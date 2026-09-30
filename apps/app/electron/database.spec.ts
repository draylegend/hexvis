import type { Surreal } from 'surrealdb';

import fs from 'node:fs';
import path from 'node:path';

import { openDatabase } from './database';

// surrealkv:// only supports cwd-relative paths on Windows: `C:` parses as URL host
// (creates a stray `C/` tree), triple-slash hangs, backslashes throw ERR_INVALID_URL.
const tempDir = (): string => {
  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
  return fs.mkdtempSync(path.join(process.cwd(), 'data', 'spec-'));
};

describe('database', () => {
  let db: Surreal | undefined;
  let dir: string;
  let url: string;

  beforeEach(() => {
    dir = tempDir();
    url = `surrealkv://./${path.relative(process.cwd(), dir).replaceAll('\\', '/')}`;
  });

  afterEach(async () => {
    await db?.close().catch(console.warn);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a record and reconnects after close', async () => {
    db = await openDatabase(url, { namespace: 'hexvis', database: 'test' });
    await db.query('CREATE item:1 CONTENT { name: "hello" }');
    await db.close();

    // Reconnect must not deadlock on the file lock (surrealdb.js #592, v3 regression).
    db = await openDatabase(url, { namespace: 'hexvis', database: 'test' });
    const [rows] = await db.query<[{ name: string }[]]>('SELECT * FROM item');
    expect(rows).toStrictEqual([expect.objectContaining({ name: 'hello' })]);
  });
});
