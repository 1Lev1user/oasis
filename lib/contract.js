// Contracts from a plan: create an unsigned contract, count the active ones. Pure functions: dates as local 'YYYY-MM-DD' keys.
import { addDays, daysBetween, isKey, nextMonday } from './dates.js';

const PLAN_FIELDS = ['anchor', 'action', 'place', 'mini'];
const OPTIONAL = ['place']; // «Где?» may be skipped in the questionnaire: stored as ''
const TEXT_MAX_CHARS = 120;
const WEEKS = [6, 7, 8];
export const START_MAX_DAYS_AHEAD = 14;
const MAX_ACTIVE = 5;

const str = (v) => String(v ?? '').trim();

// Active = signed, not closed, term not ended before today. Unsigned drafts never count.
export function activeContracts(contracts, today) {
  return contracts.filter((c) => c.signedAt !== null && !c.closed && c.endDate >= today);
}

// input: { anchor, action, place, mini, weeks, startDate }. Returns { ok, contract } or { ok: false, errors } with every error, in field order.
export function createContract(input, today, existing = []) {
  const errors = [];

  const plan = {};
  for (const field of PLAN_FIELDS) {
    const value = str(input[field]);
    plan[field] = value;
    if (!value) { if (!OPTIONAL.includes(field)) errors.push(`${field}_required`); }
    else if ([...value].length > TEXT_MAX_CHARS) errors.push(`too_long:${field}`);
  }

  const weeks = WEEKS.find((w) => str(input.weeks) === String(w));
  if (weeks === undefined) errors.push('weeks_range');

  const startDate = str(input.startDate) || nextMonday(today);
  if (!isKey(startDate)) {
    errors.push('start_invalid');
  } else {
    const ahead = daysBetween(today, startDate);
    if (ahead < 0) errors.push('start_past');
    else if (ahead > START_MAX_DAYS_AHEAD) errors.push('start_too_far');
  }

  if (activeContracts(existing, today).length >= MAX_ACTIVE) errors.push('limit');

  if (errors.length) return { ok: false, errors };

  const termDays = weeks * 7;
  return {
    ok: true,
    contract: {
      id: globalThis.crypto.randomUUID(),
      version: 1,
      createdAt: today,
      plan,
      weeks,
      termDays,
      startDate,
      endDate: addDays(startDate, termDays - 1),
      stake: null,
      signature: null,
      signedAt: null,
      checkins: {},
      payments: [],
      wrapper: 'jar',
      closed: false,
    },
  };
}
