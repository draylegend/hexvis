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

// Items as Data Dragon 16.22.1 ships them, trimmed to the fields the advisor reads:
// 6-digit mode variants and upgradable items must never be suggested.
const RIFT = { '11': true, '12': true };
const ITEMS = [
  {
    id: '3075',
    name: 'Thornmail',
    gold: { total: 2450, purchasable: true },
    stats: { FlatHPPoolMod: 150, FlatArmorMod: 75 },
    tags: [],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '2504',
    name: 'Kaenic Rookern',
    gold: { total: 2900, purchasable: true },
    stats: { FlatHPPoolMod: 400, FlatSpellBlockMod: 80 },
    tags: [],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '3084',
    name: 'Heartsteel',
    gold: { total: 3000, purchasable: true },
    stats: { FlatHPPoolMod: 900 },
    tags: [],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '3174',
    name: 'Armored Advance',
    gold: { total: 1200, purchasable: true },
    stats: { FlatArmorMod: 35 },
    tags: ['Boots'],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '3047',
    name: 'Plated Steelcaps',
    gold: { total: 1000, purchasable: true },
    stats: { FlatArmorMod: 20 },
    tags: ['Boots'],
    maps: RIFT,
    depth: 2,
    into: ['3174'],
  },
  {
    id: '323075',
    name: 'Thornmail',
    gold: { total: 2650, purchasable: true },
    stats: { FlatHPPoolMod: 200, FlatArmorMod: 85 },
    tags: [],
    maps: RIFT,
    depth: 3,
  },
  {
    id: '1036',
    name: 'Long Sword',
    gold: { total: 350, purchasable: true },
    stats: { FlatPhysicalDamageMod: 10 },
    tags: [],
    maps: RIFT,
    into: ['3071'],
  },
  {
    id: '1052',
    name: 'Amplifying Tome',
    gold: { total: 400, purchasable: true },
    stats: { FlatMagicDamageMod: 20 },
    tags: [],
    maps: RIFT,
    into: ['3165'],
  },
];
const CHAMPIONS = [
  { id: 'Aatrox', info: { attack: 8, magic: 3 } },
  { id: 'Yuumi', info: { attack: 5, magic: 8 } },
];
const LONG_SWORD = 1036;
const AMPLIFYING_TOME = 1052;
const ARMORED_ADVANCE = 3174;
const ME = 'me#EUW';

const snapshot = (mine: number[], enemyItems: number[]): LiveSnapshot => ({
  activePlayer: {
    championStats: { armor: 40, magicResist: 32, maxHealth: 1200 },
    currentGold: 0,
    level: 9,
    riotId: ME,
  },
  events: [],
  gameTime: 600,
  players: [
    { champion: 'DrMundo', items: mine, riotId: ME, team: 'CHAOS' },
    { champion: 'Aatrox', items: enemyItems, riotId: '#', team: 'ORDER' },
    { champion: 'Yuumi', items: [], riotId: '#', team: 'ORDER' },
  ],
});

describe('item advisor', () => {
  let dir: string;
  let advise: (snapshot: LiveSnapshot) => Promise<void>;

  beforeEach(async () => {
    dir = tempDir();
    const url = `surrealkv://./${path.relative(process.cwd(), dir).replaceAll('\\', '/')}`;
    await db.connect(url, { namespace: 'hexvis', database: 'test' });
    await db.query('INSERT INTO champion $champions; INSERT INTO item $items;', {
      champions: CHAMPIONS,
      items: ITEMS,
    });
    advise = createItemAdvisor();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close().catch(console.warn);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('ranks armor first against physical enemy items', async () => {
    const info = vi.spyOn(console, 'info');
    await advise(snapshot([], [LONG_SWORD, LONG_SWORD]));
    expect(info).toHaveBeenCalledWith('advisor: Thornmail, Heartsteel, Armored Advance');
  });

  it('ranks magic resist first against magic enemy items', async () => {
    const info = vi.spyOn(console, 'info');
    await advise(snapshot([], [AMPLIFYING_TOME, AMPLIFYING_TOME]));
    expect(info).toHaveBeenCalledWith('advisor: Kaenic Rookern, Heartsteel, Thornmail');
  });

  it('skips owned items and second boots, and reports only changes', async () => {
    const info = vi.spyOn(console, 'info');
    const owned = snapshot([ARMORED_ADVANCE], [LONG_SWORD]);
    await advise(owned);
    await advise(owned);
    expect(info).toHaveBeenCalledExactlyOnceWith('advisor: Thornmail, Heartsteel, Kaenic Rookern');
  });
});
