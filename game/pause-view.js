// What the HUD shows about pauses and the "mark yesterday" offer, as plain values and display strings.
// Pure, no Phaser, no DOM. Every rule comes from app/lib: the offer asks recordCheckin itself, the pause limits come from BALANCE.
import { BALANCE } from '../lib/balance.js';
import { recordCheckin } from '../lib/checkin.js';
import { pausedDays, overlaps } from '../lib/pause.js';
import { brokenNow } from '../lib/breakage.js';
import { habitOf } from '../lib/habit.js';
import { addDays } from '../lib/dates.js';
import { viewFor } from './breakage-view.js';
import { TEXTS } from './texts/oasis.js';

// True while yesterday can still be marked at this hour (local, 0-23): a session day of the term without a check-in, before
// BALANCE.markYesterdayUntilHour, and the mark would be accepted (signed, not closed, no debt left open by it).
export function yesterdayOffer(contract, today, hour) {
  return recordCheckin(contract, today, 'done', { date: addDays(today, -1), hour }).ok;
}

// The pause panel: the start days on offer (today and tomorrow, inside the term) and the most days still free.
export function pauseChoices(contract, today) {
  const starts = [today, addDays(today, 1)].filter((d) => d >= contract.startDate && d <= contract.endDate);
  return { starts, maxDays: BALANCE.pause.maxDays - pausedDays(contract) };
}

// The term end after a pause of `days` (addPause moves the end by the paused days).
export const pausePreview = (contract, from, days) => addDays(contract.endDate, days);

export const pauseErrorText = (error) => TEXTS.pauseErrors[error] ?? TEXTS.pauseErrors.other;

// The last paused day in a row from today (adjacent pauses join), or null when today is not paused.
export function pausedUntil(contract, today) {
  const { pauses } = habitOf(contract);
  let end = null;
  for (let day = today; overlaps(pauses, day, 1); day = addDays(day, 1)) end = day;
  return end;
}

// What a mark on yesterday repairs: the things broken today before it and not after it, by object id. Not always all of them:
// with N per week a settled week's misses are all dated on its last day, and a check-in repairs only misses strictly before it.
export function markRepairs(before, after, today) {
  const stays = new Set(viewFor(brokenNow(after, today)).map((item) => item.id));
  return viewFor(brokenNow(before, today)).filter((item) => !stays.has(item.id));
}

// The local hour for "mark yesterday". ?hour=N (0-23) stands in only when this load seeded the demo contract, so the noon rule
// always holds for real contracts.
export function hourFor(search, demoSeeded, now = new Date()) {
  const fake = new URLSearchParams(search).get('hour') ?? '';
  return demoSeeded && /^\d{1,2}$/.test(fake) && Number(fake) < 24 ? Number(fake) : now.getHours();
}

const DAY_MONTH = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });

// '2026-10-14' -> '14 октября'
export const dayLabel = (key) => DAY_MONTH.format(new Date(`${key}T00:00:00Z`));
