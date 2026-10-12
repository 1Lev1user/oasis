// The lizard companion: stage and mood for a contract on a day. Pure functions: dates as local 'YYYY-MM-DD' strings.
import { fedSessions } from './ledger.js';
import { plannedSessions } from './schedule.js';
import { debtState } from './debt.js';
import { comebackState } from './comeback.js';

// Share of the planned sessions fed (done + mini days) at which the lizard grows to the next stage.
const HATCHLING_BELOW = 0.25;
const YOUNG_BELOW = 0.6;
const LEGEND_FROM = 0.8;

// { stage, mood, fed }. The lizard never dies and never gets a sad or sick state.
export function lizardState(contract, today) {
  if (!contract.stake) return { stage: 'egg', mood: 'waiting', fed: 0 };

  const fed = fedSessions(contract, today);
  const share = fed / plannedSessions(contract);

  let stage;
  if (fed === 0) stage = 'egg';
  else if (today > contract.endDate && share >= LEGEND_FROM) stage = 'legend';
  else if (share < HATCHLING_BELOW) stage = 'hatchling';
  else if (share < YOUNG_BELOW) stage = 'young';
  else stage = 'grown';

  // First match wins.
  let mood;
  if (debtState(contract, today).open) mood = 'asleep';
  else if (comebackState(contract, today).active) mood = 'sleepy';
  else if (contract.checkins[today]) mood = 'happy';
  else if (today < contract.startDate) mood = 'waiting';
  else if (today > contract.endDate) mood = 'proud';
  else mood = 'hungry';

  return { stage, mood, fed };
}
