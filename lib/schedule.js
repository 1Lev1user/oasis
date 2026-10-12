// Which days of the term are sessions, from the contract's schedule and pauses. Pure functions: dates as local 'YYYY-MM-DD' strings.
import { BALANCE } from './balance.js';
import { addDays, daysBetween, weekday } from './dates.js';
import { habitOf } from './habit.js';

// One entry per day from startDate to endDate: { date, kind } with kind scheduled | rest | paused | flex (count schedules), paused wins.
// The day count is bounded (term + pause maximum): a string comparison `date <= endDate` never ends past year 9999.
// Without termDays (minimal contracts in callers' tests) the bound is the span itself.
export function dayPlan(contract) {
  const { schedule, pauses } = habitOf(contract);
  const span = daysBetween(contract.startDate, contract.endDate) + 1;
  const n = Math.min(span, (contract.termDays ?? span) + BALANCE.pause.maxDays);
  const plan = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(contract.startDate, i);
    let kind = 'scheduled';
    if (pauses.some((p) => { const k = daysBetween(p.from, date); return k >= 0 && k < p.days; })) kind = 'paused';
    else if (schedule.type === 'count') kind = 'flex';
    else if (schedule.type === 'days' && !schedule.days.includes(weekday(date))) kind = 'rest';
    plan.push({ date, kind });
  }
  return plan;
}

// Sessions in the signed term (the first termDays days from startDate, pauses ignored), never below 1.
export function plannedSessions(contract) {
  const { schedule } = habitOf(contract);
  let n = contract.termDays;
  if (schedule.type === 'count') n = Math.round((schedule.perWeek * contract.termDays) / 7);
  else if (schedule.type === 'days') {
    n = 0;
    for (let i = 0; i < contract.termDays; i++) if (schedule.days.includes(weekday(addDays(contract.startDate, i)))) n++;
  }
  return Math.max(1, n);
}
