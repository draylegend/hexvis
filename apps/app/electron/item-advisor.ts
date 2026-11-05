import type { LivePlayer, LiveSnapshot } from './live-telemetry';

import db from './database';
import { type Catalog, type CatalogItem, loadCatalog } from './item-catalog';

const SUGGESTION_COUNT = 3;
const CORE_COUNT = 2;
const WILSON_Z = 1.96;
const RESIST_SCALE = 100;
const WHOLE = 1;
const TWO = 2;
const FOUR = 4;
const NONE = 0;
const EVEN_SHARE = 0.5;

/** Collected games and wins of one item on one champion and position. */
export interface ItemStat {
  item: number;
  games: number;
  wins: number;
}

/** Pool item with its win-rate lower bound. */
interface RankedItem {
  item: CatalogItem;
  score: number;
}

/** Defensive state of the local player against the enemy damage mix. */
interface Profile {
  health: number;
  armor: number;
  magicResist: number;
  physical: number;
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
 * Share of physical damage the enemy team deals: their item AD against item AP,
 * or their champion ratings while no damage item is owned yet.
 *
 * @param {LivePlayer[]} enemies Enemy champions with inventories.
 * @param {Catalog} catalog Stored items and champion ratings.
 * @returns {number} Physical share in 0..1, even when nothing is known.
 */
const physicalShare = (enemies: LivePlayer[], catalog: Catalog): number => {
  const owned = enemies.flatMap(enemy => enemy.items.map(id => catalog.items.get(id)));
  const ratings = enemies.flatMap(enemy => catalog.champions.get(enemy.champion)?.info ?? []);
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
 * Effective-health gain per gold one item adds against the enemy damage mix.
 *
 * @param {CatalogItem} item Candidate item.
 * @param {Profile} profile Defensive state of the player.
 * @returns {number} Gain per gold, zero for items without defensive stats.
 */
const defensiveGain = (item: CatalogItem, profile: Profile): number =>
  (effectiveHealth({
    ...profile,
    health: profile.health + stat(item, 'FlatHPPoolMod'),
    armor: profile.armor + stat(item, 'FlatArmorMod'),
    magicResist: profile.magicResist + stat(item, 'FlatSpellBlockMod'),
  }) -
    effectiveHealth(profile)) /
  item.gold;

/**
 * Lower bound of the 95% Wilson interval of a win rate: few games pull the
 * bound down, so rare items with lucky win rates do not outrank proven ones.
 *
 * @param {number} wins Games won with the item.
 * @param {number} games Games finished with the item.
 * @returns {number} Lower bound in 0..1.
 */
export const wilsonLowerBound = (wins: number, games: number): number => {
  const rate = wins / games;
  const spread = WILSON_Z * WILSON_Z;
  const margin = WILSON_Z * Math.sqrt((rate * (WHOLE - rate) + spread / (FOUR * games)) / games);
  return (rate + spread / (TWO * games) - margin) / (WHOLE + spread / games);
};

/**
 * Buyable pool items ranked by win-rate lower bound: completed shop items, not
 * owned, no second pair of boots; the bound itself discounts small samples.
 *
 * @param {ItemStat[]} pool Stats of the champion and position.
 * @param {Map<number, CatalogItem>} items Catalog by item id.
 * @param {number[]} owned Item ids in the player's inventory.
 * @returns {RankedItem[]} Best lower bound first.
 */
const rankPool = (
  pool: ItemStat[],
  items: Map<number, CatalogItem>,
  owned: number[],
): RankedItem[] => {
  const hasBoots = owned.some(id => items.get(id)?.boots === true);
  return pool
    .filter(row => !owned.includes(row.item))
    .flatMap(row => {
      const item = items.get(row.item);
      if (item === undefined || !item.candidate || (hasBoots && item.boots)) {
        return [];
      }
      return [{ item, score: wilsonLowerBound(row.wins, row.games) }];
    })
    .toSorted((left, right) => right.score - left.score);
};

/**
 * Picks the suggestions from a champion's ranked pool: the two items with the
 * best win-rate lower bound as the core, then the pool item that best covers
 * the enemy damage mix (the next ranked item when none adds defense).
 *
 * @param {RankedItem[]} ranked Buyable pool items, best lower bound first.
 * @param {Profile} profile Defensive state of the player.
 * @returns {CatalogItem[]} Suggestions, at most three.
 */
const pickItems = (ranked: RankedItem[], profile: Profile): CatalogItem[] => {
  const core = ranked.slice(NONE, CORE_COUNT).map(entry => entry.item);
  const rest = ranked.slice(CORE_COUNT).map(entry => entry.item);
  const fit = rest
    .map(item => ({ item, gain: defensiveGain(item, profile) }))
    .filter(entry => entry.gain > NONE)
    .toSorted((left, right) => right.gain - left.gain)
    .map(entry => entry.item);
  return [...new Set([...core, ...fit, ...rest])].slice(NONE, SUGGESTION_COUNT);
};

/**
 * Item statistics of the player's champion and position in the stored patch;
 * while the champion has none yet, the items of every champion on the position.
 *
 * @param {Catalog} catalog Stored patch data.
 * @param {LivePlayer} me The local player's entry.
 * @returns {Promise<ItemStat[]>} Stats per item, empty only before any collection.
 */
const loadPool = async (catalog: Catalog, me: LivePlayer): Promise<ItemStat[]> => {
  const [own, position] = await db.query<[ItemStat[], ItemStat[]]>(
    `SELECT item, games, wins FROM item_stat WHERE patch = $patch AND champion = $champion AND position = $position;
SELECT item, math::sum(games) AS games, math::sum(wins) AS wins FROM item_stat
  WHERE patch = $patch AND position = $position GROUP BY item;`,
    {
      patch: catalog.patch,
      champion: catalog.champions.get(me.champion)?.key,
      position: me.position,
    },
  );
  if (own.length > NONE) {
    return own;
  }
  return position;
};

/**
 * Suggestions for the local player of one snapshot.
 *
 * @param {LiveSnapshot} snapshot Validated match telemetry.
 * @param {LivePlayer} me The local player's entry in the snapshot.
 * @param {{ catalog: Catalog; pool: ItemStat[] }} data Stored patch data and the player's pool.
 * @returns {CatalogItem[]} Suggestions, at most three.
 */
const suggest = (
  snapshot: LiveSnapshot,
  me: LivePlayer,
  data: { catalog: Catalog; pool: ItemStat[] },
): CatalogItem[] => {
  const stats = snapshot.activePlayer.championStats;
  const enemies = snapshot.players.filter(player => player.team !== me.team);
  return pickItems(rankPool(data.pool, data.catalog.items, me.items), {
    health: stats['maxHealth'] ?? NONE,
    armor: stats['armor'] ?? NONE,
    magicResist: stats['magicResist'] ?? NONE,
    physical: physicalShare(enemies, data.catalog),
  });
};

/**
 * Creates a pool reader that loads the champion and position statistics once
 * per match: a new champion, position or a game clock that ran backwards (next
 * match) reloads them, so statistics collected meanwhile are picked up.
 *
 * @returns {function(Catalog, LivePlayer, number): Promise<ItemStat[]>} Pool reader.
 */
const createPoolReader = (): ((
  catalog: Catalog,
  me: LivePlayer,
  gameTime: number,
) => Promise<ItemStat[]>) => {
  let pool: ItemStat[] = [];
  let loadedFor = '';
  let lastTime = NONE;
  return async (catalog: Catalog, me: LivePlayer, gameTime: number): Promise<ItemStat[]> => {
    const key = `${me.champion} ${me.position}`;
    if (key !== loadedFor || gameTime < lastTime) {
      pool = await loadPool(catalog, me);
      loadedFor = key;
    }
    lastTime = gameTime;
    return pool;
  };
};

/**
 * Creates the snapshot handler that suggests items from the collected ranked
 * statistics of the player's champion and position, fitted to the enemy damage
 * mix, and logs them only when they change. The catalog loads once and the pool
 * once per match; failed loads retry with the next snapshot.
 *
 * @returns {function(LiveSnapshot): Promise<void>} Handler for one snapshot.
 */
export const createItemAdvisor = (): ((snapshot: LiveSnapshot) => Promise<void>) => {
  let catalog: Catalog | undefined;
  const readPool = createPoolReader();
  let last = '';
  return async (snapshot: LiveSnapshot): Promise<void> => {
    const me = snapshot.players.find(player => player.riotId === snapshot.activePlayer.riotId);
    if (me === undefined) {
      return;
    }
    catalog ??= await loadCatalog();
    const pool = await readPool(catalog, me, snapshot.gameTime);
    const names = suggest(snapshot, me, { catalog, pool }).map(item => item.name);
    const line = names.join(', ') || `no statistics for ${me.champion} ${me.position} yet`;
    if (line !== last) {
      last = line;
      console.info(`advisor: ${line}`);
    }
  };
};
