import fs from 'node:fs';
import path from 'node:path';

import { getChampionName, getItemName } from './asset-names';
import db from './database';

// surrealkv:// only supports cwd-relative paths on Windows: `C:` parses as URL host
// (creates a stray `C/` tree), triple-slash hangs, backslashes throw ERR_INVALID_URL.
const tempDir = (): string => {
  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
  return fs.mkdtempSync(path.join(process.cwd(), 'data', 'spec-'));
};

// Raw ids as the LCU reports them: championId and itemId are numbers.
const AATROX_ID = 266;
const BOOTS_ID = 1001;
const UNKNOWN_CHAMPION_ID = 999;
const UNKNOWN_ITEM_ID = 99_999;

describe('asset names', () => {
  let dir: string;
  let url: string;

  beforeEach(async () => {
    dir = tempDir();
    url = `surrealkv://./${path.relative(process.cwd(), dir).replaceAll('\\', '/')}`;
    await db.connect(url, { namespace: 'hexvis', database: 'test' });
    // Fixture shapes mirror what ddragon.ts writes: champion keeps its payload id
    // (name) and key, items get the map key as string id.
    await db.query('INSERT INTO champion $champions; INSERT INTO item $items;', {
      champions: [{ id: 'Aatrox', key: '266', name: 'Aatrox' }],
      items: [{ id: '1001', name: 'Boots' }],
    });
  });

  afterEach(async () => {
    await db.close().catch(console.warn);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves raw ids to stored names', async () => {
    await expect(getChampionName(AATROX_ID)).resolves.toBe('Aatrox');
    await expect(getItemName(BOOTS_ID)).resolves.toBe('Boots');
  });

  it('returns undefined for unknown ids', async () => {
    await expect(getChampionName(UNKNOWN_CHAMPION_ID)).resolves.toBeUndefined();
    await expect(getItemName(UNKNOWN_ITEM_ID)).resolves.toBeUndefined();
  });
});
