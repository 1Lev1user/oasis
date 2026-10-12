// What the HUD shows about the money at stake: the stakes row, the comeback offer and the debt panel, as display strings.
// Pure, no Phaser, no DOM. Every rule comes from app/lib; every amount goes through money(). The app never moves money.
import { summary } from '../lib/ledger.js';
import { comebackState } from '../lib/comeback.js';
import { debtState, confirmPayment } from '../lib/debt.js';
import { recordCheckin } from '../lib/checkin.js';
import { addDays } from '../lib/dates.js';
import { money } from '../lib/format.js';

// { kept, burned, owed, daysLeft }: burned is net of comeback refunds; owed is null when nothing is unpaid.
export function moneyLine(contract, today) {
  const s = summary(contract, today);
  return {
    kept: money(s.keptCents),
    burned: money(s.burnedCents - s.refundCents),
    owed: s.owedCents > 0 ? money(s.owedCents) : null,
    daysLeft: String(s.daysLeft),
  };
}

// { refund } while today's step would give half of the last miss back, else null.
export function comebackLine(contract, today) {
  const { active, refundCents } = comebackState(contract, today);
  return active ? { refund: money(refundCents) } : null;
}

// { due, antiGoal } while a debt is open, else null.
export function debtView(contract, today) {
  const { open, dueCents } = debtState(contract, today);
  return open ? { due: money(dueCents), antiGoal: contract.stake.antiGoal } : null;
}

// «Да, переведено» on the screen drawn for shownDay. Refused with 'day_changed' when today is another day (the amount shown is stale,
// so the scene redraws first); else today's confirmPayment on the contract as it is in the state: { ok: true, state } or { ok: false, error }.
export function payDebt(state, contractId, shownDay, today) {
  if (shownDay !== today) return { ok: false, error: 'day_changed' };
  const contract = state.contracts.find((c) => c.id === contractId);
  if (!contract) return { ok: false, error: 'no_contract' };
  const paid = confirmPayment(contract, today);
  if (!paid.ok) return paid;
  return { ok: true, state: { ...state, contracts: state.contracts.map((c) => (c.id === contractId ? paid.contract : c)) } };
}

// The step that ends a session started on sessionStartKey, finished today at hour (local, 0-23): a session started yesterday counts
// for yesterday (the "mark yesterday" path, until 12:00) unless that is too late or yesterday was not a session day; then it is
// today's step. recordCheckin's result with the date it was recorded for: { ok: true, contract, date } or { ok: false, error }.
export function stepDate(contract, sessionStartKey, today, hour, kind = 'done') {
  if (sessionStartKey === addDays(today, -1)) {
    const late = recordCheckin(contract, today, kind, { date: sessionStartKey, hour });
    if (late.ok) return { ...late, date: sessionStartKey };
    if (late.error !== 'too_late' && late.error !== 'not_a_session') return late;
  }
  const now = recordCheckin(contract, today, kind);
  return now.ok ? { ...now, date: today } : now;
}

// The contract the running session points to, while it can still take a step: signed with a stake, not closed, and its term not
// over before yesterday (a session that crossed midnight after the last term day). Else null, also when no session runs.
export function sessionContract(state, today) {
  const c = state.contracts.find((x) => x.id === state.game?.session?.contractId);
  return c && c.signedAt !== null && c.stake && !c.closed && c.endDate >= addDays(today, -1) ? c : null;
}

const without = (contract, dates) => {
  const checkins = { ...contract.checkins };
  for (const date of dates) delete checkins[date];
  return { ...contract, checkins };
};

// ?demo=1&debt=1: the demo contract with the two days before today missed, so a debt is open.
export const demoDebt = (contract, today) => without(contract, [addDays(today, -1), addDays(today, -2)]);

// ?demo=1&comeback=1: the demo contract with only yesterday missed after a check-in, so a comeback is open.
export const demoComeback = (contract, today) => without(contract, [addDays(today, -1)]);
