// What the workshop shows: when it is open, the shelf, the keeper's look and the demo switches. Pure, no Phaser, no DOM.
// Every rule comes from app/lib/gems.js and the balance table. Gems never relate to money.
import { BALANCE } from '../lib/balance.js';
import { DEFAULT_GAME } from '../lib/game-state.js';
import { equip } from '../lib/gems.js';
import { activeContracts } from '../lib/contract.js';
import { addDays, daysBetween } from '../lib/dates.js';

const WEEK = 7;
const DEMO_START_DAY = 4; // the demo contract starts four days before today (demo.js): day 5, the fifth day of week 1
const MAX_GEMS = 9999;

// True from the first day of week BALANCE.opensInWeek.workshop of the contract (week 1 = the first 7 days from startDate).
export const workshopOpen = (contract, today) =>
  !!contract && daysBetween(contract.startDate, today) >= (BALANCE.opensInWeek.workshop - 1) * WEEK;

// Species then outfits: { type, id, price, owned, affordable }. The lizard is always owned.
export function shelf(game) {
  const g = game ?? DEFAULT_GAME;
  const owned = { species: ['lizard', ...(g.owned?.species ?? [])], outfit: g.owned?.outfits ?? [] };
  const gems = g.gems ?? 0;
  return [['species', BALANCE.species], ['outfit', BALANCE.outfits]].flatMap(([type, prices]) =>
    Object.entries(prices).map(([id, price]) => ({ type, id, price, owned: owned[type].includes(id), affordable: gems >= price })));
}

// { species, outfit } this habit's keeper wears: the lizard without an outfit until the owner dresses it.
export function lookOf(game, contractId) {
  const look = Object.hasOwn(game?.equipped ?? {}, contractId) ? game.equipped[contractId] : null;
  return { species: look?.species ?? 'lizard', outfit: look?.outfit ?? null };
}

// «Надеть» / «Снять»: equip with one part of the look changed ({ species } or { outfit }, null = no outfit), the other kept.
export const wear = (game, contractId, change) => equip(game, contractId, { ...lookOf(game, contractId), ...change });

const flag = (search, name) => new URLSearchParams(search).get(name);

// Moves a contract so that `today` is the fifth day of `week`, filling the new days before its first check-in with steps.
function inWeek(c, week, today) {
  const startDate = addDays(today, -(WEEK * (week - 1) + DEMO_START_DAY));
  const first = Object.keys(c.checkins).sort()[0] ?? today;
  const checkins = { ...c.checkins };
  for (let d = startDate; d < first; d = addDays(d, 1)) checkins[d] = 'done';
  return { ...c, createdAt: startDate, startDate, endDate: addDays(startDate, c.termDays - 1), signedAt: startDate, checkins };
}

// ?demo=1 (or the village demo ?demo=3) with gems=N (0..9999) gives N gems; with week=N (1..the term) puts today in week N of every active contract (`defaultWeek`
// when ?week is absent). Only when this load seeded the demo (`seeded`); else, and for a bad value, the state itself.
export function demoShop(search, seeded, state, today, defaultWeek = null) {
  if (!seeded || !['1', '3'].includes(flag(search, 'demo'))) return state;
  let next = state;
  const gems = flag(search, 'gems') ?? '';
  if (/^\d{1,4}$/.test(gems) && Number(gems) <= MAX_GEMS) next = { ...next, game: { ...(next.game ?? DEFAULT_GAME), gems: Number(gems) } };
  const asked = flag(search, 'week');
  const week = asked === null ? defaultWeek : /^\d$/.test(asked) ? Number(asked) : null;
  if (week === null) return next;
  const active = new Set(activeContracts(next.contracts, today).filter((c) => week >= 1 && week <= c.weeks).map((c) => c.id));
  if (!active.size) return next;
  return { ...next, contracts: next.contracts.map((c) => (active.has(c.id) ? inWeek(c, week, today) : c)) };
}
