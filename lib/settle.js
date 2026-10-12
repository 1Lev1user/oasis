// Settling a finished contract, closing it into the museum and renewing it. Pure functions: money in whole cents,
// dates as local 'YYYY-MM-DD' strings, inputs never mutated.
import { BALANCE } from './balance.js';
import { addDays, isKey, weekday } from './dates.js';
import { DEFAULT_GAME } from './game-state.js';
import { habitOf } from './habit.js';
import { summary } from './ledger.js';
import { meterState, stageFor } from './meter.js';
import { dayPlan } from './schedule.js';

// Habit fields a renewal carries over; pauses stay with the old contract.
const HABIT_FIELDS = ['schedule', 'theme', 'points', 'norm', 'centrepiece', 'why', 'sliders', 'habitId'];

// The day after the end: by then every day and every count week of the term is settled.
const finalDay = (contract) => addDays(contract.endDate, 1);

const meterOn = (contract, day) => Math.round(meterState(contract, day, habitOf(contract).meterBase).meter * 10) / 10;
const settledMeter = (contract) => meterOn(contract, finalDay(contract));

// SPEC "Closing a contract": closable once no term day can still be marked. options.hour is local 0-23, as in checkin.js
// (anything else counts as missing). A day can be marked late only on the next day before noon, and only if it is a session.
function closable(contract, today, hour) {
  const afternoon = Number.isInteger(hour) && hour >= BALANCE.markYesterdayUntilHour && hour <= 23;
  const markable = (date) => {
    if (contract.checkins[date] || date < contract.startDate) return false;
    const kind = dayPlan(contract).find((d) => d.date === date)?.kind;
    return kind === 'scheduled' || kind === 'flex';
  };
  const end = contract.endDate;
  if (today === end) return Boolean(contract.checkins[end]) && (afternoon || !markable(addDays(end, -1)));
  if (today === addDays(end, 1)) return afternoon || !markable(end);
  return today > end;
}

// The result numbers with the ledger and the meter taken on `day`.
function numbers(contract, day) {
  const s = summary(contract, day);
  const meter = meterOn(contract, day);
  return {
    rewardCents: s.keptCents,
    antiGoalCents: s.burnedCents - s.refundCents,
    owedCents: s.owedCents,
    refundCents: s.refundCents,
    done: s.doneDays,
    mini: s.miniDays,
    missed: s.missedDays,
    meter,
    stage: stageFor(meter),
  };
}

// { ok: true, ...numbers } settled on the day after the end, or { ok: false, error }; 'not_ended' carries `preview`,
// the numbers as if settled today, so the result so far can be shown.
// On the end date a count schedule's preview settles the open last week, so the preliminary anti-goal is never understated.
export function settlement(contract, today, options = {}) {
  if (!isKey(today)) return { ok: false, error: 'bad_date' };
  if (contract.signedAt === null) return { ok: false, error: 'not_signed' };
  if (contract.closed) return { ok: false, error: 'closed' };
  if (!closable(contract, today, options?.hour)) {
    const count = today === contract.endDate && habitOf(contract).schedule.type === 'count';
    return { ok: false, error: 'not_ended', preview: numbers(contract, count ? finalDay(contract) : today) };
  }
  return { ok: true, ...numbers(contract, finalDay(contract)) };
}

// { ok: true, state } with the contract closed and its house in the museum, or { ok: false, error }. A debt does not block closing.
export function closeContract(state, contractId, today, options = {}) {
  if (!isKey(today)) return { ok: false, error: 'bad_date' };
  const contract = state.contracts.find((c) => c.id === contractId);
  if (!contract) return { ok: false, error: 'unknown_contract' };
  const s = settlement(contract, today, options);
  if (!s.ok) return s;
  const house = {
    contractId,
    habitId: habitOf(contract).habitId,
    endDate: contract.endDate,
    meter: s.meter,
    stage: s.stage,
    action: contract.plan.action,
    owedCents: s.owedCents,
  };
  const game = state.game ?? structuredClone(DEFAULT_GAME);
  return {
    ok: true,
    state: {
      ...state,
      contracts: state.contracts.map((c) => (c === contract ? { ...c, closed: true } : c)),
      game: { ...game, museum: { houses: [...(game.museum?.houses ?? []), house] } },
    },
  };
}

// SPEC "Owed at term end": records the transfer of what a closed contract still owes as a payment dated today and
// clears its museum house's owedCents. { ok: true, state } or { ok: false, error }.
export function confirmTransfer(state, contractId, today) {
  if (!isKey(today)) return { ok: false, error: 'bad_date' };
  const contract = state.contracts.find((c) => c.id === contractId);
  if (!contract) return { ok: false, error: 'unknown_contract' };
  if (!contract.closed || !contract.stake || !contract.signedAt) return { ok: false, error: 'not_closed' };
  const { owedCents } = summary(contract, finalDay(contract));
  if (owedCents <= 0) return { ok: false, error: 'nothing_owed' };
  const paid = { ...contract, payments: [...contract.payments, { date: today, cents: owedCents }] };
  const game = state.game ?? structuredClone(DEFAULT_GAME);
  const houses = (game.museum?.houses ?? []).map((h) => (h.contractId === contractId ? { ...h, owedCents: 0 } : h));
  return {
    ok: true,
    state: {
      ...state,
      contracts: state.contracts.map((c) => (c === contract ? paid : c)),
      game: { ...game, museum: { houses } },
    },
  };
}

// { input, habit }: input for createContract (same plan and weeks, starting the Monday strictly after today);
// habit = the habit fields plus the settled meter as meterBase, for the caller to spread onto the new contract before signing.
export function renewalInput(contract, today) {
  const { anchor, action, place, mini } = contract.plan;
  const input = { anchor, action, place, mini, weeks: String(contract.weeks), startDate: addDays(today, 7 - weekday(today)) };
  const fields = habitOf(contract);
  const habit = structuredClone(Object.fromEntries(HABIT_FIELDS.map((k) => [k, fields[k]])));
  return { input, habit: { ...habit, meterBase: settledMeter(contract) } };
}
