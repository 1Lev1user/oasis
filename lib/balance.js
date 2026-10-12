// The balance table: every game number in one deep-frozen object. The owner tunes these values.
function deepFreeze(value) {
  for (const inner of Object.values(value)) if (inner !== null && typeof inner === 'object') deepFreeze(inner);
  return Object.freeze(value);
}

export const BALANCE = deepFreeze({
  gems: { step: 3, mini: 1, quest: 5, sunday: 10 },
  rareBonus: { chance: 0.03, multiplier: 2 },
  neglected: { perMiss: 1, max: 5, windowDays: 7 },
  species: { lizard: 0, chameleon: 30, gecko: 30, turtle: 50 },
  outfits: { cap: 10, strawhat: 15, crown: 40 },
  mine: { maxLevel: 3, upgrade: [60, 120] },
  storage: { slots: 10, chestGems: 25 },
  opensInWeek: { workshop: 3 },
  buildings: {
    lighthouse: { meter: 30, price: 80, gemsPerStep: 1 },
    watchtower: { meter: 60, price: 120 },
    observatory: { meter: 80, price: 160, rareChance: 0.06 },
  },
  streaks: [7, 14, 30],
  evolution: { egg: 0, baby: 10, teen: 30, adult: 60, legend: 100 },
  unlocks: {
    activities: { free: 3, every: 15, max: 6 },
    celebrations: { free: 3, every: 10, max: 8 },
  },
  meter: { step: 1, mini: 0.5, missLoss: [1, 2, 3] },
  pause: { maxDays: 7 },
  markYesterdayUntilHour: 12,
});
