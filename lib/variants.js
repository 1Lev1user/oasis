// Animation variants: when each one unlocks and which one plays next. Pure functions.
import { BALANCE } from './balance.js';

// Meter percentage at which the variant at `index` unlocks; Infinity beyond the maximum.
export function unlockAt(kind, index) {
  const { free, every, max } = BALANCE.unlocks[kind];
  if (index >= max) return Infinity;
  return index < free ? 0 : (index - free + 1) * every;
}

// Random unlocked variant, avoiding `last` when there is a choice; null when none is unlocked.
export function pickVariant(pool, { meter, last = null, rng = Math.random }) {
  let candidates = pool.filter((item) => item.unlockAt <= meter);
  if (candidates.length > 1) candidates = candidates.filter((item) => item.id !== last);
  return candidates[Math.floor(rng() * candidates.length)] ?? null;
}
