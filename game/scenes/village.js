// The village: one district per active habit (a hut, its keeper, strength pips, a check mark when today's step is done) and a free plot
// while fewer than five habits are active. A tap opens that habit's oasis; the plot starts the questionnaire. The scene only shows
// what village-view.js says. The HUD lists the same districts as buttons, so the canvas is never the only way in. Below them: the habits
// whose term is over and whose chest waits (a tap opens that oasis), and a calm line per closed contract that still owes a transfer.
import { WORLD, SAFE } from '../scale.js';
import { readParams } from '../params.js';
import { timeOfDay } from '../clock.js';
import { PALETTE } from '../art/palette.js';
import { keeperFrames, keeperAnim, dress, makeTextures } from '../art/textures.js';
import { color, applySettings } from '../world.js';
import { sound } from '../sound.js';
import { todayKey } from '../../lib/dates.js';
import { saveState } from '../../lib/store.js';
import { openEnded, owedReminders, transferOwed } from '../chest-view.js';
import { districts, freePlot, layout, pips, summaryOf, VILLAGE_SPRITES } from '../village-view.js';
import { sessionContract } from '../money-view.js';
import { lookOf } from '../workshop-view.js';
import { el, button, gearButton } from '../hud.js';
import { TEXTS } from '../texts/village.js';
import { TEXTS as MUSEUM } from '../texts/museum.js';
import { TEXTS as CHEST } from '../texts/chest.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const HORIZON = OY + 36;
const SHADE = { night: 0.5, dusk: 0.18 };
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y0: -WORLD.h, y1: 2 * WORLD.h };

export class Village extends Phaser.Scene {
  constructor() { super('village'); }

  create() {
    applySettings(this.state.game?.settings); // the owner's sound, shake and motion choices
    this.layer = []; // the drawing of the current day: huts, keepers, pips, taps
    this.makeTextures();
    this.backdrop();
    this.hud = this.makeHud();
    this.draw();
    // a new day (the app stayed open, or the phone woke up) redraws the done marks
    const refresh = () => { if (todayKey() !== this.day) this.draw(); this.applyTime(); };
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    this.time.addEvent({ delay: 20000, loop: true, callback: refresh });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onVisible);
      this.hud.destroy();
    });
  }

  get state() { return this.registry.get('state') ?? { contracts: [] }; }

  makeTextures() {
    makeTextures(this); // the keepers, the palm and the flowers
    for (const [key, rows] of Object.entries(VILLAGE_SPRITES)) {
      const name = `v_${key}`;
      if (this.textures.exists(name)) continue;
      const tex = this.textures.createCanvas(name, rows[0].length, rows.length);
      const ctx = tex.getContext();
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = PALETTE[ch];
        ctx.fillRect(x, y, 1, 1);
      }));
      tex.refresh();
    }
  }

  backdrop() {
    const g = this.add.graphics().setDepth(0);
    const rect = (letter, x, y, w, h) => g.fillStyle(color(letter)).fillRect(x, y, w, h);
    const w = SPAN.x1 - SPAN.x0;
    rect('j', SPAN.x0, SPAN.y0, w, HORIZON - SPAN.y0);
    for (let x = SPAN.x0; x < SPAN.x1; x += 2) {
      const h = Math.max(1, Math.round(6 + 3 * Math.sin(x / 19) + 2 * Math.sin(x / 7.3)));
      rect('A', x, HORIZON - h, 2, h);
    }
    rect('A', SPAN.x0, HORIZON, w, SPAN.y1 - HORIZON);
    rect('a', SPAN.x0, HORIZON, w, 3);
    for (let i = 0; i < 260; i++) rect(Math.random() < 0.25 ? 'a' : 'Q', Math.floor(-30 + Math.random() * (WORLD.w + 60)), HORIZON + 4 + Math.floor(Math.random() * (WORLD.h - HORIZON + 30)), 1, 1);
    for (const [key, x, y] of [['palm', 22, 112], ['palm', 222, 126], ['flower', 14, 150], ['flowerB', 228, 160], ['flower', 36, 176], ['flowerB', 206, 184]]) {
      this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y);
    }
    this.shade = this.add.rectangle(WORLD.w / 2, WORLD.h / 2, 3 * WORLD.w, 3 * WORLD.h, color('m')).setDepth(900);
    this.applyTime();
  }

  // Night and dusk by the device clock (?time= can force them), like the oasis.
  applyTime() {
    const tod = timeOfDay(new Date(), readParams(location.search).time);
    this.shade.setFillStyle(color(tod === 'dusk' ? 'z' : 'm')).setAlpha(tod === 'night' ? SHADE.night : tod === 'dusk' ? SHADE.dusk : 0);
  }

  // Draws the districts for today (read fresh) and tells the HUD.
  draw() {
    const today = todayKey();
    this.day = today;
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    this.list = districts(this.state, today);
    const plot = freePlot(this.state, today);
    const spots = layout(this.list.length + (plot ? 1 : 0));
    this.list.forEach((d, i) => this.district(d, spots[i]));
    if (plot) this.plot(spots[this.list.length]);
    this.hud.render(this.list, plot, openEnded(this.state, today), owedReminders(this.state));
  }

  // «Деньги переведены» on an owed line: the owner's word for a closed contract's transfer (the app never moves money). Read fresh.
  transfer(contractId) {
    const paid = transferOwed(this.state, contractId, todayKey());
    if (paid.ok) {
      this.registry.set('state', paid.state);
      try { saveState(localStorage, paid.state); } catch { /* shown from memory; the next save tries again */ }
    }
    this.draw();
    if (paid.ok) this.hud.message(CHEST.afterTransfer);
  }

  add1(obj) { this.layer.push(obj); return obj; }

  // A tap area over the whole district (at least 44 CSS px at the smallest zoom).
  tapArea(x, y, onTap) {
    this.add1(this.add.zone(x, y + 5, 32, 38).setInteractive({ useHandCursor: true }).on('pointerdown', () => { sound.play('tap'); onTap(); }));
  }

  district(d, { x, y }) {
    this.add1(this.add.image(x, y, 'v_hut').setOrigin(0.5, 1).setDepth(y));
    const { species, outfit } = lookOf(this.state.game, d.id);
    const keeper = this.add1(this.add.sprite(x, y + 13, keeperFrames(species, d.stage).stand).setOrigin(0.5, 1).setDepth(y + 13).play(keeperAnim(this, species, d.stage)));
    const worn = dress(this, keeper, species, outfit, d.stage);
    if (worn) this.add1(worn.img);
    const g = this.add1(this.add.graphics().setDepth(y + 14));
    const x0 = x - 10;
    g.fillStyle(color('K')).fillRect(x0, y + 15, 21, 5);
    const filled = pips(d.meter);
    for (let i = 0; i < 5; i++) g.fillStyle(color(i < filled ? 'L' : 'a')).fillRect(x0 + 1 + i * 4, y + 16, 3, 3);
    if (d.doneToday) this.add1(this.add.image(x + 3, y - 19, 'v_tick').setOrigin(0, 0).setDepth(y + 20));
    this.tapArea(x, y, () => this.open(d));
  }

  plot({ x, y }) {
    this.add1(this.add.image(x, y, 'v_plot').setOrigin(0.5, 1).setDepth(y));
    this.tapArea(x, y, () => this.newHabit());
  }

  // Opens that habit's oasis. While a session runs the oasis shows its habit whatever is asked, so the other districts say so instead
  // (also when the running session's term is over and it has no district of its own). Read fresh at the tap.
  open(d) {
    const running = sessionContract(this.state, todayKey());
    if (running && running.id !== d.id) { this.hud.message(TEXTS.sessionRuns); return; }
    this.scene.start('oasis', { contractId: d.id });
  }

  newHabit() { this.scene.start('setup'); }

  makeHud() {
    const root = document.getElementById('hud');
    const title = el('h2', 'hud-habit px', TEXTS.title);
    const summary = el('p', 'hud-point');
    summary.setAttribute('role', 'status');
    const items = el('ul', 'districts');
    const chests = el('ul', 'districts');
    const owed = el('ul', 'quests owed');
    const note = el('p', 'hint');
    note.setAttribute('role', 'status');
    note.hidden = true;
    const plotBtn = button('b-main px', TEXTS.newHabit, () => this.newHabit());
    const tools = el('div', 'tools');
    tools.append(button('b-small px', MUSEUM.enter, () => this.scene.start('museum')));
    root.replaceChildren(title, summary, items, chests, owed, note, plotBtn, tools, gearButton(() => this.scene.start('settings')));
    let timer = 0;
    return {
      render: (list, plot, ended, owing) => {
        const { done, total } = summaryOf(list);
        summary.textContent = TEXTS.summary(done, total);
        items.replaceChildren(...list.map((d) => {
          const state = d.sessionToday ? 'session' : d.doneToday ? 'done' : d.kind === 'scheduled' || d.kind === 'flex' ? 'todo' : d.kind;
          const b = button(`district${d.doneToday ? ' done' : ''}`, '', () => this.open(d));
          b.append(el('span', 'd-name', d.action), el('span', 'd-meta', `${TEXTS.strength(d.meter)} · ${TEXTS.state[state]}`));
          const item = el('li');
          item.append(b);
          return item;
        }));
        chests.replaceChildren(...ended.map((c) => {
          const b = button('district', '', () => this.open({ id: c.id }));
          b.append(el('span', 'd-name', c.plan.action), el('span', 'd-meta', CHEST.waiting));
          const item = el('li');
          item.append(b);
          return item;
        }));
        chests.hidden = !ended.length;
        owed.replaceChildren(...owing.map((r) => {
          const item = el('li', 'owed-line');
          item.append(el('span', 'debt-to', r.text), button('b-small px', CHEST.transferred, () => this.transfer(r.contractId)));
          return item;
        }));
        owed.hidden = !owing.length;
        plotBtn.hidden = !plot;
      },
      message: (line) => {
        note.textContent = line;
        note.hidden = false;
        clearTimeout(timer);
        timer = setTimeout(() => { note.hidden = true; }, 6000);
      },
      destroy: () => { clearTimeout(timer); root.replaceChildren(); },
    };
  }
}
