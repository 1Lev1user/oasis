// Day statuses and the jar. Pure functions: money in whole cents, dates as local 'YYYY-MM-DD' strings.
import { addDays, daysBetween, weekday } from './dates.js';
import { habitOf } from './habit.js';
import { dayPlan, plannedSessions } from './schedule.js';
import { perDayBurnCents } from './stake.js';

// Endowed progress: signing the contract and setting the money aside count as the first two steps.
const SIGNING_STEPS = 2;

const mondayOf = (date) => addDays(date, -weekday(date));
const isCount = (contract) => habitOf(contract).schedule.type === 'count';

// Misses a day entry stands for: its `misses` field (count weeks), else 1 when missed.
export const missesOf = (day) => day.misses ?? (day.status === 'missed' ? 1 : 0);

// A check-in always shows. Rest and paused days are never missed; a flex day (count) without a check-in is rest, its week's misses go to the week's last day.
function statusOf(contract, today, { date, kind }) {
  const checkin = contract.checkins[date];
  if (checkin) return checkin;
  if (kind === 'rest' || kind === 'paused') return kind;
  if (date === today) return 'today';
  if (date > today) return 'future';
  return kind === 'flex' ? 'rest' : 'missed';
}

// Count schedules: one entry per Monday-Sunday week touching the term, { monday, closeDate, expected, checkins, misses, settled }.
// closeDate is the week's last term day. Paused days lower the plan, and check-ins on them do not count.
// The plans are capped so their running total never exceeds the planned sessions: a pause never adds a miss. Other schedules: [].
export function countWeeks(contract, today) {
  const { schedule } = habitOf(contract);
  if (schedule.type !== 'count') return [];
  const weeks = [];
  for (const { date, kind } of dayPlan(contract)) {
    const monday = mondayOf(date);
    if (weeks.at(-1)?.monday !== monday) weeks.push({ monday, closeDate: date, days: 0, checkins: 0 });
    const week = weeks.at(-1);
    week.closeDate = date;
    if (kind === 'paused') continue;
    week.days++;
    if (contract.checkins[date]) week.checkins++;
  }
  let left = plannedSessions(contract);
  return weeks.map(({ monday, closeDate, days, checkins }) => {
    const expected = Math.min(Math.round((schedule.perWeek * days) / 7), left);
    left -= expected;
    const settled = closeDate < today;
    return { monday, closeDate, expected, checkins, misses: settled ? Math.max(0, expected - checkins) : 0, settled };
  });
}

// One entry per day of the plan: { date, status } with status done | mini | missed | today | future | rest | paused.
// Count schedules: the last unpaused day of a settled week with misses is missed (or keeps its check-in) and carries `misses: n`.
export function dayStatuses(contract, today) {
  const plan = dayPlan(contract);
  const misses = new Map();
  for (const w of countWeeks(contract, today)) {
    if (w.misses > 0) misses.set(plan.findLast((d) => d.kind !== 'paused' && d.date <= w.closeDate).date, w.misses);
  }
  return plan.map((day) => {
    const status = statusOf(contract, today, day);
    if (!misses.has(day.date)) return { date: day.date, status };
    return { date: day.date, status: status === 'done' || status === 'mini' ? status : 'missed', misses: misses.get(day.date) };
  });
}

// Scheduled and flex days only, so neighbours in the list are neighbouring sessions. A check-in on a rest or paused day is left out.
export function sessionDays(contract, today) {
  return dayPlan(contract)
    .filter((day) => day.kind === 'scheduled' || day.kind === 'flex')
    .map((day) => ({ date: day.date, status: statusOf(contract, today, day) }));
}

// Check-ins that fill progress and feed the lizard: done and mini sessions; a count week gives at most its plan.
export function fedSessions(contract, today) {
  if (isCount(contract)) return countWeeks(contract, today).reduce((sum, w) => sum + Math.min(w.checkins, w.expected), 0);
  return sessionDays(contract, today).filter((d) => d.status === 'done' || d.status === 'mini').length;
}

export function summary(contract, today) {
  if (!contract.stake) throw new Error('not_signed');

  const perDayCents = perDayBurnCents(contract);
  const days = sessionDays(contract, today);
  const count = (status) => days.filter((d) => d.status === status).length;
  const checkedIn = (day) => day?.status === 'done' || day?.status === 'mini';

  // Comeback refund: a missed session after a non-missed session and before a check-in gives back half its burn.
  // Count: a week with exactly one miss after a week without, once the next week has a check-in. Weeks with no plan are skipped.
  const weeks = countWeeks(contract, today).filter((w) => w.expected > 0);
  const refundedDays = isCount(contract)
    ? weeks.filter((w, i) => w.misses === 1 && !weeks[i - 1]?.misses && weeks[i + 1]?.checkins > 0).length
    : days.filter((d, i) => d.status === 'missed' && days[i - 1]?.status !== 'missed' && checkedIn(days[i + 1])).length;

  const doneDays = count('done');
  const miniDays = count('mini');
  const missedDays = dayStatuses(contract, today).reduce((sum, d) => sum + missesOf(d), 0);
  const burnedCents = Math.min(missedDays * perDayCents, contract.stake.cents); // the burn never exceeds the stake
  const refundCents = refundedDays * Math.floor(perDayCents / 2);
  const paidCents = contract.payments.reduce((sum, p) => sum + p.cents, 0);

  return {
    perDayCents,
    doneDays,
    miniDays,
    missedDays,
    burnedCents,
    refundCents,
    paidCents,
    owedCents: Math.max(0, burnedCents - refundCents - paidCents),
    keptCents: contract.stake.cents - (burnedCents - refundCents),
    daysLeft: Math.max(0, daysBetween(today > contract.startDate ? today : contract.startDate, contract.endDate) + 1),
    progress: { done: fedSessions(contract, today) + SIGNING_STEPS, total: plannedSessions(contract) + SIGNING_STEPS },
  };
}
