import db from './database';

const SUMMONERS_RIFT = '11';
const COMPLETED_DEPTH = 3;
// Six-digit ids duplicate four-digit shop items as mode variants.
const MAX_SHOP_ID = 9999;
const NONE = 0;

/** Data Dragon item reduced to what the advisor reads. */
export interface CatalogItem {
  id: number;
  name: string;
  gold: number;
  stats: Record<string, number>;
  boots: boolean;
  candidate: boolean;
}

/** Data Dragon champion ratings (0..10) used before enemies own items. */
export interface ChampionInfo {
  attack: number;
  magic: number;
}

/** Stored champion: numeric key (match statistics) and ratings. */
export interface ChampionRow {
  id: string;
  key: string;
  info: ChampionInfo;
}

/** Stored patch data the advisor ranks against. */
export interface Catalog {
  items: Map<number, CatalogItem>;
  champions: Map<string, ChampionRow>;
  /** Patch prefix such as `16.22.`. */
  patch: string;
}

interface ItemRow {
  id: string;
  name: string;
  gold: { total: number; purchasable: boolean };
  stats: Record<string, number>;
  tags: string[];
  maps: Record<string, boolean>;
  into?: string[];
  depth?: number;
  inStore?: boolean;
  requiredChampion?: string;
}

/**
 * Whether the shop sells the item as a finished Summoner's Rift buy: completed
 * (no upgrade path), not a starter, not champion-locked, not a mode variant.
 *
 * @param {ItemRow} row Stored Data Dragon item.
 * @returns {boolean} True when the item may be suggested.
 */
const isCandidate = (row: ItemRow): boolean =>
  row.maps[SUMMONERS_RIFT] === true &&
  row.gold.purchasable &&
  row.inStore !== false &&
  row.into === undefined &&
  (row.depth ?? NONE) >= COMPLETED_DEPTH &&
  row.requiredChampion === undefined &&
  Number(row.id) <= MAX_SHOP_ID;

const toCatalogItem = (row: ItemRow): CatalogItem => ({
  id: Number(row.id),
  name: row.name,
  gold: row.gold.total,
  stats: row.stats,
  boots: row.tags.includes('Boots'),
  candidate: isCandidate(row),
});

/**
 * Reads the stored patch items, champions and the stored patch prefix.
 *
 * @returns {Promise<Catalog>} Catalog keyed by item id and champion id.
 */
export const loadCatalog = async (): Promise<Catalog> => {
  const [itemRows, championRows, [current]] = await db.query<
    [ItemRow[], ChampionRow[], { version: string }[]]
  >(
    `SELECT record::id(id) AS id, name, gold, stats, tags, maps, into, depth, inStore, requiredChampion FROM item;
SELECT record::id(id) AS id, key, info FROM champion;
SELECT version FROM patch:current;`,
  );
  const [major, minor] = (current?.version ?? '').split('.');
  return {
    items: new Map(itemRows.map(row => [Number(row.id), toCatalogItem(row)])),
    champions: new Map(championRows.map(row => [row.id, row])),
    patch: `${major}.${minor}.`,
  };
};
