import { isRecord, parseJsonApiEvent } from '@hexvis/utils';

const CHAMP_SELECT_URI = '/lol-champ-select/v1/session';
const BAN_TYPE = 'ban';
const PICK_TYPE = 'pick';
const NO_CHAMPION = 0;

/** Action kinds the local player's own turn can carry. */
type ActionType = 'ban' | 'pick';

/** Facts needed to execute one lock: which action, which lane, which pool. */
export interface Turn {
  actionId: number;
  lane: string;
  type: ActionType;
  taken: number[];
}

const isRecordList = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every((entry: unknown) => isRecord(entry));

const isRoundList = (value: unknown): value is Record<string, unknown>[][] =>
  Array.isArray(value) && value.every((entry: unknown) => isRecordList(entry));

const isChampionId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > NO_CHAMPION;

/**
 * The local player's own action the client currently awaits: unfinished, marked
 * in progress and not someone else's turn.
 *
 * @param {Record<string, unknown>} session Champ-select session record.
 * @param {number} cellId Cell id of the local player.
 * @returns {{ actionId: number; type: ActionType } | undefined} Action to execute.
 */
const activeAction = (
  session: Record<string, unknown>,
  cellId: number,
): { actionId: number; type: ActionType } | undefined => {
  const rounds = session['actions'];
  if (!isRoundList(rounds)) {
    return undefined;
  }
  const action = rounds
    .flat()
    .find(
      (entry: Record<string, unknown>) =>
        entry['actorCellId'] === cellId &&
        entry['completed'] === false &&
        entry['isInProgress'] === true,
    );
  const actionId = action?.['id'];
  const type = action?.['type'];
  if (typeof actionId !== 'number' || (type !== BAN_TYPE && type !== PICK_TYPE)) {
    return undefined;
  }
  return { actionId, type };
};

/**
 * The lane the lobby assigned to the local player; blind pick assigns none.
 *
 * @param {Record<string, unknown>} session Champ-select session record.
 * @param {number} cellId Cell id of the local player.
 * @returns {string | undefined} Raw assigned position, undefined when unassigned.
 */
const assignedLane = (session: Record<string, unknown>, cellId: number): string | undefined => {
  const team = session['myTeam'];
  if (!isRecordList(team)) {
    return undefined;
  }
  const me = team.find(member => member['cellId'] === cellId);
  const lane = me?.['assignedPosition'];
  if (typeof lane !== 'string' || lane === '') {
    return undefined;
  }
  return lane;
};

/**
 * Champion ids found in one unknown id list: session ban arrays and stored
 * favorites both land here; 0 ("no champion") and malformed entries are dropped.
 *
 * @param {unknown} value Ban id array, stored favorites or any stray payload.
 * @returns {number[]} Real champion ids in list order, empty for non-lists.
 */
export const championIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry: unknown) => isChampionId(entry));
};

/**
 * Champion ids already banned through the session's ban record.
 *
 * @param {unknown} value The bans slot of a session.
 * @returns {number[]} Banned champion ids, empty for any malformed slot.
 */
const banIds = (value: unknown): number[] => {
  if (!isRecord(value)) {
    return [];
  }
  return [...championIds(value['myTeamBans']), ...championIds(value['theirTeamBans'])];
};

/**
 * Champion ids already locked by one team list of the session.
 *
 * @param {unknown} value The myTeam or theirTeam slot of a session.
 * @returns {number[]} Locked champion ids, empty for any malformed slot.
 */
const teamIds = (value: unknown): number[] => {
  if (!isRecordList(value)) {
    return [];
  }
  return championIds(value.map(member => member['championId']));
};

/**
 * Champion ids that can no longer be locked: bans already cast plus champions
 * already locked on either team.
 *
 * @param {Record<string, unknown>} session Champ-select session record.
 * @returns {number[]} Taken champion ids in payload order.
 */
const takenIds = (session: Record<string, unknown>): number[] => [
  ...banIds(session['bans']),
  ...teamIds(session['myTeam']),
  ...teamIds(session['theirTeam']),
];

/**
 * Reads the local player's pending lock from one champ-select session payload:
 * the action the client awaits, the assigned lane and every already-taken
 * champion. Other turns, settled actions and malformed payloads yield undefined.
 *
 * @param {unknown} session Data of one champ-select session event.
 * @returns {Turn | undefined} Pending lock, undefined when there is none to run.
 */
const readTurn = (session: unknown): Turn | undefined => {
  if (!isRecord(session)) {
    return undefined;
  }
  const cellId = session['localPlayerCellId'];
  if (typeof cellId !== 'number') {
    return undefined;
  }
  const action = activeAction(session, cellId);
  const lane = assignedLane(session, cellId);
  if (action === undefined || lane === undefined) {
    return undefined;
  }
  return { ...action, lane, taken: takenIds(session) };
};

/**
 * Creates a frame reader that yields each pending lock once: repeated session
 * updates of the same awaiting action yield undefined, so one client action is
 * never locked twice nor retried after a refusal. Any session update without a
 * pending lock re-arms the reader, as action ids are not guaranteed unique
 * across sessions; frames of other resources and malformed frames leave it untouched.
 *
 * @returns {function(string): (Turn | undefined)} Reader for raw text frames.
 */
export const createTurnReader = (): ((message: string) => Turn | undefined) => {
  let handledActionId: number | undefined;
  return (message: string): Turn | undefined => {
    const event = parseJsonApiEvent(message);
    if (event?.uri !== CHAMP_SELECT_URI) {
      return undefined;
    }
    const turn = readTurn(event.data);
    if (turn?.actionId === handledActionId) {
      return undefined;
    }
    handledActionId = turn?.actionId;
    return turn;
  };
};

/**
 * Chooses the favorite that locks now: the most preferred available entry for a
 * pick, the least preferred one for a ban (favorites double as the ban pool,
 * last entry first out); already-taken entries are skipped.
 *
 * @param {readonly number[]} favorites Stored favorites in preference order.
 * @param {readonly number[]} taken Champion ids that can no longer be locked.
 * @param {ActionType} type Whether the awaiting action bans or picks.
 * @returns {number | undefined} Champion id to lock, undefined when none fits.
 */
export const chooseChampion = (
  favorites: readonly number[],
  taken: readonly number[],
  type: ActionType,
): number | undefined => {
  if (type === BAN_TYPE) {
    return favorites.findLast(id => !taken.includes(id));
  }
  return favorites.find(id => !taken.includes(id));
};
