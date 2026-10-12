// Local calendar date keys 'YYYY-MM-DD'. Day arithmetic runs on UTC midnights, so daylight saving never shifts a day.
const DAY_MS = 86400000;
const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n, width = 2) => String(n).padStart(width, '0');

// UTC midnight of a calendar date. setUTCFullYear is used because Date.UTC maps years 0-99 to 1900-1999.
function utc(y, m, d) {
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  return t;
}

const parts = (key) => key.split('-').map(Number);

const fmt = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const keyOf = (t) => fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());

export function todayKey(date = new Date()) {
  return fmt(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function addDays(key, n) {
  const [y, m, d] = parts(key);
  return keyOf(utc(y, m, d + n));
}

export function daysBetween(a, b) {
  return Math.round((utc(...parts(b)) - utc(...parts(a))) / DAY_MS);
}

// 0 = Monday ... 6 = Sunday. getUTCDay is 0 = Sunday, so shift by 6 modulo 7.
export function weekday(key) {
  return (utc(...parts(key)).getUTCDay() + 6) % 7;
}

export function nextMonday(key) {
  return addDays(key, (7 - weekday(key)) % 7);
}

export function isKey(value) {
  if (typeof value !== 'string' || !KEY.test(value)) return false;
  return keyOf(utc(...parts(value))) === value;
}
