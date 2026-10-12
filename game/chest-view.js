// What the chest at the end of a contract shows: when it stands, its result lines, how the coins split, the renewal draft for the
// sign scene, the owed reminders and the ?demo=ended seed. Pure, no Phaser, no DOM. Every rule comes from app/lib (settle.js, gems.js);
// every amount goes through money(). The app never moves money.
import { renewalInput } from '../lib/settle.js';
import { carryOver } from '../lib/gems.js';
import { confirmTransfer } from '../lib/settle.js';
import { summary } from '../lib/ledger.js';
import { activeContracts, createContract } from '../lib/contract.js';
import { signContract } from '../lib/stake.js';
import { money } from '../lib/format.js';
import { addDays } from '../lib/dates.js';
import { formatMeter } from './session.js';
import { TEXTS } from './texts/chest.js';
import { TEXTS as MUSEUM } from './texts/museum.js';

// The chest stands once the term is over (or on the end date once it is checked in), until the contract is closed.
export function chestStands(contract, today) {
  if (contract.signedAt === null || contract.closed) return false;
  return today > contract.endDate || (today === contract.endDate && !!contract.checkins[contract.endDate]);
}

// Signed contracts whose term ended before today and that are not closed yet: activeContracts no longer lists them.
export const openEnded = (state, today) => state.contracts.filter((c) => c.signedAt !== null && !c.closed && c.endDate < today);

// [{ key, text }] for a settlement result or its preview: reward, anti-goal, owed (only when > 0), steps, mini steps, misses, strength.
export function chestLines(result) {
  const line = (key, value) => ({ key, text: TEXTS.lines[key](value) });
  return [
    line('reward', money(result.rewardCents)),
    line('antiGoal', money(result.antiGoalCents)),
    ...(result.owedCents > 0 ? [line('owed', money(result.owedCents))] : []),
    line('steps', result.done),
    line('minis', result.mini),
    line('misses', result.missed),
    { key: 'strength', text: TEXTS.lines.strength(formatMeter(result.meter), MUSEUM.stages[result.stage]) },
  ];
}

// The coins that fly out of the chest: `coins` split by the money, a side with any money gets at least one.
export function coinSplit({ rewardCents, antiGoalCents }, coins = 10) {
  const all = rewardCents + antiGoalCents;
  if (all <= 0) return { reward: 0, antiGoal: 0 };
  let antiGoal = Math.round((coins * antiGoalCents) / all);
  if (antiGoalCents > 0) antiGoal = Math.max(1, antiGoal);
  if (rewardCents > 0) antiGoal = Math.min(coins - 1, antiGoal);
  return { reward: coins - antiGoal, antiGoal };
}

// The { plan, habit } draft the sign scene takes for «Продолжить привычку»: renewalInput's plan, weeks and start, and the habit with
// its settled strength (meterBase) and habit id. Null unless `settled` is an ok settlement.
export function renewDraft(contract, settled, today) {
  if (!settled?.ok) return null;
  const { input, habit } = renewalInput(contract, today);
  return { plan: input, habit };
}

// The state with a newly signed contract; a renewal (renewalOf = the old contract id) carries the mine, storage, outfit and last picks over.
export function addSigned(state, contract, renewalOf) {
  const next = { ...state, contracts: [...state.contracts, contract] };
  return renewalOf && state.game ? { ...next, game: carryOver(state.game, renewalOf, contract.id) } : next;
}

// A house whose contract is closed and has nothing left to transfer (settle.js confirmTransfer would say 'nothing_owed'). A house whose
// contract is missing is not settled: the owner clears it with the tap (transferOwed).
const settledHouse = (state, h) => {
  const c = state.contracts.find((x) => x.id === h.contractId);
  return !!c?.stake && summary(c, addDays(c.endDate, 1)).owedCents <= 0;
};

// [{ contractId, text }]: one calm line per museum house that still owes a transfer to the anti-goal (only that habit's when given).
export function owedReminders(state, habitId = null) {
  return (state.game?.museum?.houses ?? [])
    .filter((h) => h.owedCents > 0 && (habitId === null || h.habitId === habitId) && !settledHouse(state, h))
    .map((h) => ({ contractId: h.contractId, text: TEXTS.reminder(h.action, money(h.owedCents)) }));
}

// The state with that museum house owing nothing; no game, no change.
export function clearOwed(state, contractId) {
  if (!state.game?.museum) return state;
  const houses = state.game.museum.houses.map((h) => (h.contractId === contractId ? { ...h, owedCents: 0 } : h));
  return { ...state, game: { ...state.game, museum: { ...state.game.museum, houses } } };
}

// «Деньги переведены» on a reminder: confirmTransfer, and when its contract is missing or owes nothing (the reminder could never be paid
// and would stay forever) the house is cleared instead. { ok: true, state } or confirmTransfer's refusal.
export function transferOwed(state, contractId, today) {
  const paid = confirmTransfer(state, contractId, today);
  if (paid.ok || (paid.error !== 'unknown_contract' && paid.error !== 'nothing_owed')) return paid;
  return { ok: true, state: clearOwed(state, contractId) };
}

const DEMO_WEEKS = 6;
// ?demo=ended on a state with no active habit and no chest waiting: a 6-week contract that ended yesterday, every day, with its end
// date checked in (so the chest opens at any hour), one lone miss 20 days before the end (refunded) and two in a row 6 and 5 days
// before it (not paid, so something is owed), a mini step 10 days before it and some strength carried from before.
export function demoEnded(state, today, search) {
  if (new URLSearchParams(search).get('demo') !== 'ended') return state;
  if (activeContracts(state.contracts, today).length || openEnded(state, today).length) return state;
  const plan = { anchor: 'Выхожу с работы', action: 'Тренировка в зале', place: 'Зал у дома', mini: '10 минут дома', weeks: String(DEMO_WEEKS) };
  const startDate = addDays(today, -DEMO_WEEKS * 7);
  const made = createContract({ ...plan, startDate }, startDate, state.contracts);
  if (!made.ok) return state;
  const signed = signContract({ ...made.contract, meterBase: 12 }, { stake: '60', antiGoal: 'Фонд, который мне не нравится', reward: 'Новые кроссовки', setAside: true, signature: 'Лев' }, startDate);
  if (!signed.ok) return state;
  const end = signed.contract.endDate;
  const skip = new Set([20, 6, 5].map((n) => addDays(end, -n)));
  const checkins = {};
  for (let day = startDate; day <= end; day = addDays(day, 1)) if (!skip.has(day)) checkins[day] = day === addDays(end, -10) ? 'mini' : 'done';
  return { ...state, contracts: [...state.contracts, { ...signed.contract, checkins }] };
}

// Pixel maps of the contract chest (palette letters, '.' = transparent): closed, ajar with light, open with the coins. 16x14 each.
const BODY = [
  'KRRoRRKOOKRRoRRK',
  'KRRoRRKOOKRRoRRK',
  'KrrorrrKKrrrorrK',
  'KrrorrrrrrrrorrK',
  'KrrorrrrrrrrorrK',
  'KrrorrrrrrrrorrK',
  '.KKKKKKKKKKKKKK.',
];
export const CHEST_SPRITES = {
  closed: [
    '................',
    '................',
    '..KKKKKKKKKKKK..',
    '.KRRRRRRRRRRRRK.',
    'KRRrRRRRRRRRrRRK',
    'KRRrRRRRRRRRrRRK',
    'KKKKKKKKKKKKKKKK',
    ...BODY,
  ],
  ajar: [
    '................',
    '..KKKKKKKKKKKK..',
    '.KRRRRRRRRRRRRK.',
    'KRRrRRRRRRRRrRRK',
    'KKKKKKKKKKKKKKKK',
    '.KQOQOQOQOQOQOK.',
    'KKKKKKKKKKKKKKKK',
    ...BODY,
  ],
  open: [
    '.KKKKKKKKKKKKKK.',
    'KRRrRRRRRRRRrRRK',
    'KRRRRRRRRRRRRRRK',
    'KrrrrrrrrrrrrrrK',
    'KKKKKKKKKKKKKKKK',
    'KQOQOOQOOQOOQOQK',
    'KKKKKKKKKKKKKKKK',
    ...BODY,
  ],
};
