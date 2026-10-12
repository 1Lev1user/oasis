// Earning and spending gems. Pure functions over `game` (state.game), never mutated.
// Gems buy species, outfits and mine upgrades only: nothing here touches money, misses or debt.
import { BALANCE } from './balance.js';
import { addDays } from './dates.js';
import { dayStatuses, missesOf } from './ledger.js';

const START_SPECIES = 'lizard';
const has = (table, id) => Object.hasOwn(table, id);
const ownedOf = (game) => ({
  species: [...new Set([START_SPECIES, ...(game.owned?.species ?? [])])],
  outfits: game.owned?.outfits ?? [],
});
const mineLevel = (game, contractId) => game.mine?.[contractId] ?? 1;

export const builtFor = (game, habitId) => {
  const list = Object.hasOwn(game.buildings ?? {}, habitId) ? game.buildings[habitId] : [];
  return Array.isArray(list) ? list : [];
};

export function stepReward(contract, date, kind, rng = Math.random, built = []) {
  const { windowDays, perMiss, max } = BALANCE.neglected;
  const from = addDays(date, -windowDays);
  const missed = dayStatuses(contract, date).filter((d) => d.date >= from).reduce((sum, d) => sum + missesOf(d), 0);
  const neglected = Math.min(max, perMiss * missed);
  const rare = rng() < (built.includes('observatory') ? BALANCE.buildings.observatory.rareChance : BALANCE.rareBonus.chance);
  const base = kind === 'mini' ? BALANCE.gems.mini : BALANCE.gems.step;
  const reward = { gems: base * (rare ? BALANCE.rareBonus.multiplier : 1) + neglected, rare, neglected };
  if (!built.includes('lighthouse')) return reward;
  return { ...reward, gems: reward.gems + BALANCE.buildings.lighthouse.gemsPerStep, lighthouse: 1 };
}

export function applyStep(game, contractId, reward) {
  const stored = Math.min(BALANCE.storage.slots, (game.storage?.[contractId] ?? 0) + 1);
  return {
    ...game,
    gems: (game.gems ?? 0) + reward.gems + mineLevel(game, contractId),
    storage: { ...game.storage, [contractId]: stored },
  };
}

export function openChest(game, contractId) {
  if ((game.storage?.[contractId] ?? 0) < BALANCE.storage.slots) return { ok: false, error: 'not_full' };
  return {
    ok: true,
    game: { ...game, gems: (game.gems ?? 0) + BALANCE.storage.chestGems, storage: { ...game.storage, [contractId]: 0 } },
  };
}

export function buy(game, item) {
  const gems = game.gems ?? 0;
  const owned = ownedOf(game);
  let price;
  let apply;

  if (item.type === 'species' || item.type === 'outfit') {
    const table = item.type === 'species' ? BALANCE.species : BALANCE.outfits;
    const key = item.type === 'species' ? 'species' : 'outfits';
    if (!has(table, item.id)) return { ok: false, error: 'unknown' };
    if (owned[key].includes(item.id)) return { ok: false, error: 'owned' };
    price = table[item.id];
    apply = () => ({ owned: { ...owned, [key]: [...owned[key], item.id] } });
  } else if (item.type === 'mine') {
    const level = mineLevel(game, item.contractId);
    if (level >= BALANCE.mine.maxLevel) return { ok: false, error: 'max_level' };
    price = BALANCE.mine.upgrade[level - 1];
    apply = () => ({ mine: { ...game.mine, [item.contractId]: level + 1 } });
  } else if (item.type === 'building') {
    const validHabit = typeof item.habitId === 'string' && item.habitId.length >= 1 && item.habitId.length <= 120;
    if (!has(BALANCE.buildings, item.id) || !validHabit) return { ok: false, error: 'unknown' };
    const built = builtFor(game, item.habitId);
    if (built.includes(item.id)) return { ok: false, error: 'owned' };
    if (!(item.meter >= BALANCE.buildings[item.id].meter)) return { ok: false, error: 'locked' };
    price = BALANCE.buildings[item.id].price;
    apply = () => ({ buildings: { ...game.buildings, [item.habitId]: [...built, item.id] } });
  } else {
    return { ok: false, error: 'unknown' };
  }

  if (gems < price) return { ok: false, error: 'not_enough' };
  return { ok: true, game: { ...game, gems: gems - price, owned, ...apply() } };
}

export function equip(game, contractId, { species, outfit }) {
  const owned = ownedOf(game);
  if (!owned.species.includes(species) || (outfit !== null && !owned.outfits.includes(outfit))) {
    return { ok: false, error: 'not_owned' };
  }
  return { ok: true, game: { ...game, equipped: { ...game.equipped, [contractId]: { species, outfit } } } };
}

// A renewal keeps the district as it was: the old contract's entries are copied to the new id.
export function carryOver(game, fromContractId, toContractId) {
  const next = { ...game };
  for (const key of ['mine', 'storage', 'equipped', 'last']) {
    if (Object.hasOwn(game[key] ?? {}, fromContractId)) next[key] = { ...game[key], [toContractId]: game[key][fromContractId] };
  }
  return next;
}
