import db from './database';
import { type Assets, fetchAssets, fetchLatestVersion } from './ddragon';

/**
 * Reads the stored patch record; `[[first]]` unwraps first statement, first row
 * (missing record → undefined).
 *
 * @param {string} version Patch version to compare against.
 * @returns {Promise<boolean>} True when the stored record matches the version.
 */
const isPatchCurrent = async (version: string): Promise<boolean> => {
  const [[first]] = await db.query<[{ version: string }[]]>('SELECT version FROM patch:current');
  return first?.version === version;
};

const replaceAssets = async (version: string, assets: Assets): Promise<void> => {
  // Version record is written last: a crash mid-replace resyncs on the next start.
  await db.query(
    `DELETE champion;
DELETE item;
INSERT INTO champion $champions;
INSERT INTO item $items;
UPSERT patch:current CONTENT { version: $version };`,
    { champions: assets.champions, items: assets.items, version },
  );
};

/**
 * Mirrors official Data Dragon patch metadata into the embedded store.
 * Skips asset downloads while the stored patch still matches the latest version;
 * a failed sync leaves the previous patch record in place, so the next start retries.
 */
export const syncPatchAssets = async (): Promise<void> => {
  const version = await fetchLatestVersion();
  if (await isPatchCurrent(version)) {
    return;
  }
  const assets = await fetchAssets(version);
  await replaceAssets(version, assets);
  console.info(`patch sync: ${version}`);
};
