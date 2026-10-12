// Editing the drafted plan { plan, habit }: points, the main step and the schedule. Pure, no Phaser, no DOM.
// Every operation returns { ok: true, draft } or { ok: false, error }; the input draft is never changed and a result is always a storable habit
// (validHabitFields) with exactly one main point, and that point is a 'day' point.
import { validHabitFields } from '../lib/habit.js';
import { vagueWord, draftPlan } from '../lib/questionnaire.js';
import { newAnswers, setScheduleType, toggleDay, toggleObstacle, prefillPlans, toDraftInput } from './setup-flow.js';

export const POINTS_MAX = 12; // as validHabitFields allows
const TEXT_MAX = 120;
const WHENS = ['eve', 'day', 'miss'];

const fail = (error) => ({ ok: false, error });

// The trimmed text, or the error code for it ('empty', 'too_long', 'vague:<word>' for a day point).
function checkText(value, when) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { error: 'empty' };
  if ([...text].length > TEXT_MAX) return { error: 'too_long' };
  const word = when === 'day' ? vagueWord(text) : null;
  return word ? { error: `vague:${word}` } : { text };
}

// The draft with these points, if they are valid and one day point is main; else main_required.
function finish(draft, points) {
  const habit = { ...draft.habit, points };
  const mains = points.filter((p) => p.main);
  if (mains.length !== 1 || mains[0].when !== 'day') return fail('main_required');
  return validHabitFields(habit) ? { ok: true, draft: { ...draft, habit } } : fail('invalid');
}

const pointAt = (draft, i) => draft.habit.points[i];
const replaceAt = (points, i, patch) => points.map((p, j) => (j === i ? { ...p, ...patch } : p));

export function editPoint(draft, i, value) {
  const point = pointAt(draft, i);
  if (!point) return fail('no_point');
  const checked = checkText(value, point.when);
  if (checked.error) return fail(checked.error);
  return finish(draft, replaceAt(draft.habit.points, i, { text: checked.text }));
}

export function setWhen(draft, i, when) {
  const point = pointAt(draft, i);
  if (!point) return fail('no_point');
  if (!WHENS.includes(when)) return fail('when_invalid');
  const checked = checkText(point.text, when);
  if (checked.error) return fail(checked.error);
  return finish(draft, replaceAt(draft.habit.points, i, { when })); // the main point leaving the day fails in finish
}

export function setMain(draft, i) {
  const point = pointAt(draft, i);
  if (!point) return fail('no_point');
  if (point.when !== 'day') return fail('not_day');
  return finish(draft, draft.habit.points.map((p, j) => ({ ...p, main: j === i })));
}

export function addPoint(draft, when, value) {
  if (draft.habit.points.length >= POINTS_MAX) return fail('points_full');
  if (!WHENS.includes(when)) return fail('when_invalid');
  const checked = checkText(value, when);
  if (checked.error) return fail(checked.error);
  return finish(draft, [...draft.habit.points, { text: checked.text, when, main: false }]);
}

// The main point may go when another day point can take the star (the first one left); the only day point stays.
export function removePoint(draft, i) {
  const point = pointAt(draft, i);
  if (!point) return fail('no_point');
  let points = draft.habit.points.filter((_, j) => j !== i);
  if (point.main) {
    const heir = points.findIndex((p) => p.when === 'day');
    if (heir < 0) return fail('main_required');
    points = replaceAt(points, heir, { main: true });
  }
  return finish(draft, points);
}

export function setSchedule(draft, schedule) {
  const s = schedule ?? {};
  const next = s.type === 'daily' ? { type: 'daily' }
    : s.type === 'days' && Array.isArray(s.days) ? { type: 'days', days: [...s.days].sort((a, b) => a - b) }
      : s.type === 'count' ? { type: 'count', perWeek: s.perWeek } : null;
  if (!next || !validHabitFields({ schedule: next })) return fail('schedule_invalid');
  return { ok: true, draft: { ...draft, habit: { ...draft.habit, schedule: next } } };
}

// The gym example of C-048 (Пн, Ср, Пт; tired and no time), for ?scene=plan&demo=1.
export function demoDraft() {
  let a = { ...newAnswers(), action: 'Тренировка в зале', anchor: 'Выхожу с работы', place: 'Зал у дома', mini: '10 минут дома', prep: 'форма в сумке, бутылка воды' };
  a = setScheduleType(a, 'days');
  for (const d of [0, 2, 4]) a = { ...a, schedule: toggleDay(a.schedule, d) };
  a = prefillPlans(toggleObstacle(toggleObstacle(a, 'tired'), 'no_time'));
  const { plan, habit } = draftPlan(toDraftInput({ ...a, sliders: { can: 2, opp: 4, want: 5 } }));
  return { plan, habit };
}
