import db from './database';

/**
 * Reads the stored champion name for a raw champion id (LCU championId, e.g. 266).
 * Misses return undefined instead of throwing, so unknown ids stay harmless.
 *
 * @param {number} id Raw numeric champion id.
 * @returns {Promise<string | undefined>} Champion name, undefined when unknown.
 */
export const getChampionName = async (id: number): Promise<string | undefined> => {
  // Champion records are keyed by name (payload id), so the raw id resolves via
  // The key field; 173 rows make this scan cheaper than any index maintenance.
  const [[row]] = await db.query<[{ name: string }[]]>(
    'SELECT name FROM champion WHERE key = $key LIMIT 1',
    { key: String(id) },
  );
  return row?.name;
};

/**
 * Reads the stored item name for a raw item id (e.g. 1001).
 * Misses return undefined instead of throwing, so unknown ids stay harmless.
 *
 * @param {number} id Raw numeric item id.
 * @returns {Promise<string | undefined>} Item name, undefined when unknown.
 */
export const getItemName = async (id: number): Promise<string | undefined> => {
  // Item records are keyed by the raw id as a string (item:⟨1001⟩), so a param
  // Builds the record id directly: one KV lookup, no scan.
  const [[row]] = await db.query<[{ name: string }[]]>(
    'SELECT name FROM type::thing("item", $id)',
    { id: String(id) },
  );
  return row?.name;
};
