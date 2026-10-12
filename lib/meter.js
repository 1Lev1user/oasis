// Habit strength (0-100%), the growing norm and the evolution stage. Pure functions.
import { BALANCE } from './balance.js';
import { addDays, weekday } from './dates.js';
import { dayStatuses, missesOf } from './ledger.js';

const { step, mini, missLoss } = BALANCE.meter;
const mondayOf = (date) => addDays(date, -weekday(date));

// Replays the contract day by day from `base`. misses: one { date, tier } per miss (a count week's misses all fall on its last day).
export function meterState(contract, today, base = 0, isScheduled = () => true) {
  if (contract.stake === null) return { meter: base, misses: [] };

  let meter = base;
  let week = null;
  let missesInWeek = 0;
  const misses = [];
  for (const day of dayStatuses(contract, today)) {
    const { date, status } = day;
    if (status === 'done') meter += step;
    else if (status === 'mini') meter += mini;
    const n = missesOf(day);
    if (n > 0 && isScheduled(date)) {
      if (mondayOf(date) !== week) {
        week = mondayOf(date);
        missesInWeek = 0;
      }
      for (let k = 0; k < n; k++) {
        const tier = Math.min(++missesInWeek, missLoss.length);
        misses.push({ date, tier });
        meter -= missLoss[tier - 1];
      }
    }
    meter = Math.min(100, Math.max(0, meter));
  }
  return { meter: Math.round(meter * 10) / 10, misses };
}

export function normFor(norm, meter) {
  if (norm === null) return null;
  return Math.round(norm.start + ((norm.target - norm.start) * meter) / 100);
}

export function stageFor(meter) {
  const stages = Object.entries(BALANCE.evolution).filter(([, from]) => from <= meter);
  return stages.reduce((best, stage) => (stage[1] >= best[1] ? stage : best))[0];
}
