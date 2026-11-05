import {
  type Turn,
  championIds,
  chooseChampion,
  createLockReader,
  createTurnReader,
} from './champ-select-turn';

// Real champ-select frames as documented by hextechdocs. Every session change
// Publishes [8, 'OnJsonApiEvent', { uri, eventType, data }] with the full session.
const WAMP_EVENT_OPCODE = 8;
const WAMP_UNSUBSCRIBE_OPCODE = 6;
const SESSION_URI = '/lol-champ-select/v1/session';
const OTHER_URI = '/lol-gameflow/v1/gameflow-phase';
const MY_CELL_ID = 3;
const ALLY_CELL_ID = 2;
const ACTION_ID = 7;
const TOP_LANE = 'top';
const THRESH = 412;
const MASTER_YI = 11;
const APHELIOS = 523;
const NO_CHAMPION = 0;
const NEGATIVE_ID = -1;
const FRACTIONAL_ID = 1.5;
const FLASH = 4;
const IGNITE = 14;

const MY_TURN = {
  actorCellId: MY_CELL_ID,
  completed: false,
  id: ACTION_ID,
  isInProgress: true,
  type: 'pick',
};

const session = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  actions: [[MY_TURN]],
  bans: { myTeamBans: [], theirTeamBans: [] },
  localPlayerCellId: MY_CELL_ID,
  myTeam: [
    { cellId: ALLY_CELL_ID, assignedPosition: '' },
    { cellId: MY_CELL_ID, assignedPosition: TOP_LANE },
  ],
  theirTeam: [],
  ...overrides,
});

const frame = (uri: string, data: unknown): string =>
  JSON.stringify([WAMP_EVENT_OPCODE, 'OnJsonApiEvent', { uri, eventType: 'Update', data }]);

const sessionFrame = (data: unknown): string => frame(SESSION_URI, data);

const turnFrame = (action: Record<string, unknown>): string =>
  sessionFrame(session({ actions: [[action]] }));

const readTurn = (message: string): Turn | undefined => createTurnReader()(message);

describe('champ select turn', () => {
  it('reads the pending lock for the assigned lane', () => {
    const turn = readTurn(sessionFrame(session({})));
    expect(turn).toStrictEqual({ actionId: ACTION_ID, lane: TOP_LANE, taken: [], type: 'pick' });
  });

  it('collects bans and locked champions as taken', () => {
    const data = session({
      bans: { myTeamBans: [APHELIOS], theirTeamBans: [MASTER_YI] },
      myTeam: [
        { cellId: ALLY_CELL_ID, assignedPosition: '', championId: THRESH },
        { cellId: MY_CELL_ID, assignedPosition: TOP_LANE },
      ],
    });
    expect(readTurn(sessionFrame(data))?.taken).toStrictEqual([APHELIOS, MASTER_YI, THRESH]);
  });

  it('skips actions that are not the local player turn', () => {
    expect(readTurn(turnFrame({ ...MY_TURN, actorCellId: ALLY_CELL_ID }))).toBeUndefined();
    expect(readTurn(turnFrame({ ...MY_TURN, completed: true }))).toBeUndefined();
    expect(readTurn(turnFrame({ ...MY_TURN, isInProgress: false }))).toBeUndefined();
    expect(readTurn(turnFrame({ ...MY_TURN, type: 'swap' }))).toBeUndefined();
  });

  it('stays out when the lobby assigned no lane', () => {
    const data = session({ myTeam: [{ cellId: MY_CELL_ID, assignedPosition: '' }] });
    expect(readTurn(sessionFrame(data))).toBeUndefined();
  });

  it('yields each awaiting action once', () => {
    const readNewTurn = createTurnReader();
    const pending = sessionFrame(session({}));
    const foreign = frame(OTHER_URI, session({}));
    expect(readNewTurn(pending)?.actionId).toBe(ACTION_ID);
    expect(readNewTurn(pending)).toBeUndefined();
    expect(readNewTurn(foreign)).toBeUndefined();
    expect(readNewTurn(pending)).toBeUndefined();
  });

  it('re-arms once the action settles, as the next session reuses ids', () => {
    const readNewTurn = createTurnReader();
    const pending = sessionFrame(session({}));
    const settled = turnFrame({ ...MY_TURN, completed: true });
    readNewTurn(pending);
    expect(readNewTurn(settled)).toBeUndefined();
    expect(readNewTurn(pending)?.actionId).toBe(ACTION_ID);
  });
});

describe('champ select frames', () => {
  it('ignores foreign resources and other opcodes', () => {
    const frames = [
      frame(OTHER_URI, session({})),
      JSON.stringify([WAMP_UNSUBSCRIBE_OPCODE, 'OnJsonApiEvent', { uri: SESSION_URI }]),
      JSON.stringify([WAMP_EVENT_OPCODE, 'OnJsonApiEvent', { uri: SESSION_URI }]),
      JSON.stringify([WAMP_EVENT_OPCODE, 'OnJsonApiEvent', 'payload']),
    ];
    for (const message of frames) {
      expect(readTurn(message)).toBeUndefined();
    }
  });

  it('never reads a malformed frame', () => {
    const payloads = ['', '<html lang="en">502</html>', '["InProgress"]'];
    for (const message of payloads) {
      expect(readTurn(message)).toBeUndefined();
    }
  });
});

describe('champ select favorites', () => {
  it('locks the top favorite for picks and the last for bans', () => {
    const favorites = [THRESH, MASTER_YI, APHELIOS];
    expect(chooseChampion(favorites, [], 'pick')).toBe(THRESH);
    expect(chooseChampion(favorites, [THRESH], 'pick')).toBe(MASTER_YI);
    expect(chooseChampion(favorites, [], 'ban')).toBe(APHELIOS);
    expect(chooseChampion(favorites, [APHELIOS], 'ban')).toBe(MASTER_YI);
  });

  it('locks nothing when every favorite is taken', () => {
    expect(chooseChampion([THRESH, MASTER_YI], [THRESH, MASTER_YI], 'pick')).toBeUndefined();
    expect(chooseChampion([], [], 'ban')).toBeUndefined();
  });

  it('drops malformed stored favorites', () => {
    const stored = [THRESH, String(MASTER_YI), NO_CHAMPION, NEGATIVE_ID, FRACTIONAL_ID, [APHELIOS]];
    expect(championIds(stored)).toStrictEqual([THRESH]);
    expect(championIds(String(THRESH))).toStrictEqual([]);
    expect(championIds({ champions: [THRESH] })).toStrictEqual([]);
  });
});

const lockedSession = (position: string): Record<string, unknown> =>
  session({
    actions: [[{ ...MY_TURN, completed: true, isInProgress: false }]],
    myTeam: [
      {
        cellId: MY_CELL_ID,
        assignedPosition: position,
        championId: THRESH,
        spell1Id: IGNITE,
        spell2Id: FLASH,
      },
    ],
  });

describe('champ select lock', () => {
  it('yields the locked champion once with an uppercase position', () => {
    const readLock = createLockReader();
    const locked = sessionFrame(lockedSession(TOP_LANE));
    expect(readLock(locked)).toStrictEqual({
      championId: THRESH,
      position: 'TOP',
      spellIds: [IGNITE, FLASH],
    });
    expect(readLock(locked)).toBeUndefined();
  });

  it('falls back to NONE without an assigned lane and waits for the pick to complete', () => {
    const unassigned = sessionFrame(lockedSession(''));
    expect(createLockReader()(unassigned)).toStrictEqual({
      championId: THRESH,
      position: 'NONE',
      spellIds: [IGNITE, FLASH],
    });
    const hovering = session({
      myTeam: [{ cellId: MY_CELL_ID, assignedPosition: TOP_LANE, championId: THRESH }],
    });
    expect(createLockReader()(sessionFrame(hovering))).toBeUndefined();
  });
});
