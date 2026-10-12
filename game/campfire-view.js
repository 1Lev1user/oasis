// What the Sunday campfire shows and does, as plain values: when it is lit, the week lines, finishing the review, the ?day=sunday demo
// and the fire frames. Pure, no Phaser, no DOM. Every rule comes from app/lib (campfire.js, quests.js, game-state.js); this file only
// puts them together. The scene (scenes/campfire.js) and the oasis display the result.
import { campfireOpen, automaticity, addObstaclePlan } from '../lib/campfire.js';
import { openQuests, completeQuest } from '../lib/quests.js';
import { DEFAULT_GAME } from '../lib/game-state.js';
import { addDays, weekday } from '../lib/dates.js';
import { doneThisWeek } from './coach-view.js';
import { formatMeter } from './session.js';
import { seedDemo } from './demo.js';
import { TEXTS } from './texts/campfire.js';

// Field limits: "Если {label} — {plan}" must fit a plan point (120 characters), see addObstaclePlan.
export const PLAN_MAX = 60;
export const LABEL_MAX = 40;

const questId = (today) => `sunday:${today}`;

// { open, done }: the fire is lit on a Sunday inside the term (or the one after it); done once this habit has its score for that Sunday
// (each habit has its own review).
export function campfireState(contract, game, today) {
  return { open: campfireOpen(contract, today), done: game?.campfires?.[contract.id]?.[today] !== undefined };
}

// [{ key, text }] for weekSummary's result: the plan, steps, mini steps, misses and the strength gained or lost.
export function summaryLines({ sessions, done, mini, missed, meterStart, meterEnd }) {
  const strength = meterEnd > meterStart ? TEXTS.lines.up(formatMeter(meterStart), formatMeter(meterEnd))
    : meterEnd < meterStart ? TEXTS.lines.down(formatMeter(meterStart), formatMeter(meterEnd))
      : TEXTS.lines.same(formatMeter(meterEnd));
  return [
    { key: 'sessions', text: TEXTS.lines.sessions(sessions) },
    { key: 'steps', text: TEXTS.lines.steps(done) },
    { key: 'minis', text: TEXTS.lines.minis(mini) },
    { key: 'misses', text: TEXTS.lines.misses(missed) },
    { key: 'strength', text: strength },
  ];
}

// The end of one habit's review, for the Sunday `today`: stores the automaticity score (one decimal, 1..7) in game.campfires[contractId][today]
// and adds the «Если … — …» point when a plan is given. The Sunday quest is paid once per Sunday, by whichever habit sits first; a second
// habit's review succeeds with gems 0. All or nothing: any refusal changes nothing.
// { ok: true, state, gems, score, point } (point = the new point's text or null) or { ok: false, error }. The input is never changed.
export function finish(state, contractId, today, { answers, obstacle, plan, label } = {}) {
  const contract = state.contracts.find((c) => c.id === contractId);
  if (!contract) return { ok: false, error: 'unknown_contract' };
  const game = state.game ?? DEFAULT_GAME;
  const { open, done } = campfireState(contract, game, today);
  if (!open) return { ok: false, error: 'not_open' };
  if (done) return { ok: false, error: 'already' };
  const score = automaticity(answers);
  if (score === null) return { ok: false, error: 'answers' };

  const text = typeof plan === 'string' ? plan.trim() : '';
  let next = contract;
  if (text) {
    const added = addObstaclePlan(contract, { obstacle, plan: text, label });
    if (!added.ok) return added;
    next = added.contract;
  }
  let paid = { game, gems: 0 };
  if (!game.quests?.[today]?.includes(questId(today))) {
    const quests = openQuests(next, today, 0, doneThisWeek(game, today)); // the Sunday quest does not depend on the hour
    const res = completeQuest(game, today, questId(today), quests);
    if (!res.ok) return { ok: false, error: 'other' };
    paid = { game: res.game, gems: quests.find((q) => q.id === questId(today)).gems };
  }
  return {
    ok: true,
    state: {
      ...state,
      contracts: state.contracts.map((c) => (c === contract ? next : c)),
      game: { ...paid.game, campfires: { ...game.campfires, [contractId]: { ...game.campfires?.[contractId], [today]: score } } },
    },
    gems: paid.gems,
    score,
    point: next === contract ? null : next.points.at(-1).text,
  };
}

// ---------- the ?day=sunday demo (only with ?demo=1, only on the load that seeded the demo) ----------

// ?demo=1&day=sunday on a load that seeded the demo habit.
export function demoSunday(search, seeded) {
  const q = new URLSearchParams(search);
  return seeded && q.get('demo') === '1' && q.get('day') === 'sunday';
}

// The day the oasis and the campfire count as today: with the demo flag the coming Sunday (today when it is Sunday).
export const campfireDay = (demo, today) => (demo ? addDays(today, 6 - weekday(today)) : today);

// ?scene=campfire&demo=1 opened straight, with no oasis before it: the demo habit, only on a state with no active habit.
export function demoCampfire(state, today, search) {
  return new URLSearchParams(search).get('demo') === '1' ? seedDemo(state, today) : state;
}

// Two frames of the lit fire, 9x8 (palette letters, '.' = transparent): the flame leans one way, then the other. Logs stay.
const LOGS = [
  '.KRrKrRK.',
  'KRRrKrRRK',
  '.KKKKKKK.',
];
export const FIRE_SPRITES = {
  a: [
    '....O....',
    '...OZO...',
    '..OZQZO..',
    '..OZQZO..',
    '...OZZ...',
    ...LOGS,
  ],
  b: [
    '...O.....',
    '...OZO...',
    '..OZQZO..',
    '.OZQQZO..',
    '..ZZZO...',
    ...LOGS,
  ],
};
