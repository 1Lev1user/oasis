// What the settings screen needs to save the game to a file and load it back: the file name, what a loaded file holds, the calm error
// lines and the replace step. Pure, no Phaser, no DOM. Reading and checking the file is store.js (parseBackup).
import { activeContracts } from '../lib/contract.js';
import { STORAGE_KEY } from '../lib/store.js';
import { TEXTS } from './texts/settings.js';

// Larger files are refused before they are read: a real save is a few hundred kilobytes at most.
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const tooBig = (bytes) => bytes > MAX_FILE_BYTES;

export const backupName = (today) => `oazis-${today}.json`;

// What the confirm step shows of a parsed file's state: habits, the active ones today, gems and museum houses.
export function fileSummary(state, today) {
  return {
    habits: state.contracts.length,
    active: activeContracts(state.contracts, today).length,
    gems: state.game?.gems ?? 0,
    houses: state.game?.museum?.houses?.length ?? 0,
  };
}

// A calm line for a parseBackup error (bad_contract:N counts as one) or a file step (too_big, read_failed, save_failed, bad_state).
export function errorText(code) {
  const key = String(code).startsWith('bad_contract:') ? 'bad_contract' : code;
  if (key === 'too_big') return TEXTS.errors.too_big(MAX_FILE_BYTES / 1024 / 1024);
  return Object.hasOwn(TEXTS.errors, key) ? TEXTS.errors[key] : TEXTS.errors.bad_json;
}

const COPY_PREFIX = `${STORAGE_KEY}:before-import-`;
const KEEP_COPIES = 3;

// Deletes before-import copies beyond the newest KEEP_COPIES (newest by the time in the key), but never `keep`, the copy written in
// this call: it stays plus the newest KEEP_COPIES - 1 others. Other keys are never touched, and a failed delete is ignored: the
// replace itself has already worked.
function pruneCopies(storage, keep) {
  const keys = Array.from({ length: storage.length ?? 0 }, (_, i) => storage.key(i)).filter((k) => k?.startsWith(COPY_PREFIX) && k !== keep);
  const time = (k) => Number(k.slice(COPY_PREFIX.length)) || 0;
  keys.sort((a, b) => time(b) - time(a)).slice(KEEP_COPIES - 1).forEach((k) => { try { storage.removeItem(k); } catch { /* kept */ } });
}

// Turns next into text first (an unserialisable state throws code 'bad_state' before anything is written), keeps the stored raw state
// (or the current one, when nothing is stored) under its own key, then saves next and drops copies beyond the newest 3 (never the one just written). A failed copy
// throws before the main key is touched. Returns next.
export function replaceState(storage, current, next, now) {
  let json;
  try { json = JSON.stringify(next); } catch (e) { throw Object.assign(new Error('state cannot be saved', { cause: e }), { code: 'bad_state' }); }
  const copyKey = COPY_PREFIX + now;
  storage.setItem(copyKey, storage.getItem(STORAGE_KEY) ?? JSON.stringify(current));
  storage.setItem(STORAGE_KEY, json);
  pruneCopies(storage, copyKey);
  return next;
}
