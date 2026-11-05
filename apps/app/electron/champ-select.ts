import { type LcuCredentials, isOk, requestLcu, watchJsonApiEvents } from '@hexvis/utils';

import {
  type Turn,
  championIds,
  chooseChampion,
  createLockReader,
  createTurnReader,
} from './champ-select-turn';
import db from './database';
import { getLcuCredentials } from './lcu-credentials';
import { createLoadoutApplier } from './loadout';

const ACTION_PATH = '/lol-champ-select/v1/session/actions';

/**
 * Reads the stored favorite champion ids for one lane, keyed by the raw
 * assigned position (`favorite:⟨middle⟩`); unconfigured lanes and malformed
 * rows yield an empty pool, malformed entries are dropped.
 *
 * @param {string} lane Raw assigned position of the local player.
 * @returns {Promise<number[]>} Favorites in preference order, empty when none.
 */
const getFavorites = async (lane: string): Promise<number[]> => {
  const [[row]] = await db.query<[{ champions: unknown }[]]>(
    'SELECT champions FROM type::thing("favorite", $lane)',
    { lane },
  );
  return championIds(row?.champions);
};

/**
 * Executes one pending lock: resolves the lane's favorite pool, chooses the
 * champion for the awaiting action and completes that action in the client.
 *
 * @param {Turn} turn Pending lock read from the session.
 * @param {LcuCredentials} credentials Active client port and token.
 * @returns {Promise<void>} Resolves once the client answered the lock.
 */
const lockTurn = async (turn: Turn, credentials: LcuCredentials): Promise<void> => {
  const favorites = await getFavorites(turn.lane);
  const championId = chooseChampion(favorites, turn.taken, turn.type);
  if (championId === undefined) {
    return;
  }
  const { status } = await requestLcu(credentials, {
    method: 'PATCH',
    path: `${ACTION_PATH}/${turn.actionId}`,
    body: JSON.stringify({ championId, completed: true, type: turn.type }),
  });
  if (isOk(status)) {
    console.info(`champ-select: locked ${championId} as ${turn.type} on ${turn.lane}`);
  } else {
    console.error(`champ-select: lock refused with ${status}`);
  }
};

/**
 * Subscribes to the local client's champ-select events and executes the pending
 * lock for the assigned lane the moment the client awaits one. Each client
 * action runs once: favorites are read when the turn starts, and a refused lock
 * is left to the player instead of being retried. Once the player's pick is
 * locked, the client-recommended runes and summoner spells are applied. The
 * returned closure closes the subscription.
 *
 * @returns {function(): void} Closure closing the subscription.
 */
export const watchChampSelect = (): (() => void) => {
  const readNewTurn = createTurnReader();
  const readNewLock = createLockReader();
  const applyLoadout = createLoadoutApplier();
  return watchJsonApiEvents(getLcuCredentials, (message, credentials) => {
    const turn = readNewTurn(message);
    if (turn !== undefined) {
      lockTurn(turn, credentials).catch(console.error);
    }
    const lock = readNewLock(message);
    if (lock !== undefined) {
      applyLoadout(lock, credentials).catch(console.error);
    }
  });
};
