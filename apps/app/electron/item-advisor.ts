import type { LivePlayer, LiveSnapshot } from './live-telemetry';

import db from './database';

const SUMMONERS_RIFT = '11';
const COMPLETED_DEPTH = 3;
// Six-digit ids duplicate four-digit shop items as mode variants.
const MAX_SHOP_ID = 9999;
const SUGGESTION_COUNT = 3;
const RESIST_SCALE = 100;
const WHOLE = 1;
const NONE = 0;
const EVEN_SHARE = 0.5;

/** Data Dragon item reduced to what the advisor reads. */
interface CatalogItem {
  id: number;
  name: string;
  gold: number;
  stats: Record<string, number>;
  boots: boolean;
  candidate: boolean;
}

/** Data Dragon champion ratings (0..10) used before enemies own items. */
interface ChampionInfo {
  attack: number;
  magic: number;
}

/** Stored patch data the advisor ranks against. */
interface Catalog {
  items: Map<number, CatalogItem>;
  champions: Map<string, ChampionInfo>;
}

/** Defensive state of the local player against the enemy damage mix. */
interface Profile {
  health: number;
  armor: number;
  magicResist: number;
  owned: number[];
  physical: number;
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

interface ChampionRow {
  id: string;
  info: ChampionInfo;
}

const stat = (item: CatalogItem | undefined, name: string): number => item?.stats[name] ?? NONE;

const sum = (values: number[]): number => values.reduce((total, value) => total + value, NONE);

/**
 * Share of the first part in a two-part total.
 *
 * @param {number} part Part whose share is wanted.
 * @param {number} other Remaining part.
 * @returns {number | undefined} Share in 0..1, undefined when both parts are zero.
 */
const share = (part: number, other: number): number | undefined => {
  if (part + other <= NONE) {
    return undefined;
  }
  return part / (part + other);
};

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
 * Share of physical damage the enemy team deals: their item AD against item AP,
 * or their champion ratings while no damage item is owned yet.
 *
 * @param {LivePlayer[]} enemies Enemy champions with inventories.
 * @param {Catalog} catalog Stored items and champion ratings.
 * @returns {number} Physical share in 0..1, even when nothing is known.
 */
const physicalShare = (enemies: LivePlayer[], catalog: Catalog): number => {
  const owned = enemies.flatMap(enemy => enemy.items.map(id => catalog.items.get(id)));
  const ratings = enemies.flatMap(enemy => catalog.champions.get(enemy.champion) ?? []);
  return (
    share(
      sum(owned.map(item => stat(item, 'FlatPhysicalDamageMod'))),
      sum(owned.map(item => stat(item, 'FlatMagicDamageMod'))),
    ) ??
    share(sum(ratings.map(info => info.attack)), sum(ratings.map(info => info.magic))) ??
    EVEN_SHARE
  );
};

/**
 * Health it takes to kill the player with the profile's damage mix, following
 * the resistance formula damage ÷ (1 + resist / 100).
 *
 * @param {Profile} profile Health, resistances and physical share.
 * @returns {number} Effective health.
 */
const effectiveHealth = (profile: Profile): number =>
  profile.health /
  (profile.physical / (WHOLE + profile.armor / RESIST_SCALE) +
    (WHOLE - profile.physical) / (WHOLE + profile.magicResist / RESIST_SCALE));

/**
 * Ranks candidate items by effective-health gain per gold against the enemy
 * damage mix; owned items and a second pair of boots are skipped.
 *
 * @param {CatalogItem[]} catalog Every stored item.
 * @param {Profile} profile Defensive state of the player.
 * @returns {CatalogItem[]} Best items first, at most three.
 */
const rankDefensiveItems = (catalog: CatalogItem[], profile: Profile): CatalogItem[] => {
  const hasBoots = catalog.some(item => item.boots && profile.owned.includes(item.id));
  const base = effectiveHealth(profile);
  const gain = (item: CatalogItem): number =>
    (effectiveHealth({
      ...profile,
      health: profile.health + stat(item, 'FlatHPPoolMod'),
      armor: profile.armor + stat(item, 'FlatArmorMod'),
      magicResist: profile.magicResist + stat(item, 'FlatSpellBlockMod'),
    }) -
      base) /
    item.gold;
  return catalog
    .filter(item => item.candidate && !profile.owned.includes(item.id) && !(hasBoots && item.boots))
    .map(item => ({ item, score: gain(item) }))
    .filter(entry => entry.score > NONE)
    .toSorted((left, right) => right.score - left.score)
    .slice(NONE, SUGGESTION_COUNT)
    .map(entry => entry.item);
};

/**
 * Reads the stored patch items and champion ratings.
 *
 * @returns {Promise<Catalog>} Catalog keyed by item id and champion id.
 */
const loadCatalog = async (): Promise<Catalog> => {
  const [itemRows, championRows] = await db.query<[ItemRow[], ChampionRow[]]>(
    `SELECT record::id(id) AS id, name, gold, stats, tags, maps, into, depth, inStore, requiredChampion FROM item;
SELECT record::id(id) AS id, info FROM champion;`,
  );
  return {
    items: new Map(itemRows.map(row => [Number(row.id), toCatalogItem(row)])),
    champions: new Map(championRows.map(row => [row.id, row.info])),
  };
};

/**
 * Top defensive items for the local player of one snapshot.
 *
 * @param {LiveSnapshot} snapshot Validated match telemetry.
 * @param {LivePlayer} me The local player's entry in the snapshot.
 * @param {Catalog} catalog Stored patch data.
 * @returns {CatalogItem[]} Best items first, at most three.
 */
const suggest = (snapshot: LiveSnapshot, me: LivePlayer, catalog: Catalog): CatalogItem[] => {
  const stats = snapshot.activePlayer.championStats;
  const enemies = snapshot.players.filter(player => player.team !== me.team);
  return rankDefensiveItems([...catalog.items.values()], {
    health: stats['maxHealth'] ?? NONE,
    armor: stats['armor'] ?? NONE,
    magicResist: stats['magicResist'] ?? NONE,
    owned: me.items,
    physical: physicalShare(enemies, catalog),
  });
};

/**
 * Creates the snapshot handler that ranks defensive items on every snapshot (an
 * in-memory pass over the catalog) and logs them only when the top three change.
 * The catalog loads once on first use; a failed load is retried with the next snapshot.
 *
 * @returns {function(LiveSnapshot): Promise<void>} Handler for one snapshot.
 */
export const createItemAdvisor = (): ((snapshot: LiveSnapshot) => Promise<void>) => {
  let catalog: Catalog | undefined;
  let last = '';
  return async (snapshot: LiveSnapshot): Promise<void> => {
    const me = snapshot.players.find(player => player.riotId === snapshot.activePlayer.riotId);
    if (me === undefined) {
      return;
    }
    catalog ??= await loadCatalog();
    const names = suggest(snapshot, me, catalog)
      .map(item => item.name)
      .join(', ');
    if (names !== last) {
      last = names;
      console.info(`advisor: ${names}`);
    }
  };
};
