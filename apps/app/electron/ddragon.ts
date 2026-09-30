const DDRAGON = 'https://ddragon.leagueoflegends.com';
const FIRST_INDEX = 0;
export const VERSIONS_URL = `${DDRAGON}/api/versions.json`;

export interface Assets {
  champions: unknown[];
  items: unknown[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Narrows the versions.json payload to a non-empty string array.
 *
 * @param {unknown} value Raw JSON response body.
 * @returns {value is [string, ...string[]]} True when at least the first entry is a string.
 */
const isVersionList = (value: unknown): value is [string, ...string[]] =>
  Array.isArray(value) && typeof value[FIRST_INDEX] === 'string';

export const cdnUrl = (version: string, asset: string): string =>
  `${DDRAGON}/cdn/${version}/data/en_US/${asset}.json`;

const fetchJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ddragon: ${res.status} for ${url}`);
  }
  return res.json();
};

/**
 * Narrows a payload's `data` map when every entry is an object record, so callers
 * may spread entries without casting (`spread of unknown` does not type-check).
 *
 * @param {Record<string, unknown>} value Candidate data map.
 * @returns {value is Record<string, Record<string, unknown>>} True when all entries are records.
 */
const hasRecordValues = (
  value: Record<string, unknown>,
): value is Record<string, Record<string, unknown>> =>
  Object.values(value).every(entry => isRecord(entry));

/**
 * Validates the Data Dragon asset payload shape `{ version, data }` for one asset
 * list and returns the keyed map; throws a TypeError on any malformed response.
 *
 * @param {unknown} payload Raw JSON response body.
 * @param {string} asset Asset name used in the error message.
 * @returns {Record<string, Record<string, unknown>>} Keyed asset documents.
 */
const parseData = (payload: unknown, asset: string): Record<string, Record<string, unknown>> => {
  if (
    !isRecord(payload) ||
    typeof payload['version'] !== 'string' ||
    !isRecord(payload['data']) ||
    !hasRecordValues(payload['data'])
  ) {
    throw new TypeError(`ddragon: malformed asset list for ${asset}`);
  }
  return payload['data'];
};

/**
 * Fetches the latest available patch version from the official versions list.
 *
 * @returns {string} Newest version string.
 */
export const fetchLatestVersion = async (): Promise<string> => {
  const versions = await fetchJson(VERSIONS_URL);
  if (!isVersionList(versions)) {
    throw new TypeError('ddragon: malformed version list');
  }
  return versions[FIRST_INDEX];
};

/**
 * Downloads champion and item metadata for one patch.
 *
 * @param {string} version Patch version to download.
 * @returns {Assets} Raw documents ready for insertion.
 */
export const fetchAssets = async (version: string): Promise<Assets> => {
  // Both payload requests run in parallel; the store replace below stays sequential.
  const [championPayload, itemPayload] = await Promise.all([
    fetchJson(cdnUrl(version, 'champion')),
    fetchJson(cdnUrl(version, 'item')),
  ]);
  const champions = Object.values(parseData(championPayload, 'champion'));
  const items = Object.entries(parseData(itemPayload, 'item')).map(([id, item]) => ({
    id,
    ...item,
  }));
  return { champions, items };
};
