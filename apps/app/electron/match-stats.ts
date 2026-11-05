import { isRecord, scheduleRetry } from '@hexvis/utils';

import db from './database';
import { CALL_SPACING_MS, type RiotReader, createRiotReader } from './riot-api';

const PLATFORM = 'https://euw1.api.riotgames.com';
const REGION = 'https://europe.api.riotgames.com';
const LADDER_PATH = '/lol/league-exp/v4/entries/RANKED_SOLO_5x5';
// Emerald+ divisions walked page by page; every page brings new players and matches.
const DIVISIONS = [
  'MASTER/I',
  'DIAMOND/I',
  'DIAMOND/II',
  'DIAMOND/III',
  'DIAMOND/IV',
  'EMERALD/I',
  'EMERALD/II',
  'EMERALD/III',
  'EMERALD/IV',
];
const FIRST_PAGE = 1;
const RANKED_SOLO = 420;
const MATCHES_PER_PLAYER = 20;
// Ladder players also hold matches of older patches; a week back keeps calls on the current one.
const RECENT_SECONDS = 604_800;
const MS_PER_SECOND = 1000;
// Pause after the whole ladder was walked, before starting over.
const LADDER_PAUSE_MS = 600_000;
const ITEM_SLOTS = ['item0', 'item1', 'item2', 'item3', 'item4', 'item5'];
const NO_ITEM = 0;
const NONE = 0;
const ONE = 1;

/** One participant's result reduced to what the item statistics count. */
export interface ParticipantResult {
  championKey: string;
  position: string;
  win: boolean;
  items: number[];
}

const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value;
};

/**
 * Runs the tasks one after another, never in parallel, so every Riot call keeps
 * its rate-limit spacing; resolves the summed task results.
 *
 * @param {Value[]} values Inputs in processing order.
 * @param {function(Value): Promise<number>} task Work for one input.
 * @returns {Promise<number>} Sum of all task results.
 */
const inSequence = async <Value>(
  values: Value[],
  task: (value: Value) => Promise<number>,
): Promise<number> => {
  const [first, ...rest] = values;
  if (first === undefined) {
    return NONE;
  }
  return (await task(first)) + (await inSequence(rest, task));
};

/**
 * One participant with a position and a result; trinket and empty slots are dropped.
 *
 * @param {unknown} entry One participants entry.
 * @returns {ParticipantResult | undefined} Participant, undefined when malformed or unpositioned.
 */
const readParticipant = (entry: unknown): ParticipantResult | undefined => {
  if (
    !isRecord(entry) ||
    !Number.isInteger(entry['championId']) ||
    typeof entry['teamPosition'] !== 'string' ||
    entry['teamPosition'] === '' ||
    typeof entry['win'] !== 'boolean'
  ) {
    return undefined;
  }
  const items = ITEM_SLOTS.map(slot => entry[slot]).filter(
    (id: unknown): id is number => Number.isInteger(id) && id !== NO_ITEM,
  );
  return {
    championKey: String(entry['championId']),
    position: entry['teamPosition'],
    win: entry['win'],
    items: [...new Set(items)],
  };
};

/**
 * Reads the participants of one match-v5 payload when it belongs to the given
 * patch; other patches, remakes without positions and malformed entries yield
 * nothing.
 *
 * @param {unknown} payload Body of one match-v5 match response.
 * @param {string} patch Patch prefix such as `16.22.`.
 * @returns {ParticipantResult[]} Participants with position, result and items.
 */
export const readParticipants = (payload: unknown, patch: string): ParticipantResult[] => {
  const info = isRecord(payload) && payload['info'];
  if (
    !isRecord(info) ||
    typeof info['gameVersion'] !== 'string' ||
    !info['gameVersion'].startsWith(patch)
  ) {
    return [];
  }
  return list(info['participants']).flatMap(entry => readParticipant(entry) ?? []);
};

/**
 * Stores one match's participants: per patch, champion, position and item the
 * games the item was finished in and how many of them were won.
 *
 * @param {string} matchId Match id, recorded so it is never counted twice.
 * @param {string} patch Patch prefix the statistics belong to.
 * @param {ParticipantResult[]} participants Participants of the match.
 * @returns {Promise<void>} Resolves once stored.
 */
export const storeMatch = async (
  matchId: string,
  patch: string,
  participants: ParticipantResult[],
): Promise<void> => {
  await db.query(
    `FOR $p IN $participants {
  FOR $item IN $p.items {
    UPSERT type::thing("item_stat", [$patch, $p.championKey, $p.position, $item])
      SET patch = $patch, champion = $p.championKey, position = $p.position, item = $item,
        games = (games OR 0) + 1, wins = (wins OR 0) + IF $p.win THEN 1 ELSE 0 END;
  };
};
UPSERT type::thing("match_seen", $matchId);`,
    { matchId, patch, participants },
  );
};

/**
 * Counts one match unless it was counted before.
 *
 * @param {RiotReader} read Rate-limited Riot API reader.
 * @param {string} patch Patch prefix such as `16.22.`.
 * @param {string} matchId Match id.
 * @returns {Promise<number>} 1 when the match was new, 0 otherwise.
 */
const countMatch = async (read: RiotReader, patch: string, matchId: string): Promise<number> => {
  const [[seen]] = await db.query<[unknown[]]>(
    'SELECT id FROM type::thing("match_seen", $matchId)',
    {
      matchId,
    },
  );
  if (seen !== undefined) {
    return NONE;
  }
  const payload = await read(`${REGION}/lol/match/v5/matches/${matchId}`);
  await storeMatch(matchId, patch, readParticipants(payload, patch));
  return ONE;
};

/** Position in the ladder walk: division index and page. */
interface LadderCursor {
  division: number;
  page: number;
}

/**
 * The ladder position after a page: the next page, or the first page of the
 * next division once a page came back empty (wrapping after the last one).
 *
 * @param {LadderCursor} cursor Page just collected.
 * @param {number} players Players the page held.
 * @returns {LadderCursor} Page to collect next.
 */
export const nextPage = (cursor: LadderCursor, players: number): LadderCursor => {
  if (players > NONE) {
    return { ...cursor, page: cursor.page + ONE };
  }
  return { division: (cursor.division + ONE) % DIVISIONS.length, page: FIRST_PAGE };
};

/**
 * Active players of one ladder page.
 *
 * @param {RiotReader} read Rate-limited Riot API reader.
 * @param {LadderCursor} cursor Division and page.
 * @returns {Promise<string[]>} Player puuids, empty past the last page.
 */
const readLadder = async (read: RiotReader, cursor: LadderCursor): Promise<string[]> => {
  const division = DIVISIONS[cursor.division] ?? DIVISIONS[NONE];
  const page = await read(`${PLATFORM}${LADDER_PATH}/${division}?page=${cursor.page}`);
  return list(page)
    .map(entry => isRecord(entry) && entry['inactive'] !== true && entry['puuid'])
    .filter((puuid: unknown): puuid is string => typeof puuid === 'string');
};

/**
 * Prefix of the stored patch version, such as `16.22.` for `16.22.1`.
 *
 * @returns {Promise<string | undefined>} Prefix, undefined before the first patch sync.
 */
const storedPatch = async (): Promise<string | undefined> => {
  const [[current]] = await db.query<[{ version: string }[]]>('SELECT version FROM patch:current');
  const [major, minor] = current?.version.split('.') ?? [];
  if (major === undefined || minor === undefined) {
    return undefined;
  }
  return `${major}.${minor}.`;
};

/**
 * Collects one ladder page: its active players' ranked matches of the last
 * week, every not yet counted match of the stored patch.
 *
 * @param {RiotReader} read Rate-limited Riot API reader.
 * @param {LadderCursor} cursor Division and page to collect.
 * @returns {Promise<LadderCursor | undefined>} Page to collect next, undefined without a stored patch.
 */
const collectPage = async (
  read: RiotReader,
  cursor: LadderCursor,
): Promise<LadderCursor | undefined> => {
  const patch = await storedPatch();
  if (patch === undefined) {
    return undefined;
  }
  const players = await readLadder(read, cursor);
  const startTime = Math.floor(Date.now() / MS_PER_SECOND) - RECENT_SECONDS;
  const query = `queue=${RANKED_SOLO}&startTime=${startTime}&count=${MATCHES_PER_PLAYER}`;
  const counted = await inSequence(players, async puuid => {
    const ids = list(await read(`${REGION}/lol/match/v5/matches/by-puuid/${puuid}/ids?${query}`));
    return inSequence(
      ids.filter((id: unknown): id is string => typeof id === 'string'),
      matchId => countMatch(read, patch, matchId),
    );
  });
  console.info(
    `stats: ${DIVISIONS[cursor.division]} page ${cursor.page}: ${counted} matches counted for ${patch}`,
  );
  return nextPage(cursor, players.length);
};

/**
 * Pause before collecting the given page: a long one once the walk wrapped to
 * the start of the ladder, otherwise just the call spacing.
 *
 * @param {LadderCursor} cursor Page to collect next.
 * @returns {number} Delay in milliseconds.
 */
const pauseBefore = (cursor: LadderCursor): number => {
  if (cursor.division === NONE && cursor.page === FIRST_PAGE) {
    return LADDER_PAUSE_MS;
  }
  return CALL_SPACING_MS;
};

/**
 * Collects ranked item statistics for the stored patch in the background while
 * a Riot API key is configured (RIOT_API_KEY), walking the Emerald+ ladder page
 * by page and pausing after each full walk. The returned closure stops further calls.
 *
 * @returns {function(): void} Closure stopping the collector.
 */
export const watchMatchStats = (): (() => void) => {
  const key = process.env['RIOT_API_KEY'];
  let stopped = false;
  const stop = (): void => {
    stopped = true;
  };
  if (key === undefined || key === '') {
    console.info('stats: RIOT_API_KEY not set, collection off');
    return stop;
  }
  const read = createRiotReader(key, () => stopped);
  const round = async (cursor: LadderCursor): Promise<void> => {
    const next = await collectPage(read, cursor);
    if (!stopped && next !== undefined) {
      scheduleRetry(() => round(next), pauseBefore(next));
    }
  };
  round({ division: NONE, page: FIRST_PAGE }).catch(console.error);
  return stop;
};
