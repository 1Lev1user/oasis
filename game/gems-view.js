// What a step pays and what the HUD shows about gems: pure, no Phaser, no DOM. Every rule comes from app/lib/gems.js and the balance table.
// Gems never relate to money and never buy off a miss or a debt.
import { stepReward, applyStep, builtFor } from '../lib/gems.js';
import { habitOf } from '../lib/habit.js';
import { DEFAULT_GAME } from '../lib/game-state.js';
import { BALANCE } from '../lib/balance.js';

export const mineOf = (game, contractId) => game?.mine?.[contractId] ?? 1;

// The step of `kind` recorded for `date`: { reward, game } with the gems and the storage slot added to `game` (never changed).
// `contract` is the one after the step; `date` is the day the step was recorded for (the yesterday mark pays like a step).
export function rewardFor(contract, game, date, kind, rng = Math.random) {
  const base = game ?? DEFAULT_GAME;
  const reward = stepReward(contract, date, kind, rng, builtFor(base, habitOf(contract).habitId));
  return { reward, game: applyStep(base, contract.id, reward) };
}

// The parts of what was paid: total with the mine, base (rare doubling included), the neglected bonus, the mine and the lighthouse.
export function rewardLine(reward, mineLevel) {
  const lighthouse = reward.lighthouse ?? 0;
  return { total: reward.gems + mineLevel, base: reward.gems - reward.neglected - lighthouse, rare: reward.rare, neglected: reward.neglected, mine: mineLevel, lighthouse };
}

export const chestReady = (game, contractId) => (game?.storage?.[contractId] ?? 0) >= BALANCE.storage.slots;

const flag = (search, name) => new URLSearchParams(search).get(name);

// ?rare=1: the first roll is rare, then random again. Only when this load seeded the demo contract.
export function demoRng(search, demoSeeded, random = Math.random) {
  let first = demoSeeded && flag(search, 'rare') === '1';
  return () => (first ? ((first = false), 0) : random());
}

// ?storage=N: the demo contract starts with N slots filled (0..slots). Only when this load seeded the demo contract.
export function demoStorage(search, demoSeeded, game, contractId) {
  const n = flag(search, 'storage') ?? '';
  if (!demoSeeded || !/^\d{1,3}$/.test(n)) return game;
  return { ...game, storage: { ...game.storage, [contractId]: Math.min(BALANCE.storage.slots, Number(n)) } };
}
