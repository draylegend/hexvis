import fs from 'node:fs';
import path from 'node:path';

import db from './database';
import { nextPage, readParticipants, storeMatch } from './match-stats';

// surrealkv:// only supports cwd-relative paths on Windows: `C:` parses as URL host
// (creates a stray `C/` tree), triple-slash hangs, backslashes throw ERR_INVALID_URL.
const tempDir = (): string => {
  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
  return fs.mkdtempSync(path.join(process.cwd(), 'data', 'spec-'));
};

// Participant fields as match-v5 returns them (checked on a live 16.22 match).
const PATCH = '16.22.';
const GAREN = 86;
const STRIDEBREAKER = 6631;
const BOOTS = 3047;
const WARD = 3340;
const FULL_PAGE = 205;
const EMPTY_PAGE = 0;

const participant = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  championId: GAREN,
  item0: STRIDEBREAKER,
  item1: BOOTS,
  item2: 0,
  item3: 0,
  item4: STRIDEBREAKER,
  item5: 0,
  item6: WARD,
  teamPosition: 'TOP',
  win: true,
  ...overrides,
});

const match = (gameVersion: string, participants: unknown[]): Record<string, unknown> => ({
  info: { gameVersion, participants },
});

describe('match stats', () => {
  it('reads positioned participants of the current patch without empty or trinket slots', () => {
    const payload = match('16.22.834.8910', [
      participant({}),
      participant({ teamPosition: '' }),
      participant({ win: 'yes' }),
      'participant',
    ]);
    expect(readParticipants(payload, PATCH)).toStrictEqual([
      { championKey: '86', items: [STRIDEBREAKER, BOOTS], position: 'TOP', win: true },
    ]);
    const oldPatch = match('16.21.700.1', [participant({})]);
    expect(readParticipants(oldPatch, PATCH)).toStrictEqual([]);
    expect(readParticipants({ status: { status_code: 404 } }, PATCH)).toStrictEqual([]);
  });

  it('walks a division page by page, then the next division, wrapping after the last', () => {
    expect(nextPage({ division: 0, page: 3 }, FULL_PAGE)).toStrictEqual({ division: 0, page: 4 });
    expect(nextPage({ division: 0, page: 4 }, EMPTY_PAGE)).toStrictEqual({ division: 1, page: 1 });
    expect(nextPage({ division: 8, page: 9 }, EMPTY_PAGE)).toStrictEqual({ division: 0, page: 1 });
  });

  describe('storage', () => {
    let dir: string;

    beforeEach(async () => {
      dir = tempDir();
      const url = `surrealkv://./${path.relative(process.cwd(), dir).replaceAll('\\', '/')}`;
      await db.connect(url, { namespace: 'hexvis', database: 'test' });
    });

    afterEach(async () => {
      await db.close().catch(console.warn);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('counts games and wins per item and remembers the match', async () => {
      const win = { championKey: '86', items: [STRIDEBREAKER], position: 'TOP', win: true };
      await storeMatch('EUW1_1', PATCH, [win]);
      await storeMatch('EUW1_2', PATCH, [{ ...win, win: false }]);
      const [rows, seen] = await db.query<[unknown[], unknown[]]>(
        'SELECT champion, games, item, patch, position, wins FROM item_stat; SELECT VALUE record::id(id) FROM match_seen;',
      );
      expect(rows).toStrictEqual([
        { champion: '86', games: 2, item: STRIDEBREAKER, patch: PATCH, position: 'TOP', wins: 1 },
      ]);
      expect(seen).toStrictEqual(['EUW1_1', 'EUW1_2']);
    });
  });
});
