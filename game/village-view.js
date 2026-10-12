// What the village shows: one district per active habit, the free plot, where they stand, which scene opens first, and the ?demo=3 seed.
// Pure, no Phaser, no DOM. Every rule comes from app/lib.
import { activeContracts } from '../lib/contract.js';
import { meterState, stageFor } from '../lib/meter.js';
import { habitOf } from '../lib/habit.js';
import { dayPlan } from '../lib/schedule.js';
import { addDays } from '../lib/dates.js';
import { WORLD, SAFE } from './scale.js';
import { sessionContract } from './money-view.js';
import { seedDemo } from './demo.js';

// contract.js keeps this limit private (app/lib is not this card's to change); a test checks it against createContract.
export const MAX_ACTIVE = 5;
const PIPS = 5;

// One entry per active habit in creation order, at most MAX_ACTIVE: { id, action, meter, stage, doneToday, sessionToday, kind }.
// kind is what today is for the habit: scheduled | flex | rest | paused, or 'later' before its first day.
export function districts(state, today) {
  const running = sessionContract(state, today)?.id;
  return activeContracts(state.contracts, today).slice(0, MAX_ACTIVE).map((c) => {
    const { meter } = meterState(c, today, habitOf(c).meterBase);
    return {
      id: c.id,
      action: c.plan.action,
      meter,
      stage: stageFor(meter),
      doneToday: !!c.checkins[today],
      sessionToday: c.id === running,
      kind: dayPlan(c).find((d) => d.date === today)?.kind ?? 'later',
    };
  });
}

export const freePlot = (state, today) => activeContracts(state.contracts, today).length < MAX_ACTIVE;

// Filled pips of the 5 under a district: any progress shows at least one.
export const pips = (meter) => Math.min(PIPS, Math.ceil(meter / (100 / PIPS)));

// Steps due today and how many of them are done; a step on a rest day still counts as done (and as due).
export function summaryOf(list) {
  const due = (d) => d.kind === 'scheduled' || d.kind === 'flex' || d.doneToday;
  return { done: list.filter((d) => due(d) && d.doneToday).length, total: list.filter(due).length };
}

// Slot positions in world pixels (the bottom centre of a hut; the keeper stands below it, the pips under the keeper). The last
// slot of layout(count + 1) is the free plot. Safe-area coordinates, centred in the world like the oasis.
const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const SLOTS = [
  [[80, 84]],
  [[44, 84], [116, 84]],
  [[44, 58], [116, 58], [80, 108]],
  [[44, 58], [116, 58], [44, 108], [116, 108]],
  [[30, 58], [80, 58], [130, 58], [55, 108], [105, 108]],
];
export const layout = (n) => (SLOTS[n - 1] ?? []).map(([x, y]) => ({ x: x + OX, y: y + OY }));

// The scene a fresh start opens: the village from two active habits on, unless a session runs (the oasis shows it).
export const startSceneFor = (state, today) =>
  activeContracts(state.contracts, today).length >= 2 && !sessionContract(state, today) ? 'village' : 'oasis';

// ?demo=3, only on a state with no active habit: three demo habits (the C-030 demo shape), the first one already done today.
// The third has one missed day (not two in a row, so no debt).
const DEMO = [
  { action: 'Тренировка в зале' },
  { action: 'Читаю 10 страниц', anchor: 'Сажусь на диван вечером', place: 'Диван', mini: 'Одна страница' },
  { action: 'Ложусь до 23:30', anchor: 'Чищу зубы вечером', place: 'Спальня', mini: 'Выключаю свет на 10 минут раньше', skip: 2 },
];
export function seedVillage(state, today, search) {
  if (new URLSearchParams(search).get('demo') !== '3' || activeContracts(state.contracts, today).length) return state;
  const made = DEMO.map(({ skip, ...plan }, i) => {
    const [c] = seedDemo({ contracts: [] }, today).contracts;
    const checkins = { ...c.checkins };
    if (skip) delete checkins[addDays(today, -skip)];
    if (i === 0) checkins[today] = 'done';
    return { ...c, plan: { ...c.plan, ...plan }, checkins };
  });
  return { ...state, contracts: [...state.contracts, ...made] };
}

// Pixel maps of the village (palette letters, '.' = transparent). Textures are made from them in the scene.
export const VILLAGE_SPRITES = {
  hut: [
    '.....KKKKKK.....',
    '...KKRRRRRRKK...',
    '..KRRRrRRrRRRK..',
    '.KRRrRRRRRRrRRK.',
    'KKKKKKKKKKKKKKKK',
    '.KAAAAAAAAAAAAK.',
    '.KAAJJAAANNNAAK.',
    '.KAAJJAAANNNAAK.',
    '.KAAAAAAANNNAAK.',
    '.KaaaaaaaNNNaaK.',
    '..KKKKKKKKKKKK..',
  ],
  tick: [
    '..KKKKK..',
    '.KHHHHHK.',
    'KHHHHHlHK',
    'KHHHHlHHK',
    'KHlHlHHHK',
    'KHHlHHHHK',
    'KHHHHHHHK',
    '.KHHHHHK.',
    '..KKKKK..',
  ],
  plot: [
    'KKKK........KKKK',
    'K..............K',
    'K......OO......K',
    'K......OO......K',
    'K...OOOOOOOO...K',
    'K...OOOOOOOO...K',
    'K......OO......K',
    'K......OO......K',
    'K..............K',
    'K..............K',
    'KKKK........KKKK',
  ],
};
