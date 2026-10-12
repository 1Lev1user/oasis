// What the oasis builds for a habit and how the «Стройка» panel and the world show it: pure, no Phaser, no DOM.
// Every rule comes from app/lib (gems.js `buy`, meter.js, breakage.js) and the balance table; gems never relate to money.
import { BALANCE } from '../lib/balance.js';
import { DEFAULT_GAME } from '../lib/game-state.js';
import { buy, builtFor } from '../lib/gems.js';
import { habitOf } from '../lib/habit.js';
import { meterState } from '../lib/meter.js';
import { brokenNow } from '../lib/breakage.js';
import { mineOf } from './gems-view.js';
import { viewFor } from './breakage-view.js';
import { SPRITES, LAMP_ROWS } from './art/sprites.js';
import { TEXTS } from './texts/build.js';

// Where each building stands (safe-area coordinates: x the centre, y the bottom edge). Clear of the pond, the burrow, the old props and
// every breakable spot (BREAK_SPOTS); build-view.test.js checks it.
export const BUILD_SPOTS = {
  mine: { x: 13, y: 120 },
  storage: { x: 14, y: 136 },
  storageBar: { x: 14, y: 139 },
  lighthouse: { x: 102, y: 114 },
  watchtower: { x: 117, y: 114 },
  observatory: { x: 133, y: 114 },
};
// The lit lamp that shines above the night shade, on the lamp rows of the lighthouse.
export const LAMP = { key: 'lamp_glow', x: BUILD_SPOTS.lighthouse.x, y: BUILD_SPOTS.lighthouse.y - SPRITES.lighthouse.length + LAMP_ROWS, rows: LAMP_ROWS };

export const mineKey = (level) => (level <= 1 ? 'mine' : `mine${Math.min(level, BALANCE.mine.maxLevel)}`);
export const storageKey = (filled) => `storage_bar_${Math.min(BALANCE.storage.slots, Math.max(0, Math.trunc(filled) || 0))}`;

// The effect buildings this habit owns (they belong to the habit, so a renewal keeps them).
export const builtIn = (game, contract) => (contract ? builtFor(game ?? DEFAULT_GAME, habitOf(contract).habitId) : []);

const meterOf = (contract, today) => meterState(contract, today, habitOf(contract).meterBase).meter;

// { mine: { level, nextPrice | null }, storage: { filled, slots }, effects: [{ id, state: locked | buyable | built, unlockMeter, price }] }
export function buildings(game, contract, today) {
  const g = game ?? DEFAULT_GAME;
  const level = mineOf(g, contract.id);
  const meter = meterOf(contract, today);
  const built = builtIn(g, contract);
  return {
    mine: { level, nextPrice: level >= BALANCE.mine.maxLevel ? null : BALANCE.mine.upgrade[level - 1] },
    storage: { filled: g.storage?.[contract.id] ?? 0, slots: BALANCE.storage.slots },
    effects: Object.entries(BALANCE.buildings).map(([id, b]) => ({
      id, state: built.includes(id) ? 'built' : meter >= b.meter ? 'buyable' : 'locked', unlockMeter: b.meter, price: b.price,
    })),
  };
}

// The result of gems.js `buy` plus `line`, the one calm sentence to show for it.
const said = (result, done) => ({ ...result, line: result.ok ? done(result.game) : TEXTS.errors[result.error] ?? TEXTS.errors.other });

export const upgradeMine = (game, contract) =>
  said(buy(game, { type: 'mine', contractId: contract.id }), (next) => TEXTS.upgraded(mineOf(next, contract.id)));

export const construct = (game, contract, id, today) =>
  said(buy(game, { type: 'building', id, habitId: habitOf(contract).habitId, meter: meterOf(contract, today) }),
    () => TEXTS.built(TEXTS.effects[id].name.toLowerCase()));

// The panel's lines: { id, name, meta, action: 'upgrade' | 'build' | null }, the storage also { filled, slots }.
export function rows({ mine, storage, effects }) {
  const stateText = { built: () => TEXTS.owned, locked: (e) => TEXTS.locked(e.unlockMeter), buyable: (e) => TEXTS.price(e.price) };
  return [
    {
      id: 'mine',
      name: TEXTS.mineName(mine.level, BALANCE.mine.maxLevel),
      meta: `${TEXTS.mineMeta(mine.level)} · ${mine.nextPrice === null ? TEXTS.top : TEXTS.nextPrice(mine.nextPrice)}`,
      action: mine.nextPrice === null ? null : 'upgrade',
    },
    { id: 'storage', name: TEXTS.storageName(storage.filled, storage.slots), meta: TEXTS.storageMeta, action: null, filled: storage.filled, slots: storage.slots },
    ...effects.map((e) => ({
      id: e.id,
      name: TEXTS.effects[e.id].name,
      meta: `${TEXTS.effects[e.id].effect} · ${stateText[e.state](e)}`,
      action: e.state === 'buyable' ? 'build' : null,
    })),
  ];
}

// What the world shows, in drawing order: { id, key, x, y }; the lamp glow also `over: true` (it shines above the night shade).
// `lit` is true at dusk and night: only a built lighthouse lights up, the rest stay silhouettes until they are built.
export function placed({ mine, storage, effects }, lit) {
  const at = (id, key) => ({ id, key, ...BUILD_SPOTS[id] });
  const list = [at('mine', mineKey(mine.level)), at('storage', 'storage'), at('storageBar', storageKey(storage.filled))];
  for (const { id, state } of effects) {
    list.push(at(id, state !== 'built' ? `${id}_locked` : id === 'lighthouse' && lit ? 'lighthouse_lit' : id));
    if (id === 'lighthouse' && state === 'built' && lit) list.push({ id: 'lamp', key: LAMP.key, x: LAMP.x, y: LAMP.y, over: true });
  }
  return list;
}

// True where the walking keeper would vanish behind a building: foot positions (safe-area coordinates) around the mine and the storage,
// and behind the three tall buildings.
export const keepsOut = (x, y) => (x < 34 && y > 106) || (x > 87 && x < 149 && y > 95 && y < 118);

// The things a step repairs, by object id and place, counting the watchtower (`built`): what is broken before the step and not after it.
// (pause-view.js markRepairs does the same without the buildings.)
export function repairsFor(before, after, today, built) {
  const stays = new Set(viewFor(brokenNow(after, today, built)).map((item) => item.id));
  return viewFor(brokenNow(before, today, built)).filter((item) => !stays.has(item.id));
}
