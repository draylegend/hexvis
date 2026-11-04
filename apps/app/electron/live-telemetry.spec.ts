import { readSnapshot } from './live-telemetry';

// Allgamedata payload trimmed to the fields the collector reads. Field names as
// Documented by Riot (/liveclientdata/allgamedata) and Overwolf's live_client_data samples.
const GAME_TIME = 754.2;
const LEVEL = 9;
const GOLD = 1250.5;
const ATTACK_DAMAGE = 120;
const DORANS_BLADE = 1055;
const HEALTH_POTION = 2003;
const FIRST_EVENT_TIME = 0.04;
const KILL_EVENT_TIME = 312.7;

const payload = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  activePlayer: {
    championStats: { attackDamage: ATTACK_DAMAGE, resourceType: 'MANA' },
    currentGold: GOLD,
    level: LEVEL,
  },
  allPlayers: [
    {
      championName: 'Garen',
      items: [{ itemID: DORANS_BLADE }, { itemID: HEALTH_POTION }, { itemID: '3006' }],
      team: 'ORDER',
    },
    { championName: 'Ahri', team: 42 },
  ],
  events: {
    Events: [
      { EventID: 0, EventName: 'GameStart', EventTime: FIRST_EVENT_TIME },
      { EventID: 1, EventName: 'ChampionKill', EventTime: KILL_EVENT_TIME, KillerName: 'Ahri' },
      { EventName: 'FirstBlood' },
    ],
  },
  gameData: { gameMode: 'CLASSIC', gameTime: GAME_TIME },
  ...overrides,
});

describe('live telemetry', () => {
  it('reads stats, inventories and events and drops malformed entries', () => {
    expect(readSnapshot(payload({}))).toStrictEqual({
      activePlayer: {
        championStats: { attackDamage: ATTACK_DAMAGE },
        currentGold: GOLD,
        level: LEVEL,
      },
      events: [
        { id: 0, name: 'GameStart', time: FIRST_EVENT_TIME },
        { id: 1, name: 'ChampionKill', time: KILL_EVENT_TIME },
      ],
      gameTime: GAME_TIME,
      players: [{ championName: 'Garen', items: [DORANS_BLADE, HEALTH_POTION], team: 'ORDER' }],
    });
  });

  it('yields nothing without game time or local player', () => {
    const payloads = [
      undefined,
      'RESOURCE_NOT_FOUND',
      payload({ gameData: {} }),
      payload({ activePlayer: { championStats: {} } }),
    ];
    for (const entry of payloads) {
      expect(readSnapshot(entry)).toBeUndefined();
    }
  });
});
