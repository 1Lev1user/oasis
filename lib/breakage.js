// What breaks in the oasis after a miss and what the next step repairs. Pure functions: dates as local 'YYYY-MM-DD' strings.
import { meterState } from './meter.js';

// Object ids the scene draws, by size. Miss tier 1 -> small, 2 -> medium, 3 and more -> large.
export const BREAKABLE = {
  small: ['flowerpot', 'sign', 'lantern', 'fence', 'bucket'],
  medium: ['bench', 'well_roof', 'bridge', 'cart'],
  large: ['palm', 'hut_roof', 'tower'],
};
const SIZES = ['small', 'medium', 'large'];

// FNV-1a, 32 bit.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// The same miss (contract, date and position n among that date's misses) always breaks the same object, also after a reload.
export function pickObject(contractId, date, tier, n = 0) {
  const list = BREAKABLE[SIZES[Math.min(tier, SIZES.length) - 1]];
  return list[hash(contractId + date + n) % list.length];
}

// Misses not followed by a check-in on a day for which `counts(day)` holds, oldest first. A miss dated D is repaired only by a check-in strictly after D.
function broken(contract, today, counts, built) {
  const last = Object.keys(contract.checkins).filter((d) => d <= today && counts(d)).sort().at(-1) ?? '';
  const seen = {};
  return meterState(contract, today).misses.flatMap(({ date, tier }) => {
    const n = (seen[date] = (seen[date] ?? -1) + 1);
    if (date < last || (tier === 1 && built.includes('watchtower'))) return [];
    return [{ date, tier, size: SIZES[Math.min(tier, SIZES.length) - 1], object: pickObject(contract.id, date, tier, n) }];
  });
}

// Everything broken at the end of `today`: a check-in on a later day (today included) repairs all earlier breakages.
// With a watchtower in `built` the first miss of a week (tier 1) breaks nothing.
export const brokenNow = (contract, today, built = []) => broken(contract, today, () => true, built);

// The breakages a check-in on `date` repairs: what is broken before that check-in (a check-in already on `date` is left out).
export const repairedBy = (contract, date, built = []) => broken(contract, date, (d) => d < date, built);
