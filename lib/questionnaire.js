// Drafts the owner's plan from the questionnaire answers, in the owner's own words. Pure functions.
import { validHabitFields } from './habit.js';

export const VAGUE = ['правильно', 'больше', 'меньше', 'лучше', 'чаще', 'нормально', 'здорово', 'постараюсь', 'по возможности', 'иногда'];

export const OBSTACLES = ['tired', 'no_time', 'forgot', 'guests', 'weather', 'mood'];

// Editable starting plans for each obstacle (coach-texts).
export const SUGGESTIONS = {
  tired: 'делаю мини-версию',
  no_time: 'делаю короче, но делаю',
  forgot: 'накануне готовлю всё на видном месте',
  guests: 'делаю мини-версию утром',
  weather: 'делаю дома',
  mood: 'просто начинаю, дальше решаю',
};

// How an obstacle reads after «Если».
const LABELS = { tired: 'нет сил', no_time: 'нет времени', forgot: 'вылетело из головы', guests: 'гости или кафе', weather: 'погода', mood: 'плохое настроение' };

// Word-start stems per theme; the first theme with a matching word wins, and 'sport' is the default.
const THEME_STEMS = [
  ['sport', ['зал', 'бег', 'трен', 'спорт', 'отжим', 'йог', 'плав', 'шаг']],
  ['mind', ['чит', 'книг', 'учи', 'язык', 'медит', 'пиш', 'курс']],
  ['food', ['ед', 'ов', 'готов', 'вод', 'пит', 'сахар', 'завтрак', 'обед']],
  ['sleep', ['сон', 'сп', 'ложусь', 'экран', 'телефон', 'рис', 'муз', 'игра']],
];

const MAX_PREP = 5;
const MAX_OBSTACLES = 3;

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// The vague word that appears first in the text, as written in VAGUE, or null.
export function vagueWord(s) {
  const t = String(s).toLowerCase();
  let best = null;
  for (const word of VAGUE) {
    const m = new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, 'u').exec(t);
    if (m && (best === null || m.index < best.index)) best = { word, index: m.index };
  }
  return best ? best.word : null;
}

export function guessTheme(s) {
  const words = String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const hit = THEME_STEMS.find(([, stems]) => words.some((w) => stems.some((st) => w.startsWith(st))));
  return hit ? hit[0] : 'sport';
}

const point = (when, main, t) => ({ text: t, when, main });

export function draftPlan(answers) {
  const a = answers ?? {};
  const action = text(a.action);
  const anchor = text(a.anchor);
  const place = text(a.place);
  const mini = text(a.mini);
  const vague = vagueWord(action);
  const errors = [];

  if (!action) errors.push('action_required');
  else if (vague) errors.push(`vague:${vague}`);
  if (!anchor) errors.push('anchor_required');
  if (!validHabitFields({ schedule: a.schedule }) || a.schedule === undefined) errors.push('schedule_invalid');

  const obstacles = Array.isArray(a.obstacles) ? a.obstacles : [];
  if (obstacles.length < 1 || obstacles.length > MAX_OBSTACLES) errors.push('obstacles_range');
  else {
    for (const o of obstacles) {
      if (!OBSTACLES.includes(o?.id)) errors.push(`obstacle_unknown:${o?.id}`);
      else if (!text(o.plan)) errors.push(`plan_required:${o.id}`);
    }
  }

  if (!mini) errors.push('mini_required');
  if (!validHabitFields({ sliders: a.sliders }) || a.sliders === undefined) errors.push('sliders_invalid');
  if (errors.length) return { ok: false, errors };

  const day = `После того как ${lowerFirst(anchor)} — ${lowerFirst(action)}${place ? ` (${place})` : ''}`;
  const prep = text(a.prep).split(',').map((p) => p.trim()).filter(Boolean).slice(0, MAX_PREP);
  const habit = {
    schedule: a.schedule,
    points: [
      point('day', true, day),
      ...prep.map((p) => point('eve', false, p)),
      ...obstacles.map((o) => point('miss', false, `Если ${LABELS[o.id]} — ${text(o.plan)}`)),
    ],
    why: text(a.why),
    theme: guessTheme(action),
    sliders: { can: a.sliders.can, opp: a.sliders.opp, want: a.sliders.want },
  };
  // A text over the point or why length limit would not be storable.
  if (!validHabitFields(habit)) return { ok: false, errors: ['too_long'] };
  return { ok: true, plan: { anchor, action, place, mini }, habit };
}
