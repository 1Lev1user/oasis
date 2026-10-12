// The chest at the end of a contract: it wobbles open, the coins fly to the reward (the jar) and to the anti-goal (the fire), then the
// result stands in #hud. «Закрыть договор» closes the contract into the museum; then «Продолжить привычку» opens the sign scene with
// the renewal draft, «В деревню» the village. Owed money gets «Деньги переведены». The rules live in app/lib/settle.js and chest-view.js;
// this scene only shows them and saves. The app never moves money. Started with { contractId }; ?scene=chest opens the first chest waiting.
import { WORLD, SAFE } from '../scale.js';
import { readParams } from '../params.js';
import { timeOfDay } from '../clock.js';
import { FRAMES, makeTextures } from '../art/textures.js';
import { PALETTE } from '../art/palette.js';
import { reducedMotion, color, wait, tween, squash, burst } from '../world.js';
import { el, button } from '../hud.js';
import { hourFor } from '../pause-view.js';
import { chestLines, coinSplit, openEnded, renewDraft, CHEST_SPRITES } from '../chest-view.js';
import { settlement, closeContract, confirmTransfer } from '../../lib/settle.js';
import { saveState } from '../../lib/store.js';
import { todayKey } from '../../lib/dates.js';
import { TEXTS } from '../texts/chest.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const at = (x, y) => [x + OX, y + OY]; // prototype coordinates -> world coordinates
const HORIZON = OY + 48;
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y1: 2 * WORLD.h };
const SHADE = { night: { letter: 'm', alpha: 0.7 }, dusk: { letter: 'z', alpha: 0.18 } }; // as in the oasis
const SPOT = { chest: [80, 112], reward: [36, 114], antiGoal: [124, 114] };

// The chest textures 'cchest_closed', 'cchest_ajar', 'cchest_open' from chest-view.js (the oasis shows the closed one).
export function chestTextures(scene) {
  for (const [name, rows] of Object.entries(CHEST_SPRITES)) {
    const key = `cchest_${name}`;
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, rows[0].length, rows.length);
    const ctx = tex.getContext();
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = PALETTE[ch];
      ctx.fillRect(x, y, 1, 1);
    }));
    tex.refresh();
  }
}

export class Chest extends Phaser.Scene {
  constructor() { super('chest'); }

  // The contract and its result are read fresh (today and the hour now); nothing to open hands over to the oasis. A contract with a
  // running session is left to the oasis (the session ends there first). data.demo: the oasis load seeded the demo, so ?hour=N counts.
  init(data) {
    const state = this.registry.get('state') ?? { contracts: [] };
    const today = todayKey();
    const running = state.game?.session?.contractId;
    this.demo = !!data?.demo;
    this.contract = state.contracts.find((c) => c.id === data?.contractId) ?? openEnded(state, today).find((c) => c.id !== running) ?? null;
    this.result = this.contract && this.contract.id !== running ? settlement(this.contract, today, { hour: this.hourNow() }) : null;
    this.leaving = !this.result?.ok;
  }

  // The same hour the oasis counts (the demo ?hour=N only on a load that seeded the demo).
  hourNow() { return hourFor(location.search, this.demo); }

  create() {
    if (this.leaving) { this.scene.start('oasis'); return; }
    this.busy = false;
    makeTextures(this);
    chestTextures(this);
    if (!this.anims.exists('idle')) this.anims.create({ key: 'idle', frames: FRAMES.idle.map((key) => ({ key })), frameRate: 2, repeat: -1 });
    this.buildWorld();
    this.hud = this.makeHud();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hud.destroy());
    this.open().catch(() => {}).finally(() => this.hud.showResult());
  }

  get state() { return this.registry.get('state') ?? { contracts: [] }; }

  buildWorld() {
    const g = this.add.graphics().setDepth(0);
    const rect = (letter, x, y, w, h) => g.fillStyle(color(letter)).fillRect(x, y, w, h);
    const w = SPAN.x1 - SPAN.x0;
    rect('j', SPAN.x0, -WORLD.h, w, HORIZON + WORLD.h);
    for (let x = SPAN.x0; x < SPAN.x1; x += 2) { // distant dunes
      const h = Math.max(1, Math.round(6 + 3 * Math.sin(x / 19) + 2 * Math.sin(x / 7.3)));
      rect('A', x, HORIZON - h, 2, h);
    }
    rect('A', SPAN.x0, HORIZON, w, SPAN.y1 - HORIZON);
    rect('a', SPAN.x0, HORIZON, w, 3);
    const put = (key, [x, y]) => this.add.image(...at(x, y), key).setOrigin(0.5, 1).setDepth(OY + y);
    put('palm', [14, 100]);
    put('cactus', [148, 92]);
    this.jar = put('jar', SPOT.reward);
    this.fire = put('fire', SPOT.antiGoal);
    this.chest = put('cchest_closed', SPOT.chest);
    this.liz = this.add.sprite(...at(58, 128), 'liz').setOrigin(0.5, 1).setDepth(OY + 128).play('idle');
    const shade = SHADE[timeOfDay(new Date(), readParams(location.search).time)];
    if (shade) this.add.rectangle(WORLD.w / 2, WORLD.h / 2, 3 * WORLD.w, 3 * WORLD.h, color(shade.letter)).setDepth(900).setAlpha(shade.alpha);
    if (!reducedMotion()) this.tweens.add({ targets: this.fire, scaleY: 0.85, duration: 180, yoyo: true, repeat: -1 });
  }

  // About 2 s: three wobbles, the lid lifts, sparks, the coins fly to both sides. No rotation; reduced motion: fades, half the coins.
  async open() {
    const reduced = reducedMotion();
    const c = this.chest;
    if (reduced) await wait(this, 300);
    else for (let i = 0; i < 3; i++) await squash(this, c, 1.1, 0.9, 200);
    c.setTexture('cchest_ajar');
    await wait(this, 150);
    c.setTexture('cchest_open');
    burst(this, 'spark', c.x, c.y - 10, 8, { angle: { min: 220, max: 320 }, lifespan: 600 });
    const split = coinSplit(this.result, reduced ? 5 : 10);
    const flights = [];
    const fly = (n, side) => {
      const [tx, ty] = at(...SPOT[side]);
      for (let i = 0; i < n; i++) flights.push(wait(this, i * 70).then(() => this.coin(c.x, c.y - 10, tx + (i % 3) * 3 - 3, ty - 12 - Math.floor(i / 3) * 2, reduced)));
    };
    fly(split.reward, 'reward');
    fly(split.antiGoal, 'antiGoal');
    await Promise.all(flights);
  }

  // One coin from (x, y) in an arc to (tx, ty), where it stays; with reduced motion it fades in at (tx, ty).
  coin(x, y, tx, ty, reduced) {
    const img = this.add.image(x, y, 'coin').setDepth(ty + 2);
    if (reduced) return tween(this, { targets: img.setPosition(tx, ty).setAlpha(0), alpha: 1, duration: 300 });
    return Promise.all([
      tween(this, { targets: img, x: tx, duration: 600 }),
      tween(this, { targets: img, y: Math.min(y, ty) - 18, duration: 300, ease: 'Quad.easeOut' }).then(() => tween(this, { targets: img, y: ty, duration: 300, ease: 'Quad.easeIn' })),
    ]);
  }

  // Keeps the new state in the registry and saves it; a failed save is said, the game goes on.
  commit(next) {
    this.registry.set('state', next);
    try { saveState(localStorage, next); } catch { this.hud.message(TEXTS.saveFailed); }
  }

  // «Закрыть договор»: closeContract with today and the hour read now. The house goes to the museum.
  close() {
    if (this.busy) return;
    const closed = closeContract(this.state, this.contract.id, todayKey(), { hour: this.hourNow() });
    if (!closed.ok) { this.hud.message(TEXTS.notReady); return; }
    this.commit(closed.state);
    this.hud.showClosed();
  }

  // «Деньги переведены»: the owner's word that the owed amount went to the anti-goal (the app never moves money).
  transfer() {
    if (this.busy) return;
    const paid = confirmTransfer(this.state, this.contract.id, todayKey());
    if (!paid.ok) return;
    this.commit(paid.state);
    this.result = { ...this.result, owedCents: 0 };
    this.hud.showResult();
    this.hud.showClosed();
    this.hud.message(TEXTS.afterTransfer);
  }

  // «Продолжить привычку»: the same plan, weeks and habit with the strength reached, through the sign scene.
  renew() {
    if (this.busy) return;
    this.busy = true;
    this.scene.start('sign', { draft: renewDraft(this.contract, this.result, todayKey()), renewalOf: this.contract.id });
  }

  makeHud() {
    const root = document.getElementById('hud');
    const title = el('h2', 'hud-habit px', TEXTS.title);
    const habit = el('p', 'hud-point', this.contract.plan.action);
    const caption = el('div', 'caption');
    const capText = el('span', 'cap-text', TEXTS.opening);
    capText.setAttribute('aria-live', 'polite');
    caption.append(capText);
    const list = el('ul', 'coach-points');
    const note = el('p', 'debt-note', TEXTS.note);
    const transferBtn = button('b-sec px', TEXTS.transferred, () => this.transfer());
    const result = el('section', 'coach end');
    result.append(list, note, transferBtn);
    result.hidden = true;
    const status = el('p', 'hint');
    status.setAttribute('role', 'status');
    status.hidden = true;
    const closeBtn = button('b-main px', TEXTS.close, () => this.close());
    closeBtn.hidden = true;
    const after = el('div', 'btns end-btns');
    after.append(button('b-main px', TEXTS.renew, () => this.renew()), button('b-sec px', TEXTS.toVillage, () => this.scene.start('village')));
    after.hidden = true;
    root.replaceChildren(title, habit, caption, result, status, closeBtn, after);
    root.scrollTop = 0;
    let timer = 0;
    let closed = false;
    const owes = () => this.result.owedCents > 0;
    return {
      showResult: () => {
        list.replaceChildren(...chestLines(this.result).map((l) => el('li', '', l.text)));
        note.hidden = !owes();
        transferBtn.hidden = !closed || !owes();
        result.hidden = false;
        caption.hidden = true;
        closeBtn.hidden = closed;
      },
      showClosed: () => {
        closed = true;
        closeBtn.hidden = true;
        transferBtn.hidden = !owes();
        after.hidden = false;
        capText.textContent = TEXTS.closed;
        caption.hidden = false;
        after.querySelector('button').focus();
      },
      message: (line) => {
        status.textContent = line;
        status.hidden = false;
        clearTimeout(timer);
        timer = setTimeout(() => { status.hidden = true; }, 6000);
      },
      destroy: () => { clearTimeout(timer); root.replaceChildren(); },
    };
  }
}
