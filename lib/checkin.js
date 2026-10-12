// Today's check-in: 'done' or 'mini', or yesterday's until noon. Pure functions: dates as local 'YYYY-MM-DD' strings, input contract never mutated.
import { BALANCE } from './balance.js';
import { addDays } from './dates.js';
import { debtState } from './debt.js';
import { dayPlan } from './schedule.js';

const KINDS = ['done', 'mini'];

// { ok: true, contract } with checkins[today] = kind, or { ok: false, error }. Checks run in this order.
// options.date = yesterday with options.hour (local, 0-23) before BALANCE.markYesterdayUntilHour marks yesterday instead:
// yesterday must also be a session, and a debt blocks only if it is still open after the mark.
export function recordCheckin(contract, today, kind, options = {}) {
  if (!KINDS.includes(kind)) return { ok: false, error: 'bad_kind' };
  const { date: day, hour } = options ?? {}; // null options mean none
  const late = day !== undefined;
  if (late && day !== addDays(today, -1)) return { ok: false, error: 'bad_date' };
  if (late && !(Number.isInteger(hour) && hour >= 0 && hour < BALANCE.markYesterdayUntilHour)) return { ok: false, error: 'too_late' };
  const date = late ? day : today;
  if (contract.signedAt === null) return { ok: false, error: 'not_signed' };
  if (contract.closed) return { ok: false, error: 'closed' };
  if (date < contract.startDate) return { ok: false, error: 'not_started' };
  if (date > contract.endDate) return { ok: false, error: 'ended' };
  if (contract.checkins[date]) return { ok: false, error: 'already' };
  const next = { ...contract, checkins: { ...contract.checkins, [date]: kind } };
  if (late) {
    const { kind: dayKind } = dayPlan(contract).find((d) => d.date === date);
    if (dayKind !== 'scheduled' && dayKind !== 'flex') return { ok: false, error: 'not_a_session' };
    if (debtState(next, today).open) return { ok: false, error: 'debt' };
  } else if (debtState(contract, today).open) return { ok: false, error: 'debt' };
  return { ok: true, contract: next };
}
