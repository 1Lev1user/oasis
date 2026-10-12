// Pausing a contract: from today on, at most BALANCE.pause.maxDays in total; the term end moves by the paused days.
// Pure functions: dates as local 'YYYY-MM-DD' strings, input contract never mutated.
import { BALANCE } from './balance.js';
import { addDays, isKey } from './dates.js';
import { habitOf } from './habit.js';

export function pausedDays(contract) {
  return habitOf(contract).pauses.reduce((sum, p) => sum + p.days, 0);
}

// True when the days [from, from + days - 1] share a day with any of the pauses.
export function overlaps(pauses, from, days) {
  const last = addDays(from, days - 1);
  return pauses.some((p) => from <= addDays(p.from, p.days - 1) && p.from <= last);
}

// { ok: true, contract } with the pause appended and endDate moved, or { ok: false, error }. Checks run in this order.
// termDays stays: paused days are not sessions, and the price of a miss is fixed by the signed term.
export function addPause(contract, from, days, today) {
  if (contract.signedAt === null) return { ok: false, error: 'not_signed' };
  if (contract.closed) return { ok: false, error: 'closed' };
  if (!isKey(from) || !isKey(today)) return { ok: false, error: 'bad_date' };
  if (!Number.isInteger(days) || days < 1) return { ok: false, error: 'bad_days' };
  if (from < today) return { ok: false, error: 'past' };
  if (from < contract.startDate || from > contract.endDate) return { ok: false, error: 'outside' };
  if (pausedDays(contract) + days > BALANCE.pause.maxDays) return { ok: false, error: 'too_long' };
  const { pauses } = habitOf(contract);
  if (overlaps(pauses, from, days)) return { ok: false, error: 'overlap' };
  // A recorded step is never lost: a pause cannot cover a day that already has a check-in.
  const last = addDays(from, days - 1);
  if (Object.keys(contract.checkins).some((d) => d >= from && d <= last)) return { ok: false, error: 'checked_in' };
  return { ok: true, contract: { ...contract, pauses: [...pauses, { from, days }], endDate: addDays(contract.endDate, days) } };
}
