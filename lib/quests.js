// Which plan points to show and which quests are open at a moment. Pure functions: dates as local 'YYYY-MM-DD' strings, hour 0..23.
// Quest texts are not here: the scene maps quest ids to texts.
import { BALANCE } from './balance.js';
import { comebackState } from './comeback.js';
import { addDays, weekday } from './dates.js';
import { habitOf } from './habit.js';
import { sessionDays } from './ledger.js';
import { dayPlan } from './schedule.js';

const EVENING_FROM = 17;
const MORNING_UNTIL = 12;
const PREP_QUESTS = 2;
const LOW_SLIDER = 2;
const MAX_PER_DAY = 20;

const monday = (today) => addDays(today, -weekday(today));

// A session day is scheduled or flex; rest, paused and days outside the term are not.
const isSession = (plan, date) => ['scheduled', 'flex'].includes(plan.find((d) => d.date === date)?.kind);

// The last session before today was missed.
function prevMissed(contract, today) {
  const prev = sessionDays(contract, today).filter((d) => d.date < today).at(-1);
  return prev?.status === 'missed';
}

// { dayPoints, evePoints, missPoints, why }: the contract's points that fit the moment.
export function momentFor(contract, today, hour) {
  const { points, why, sliders } = habitOf(contract);
  const plan = dayPlan(contract);
  const of = (when) => points.filter((p) => p.when === when);
  const missed = prevMissed(contract, today);
  return {
    dayPoints: isSession(plan, today) ? of('day') : [],
    evePoints: hour >= EVENING_FROM && isSession(plan, addDays(today, 1)) ? of('eve') : [],
    missPoints: comebackState(contract, today).active || missed ? of('miss') : [],
    why: missed || sliders.want <= LOW_SLIDER ? why : '',
  };
}

// Open quests as { id, kind, gems, point? }. `done` holds the quest ids already completed (a Set or an array).
// Weekly ids carry the Monday, so the caller passes the ids done earlier in the week to keep them once a week.
export function openQuests(contract, today, hour, done) {
  const { points, sliders } = habitOf(contract);
  const plan = dayPlan(contract);
  const { quest, sunday } = BALANCE.gems;
  const week = monday(today);
  const quests = [];

  if (hour >= EVENING_FROM && isSession(plan, addDays(today, 1))) {
    const eve = points.filter((p) => p.when === 'eve');
    eve.forEach((point, n) => quests.push({ id: `prep:${n}`, kind: 'prep', gems: quest, point }));
    for (let k = 0; k < PREP_QUESTS - eve.length; k++) quests.push({ id: `prep:any:${k}`, kind: 'prep', gems: quest });
  }
  if (hour < MORNING_UNTIL && isSession(plan, today) && points.some((p) => p.when === 'miss')) {
    quests.push({ id: 'repeat', kind: 'repeat', gems: quest });
  }
  if (sliders.can <= LOW_SLIDER) quests.push({ id: `learn:${week}`, kind: 'learn', gems: quest });
  if (sliders.opp <= LOW_SLIDER) quests.push({ id: `conditions:${week}`, kind: 'conditions', gems: quest });
  if (weekday(today) === 6) quests.push({ id: `sunday:${today}`, kind: 'sunday', gems: sunday });

  const skip = new Set(done);
  return quests.filter((q) => !skip.has(q.id));
}

// Pays an open quest once. `quests` is the openQuests result; `game` is state.game and is never mutated.
export function completeQuest(game, today, id, quests) {
  const doneToday = game.quests?.[today] ?? [];
  if (doneToday.includes(id)) return { ok: false, error: 'already' };
  const open = quests.find((q) => q.id === id);
  if (!open || doneToday.length >= MAX_PER_DAY) return { ok: false, error: 'not_open' };
  return {
    ok: true,
    game: { ...game, gems: (game.gems ?? 0) + open.gems, quests: { ...game.quests, [today]: [...doneToday, id] } },
  };
}
