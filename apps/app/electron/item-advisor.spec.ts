import fs from 'node:fs';
import path from 'node:path';

import type { LiveSnapshot } from './live-telemetry';

import db from './database';
import { createItemAdvisor } from './item-advisor';

// surrealkv:// only supports cwd-relative paths on Windows: `C:` parses as URL host
// (creates a stray `C/` tree), triple-slash hangs, backslashes throw ERR_INVALID_URL.
const tempDir = (): string => {
  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
  return fs.mkdtempSync(path.join(process.cwd(), 'data', 'spec-'));
};

// Items as Data Dragon 16.22.1 ships them, trimmed to the fields the advisor reads.
// Kaenic Rookern has no statistics on Seraphine, so it must never be suggested to her.
const RIFT = { '11': true, '12': true };
const BUY = { purchasable: true };
const ITEMS = [
  {
    id: '6617',
    name: 'Moonstone Renewer',
    gold: { ...BUY, total: 2200 },
    stats: { FlatHPPoolMod: 200 },
    tags: [],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '6620',
    name: 'Echoes of Helia',
    gold: { ...BUY, total: 2200 },
    stats: { FlatHPPoolMod: 200 },
    tags: [],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '3165',
    name: 'Morellonomicon',
    gold: { ...BUY, total: 2850 },
    stats: { FlatHPPoolMod: 350 },
    tags: [],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '3157',
    name: "Zhonya's Hourglass",
    gold: { ...BUY, total: 3250 },
    stats: { FlatArmorMod: 50 },
    tags: [],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '3089',
    name: "Rabadon's Deathcap",
    gold: { ...BUY, total: 3600 },
    stats: {},
    tags: [],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '2504',
    name: 'Kaenic Rookern',
    gold: { ...BUY, total: 2900 },
    stats: { FlatHPPoolMod: 400, FlatSpellBlockMod: 80 },
    tags: [],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '1036',
    name: 'Long Sword',
    gold: { ...BUY, total: 350 },
    stats: { FlatPhysicalDamageMod: 10 },
    tags: [],
    maps: RIFT,
    into: ['3071'],
  },
  {
    id: '1052',
    name: 'Amplifying Tome',
    gold: { ...BUY, total: 400 },
    stats: { FlatMagicDamageMod: 20 },
    tags: [],
    maps: RIFT,
    into: ['3165'],
  },
];
const CHAMPIONS = [
  { id: 'Seraphine', key: '147', info: { attack: 2, magic: 8 } },
  { id: 'Garen', key: '86', info: { attack: 7, magic: 1 } },
  { id: 'Aatrox', key: '266', info: { attack: 8, magic: 3 } },
];
// Win-rate lower bounds: Moonstone .501, Echoes .464, Morello .461, Zhonya .404,
// Rabadon's 1 of 5 only .036: few games pull the bound down.
const STAT = { patch: '16.22.', champion: '147', position: 'UTILITY' };
const STATS = [
  { ...STAT, item: 6617, games: 400, wins: 220 },
  { ...STAT, item: 6620, games: 300, wins: 156 },
  { ...STAT, item: 3165, games: 120, wins: 66 },
  { ...STAT, item: 3157, games: 100, wins: 50 },
  { ...STAT, item: 3089, games: 5, wins: 1 },
];
const LONG_SWORD = 1036;
const AMPLIFYING_TOME = 1052;
const MOONSTONE = 6617;
const ME = 'me#EUW';
const MAGIC_FIT = 'advisor: Moonstone Renewer, Echoes of Helia, Morellonomicon';

const snapshot = (champion: string, mine: number[], enemyItems: number[]): LiveSnapshot => ({
  activePlayer: {
    championStats: { armor: 30, magicResist: 30, maxHealth: 1100 },
    currentGold: 0,
    level: 9,
    riotId: ME,
  },
  events: [],
  gameTime: 600,
  players: [
    { champion, items: mine, position: 'UTILITY', riotId: ME, team: 'CHAOS' },
    { champion: 'Aatrox', items: enemyItems, position: 'TOP', riotId: '#', team: 'ORDER' },
  ],
});

const seed = (): Promise<unknown> =>
  db.query(
    `INSERT INTO champion $champions; INSERT INTO item $items; INSERT INTO item_stat $stats;
UPSERT patch:current CONTENT { version: "16.22.1" };`,
    { champions: CHAMPIONS, items: ITEMS, stats: STATS },
  );

describe('item advisor', () => {
  let dir: string;
  let advise: (snapshot: LiveSnapshot) => Promise<void>;

  beforeEach(async () => {
    dir = tempDir();
    const url = `surrealkv://./${path.relative(process.cwd(), dir).replaceAll('\\', '/')}`;
    await db.connect(url, { namespace: 'hexvis', database: 'test' });
    await seed();
    advise = createItemAdvisor();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close().catch(console.warn);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('suggests the champion core and fits the third item to magic damage', async () => {
    const info = vi.spyOn(console, 'info');
    await advise(snapshot('Seraphine', [], [AMPLIFYING_TOME]));
    expect(info).toHaveBeenCalledWith(MAGIC_FIT);
  });

  it('fits the third item to physical damage and skips owned items', async () => {
    const info = vi.spyOn(console, 'info');
    await advise(snapshot('Seraphine', [], [LONG_SWORD]));
    await advise(snapshot('Seraphine', [MOONSTONE], [LONG_SWORD]));
    expect(info.mock.calls).toStrictEqual([
      ["advisor: Moonstone Renewer, Echoes of Helia, Zhonya's Hourglass"],
      ["advisor: Echoes of Helia, Morellonomicon, Zhonya's Hourglass"],
    ]);
  });

  it('falls back to the position pool while the champion has no statistics', async () => {
    const info = vi.spyOn(console, 'info');
    await advise(snapshot('Garen', [], [AMPLIFYING_TOME]));
    expect(info).toHaveBeenCalledWith(MAGIC_FIT);
  });

  it('says so before any statistics were collected', async () => {
    const info = vi.spyOn(console, 'info');
    await db.query('DELETE item_stat');
    await advise(snapshot('Garen', [], []));
    expect(info).toHaveBeenCalledExactlyOnceWith('advisor: no statistics for Garen UTILITY yet');
  });
});
