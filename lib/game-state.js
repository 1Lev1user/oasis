// The saved game object (state.game): its defaults and the rules that clean it on load and import. Pure.
// Later cards that add a game field add its default and rule here.
import { BALANCE } from './balance.js';
import { isKey } from './dates.js';

export const DEFAULT_GAME = Object.freeze({
  gems: 0,
  storage: Object.freeze({}),
  mine: Object.freeze({}),
  owned: Object.freeze({ species: Object.freeze(['lizard']), outfits: Object.freeze([]) }),
  equipped: Object.freeze({}),
  quests: Object.freeze({}),
  session: null,
  last: Object.freeze({}),
  museum: Object.freeze({ houses: Object.freeze([]) }),
  buildings: Object.freeze({}),
  campfires: Object.freeze({}),
  settings: Object.freeze({ sound: false, shake: 1, reducedMotion: false }),
});

const THEMES = ['sport', 'mind', 'food', 'sleep', 'any'];
const MAX_QUEST_DAYS = 60;
const MAX_QUESTS_PER_DAY = 20;
const MAX_LAST_KEYS = 50;
const MAX_HOUSES = 200;
const MAX_BUILDING_HABITS = 20;
const MAX_CAMPFIRE_DATES = 20;
const HABIT_ID_MAX = 120;
const HOUSE_TEXT_MAX = 120;
const HOUSE_TEXTS = ['contractId', 'habitId', 'action'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Own entries of an object, never '__proto__', so a copy cannot change a prototype.
const entries = (v) => (isObj(v) ? Object.entries(v).filter(([k]) => k !== '__proto__') : []);

// A museum house: closed contract's summary (settle.js closeContract), copied key by key; texts cut to 120 characters.
// Null when any key is bad.
function house(h) {
  if (!isObj(h) || !HOUSE_TEXTS.every((k) => typeof h[k] === 'string')) return null;
  if (!isKey(h.endDate) || !isInt(h.owedCents, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (!(Number.isFinite(h.meter) && h.meter >= 0 && h.meter <= 100)) return null;
  if (typeof h.stage !== 'string' || !Object.hasOwn(BALANCE.evolution, h.stage)) return null;
  // 240 code units always hold the first 120 characters, so a huge imported string is never spread whole.
  const cut = (k) => [...h[k].slice(0, HOUSE_TEXT_MAX * 2)].slice(0, HOUSE_TEXT_MAX).join('');
  const { endDate, meter, stage, owedCents } = h;
  return { contractId: cut('contractId'), habitId: cut('habitId'), endDate, meter, stage, action: cut('action'), owedCents };
}

const knownIds = (list, table) => (Array.isArray(list)
  ? [...new Set(list.filter((id) => typeof id === 'string' && Object.hasOwn(table, id)))]
  : []);

// Built buildings per habit id: known unique ids only, an empty list drops the key. Habit ids outlive contracts, so they are not pruned by contract ids.
function sanitizeBuildings(v) {
  return Object.fromEntries(entries(v)
    .filter(([k]) => k.length >= 1 && k.length <= HABIT_ID_MAX)
    .map(([k, list]) => [k, knownIds(list, BALANCE.buildings)])
    .filter(([, list]) => list.length > 0)
    .slice(0, MAX_BUILDING_HABITS));
}

// Automaticity scores per contract: { 'YYYY-MM-DD': 1..7 }. Unknown contracts and bad entries are dropped, the newest 20 dates are
// kept, a contract left with no score is dropped (the trophy reads any entry as "sat at a campfire").
function sanitizeCampfires(v, ids) {
  return Object.fromEntries(entries(v)
    .filter(([k]) => ids.has(k))
    .map(([k, days]) => [k, Object.fromEntries(entries(days)
      .filter(([date, n]) => isKey(date) && Number.isFinite(n) && n >= 1 && n <= 7)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, MAX_CAMPFIRE_DATES))])
    .filter(([, days]) => Object.keys(days).length > 0));
}

// The owner's choices (C-060): sound on/off, screen shake 0 off / 1 light / 2 normal, reduced motion forced. A bad value gives its default.
function sanitizeSettings(v) {
  const s = isObj(v) ? v : {};
  return {
    sound: s.sound === true,
    shake: isInt(s.shake, 0, 2) ? s.shake : DEFAULT_GAME.settings.shake,
    reducedMotion: s.reducedMotion === true,
  };
}

export function sanitizeGame(raw, contractIds) {
  const g = isObj(raw) ? raw : {};
  const ids = new Set(contractIds);
  const perContract = (v, keep) => Object.fromEntries(entries(v).filter(([k, x]) => ids.has(k) && keep(x)));

  const species = knownIds(g.owned?.species, BALANCE.species);
  if (!species.includes('lizard')) species.unshift('lizard');
  const owned = { species, outfits: knownIds(g.owned?.outfits, BALANCE.outfits) };

  const equipped = {};
  for (const [k, e] of entries(g.equipped)) {
    if (!ids.has(k) || !isObj(e) || !owned.species.includes(e.species)) continue;
    equipped[k] = { species: e.species, outfit: owned.outfits.includes(e.outfit) ? e.outfit : null };
  }

  const quests = Object.fromEntries(entries(g.quests)
    .filter(([k, v]) => isKey(k) && Array.isArray(v))
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, MAX_QUEST_DAYS)
    .map(([k, v]) => [k, v.filter((q) => typeof q === 'string' && q.length >= 1 && q.length <= 40).slice(0, MAX_QUESTS_PER_DAY)]));

  const s = g.session;
  const session = isObj(s) && ids.has(s.contractId) && Number.isFinite(s.start) && THEMES.includes(s.theme)
    ? { contractId: s.contractId, start: s.start, theme: s.theme }
    : null;

  return {
    gems: isInt(g.gems, 0, 1e9) ? g.gems : 0,
    storage: perContract(g.storage, (v) => isInt(v, 0, BALANCE.storage.slots)),
    mine: perContract(g.mine, (v) => isInt(v, 1, BALANCE.mine.maxLevel)),
    owned,
    equipped,
    quests,
    session,
    last: Object.fromEntries(entries(g.last).filter(([, v]) => typeof v === 'string').slice(0, MAX_LAST_KEYS)),
    // The museum outlives contracts: houses are never checked against contract ids. The newest are kept.
    museum: { houses: (Array.isArray(g.museum?.houses) ? g.museum.houses.map(house).filter(Boolean) : []).slice(-MAX_HOUSES) },
    buildings: sanitizeBuildings(g.buildings),
    campfires: sanitizeCampfires(g.campfires, ids),
    settings: sanitizeSettings(g.settings),
  };
}
