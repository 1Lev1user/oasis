// The habit session in the saved game: start, end, the timer and what the HUD shows. Pure, no Phaser, no DOM.
// A session is { contractId, start, theme } in state.game.session; start is Date.now() in ms, so the timer survives a closed app.
// Every function returns a new state; the input is never changed (DEFAULT_GAME is frozen).
import { DEFAULT_GAME } from '../lib/game-state.js';

const SEGMENTS = 20;
const TIMER_MAX_SECONDS = 99 * 60 + 59;

const gameOf = (state) => state.game ?? structuredClone(DEFAULT_GAME);
const withGame = (state, patch) => ({ ...state, game: { ...gameOf(state), ...patch } });

export const startSession = (state, contractId, theme, now) => withGame(state, { session: { contractId, start: now, theme } });

export const endSession = (state) => withGame(state, { session: null });

// Whole seconds since the start, never negative.
export const elapsed = (session, now) => (session ? Math.max(0, Math.floor((now - session.start) / 1000)) : 0);

export function formatTimer(seconds) {
  const s = Number.isFinite(seconds) ? Math.min(TIMER_MAX_SECONDS, Math.max(0, Math.floor(seconds))) : 0;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Whole minutes since the start when there is at least one, else 0.
export const awayMessageMinutes = (session, now) => Math.floor(elapsed(session, now) / 60);

// The running session of this contract, or null (a session of another contract is not shown).
export function sessionFor(state, contract) {
  const session = state.game?.session ?? null;
  return session && contract && session.contractId === contract.id ? session : null;
}

// What the HUD shows: none (no habit), done (today's step is recorded), session (running), idle.
export function modeOf(state, contract, today) {
  if (!contract) return 'none';
  if (contract.checkins[today]) return 'done';
  return sessionFor(state, contract) ? 'session' : 'idle';
}

// Remembers the variant that played last in a pool, so the picker does not repeat it.
export const setLast = (state, pool, id) => withGame(state, { last: { ...gameOf(state).last, [pool]: id } });

// 24 -> '24,0%'
export const formatMeter = (meter) => `${meter.toFixed(1).replace('.', ',')}%`;

// Filled segments of the 20-segment bar, one per 5 percent started: any strength above 0 shows at least one.
export const barSegments = (meter) => Math.min(SEGMENTS, Math.ceil(meter / 5));
