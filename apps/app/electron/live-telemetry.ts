import { RIOT_CA, UNKNOWN_STATUS, isOk, isRecord, parseJson, scheduleRetry } from '@hexvis/utils';
import { get } from 'node:https';

const LIVE_HOST = '127.0.0.1';
const LIVE_PORT = 2999;
const ALL_GAME_DATA_PATH = '/liveclientdata/allgamedata';
const POLL_MS = 1000;
const IDLE_MS = 5000;
const REQUEST_TIMEOUT_MS = 2000;
const NO_GAME_CODE = 'ECONNREFUSED';

/** Live statistics of the local player. */
export interface ActivePlayer {
  level: number;
  currentGold: number;
  championStats: Record<string, number>;
}

/** One champion in the match with its current inventory. */
export interface LivePlayer {
  championName: string;
  team: string;
  items: number[];
}

/** One match event as published by the game. */
export interface LiveEvent {
  id: number;
  name: string;
  time: number;
}

/** Validated telemetry of one poll. */
export interface LiveSnapshot {
  gameTime: number;
  activePlayer: ActivePlayer;
  players: LivePlayer[];
  events: LiveEvent[];
}

let latest: LiveSnapshot | undefined;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const records = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry: unknown) => isRecord(entry));
};

/**
 * Numeric champion stats; non-numeric entries are dropped.
 *
 * @param {unknown} value The championStats slot of the active player.
 * @returns {Record<string, number>} Stats by name, empty for any malformed slot.
 */
const readStats = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => {
      const [, stat] = entry;
      return isNumber(stat);
    }),
  );
};

/**
 * Local player statistics; spectators and malformed payloads have none.
 *
 * @param {unknown} value The activePlayer slot of the game data.
 * @returns {ActivePlayer | undefined} Statistics, undefined when malformed.
 */
const readActivePlayer = (value: unknown): ActivePlayer | undefined => {
  if (!isRecord(value) || !isNumber(value['level']) || !isNumber(value['currentGold'])) {
    return undefined;
  }
  return {
    level: value['level'],
    currentGold: value['currentGold'],
    championStats: readStats(value['championStats']),
  };
};

/**
 * One champion with its inventory item ids; malformed items are dropped.
 *
 * @param {Record<string, unknown>} value One allPlayers entry.
 * @returns {LivePlayer | undefined} Player, undefined when name or team is missing.
 */
const readPlayer = (value: Record<string, unknown>): LivePlayer | undefined => {
  const { championName } = value;
  const { team } = value;
  if (typeof championName !== 'string' || typeof team !== 'string') {
    return undefined;
  }
  const items = records(value['items'])
    .map(item => item['itemID'])
    .filter((id: unknown): id is number => Number.isInteger(id));
  return { championName, team, items };
};

/**
 * One match event reduced to its common fields.
 *
 * @param {Record<string, unknown>} value One entry of the Events list.
 * @returns {LiveEvent | undefined} Event, undefined when a common field is malformed.
 */
const readEvent = (value: Record<string, unknown>): LiveEvent | undefined => {
  const id = value['EventID'];
  const name = value['EventName'];
  const time = value['EventTime'];
  if (!isNumber(id) || typeof name !== 'string' || !isNumber(time)) {
    return undefined;
  }
  return { id, name, time };
};

/**
 * Validates one allgamedata payload: game time and the local player are
 * required, malformed players and events are dropped one by one.
 *
 * @param {unknown} payload Parsed allgamedata response body.
 * @returns {LiveSnapshot | undefined} Snapshot, undefined for malformed payloads.
 */
export const readSnapshot = (payload: unknown): LiveSnapshot | undefined => {
  if (!isRecord(payload) || !isRecord(payload['gameData'])) {
    return undefined;
  }
  const { gameTime } = payload['gameData'];
  const activePlayer = readActivePlayer(payload['activePlayer']);
  if (!isNumber(gameTime) || activePlayer === undefined) {
    return undefined;
  }
  const { events } = payload;
  return {
    gameTime,
    activePlayer,
    players: records(payload['allPlayers']).flatMap(entry => readPlayer(entry) ?? []),
    events: records(isRecord(events) && events['Events']).flatMap(entry => readEvent(entry) ?? []),
  };
};

/**
 * Fetches the full game data over the game's self-signed HTTPS endpoint,
 * trusting only Riot's root CA; non-2xx answers (loading screen) yield false,
 * transport failures and stalled responses reject.
 *
 * @returns {Promise<unknown>} Parsed body, false for non-2xx, undefined for malformed bodies.
 */
const requestAllGameData = (): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const req = get(
      { host: LIVE_HOST, port: LIVE_PORT, path: ALL_GAME_DATA_PATH, ca: RIOT_CA },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const ok = isOk(res.statusCode ?? UNKNOWN_STATUS);
          resolve(ok && parseJson(Buffer.concat(chunks).toString('utf8')));
        });
      },
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`live: ${ALL_GAME_DATA_PATH} stalled`));
    });
    req.on('error', reject);
  });

/**
 * One poll: a refused connection means no match is running and stays silent,
 * any other failure is logged; both yield no snapshot.
 *
 * @returns {Promise<LiveSnapshot | undefined>} Snapshot, undefined outside a match.
 */
const pollSnapshot = async (): Promise<LiveSnapshot | undefined> => {
  try {
    return readSnapshot(await requestAllGameData());
  } catch (error) {
    if (!isRecord(error) || error['code'] !== NO_GAME_CODE) {
      console.error(error);
    }
    return undefined;
  }
};

/**
 * Latest validated telemetry of the running match.
 *
 * @returns {LiveSnapshot | undefined} Snapshot, undefined outside a match.
 */
export const getLiveTelemetry = (): LiveSnapshot | undefined => latest;

/**
 * Logs match start and end, the only collector events worth a line.
 *
 * @param {LiveSnapshot | undefined} previous Snapshot of the previous poll.
 * @param {LiveSnapshot | undefined} next Snapshot of the current poll.
 * @returns {void}
 */
const logTransition = (
  previous: LiveSnapshot | undefined,
  next: LiveSnapshot | undefined,
): void => {
  if (next && !previous) {
    console.info('live: match detected');
  }
  if (!next && previous) {
    console.info('live: match ended');
  }
};

/**
 * Polls the game's live data every second while a match runs and probes at a
 * slower cadence while none does; the returned closure stops polling.
 *
 * @returns {function(): void} Closure stopping the collector.
 */
export const watchLiveTelemetry = (): (() => void) => {
  let stopped = false;
  const poll = async (): Promise<void> => {
    const snapshot = await pollSnapshot();
    if (stopped) {
      return;
    }
    logTransition(latest, snapshot);
    latest = snapshot;
    if (snapshot === undefined) {
      scheduleRetry(poll, IDLE_MS);
      return;
    }
    scheduleRetry(poll, POLL_MS);
  };
  poll().catch(console.error);
  return () => {
    stopped = true;
    latest = undefined;
  };
};
