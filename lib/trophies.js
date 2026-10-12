// Trophies of the museum, computed from the saved data only. Pure functions: dates as local 'YYYY-MM-DD' strings, input never mutated.
import { BALANCE } from './balance.js';
import { addDays, weekday } from './dates.js';
import { habitOf } from './habit.js';
import { countWeeks, dayStatuses, missesOf, sessionDays, summary } from './ledger.js';
import { meterState } from './meter.js';

export const TROPHIES = [
  'first_step', 'week_full', 'comeback', 'campfire', 'stage_teen', 'stage_adult', 'stage_legend', 'finished',
  ...BALANCE.streaks.map((n) => `streak_${n}`),
];

const checkedIn = (status) => status === 'done' || status === 'mini';
const mondayOf = (date) => addDays(date, -weekday(date));

// Every session of one Monday-Sunday week lying wholly inside the term is checked in (a week still open counts once its sessions
// are all done). A count schedule needs its week's expected sessions.
function hasFullWeek(contract, today) {
  const inTerm = (monday) => monday >= contract.startDate && addDays(monday, 6) <= contract.endDate;
  if (habitOf(contract).schedule.type === 'count') return countWeeks(contract, today).some((w) => inTerm(w.monday) && w.expected > 0 && w.checkins >= w.expected);
  const weeks = new Map();
  for (const { date, status } of sessionDays(contract, today)) {
    const monday = mondayOf(date);
    weeks.set(monday, [...(weeks.get(monday) ?? []), checkedIn(status)]);
  }
  return [...weeks].some(([monday, done]) => inTerm(monday) && done.every(Boolean));
}

// The longest run of check-ins with no miss between them. Rest, paused and open days neither count nor break it. A day with a
// check-in and misses (a count week's closing Sunday) counts first, then the misses end the run.
function longestRun(contract, today) {
  let run = 0;
  let best = 0;
  for (const day of dayStatuses(contract, today)) {
    if (checkedIn(day.status)) best = Math.max(best, ++run);
    if (missesOf(day) > 0) run = 0;
  }
  return best;
}

// The highest strength the contract ever had, from its start strength up to `today`.
function peakMeter(contract, today) {
  const base = habitOf(contract).meterBase;
  return Math.max(base, ...dayStatuses(contract, today).map(({ date }) => meterState(contract, date, base).meter));
}

// The ids earned so far, in TROPHIES order. A stage is earned when any contract reached it or a museum house ended in it.
export function earned(state, today) {
  const signed = (state.contracts ?? []).filter((c) => c.stake);
  const houses = state.game?.museum?.houses ?? [];
  const campfires = state.game?.campfires;
  const top = Math.max(...signed.map((c) => peakMeter(c, today)), ...houses.map((h) => BALANCE.evolution[h.stage] ?? 0), 0);
  const streak = Math.max(0, ...signed.map((c) => longestRun(c, today)));
  const has = {
    first_step: signed.some((c) => Object.keys(c.checkins).length > 0),
    week_full: signed.some((c) => hasFullWeek(c, today)),
    comeback: signed.some((c) => summary(c, today).refundCents > 0),
    campfire: campfires !== null && typeof campfires === 'object' && Object.keys(campfires).length > 0,
    finished: houses.length > 0,
  };
  for (const stage of ['teen', 'adult', 'legend']) has[`stage_${stage}`] = top >= BALANCE.evolution[stage];
  for (const n of BALANCE.streaks) has[`streak_${n}`] = streak >= n;
  return TROPHIES.filter((id) => has[id]);
}
