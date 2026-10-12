// What the museum shows: one house per finished contract, the trophy shelf, where things stand in the hall, the growth check and the
// ?demo=1 seed. Pure, no Phaser, no DOM. Every rule comes from app/lib (trophies.js, meter.js, balance.js).
import { BALANCE } from '../lib/balance.js';
import { addDays } from '../lib/dates.js';
import { DEFAULT_GAME } from '../lib/game-state.js';
import { stageFor } from '../lib/meter.js';
import { TROPHIES, earned } from '../lib/trophies.js';
import { WORLD, SAFE } from './scale.js';
import { demoMeter } from './demo.js';

// Houses drawn in the hall (the newest); the HUD lists them all.
export const MAX_SHOWN = 6;
const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const CENTRE = OX + SAFE.w / 2;

// { houses, trophies }: the museum's houses newest first ({ contractId, action, endDate, meter, stage }) and every trophy with its state.
export function hall(state, today) {
  const got = new Set(earned(state, today));
  return {
    houses: [...(state.game?.museum?.houses ?? [])].reverse().map(({ contractId, action, endDate, meter, stage }) => ({ contractId, action, endDate, meter, stage })),
    trophies: TROPHIES.map((id) => ({ id, earned: got.has(id) })),
  };
}

// n things in rows of `perRow`, each row centred on the hall's middle; row k stands on y = bottom + k * rowGap.
const rows = (n, perRow, gap, bottom, rowGap) => Array.from({ length: n }, (_, i) => {
  const row = Math.floor(i / perRow);
  const inRow = Math.min(perRow, n - row * perRow);
  return { x: CENTRE + Math.round(((i % perRow) - (inRow - 1) / 2) * gap), y: bottom + row * rowGap };
});

// Bottom-centre positions in world pixels: trophies stand on shelves on the wall, houses on the floor.
export const trophySpots = (n) => rows(n, 7, 20, OY + 46, 28);
export const houseSpots = (n) => rows(Math.min(n, MAX_SHOWN), 3, 44, OY + 108, 26);

// True when `after` is a higher stage than `before`: the step moved the keeper up.
export const stageUp = (before, after) => {
  const stages = Object.keys(BALANCE.evolution);
  return stages.indexOf(after) > stages.indexOf(before);
};

// ?demo=1 on a load that seeded the demo contract (`seeded`): ?meter=N for it and, in an empty museum, one demo house, so the hall and
// the shelf can be tried. Never on another load or with another demo value.
export function demoMuseum(search, seeded, state, today) {
  if (!seeded || new URLSearchParams(search).get('demo') !== '1') return state;
  const game = state.game ?? DEFAULT_GAME;
  const houses = game.museum?.houses ?? [];
  const meter = 41;
  const demo = { contractId: 'demo-house', habitId: 'demo', endDate: addDays(today, -7), meter, stage: stageFor(meter), action: 'Читаю 10 страниц', owedCents: 0 };
  const last = state.contracts.length - 1;
  return {
    ...state,
    contracts: state.contracts.map((c, i) => (i === last ? demoMeter(search, true, c) : c)),
    game: houses.length ? game : { ...game, museum: { houses: [demo] } },
  };
}
