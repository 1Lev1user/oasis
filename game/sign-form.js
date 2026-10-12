// The signing form: the plan draft { plan, habit } plus the form fields become a signed contract. Pure, no Phaser, no DOM.
// Every rule comes from app/lib; the error codes are the lib's own (plus 'habit_invalid', 'invalid'). The app never moves money.
import { createContract, START_MAX_DAYS_AHEAD } from '../lib/contract.js';
import { signContract, perDayBurnCents } from '../lib/stake.js';
import { validHabitFields } from '../lib/habit.js';
import { validContract } from '../lib/store.js';
import { addDays, nextMonday } from '../lib/dates.js';

// A renewal draft (chest-view.js renewDraft) also brings the norm, the habit id and the strength reached (meterBase).
const HABIT_FIELDS = ['schedule', 'points', 'why', 'theme', 'sliders', 'norm', 'habitId', 'meterBase'];

// form: { weeks, startDate, stake, setAside, antiGoal, reward, centrepiece, signature } as the fields hold them.
// A renewal draft prefills the weeks, the start date and the centrepiece it carries; a questionnaire draft has none of them.
export const formDefaults = (today, draft) => ({
  weeks: draft?.plan.weeks ?? '6',
  startDate: draft?.plan.startDate ?? nextMonday(today),
  stake: '',
  setAside: false,
  antiGoal: '',
  reward: '',
  centrepiece: draft?.habit.centrepiece ?? 'jar',
  signature: '',
});

// The days the start date field allows.
export const startRange = (today) => ({ min: today, max: addDays(today, START_MAX_DAYS_AHEAD) });

// The unsigned contract with the habit fields of the draft and the chosen centrepiece: { ok, contract } or { ok: false, errors }.
// An empty start date is refused here: createContract would replace it with next Monday while the field on screen stays empty.
function unsigned(draft, form, state, today) {
  if (typeof form.startDate !== 'string' || !form.startDate.trim()) return { ok: false, errors: ['start_invalid'] };
  const made = createContract({ ...draft.plan, weeks: form.weeks, startDate: form.startDate }, today, state.contracts);
  if (!made.ok) return made;
  const contract = { ...made.contract, centrepiece: form.centrepiece };
  for (const k of HABIT_FIELDS) if (draft.habit[k] !== undefined) contract[k] = structuredClone(draft.habit[k]);
  return validHabitFields(contract) ? { ok: true, contract } : { ok: false, errors: ['habit_invalid'] };
}

export function buildContract(draft, form, state, today) {
  const made = unsigned(draft, form, state, today);
  if (!made.ok) return made;
  const { stake, antiGoal, reward, setAside, signature } = form;
  const signed = signContract(made.contract, { stake, antiGoal, reward, setAside, signature }, today);
  if (!signed.ok) return signed;
  return validContract(signed.contract) ? signed : { ok: false, errors: ['invalid'] };
}

// What one miss would burn with this stake and term (cents), or null while the stake or the term is not valid yet.
// The other fields may still be empty, so the stake is checked by signing with stand-in texts; that contract is never kept.
export function perMissCents(draft, form, state, today) {
  const made = unsigned(draft, form, state, today);
  if (!made.ok) return null;
  const probe = signContract(made.contract, { stake: form.stake, antiGoal: '-', reward: '-', setAside: true, signature: '-' }, today);
  return probe.ok ? perDayBurnCents(probe.contract) : null;
}
