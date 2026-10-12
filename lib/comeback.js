// Comeback mission: after exactly one missed session, checking in today refunds half a session's burn. Pure functions: dates as local 'YYYY-MM-DD' strings, money in whole cents.
import { countWeeks, dayStatuses, sessionDays } from './ledger.js';
import { dayPlan } from './schedule.js';
import { perDayBurnCents } from './stake.js';

const INACTIVE = { active: false, missedDate: null, refundCents: 0 };

// Count: today is an unpaused term day in the week after a settled week with exactly one miss (the week before that one without),
// and this week has no check-in yet. Weeks with no plan are skipped. missedDate is the day that carries the miss.
function countComeback(contract, today) {
  const weeks = countWeeks(contract, today).filter((w) => w.expected > 0);
  const i = weeks.findIndex((w) => w.monday <= today && today <= w.closeDate);
  if (i < 1) return INACTIVE;
  const missed = weeks[i - 1];
  if (missed.misses !== 1 || weeks[i - 2]?.misses || weeks[i].checkins > 0) return INACTIVE;
  const missedDate = dayStatuses(contract, today).findLast((d) => d.misses && d.date <= missed.closeDate).date;
  return { active: true, missedDate, refundCents: Math.floor(perDayBurnCents(contract) / 2) };
}

// { active, missedDate, refundCents }. Active when today is an open scheduled day inside the term, the previous session is missed and the one before is not.
export function comebackState(contract, today) {
  if (!contract.stake) return INACTIVE;
  const kind = dayPlan(contract).find((d) => d.date === today)?.kind;
  if (kind === 'flex') return countComeback(contract, today);
  if (kind !== 'scheduled') return INACTIVE; // rest, paused or outside the term
  const days = sessionDays(contract, today);
  const i = days.findIndex((d) => d.date === today);
  // 'today' is false once today is checked in.
  if (days[i].status !== 'today' || days[i - 1]?.status !== 'missed' || days[i - 2]?.status === 'missed') return INACTIVE;
  return { active: true, missedDate: days[i - 1].date, refundCents: Math.floor(perDayBurnCents(contract) / 2) };
}
