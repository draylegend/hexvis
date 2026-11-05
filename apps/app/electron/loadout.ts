import { type LcuCredentials, type LcuResponse, isOk, isRecord, requestLcu } from '@hexvis/utils';

import type { Lock } from './champ-select-turn';

import { getChampionName } from './asset-names';

const SUMMONERS_RIFT = 11;
const PAGES_PATH = '/lol-perks/v1/pages';
const SELECTION_PATH = '/lol-champ-select/v1/session/my-selection';
const SPELLS_PATH = '/lol-game-data/assets/v1/summoner-spells.json';
const PAGE_NAME = 'HexVis';
const SPELL_COUNT = 2;
const FIRST = 0;
const EMPTY = 0;

/** Rune page and summoner spells of the client's first recommendation. */
export interface Loadout {
  keystone: string;
  primaryStyleId: number;
  subStyleId: number;
  perkIds: number[];
  spellIds: [number, number];
}

const isId = (value: unknown): value is number => Number.isInteger(value);

/**
 * The name field of an untrusted record.
 *
 * @param {unknown} value Candidate record.
 * @returns {string | undefined} Name, undefined when absent.
 */
const nameOf = (value: unknown): string | undefined => {
  const name = isRecord(value) && value['name'];
  if (typeof name !== 'string') {
    return undefined;
  }
  return name;
};

const isIdPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === SPELL_COUNT && value.every(entry => isId(entry));

/**
 * Reads the client's first recommended page; malformed payloads yield undefined
 * so an untrusted response never reaches the rune page or spell slots.
 *
 * @param {unknown} payload Body of the recommended-pages response.
 * @returns {Loadout | undefined} Loadout, undefined for empty or malformed payloads.
 */
export const readLoadout = (payload: unknown): Loadout | undefined => {
  const page: unknown = Array.isArray(payload) && payload[FIRST];
  if (!isRecord(page) || !Array.isArray(page['perks'])) {
    return undefined;
  }
  const { primaryPerkStyleId, secondaryPerkStyleId, summonerSpellIds } = page;
  const perkIds = page['perks'].map((perk: unknown) => isRecord(perk) && perk['id']);
  if (
    !isId(primaryPerkStyleId) ||
    !isId(secondaryPerkStyleId) ||
    !isIdPair(summonerSpellIds) ||
    perkIds.length === EMPTY ||
    !perkIds.every(id => isId(id))
  ) {
    return undefined;
  }
  return {
    keystone: nameOf(page['keystone']) ?? String(perkIds[FIRST]),
    primaryStyleId: primaryPerkStyleId,
    subStyleId: secondaryPerkStyleId,
    perkIds,
    spellIds: summonerSpellIds,
  };
};

/**
 * Asks the client for its recommendation for the locked champion and position.
 *
 * @param {Lock} lock Locked champion and uppercase position.
 * @param {LcuCredentials} credentials Active client port and token.
 * @returns {Promise<Loadout | undefined>} Loadout, undefined when none is usable.
 */
const fetchLoadout = async (
  lock: Lock,
  credentials: LcuCredentials,
): Promise<Loadout | undefined> => {
  const { status, body } = await requestLcu(credentials, {
    method: 'GET',
    path: `/lol-perks/v1/recommended-pages/champion/${lock.championId}/position/${lock.position}/map/${SUMMONERS_RIFT}`,
  });
  const loadout = readLoadout(body);
  if (loadout === undefined) {
    console.error(`loadout: client has no recommendation for ${lock.championId} (${status})`);
  }
  return loadout;
};

/**
 * Replaces the previous app page with a temporary page holding the loadout's
 * runes; the client makes it current and it takes no page slot.
 *
 * @param {Loadout} loadout Runes to write.
 * @param {number | undefined} previousId Id of the page this app created last.
 * @param {LcuCredentials} credentials Active client port and token.
 * @returns {Promise<LcuResponse>} Response of the page creation.
 */
const replacePage = async (
  loadout: Loadout,
  previousId: number | undefined,
  credentials: LcuCredentials,
): Promise<LcuResponse> => {
  if (previousId !== undefined) {
    await requestLcu(credentials, { method: 'DELETE', path: `${PAGES_PATH}/${previousId}` });
  }
  return requestLcu(credentials, {
    method: 'POST',
    path: PAGES_PATH,
    body: JSON.stringify({
      name: PAGE_NAME,
      primaryStyleId: loadout.primaryStyleId,
      subStyleId: loadout.subStyleId,
      selectedPerkIds: loadout.perkIds,
      current: true,
      isTemporary: true,
    }),
  });
};

/**
 * Id of a created page, undefined when the client refused or answered oddly.
 *
 * @param {LcuResponse} response Response of the page creation.
 * @returns {number | undefined} Page id.
 */
const createdId = (response: LcuResponse): number | undefined => {
  const id = isOk(response.status) && isRecord(response.body) && response.body['id'];
  if (!isId(id)) {
    return undefined;
  }
  return id;
};

/**
 * Orders the recommended spells so a spell the player already has keeps its
 * slot (Flash stays on F for players who bind it there).
 *
 * @param {[number, number]} recommended Spells in the client's recommended order.
 * @param {unknown[]} current Spells in the D and F slots at lock time.
 * @returns {[number, number]} Spells for the D and F slots.
 */
export const orderSpells = (
  recommended: [number, number],
  current: unknown[],
): [number, number] => {
  const [first, second] = recommended;
  const [slotD, slotF] = current;
  if (slotF === first || slotD === second) {
    return [second, first];
  }
  return recommended;
};

/**
 * Sets the loadout's summoner spells in the current champ select.
 *
 * @param {Loadout} loadout Spells to set.
 * @param {LcuCredentials} credentials Active client port and token.
 * @returns {Promise<LcuResponse>} Response of the selection update.
 */
const setSpells = (loadout: Loadout, credentials: LcuCredentials): Promise<LcuResponse> => {
  const [spell1Id, spell2Id] = loadout.spellIds;
  return requestLcu(credentials, {
    method: 'PATCH',
    path: SELECTION_PATH,
    body: JSON.stringify({ spell1Id, spell2Id }),
  });
};

/**
 * Readable summoner spell names from the client's game data; ids stand in for
 * names the client does not list.
 *
 * @param {number[]} ids Summoner spell ids.
 * @param {LcuCredentials} credentials Active client port and token.
 * @returns {Promise<string>} Names joined with a plus.
 */
const spellNames = async (ids: number[], credentials: LcuCredentials): Promise<string> => {
  const { body } = await requestLcu(credentials, { method: 'GET', path: SPELLS_PATH });
  const spells: unknown[] = [];
  if (Array.isArray(body)) {
    spells.push(...(body as unknown[]));
  }
  const names = ids.map(
    id => nameOf(spells.find(spell => isRecord(spell) && spell['id'] === id)) ?? String(id),
  );
  return names.join(' + ');
};

/**
 * Logs a refused call with the client's own reason.
 *
 * @param {string} part What the call tried to set.
 * @param {LcuResponse} response Response of the call.
 * @returns {void}
 */
const logRefusal = (part: string, response: LcuResponse): void => {
  if (!isOk(response.status)) {
    const reason = isRecord(response.body) && response.body['message'];
    console.error(`loadout: ${part} refused (${response.status}): ${String(reason)}`);
  }
};

/**
 * Logs the applied loadout in readable names.
 *
 * @param {Lock} lock Locked champion and position.
 * @param {Loadout} loadout Applied runes and spells.
 * @param {LcuCredentials} credentials Active client port and token.
 * @returns {Promise<void>} Resolves once logged.
 */
const logApplied = async (
  lock: Lock,
  loadout: Loadout,
  credentials: LcuCredentials,
): Promise<void> => {
  const champion = (await getChampionName(lock.championId)) ?? String(lock.championId);
  const spells = await spellNames(loadout.spellIds, credentials);
  console.info(`loadout: ${champion} ${lock.position} — ${loadout.keystone}, ${spells}`);
};

/**
 * Creates the lock handler that writes the client's recommendation into a
 * temporary app-created rune page and sets the recommended summoner spells,
 * logging what was applied. Only the page this app created last is ever
 * deleted; pages the player created are never touched.
 *
 * @returns {function(Lock, LcuCredentials): Promise<void>} Handler for one lock.
 */
export const createLoadoutApplier = (): ((
  lock: Lock,
  credentials: LcuCredentials,
) => Promise<void>) => {
  let pageId: number | undefined;
  return async (lock: Lock, credentials: LcuCredentials): Promise<void> => {
    const loadout = await fetchLoadout(lock, credentials);
    if (loadout === undefined) {
      return;
    }
    loadout.spellIds = orderSpells(loadout.spellIds, lock.spellIds);
    const page = await replacePage(loadout, pageId, credentials);
    pageId = createdId(page);
    const spells = await setSpells(loadout, credentials);
    logRefusal('rune page', page);
    logRefusal('summoner spells', spells);
    await logApplied(lock, loadout, credentials);
  };
};
