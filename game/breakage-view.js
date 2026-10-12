// Where the broken objects stand in the oasis and which texture shows them. Pure, no Phaser.
// Spots are in 160x140 safe-area coordinates: x is the centre, y the bottom edge. They sit in the back of the oasis (y below 90 is the
// lizard's walking ground), clear of the pond, the burrow and the well, at least 10 px apart.
import { addDays } from '../lib/dates.js';
import { confirmPayment } from '../lib/debt.js';

export const BREAK_SPOTS = {
  // small
  flowerpot: { x: 110, y: 88 },
  sign: { x: 122, y: 88 },
  lantern: { x: 147, y: 88 },
  fence: { x: 111, y: 62 },
  bucket: { x: 134, y: 88 },
  // medium
  bench: { x: 94, y: 89 },
  well_roof: { x: 70, y: 64 },
  bridge: { x: 94, y: 64 },
  cart: { x: 127, y: 62 },
  // large
  palm: { x: 46, y: 72 },
  hut_roof: { x: 22, y: 72 },
  tower: { x: 150, y: 64 },
};

export const brokenSprite = (id) => `${id}_broken`;
export const fixedSprite = (id) => `${id}_whole`;

// What to draw for brokenNow(): one entry per object id (the first break of an object wins), oldest first.
export function viewFor(broken) {
  const seen = new Set();
  return broken.flatMap(({ object, size }) => {
    if (seen.has(object) || !BREAK_SPOTS[object]) return [];
    seen.add(object);
    return [{ id: object, size, ...BREAK_SPOTS[object], key: brokenSprite(object) }];
  });
}

// ?demo=1&broken=1: the demo contract with the last two days missed (a check-in after a miss would repair it, so none follows) and the
// debt those two adjacent misses open already paid, so today's step is still possible.
export function demoBroken(contract, today) {
  const checkins = { ...contract.checkins };
  delete checkins[addDays(today, -1)];
  delete checkins[addDays(today, -2)];
  const missed = { ...contract, checkins };
  const paid = confirmPayment(missed, today);
  return paid.ok ? paid.contract : missed;
}
