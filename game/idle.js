// What the lizard does when nobody is playing: the behaviour table and a weighted picker. Pure, no Phaser.
const COOLDOWN_MS = 9000;
export const IDLE = [
  { id: 'wander', weight: 5, cooldownMs: 0 },
  { id: 'look', weight: 2, cooldownMs: COOLDOWN_MS },
  { id: 'fly', weight: 2, cooldownMs: COOLDOWN_MS },
  { id: 'drink', weight: 1.5, cooldownMs: COOLDOWN_MS },
  { id: 'sun', weight: 1.2, cooldownMs: COOLDOWN_MS },
  { id: 'nap', weight: 0.8, cooldownMs: COOLDOWN_MS },
  { id: 'chase', weight: 1.2, cooldownMs: COOLDOWN_MS },
];

// Weighted pick among items whose cooldown (id -> time it ends, ms) is over and that are not `last`
// (unless `last` is the only one left). Everything cooling: the first item. Does not change `cooldowns`.
export function pickIdle(list, now, cooldowns, last, rng = Math.random) {
  const ready = list.filter((x) => !(cooldowns[x.id] > now));
  const fresh = ready.filter((x) => x.id !== last);
  const pool = fresh.length ? fresh : ready;
  if (!pool.length) return list[0];
  let r = rng() * pool.reduce((sum, x) => sum + x.weight, 0);
  for (const x of pool) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return pool[pool.length - 1];
}
