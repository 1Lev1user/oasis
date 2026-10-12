// The Sunday campfire: the week in numbers, four automaticity questions, a new if-then point for what got in the way. Pure functions.
import { addDays, weekday } from './dates.js';
import { countWeeks, dayStatuses, missesOf } from './ledger.js';
import { meterState } from './meter.js';
import { validHabitFields, habitOf } from './habit.js';
import { dayPlan } from './schedule.js';
import { OBSTACLES } from './questionnaire.js';

// Self-Report Behavioural Automaticity Index, scale 1..7 (Gardner et al. 2012). The Russian wording is a translation, not a validated version.
export const SRBAI = [
  { id: 'auto', text: 'Делаю это автоматически' },
  { id: 'noThink', text: 'Делаю, не задумываясь' },
  { id: 'noRemember', text: 'Делаю, не вспоминая специально' },
  { id: 'start', text: 'Начинаю раньше, чем успеваю подумать' },
];

// How an obstacle reads after «Если» (as in questionnaire.js, which does not export them).
const LABELS = { tired: 'нет сил', no_time: 'нет времени', forgot: 'вылетело из головы', guests: 'гости или кафе', weather: 'погода', mood: 'плохое настроение' };

const POINTS_MAX = 12;
const LABEL_MAX = 40;
const round1 = (n) => Math.round(n * 10) / 10;

// Sessions of the week: a count schedule's expected sessions, else the scheduled days (a check-in on a rest day adds none).
function sessionsOf(contract, monday, sunday) {
  if (habitOf(contract).schedule.type === 'count') return countWeeks(contract, addDays(sunday, 1)).find((w) => w.monday === monday)?.expected ?? 0;
  return dayPlan(contract).filter((d) => d.kind === 'scheduled' && d.date >= monday && d.date <= sunday).length;
}

// The Monday-Sunday week ending on `sunday`, settled the day after. meterStart leaves out Monday's and later check-ins, so it is the previous week's meterEnd.
export function weekSummary(contract, sunday) {
  const monday = addDays(sunday, -6);
  const settled = addDays(sunday, 1);
  const { meterBase } = habitOf(contract);
  const days = dayStatuses(contract, settled).filter((d) => d.date >= monday && d.date <= sunday);
  const count = (status) => days.filter((d) => d.status === status).length;
  const before = Object.fromEntries(Object.entries(contract.checkins).filter(([date]) => date < monday));
  return {
    monday,
    sunday,
    done: count('done'),
    mini: count('mini'),
    missed: days.reduce((sum, d) => sum + missesOf(d), 0),
    sessions: sessionsOf(contract, monday, sunday),
    meterStart: round1(meterState({ ...contract, checkins: before }, monday, meterBase).meter),
    meterEnd: round1(meterState(contract, settled, meterBase).meter),
  };
}

// Mean of the four 1..7 integer answers (keyed by SRBAI ids), one decimal; null when any is missing or out of range.
export function automaticity(answers) {
  const values = SRBAI.map((item) => answers?.[item.id]);
  if (!values.every((v) => Number.isInteger(v) && v >= 1 && v <= 7)) return null;
  return round1(values.reduce((sum, v) => sum + v, 0) / values.length);
}

// Appends «Если {obstacle} — {plan}» as a 'miss' point. Never mutates the contract.
export function addObstaclePlan(contract, { obstacle, plan, label } = {}) {
  const text = typeof plan === 'string' ? plan.trim() : '';
  if (!text) return { ok: false, error: 'plan_required' };
  const name = OBSTACLES.includes(obstacle) ? LABELS[obstacle] : obstacle === 'other' && typeof label === 'string' ? label.trim() : '';
  if (!name || [...name].length > LABEL_MAX) return { ok: false, error: 'obstacle_unknown' };
  const { points } = habitOf(contract);
  if (points.length >= POINTS_MAX) return { ok: false, error: 'points_full' };
  const next = [...points, { text: `Если ${name} — ${text}`, when: 'miss', main: false }];
  if (!validHabitFields({ points: next })) return { ok: false, error: 'too_long' };
  return { ok: true, contract: { ...contract, points: next } };
}

// A Sunday inside the term, or the first Sunday after the end date (the last week's review).
export function campfireOpen(contract, today) {
  return weekday(today) === 6 && today >= contract.startDate && today <= addDays(contract.endDate, 6);
}
