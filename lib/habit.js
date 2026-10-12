// The game's plan data on a contract: optional fields, their defaults and their validation. Pure functions.
import { isKey } from './dates.js';
import { BALANCE } from './balance.js';

export const DEFAULTS = { schedule: { type: 'daily' }, pauses: [], theme: 'sport', points: [], norm: null, centrepiece: 'jar', meterBase: 0, why: '', sliders: { can: 3, opp: 3, want: 3 } };

const PAUSE_MAX_DAYS = BALANCE.pause.maxDays;
const POINTS_MAX = 12;
const NORM_MAX = 10000;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const chars = (v) => [...v].length;
const isText = (v, min, max) => typeof v === 'string' && chars(v) >= min && chars(v) <= max;
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Defaults merged with the contract's own optional fields; habitId falls back to the contract id.
export function habitOf(contract) {
  const habit = structuredClone(DEFAULTS);
  for (const k of Object.keys(DEFAULTS)) if (contract[k] !== undefined) habit[k] = contract[k];
  return { ...habit, habitId: contract.habitId ?? contract.id };
}

const validSchedule = (s) => isObj(s) && (
  s.type === 'daily'
  || (s.type === 'days' && Array.isArray(s.days) && isInt(s.days.length, 1, 7)
    && s.days.every((d) => isInt(d, 0, 6)) && new Set(s.days).size === s.days.length)
  || (s.type === 'count' && isInt(s.perWeek, 1, 6))
);

const validPauses = (p) => Array.isArray(p)
  && p.every((x) => isObj(x) && isKey(x.from) && isInt(x.days, 1, PAUSE_MAX_DAYS))
  && p.reduce((sum, x) => sum + x.days, 0) <= PAUSE_MAX_DAYS;

// At most one main point, and only on a 'day' point.
const validPoints = (p) => Array.isArray(p) && p.length <= POINTS_MAX
  && p.every((x) => isObj(x) && isText(x.text, 1, 120) && ['eve', 'day', 'miss'].includes(x.when)
    && typeof x.main === 'boolean' && (!x.main || x.when === 'day'))
  && p.filter((x) => x.main).length <= 1;

const validNorm = (n) => n === null
  || (isObj(n) && isInt(n.start, 1, NORM_MAX) && isInt(n.target, n.start + 1, NORM_MAX) && isText(n.unit, 1, 20));

// Self-rating of capability, opportunity and motivation: exactly these three, each 1..5.
const validSliders = (s) => isObj(s) && Object.keys(s).length === 3 && ['can', 'opp', 'want'].every((k) => isInt(s[k], 1, 5));

const RULES = {
  schedule: validSchedule,
  pauses: validPauses,
  theme: (v) => ['sport', 'mind', 'food', 'sleep'].includes(v),
  points: validPoints,
  norm: validNorm,
  centrepiece: (v) => ['pet', 'jar', 'lock'].includes(v),
  habitId: (v) => isText(v, 1, Infinity),
  meterBase: (v) => typeof v === 'number' && v >= 0 && v <= 100,
  why: (v) => isText(v, 0, 120),
  sliders: validSliders,
};

// True when every optional field the contract has is valid; a missing field means its default.
export function validHabitFields(c) {
  return Object.entries(RULES).every(([k, ok]) => c[k] === undefined || ok(c[k]));
}
