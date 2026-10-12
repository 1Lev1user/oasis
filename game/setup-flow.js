// The questionnaire flow: the ten questions, the answers model and the checks per step. Pure, no Phaser, no DOM.
// Every function returns new data; the answers are never changed. The plan itself is drafted by app/lib/questionnaire.js.
import { vagueWord, OBSTACLES, SUGGESTIONS } from '../lib/questionnaire.js';
import { validHabitFields } from '../lib/habit.js';

export const QUESTIONS = ['action', 'why', 'anchor', 'schedule', 'place', 'obstacles', 'plans', 'prep', 'mini', 'sliders'].map((id) => ({ id }));

// Field lengths: with all of them full the day point ("После того как … — … (…)") still fits the 120 characters a point may have.
export const LIMITS = { action: 50, anchor: 32, place: 15, why: 120, plan: 60, prep: 100, mini: 60 };

const MAX_OBSTACLES = 3;
const DEFAULT_PER_WEEK = 3;
const WHENS = ['eve', 'day', 'miss'];

export const newAnswers = () => ({
  action: '', why: '', anchor: '', schedule: { type: 'daily' }, place: '',
  obstacles: [], prep: '', mini: '', sliders: { can: 3, opp: 3, want: 3 },
});

const blank = (v) => typeof v !== 'string' || v.trim() === '';

// null when the step is fine, else an error code for that step only (the codes of draftPlan, plus vague:<word>).
export function stepError(answers, step) {
  const a = answers;
  switch (QUESTIONS[step]?.id) {
    case 'action': {
      if (blank(a.action)) return 'action_required';
      const word = vagueWord(a.action);
      return word ? `vague:${word}` : null;
    }
    case 'anchor': return blank(a.anchor) ? 'anchor_required' : null;
    case 'schedule': return a.schedule !== undefined && validHabitFields({ schedule: a.schedule }) ? null : 'schedule_invalid';
    case 'obstacles': {
      const list = Array.isArray(a.obstacles) ? a.obstacles : [];
      return list.length >= 1 && list.length <= MAX_OBSTACLES && list.every((o) => OBSTACLES.includes(o?.id)) ? null : 'obstacles_range';
    }
    case 'plans': {
      const missing = (a.obstacles ?? []).find((o) => blank(o.plan));
      return missing ? `plan_required:${missing.id}` : null;
    }
    case 'mini': return blank(a.mini) ? 'mini_required' : null;
    case 'sliders': return a.sliders !== undefined && validHabitFields({ sliders: a.sliders }) ? null : 'sliders_invalid';
    default: return null; // why, place, prep are optional
  }
}

// The next step when this one is fine, else the same step. After the last question comes QUESTIONS.length: the draft.
export const nextStep = (answers, step) => (stepError(answers, step) ? step : step + 1);

export const prevStep = (step) => Math.max(0, step - 1);

export function setScheduleType(answers, type) {
  const schedule = type === 'days' ? { type, days: [] } : type === 'count' ? { type, perWeek: DEFAULT_PER_WEEK } : { type: 'daily' };
  return { ...answers, schedule };
}

export function toggleDay(schedule, day) {
  const days = schedule.days ?? [];
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((x, y) => x - y);
  return { type: 'days', days: next };
}

// Adds the obstacle (up to three) or removes it. A new one has no plan yet (prefillPlans gives it the suggestion).
export function toggleObstacle(answers, id) {
  const list = answers.obstacles;
  if (list.some((o) => o.id === id)) return { ...answers, obstacles: list.filter((o) => o.id !== id) };
  if (list.length >= MAX_OBSTACLES) return answers;
  return { ...answers, obstacles: [...list, { id }] };
}

// Gives every obstacle that has no plan yet its suggestion as an editable start; a plan the owner emptied stays empty.
export const prefillPlans = (answers) => ({
  ...answers,
  obstacles: answers.obstacles.map((o) => (o.plan === undefined ? { ...o, plan: SUGGESTIONS[o.id] } : o)),
});

export const toDraftInput = (a) => ({
  action: a.action, why: a.why, anchor: a.anchor, schedule: a.schedule, place: a.place,
  obstacles: a.obstacles.map(({ id, plan }) => ({ id, plan })), prep: a.prep, mini: a.mini, sliders: { ...a.sliders },
});

// The draft's points by moment (evening before, the day, a miss); a moment without points is left out.
export const groupPoints = (points) => WHENS
  .map((when) => ({ when, points: points.filter((p) => p.when === when) }))
  .filter((g) => g.points.length > 0);
