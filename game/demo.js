// Demo data for ?demo=1: one signed contract with a few past check-ins, so the meter and the buttons can be tried.
// createContract refuses a start in the past, so the dates are moved after creation (the contract stays valid for the store).
import { activeContracts, createContract } from '../lib/contract.js';
import { signContract } from '../lib/stake.js';
import { addDays } from '../lib/dates.js';

const DAYS_BACK = 4;

// Returns the state unchanged when a contract is already active (or the demo cannot be made), else a new state with the demo contract.
export function seedDemo(state, today) {
  if (activeContracts(state.contracts, today).length) return state;
  const plan = { anchor: 'Выхожу с работы', action: 'Тренировка в зале', place: 'Зал у дома', mini: '10 минут дома', weeks: '7', startDate: today };
  const made = createContract(plan, today, state.contracts);
  if (!made.ok) return state;
  const startDate = addDays(today, -DAYS_BACK);
  const moved = { ...made.contract, createdAt: startDate, startDate, endDate: addDays(startDate, made.contract.termDays - 1) };
  const signed = signContract(moved, { stake: '60', antiGoal: 'Фонд, который мне не нравится', reward: 'Новые кроссовки', setAside: true, signature: 'Лев' }, startDate);
  if (!signed.ok) return state;
  const checkins = Object.fromEntries(Array.from({ length: DAYS_BACK }, (_, i) => [addDays(today, i - DAYS_BACK), 'done']));
  return { ...state, contracts: [...state.contracts, { ...signed.contract, checkins }] };
}

// ?demo=1&meter=N (0..100): the demo contract starts at that habit strength (meterBase), so the effect buildings can be tried. Only when
// this load seeded the demo contract (`seeded`); a bad value leaves the contract as it is.
export function demoMeter(search, seeded, contract) {
  const n = new URLSearchParams(search).get('meter') ?? '';
  return seeded && /^\d{1,3}$/.test(n) && Number(n) <= 100 ? { ...contract, meterBase: Number(n) } : contract;
}
