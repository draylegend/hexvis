import fs from 'node:fs';
import path from 'node:path';

import db from './database';
import { VERSIONS_URL, cdnUrl } from './ddragon';
import { syncPatchAssets } from './patch-sync';

const resolveUrl = (input: string | URL | Request): string => {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
};

interface DdragonStub {
  fetch: typeof fetch;
  calls: string[];
  updateTo: (version: string, champion: string) => void;
}

const stubDdragon = (): DdragonStub => {
  const fixtures = new Map<string, Promise<unknown>>();
  const calls: string[] = [];
  const updateTo = (version: string, champion: string): void => {
    fixtures.set(VERSIONS_URL, Promise.resolve([version]));
    fixtures.set(
      cdnUrl(version, 'champion'),
      Promise.resolve({ version, data: { [champion]: { id: champion, name: champion } } }),
    );
    fixtures.set(
      cdnUrl(version, 'item'),
      Promise.resolve({ version, data: { 1001: { name: 'Boots' } } }),
    );
  };
  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    const url = resolveUrl(input);
    calls.push(url);
    return Response.json(await fixtures.get(url));
  };
  updateTo('1.2.3', 'Aatrox');
  return { fetch: fetchImpl, calls, updateTo };
};

// surrealkv:// only supports cwd-relative paths on Windows: `C:` parses as URL host
// (creates a stray `C/` tree), triple-slash hangs, backslashes throw ERR_INVALID_URL.
const tempDir = (): string => {
  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
  return fs.mkdtempSync(path.join(process.cwd(), 'data', 'spec-'));
};

describe('patch sync', () => {
  let dir: string;
  let url: string;
  let stub: DdragonStub;

  beforeEach(() => {
    dir = tempDir();
    url = `surrealkv://./${path.relative(process.cwd(), dir).replaceAll('\\', '/')}`;
    stub = stubDdragon();
    vi.stubGlobal('fetch', stub.fetch);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.close().catch(console.warn);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('populates a fresh patch', async () => {
    await db.connect(url, { namespace: 'hexvis', database: 'test' });
    await syncPatchAssets();
    expect(stub.calls).toStrictEqual([
      VERSIONS_URL,
      cdnUrl('1.2.3', 'champion'),
      cdnUrl('1.2.3', 'item'),
    ]);
    const [champions] = await db.query<[{ name: string }[]]>('SELECT name FROM champion:Aatrox');
    expect(champions).toStrictEqual([expect.objectContaining({ name: 'Aatrox' })]);
    const [items] = await db.query<[{ name: string }[]]>('SELECT name FROM item');
    expect(items).toStrictEqual([expect.objectContaining({ name: 'Boots' })]);
  });

  it('skips assets while the stored patch is current', async () => {
    await db.connect(url, { namespace: 'hexvis', database: 'test' });
    await syncPatchAssets();
    await syncPatchAssets();
    expect(stub.calls).toStrictEqual([
      VERSIONS_URL,
      cdnUrl('1.2.3', 'champion'),
      cdnUrl('1.2.3', 'item'),
      VERSIONS_URL,
    ]);
  });

  it('replaces stale assets when the patch updates', async () => {
    await db.connect(url, { namespace: 'hexvis', database: 'test' });
    await syncPatchAssets();
    stub.updateTo('1.2.4', 'Ahri');
    await syncPatchAssets();
    const [champions] = await db.query<[{ name: string }[]]>('SELECT name FROM champion');
    expect(champions).toStrictEqual([{ name: 'Ahri' }]);
    const [patch] = await db.query<[{ version: string }[]]>('SELECT version FROM patch:current');
    expect(patch).toStrictEqual([{ version: '1.2.4' }]);
  });
});
