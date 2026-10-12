// Debt after two missed sessions (count: two settled weeks with misses) in a row. Pure functions: money in whole cents, dates as local 'YYYY-MM-DD' strings.
import { habitOf } from './habit.js';
import { countWeeks, sessionDays, summary } from './ledger.js';

// Count: over the settled weeks with a plan (weeks with none are skipped like paused days), the close date of the latest
// neighbouring pair with misses whose later week closes on or after the last payment (its misses show only the day after,
// so a payment on that day did not cover them), or null.
function countSince(contract, today, lastPay) {
  const weeks = countWeeks(contract, today).filter((w) => w.settled && w.expected > 0);
  return weeks.findLast((w, i) => w.misses > 0 && weeks[i - 1]?.misses > 0 && w.closeDate >= lastPay)?.closeDate ?? null;
}

// Second day of the latest pair of neighbouring missed sessions after the last payment, or null.
export function debtState(contract, today) {
  const { owedCents } = summary(contract, today); // throws not_signed for an unsigned contract
  const lastPay = contract.payments.reduce((latest, p) => (p.date > latest ? p.date : latest), '');
  const days = sessionDays(contract, today);
  const since = habitOf(contract).schedule.type === 'count'
    ? countSince(contract, today, lastPay)
    : days.findLast((d, i) => d.status === 'missed' && days[i - 1]?.status === 'missed' && d.date > lastPay)?.date ?? null;
  const open = since !== null && owedCents > 0;
  return { open, dueCents: open ? owedCents : 0, since };
}

export function confirmPayment(contract, today) {
  const { open, dueCents } = debtState(contract, today);
  if (!open) return { ok: false, error: 'no_debt' };
  return { ok: true, contract: { ...contract, payments: [...contract.payments, { date: today, cents: dueCents }] } };
}
