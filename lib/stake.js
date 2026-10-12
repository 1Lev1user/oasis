// Money at stake and signing. Pure functions: money in whole cents, dates as local 'YYYY-MM-DD' strings.
// The input contract is never mutated; signing returns a new contract.
import { plannedSessions } from './schedule.js';

const STAKE_MIN_CENTS = 500;
export const STAKE_MAX_CENTS = 10000000;
const TEXT_MAX_CHARS = 120;
const SIGNATURE_MAX_CHARS = 60;

// '60' -> 6000, '60,5' -> 6050, '60.50' -> 6050, ' 1 000,00 ' -> 100000. Anything else -> null.
export function parseEuros(text) {
  if (typeof text !== 'string') return null;
  const match = text.replace(/\s/g, '').match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

// input: { stake, antiGoal, reward, setAside, signature }. Returns { ok, contract } or { ok: false, errors }.
export function signContract(contract, input, today) {
  if (contract.signedAt !== null) return { ok: false, errors: ['already_signed'] };

  const errors = [];

  const cents = parseEuros(input.stake);
  if (cents === null) errors.push('stake_invalid');
  else if (cents < STAKE_MIN_CENTS || cents > STAKE_MAX_CENTS) errors.push('stake_range');

  // Trimmed text; pushes '<requiredCode>' when empty, 'too_long:<field>' when over max characters.
  const text = (field, requiredCode, max) => {
    const value = String(input[field] ?? '').trim();
    if (!value) errors.push(requiredCode);
    else if ([...value].length > max) errors.push('too_long:' + field);
    return value;
  };
  const antiGoal = text('antiGoal', 'antigoal_required', TEXT_MAX_CHARS);
  const reward = text('reward', 'reward_required', TEXT_MAX_CHARS);
  if (input.setAside !== true && input.setAside !== 'on') errors.push('setaside_required');
  const signature = text('signature', 'signature_required', SIGNATURE_MAX_CHARS);

  if (errors.length) return { ok: false, errors };

  const signed = structuredClone(contract);
  signed.stake = { cents, antiGoal, reward };
  signed.signature = signature;
  signed.signedAt = today;
  return { ok: true, contract: signed };
}

// Burn per missed session: the stake over the planned sessions, fixed at signing (pauses never change it). Remainder cents are kept.
export function perDayBurnCents(contract) {
  if (!contract.stake) return 0;
  return Math.floor(contract.stake.cents / plannedSessions(contract));
}
