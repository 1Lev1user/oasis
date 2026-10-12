// Contract state in a storage object (localStorage or a fake), plus backup export/import with validation.
import { isKey, addDays } from './dates.js';
import { validHabitFields } from './habit.js';
import { sanitizeGame } from './game-state.js';
import { overlaps, pausedDays } from './pause.js';
import { STAKE_MAX_CENTS } from './stake.js';

export const STORAGE_KEY = 'habit-contract:v1';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isCents = (v, min) => Number.isInteger(v) && v >= min && v <= STAKE_MAX_CENTS;
// The museum cuts ids to 120 characters (code points), so a longer one could not be found again. 240 code units bound the spread.
const validId = (v) => isStr(v) && v.length >= 1 && v.length <= 240 && [...v].length <= 120;
// At most `max` code points. The length guard comes first so a huge string is never spread.
const fits = (v, max) => isStr(v) && v.length <= 4 * max && [...v].length <= max;
// Same limits as signing allows: 120 for plan texts, anti-goal and reward (contract.js and stake.js TEXT_MAX_CHARS), 60 for the signature (stake.js SIGNATURE_MAX_CHARS). Neither module exports them.
const TEXT_MAX = 120;
const SIGNATURE_MAX = 60;

export function validContract(c) {
  if (!isObj(c)) return false;
  if (!validId(c.id) || c.version !== 1 || !isKey(c.createdAt)) return false;
  if (!isObj(c.plan) || !['anchor', 'action', 'place', 'mini'].every((k) => fits(c.plan[k], TEXT_MAX))) return false;
  if (![6, 7, 8].includes(c.weeks) || c.termDays !== c.weeks * 7) return false;
  // The optional fields first: the end moves by the paused days, so pauses must be valid before they are summed.
  if (!validHabitFields(c)) return false;
  if (!isKey(c.startDate) || !isKey(c.endDate) || c.endDate !== addDays(c.startDate, c.termDays - 1 + pausedDays(c))) return false;
  // Pauses start inside the term and never overlap, so the sum above is the number of distinct paused days.
  const pauses = c.pauses ?? [];
  if (pauses.some((p, i) => p.from < c.startDate || overlaps(pauses.slice(0, i), p.from, p.days))) return false;
  // stake, signature and signedAt are either all null (draft) or all set (signed).
  const signed = c.stake !== null;
  if ([c.signature, c.signedAt].some((v) => (v !== null) !== signed)) return false;
  if (signed) {
    if (!isObj(c.stake) || !isCents(c.stake.cents, 0) || !fits(c.stake.antiGoal, TEXT_MAX) || !fits(c.stake.reward, TEXT_MAX)) return false;
    if (!fits(c.signature, SIGNATURE_MAX) || !isKey(c.signedAt)) return false;
  }
  if (!isObj(c.checkins) || !Object.entries(c.checkins).every(([k, v]) => isKey(k) && (v === 'done' || v === 'mini'))) return false;
  if (!Array.isArray(c.payments) || !c.payments.every((p) => isObj(p) && isKey(p.date) && isCents(p.cents, 1))) return false;
  return c.wrapper === 'jar' && typeof c.closed === 'boolean';
}

const validState = (s) => isObj(s) && Array.isArray(s.contracts) && s.contracts.every(validContract);
const contractIds = (contracts) => contracts.map((c) => c.id);

export function loadState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null || raw === undefined) return { contracts: [] };
  try {
    const state = JSON.parse(raw);
    if (validState(state)) {
      // A bad game part is cleaned, never a reason to move the contracts aside. No game key, none added.
      if (Object.hasOwn(state, 'game')) state.game = sanitizeGame(state.game, contractIds(state.contracts));
      return state;
    }
  } catch { /* fall through to keep the raw text */ }
  // Keep the unreadable text aside once, then reset the main key so the next load does not copy it again.
  const empty = { contracts: [] };
  storage.setItem(STORAGE_KEY + ':corrupt-' + Date.now(), raw);
  saveState(storage, empty);
  return empty;
}

export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function toBackup(state, now = new Date()) {
  const data = { app: 'habit-contract', version: 1, exportedAt: now.toISOString(), contracts: state.contracts };
  if (state.game !== undefined) data.game = sanitizeGame(state.game, contractIds(state.contracts));
  return JSON.stringify(data, null, 2);
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'bad_json' }; }
  if (!isObj(data) || data.app !== 'habit-contract') return { ok: false, error: 'wrong_app' };
  if (data.version !== 1) return { ok: false, error: 'bad_version' };
  if (!Array.isArray(data.contracts)) return { ok: false, error: 'bad_json' };
  const bad = data.contracts.findIndex((c) => !validContract(c));
  if (bad !== -1) return { ok: false, error: 'bad_contract:' + bad };
  // Older backups have no game; the state then has none and callers fall back to DEFAULT_GAME.
  const state = { contracts: data.contracts };
  if (Object.hasOwn(data, 'game')) state.game = sanitizeGame(data.game, contractIds(data.contracts));
  return { ok: true, state };
}
