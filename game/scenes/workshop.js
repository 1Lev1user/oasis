// The workshop (opens in week 3 of a habit): a counter with the species and outfits, gem prices from the balance table, and the habit's
// keeper on the floor wearing what the owner picked. The scene only shows what workshop-view.js says and calls buy/equip from gems.js;
// the HUD lists the same items as buttons, so the canvas is never the only way in.
import { WORLD, SAFE } from '../scale.js';
import { readParams } from '../params.js';
import { KEEPER } from '../art/sprites.js';
import { keeperFrames, keeperAnim, dress, makeTextures } from '../art/textures.js';
import { color, hop } from '../world.js';
import { todayKey } from '../../lib/dates.js';
import { activeContracts } from '../../lib/contract.js';
import { saveState } from '../../lib/store.js';
import { DEFAULT_GAME } from '../../lib/game-state.js';
import { buy } from '../../lib/gems.js';
import { seedDemo } from '../demo.js';
import { workshopOpen, shelf, lookOf, wear, demoShop } from '../workshop-view.js';
import { BALANCE } from '../../lib/balance.js';
import { el, button } from '../hud.js';
import { TEXTS } from '../texts/workshop.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y0: -WORLD.h, y1: 2 * WORLD.h };
const WALL_END = OY + 90; // the wall stops here, the floor starts
const COUNTER = { x: OX + 8, y: OY + 74, w: 144, h: 14 };
const KEEPER_AT = { x: OX + 80, y: OY + 136, scale: 3 }; // a whole-number scale, never a fraction
const LOCK_MS = 400; // taps closer together than this are one tap
const DEMO_WEEK = 3; // ?scene=workshop&demo=1 opens in week 3 unless ?week=N says otherwise

export class Workshop extends Phaser.Scene {
  constructor() { super('workshop'); }

  // data.contractId (from the oasis): the habit to dress; else the first active one.
  init(data) { this.pick = data?.contractId ?? null; }

  create() {
    this.layer = []; // the drawing of the current state: counter items, the keeper
    this.worn = null;
    this.lockUntil = 0;
    this.focusKey = null;
    makeTextures(this);
    this.backdrop();
    this.hud = this.makeHud();
    this.seedForDemo();
    this.draw();
    const onVisible = () => { if (!document.hidden && todayKey() !== this.day) this.draw(); };
    document.addEventListener('visibilitychange', onVisible);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onVisible);
      this.hud.destroy();
    });
  }

  get state() { return this.registry.get('state') ?? { contracts: [] }; }

  update() { this.worn?.sync(); }

  // Keeps the new state in the registry and saves it; a failed save is shown, the game goes on.
  commit(next) {
    this.registry.set('state', next);
    try { saveState(localStorage, next); } catch { this.hud.message(TEXTS.saveFailed); }
  }

  // ?demo=1 with no habit yet: the demo habit, with ?gems=N and ?week=N (week 3 by default). Never over the owner's own habit.
  seedForDemo() {
    if (!readParams(location.search).demo) return;
    const today = todayKey();
    const seeded = seedDemo(this.state, today);
    if (seeded !== this.state) this.commit(demoShop(location.search, true, seeded, today, DEMO_WEEK));
  }

  // The habit being dressed, read fresh: null when it is gone (closed, or its term is over).
  current(today) {
    const active = activeContracts(this.state.contracts, today);
    return active.find((c) => c.id === this.pick) ?? active[0] ?? null;
  }

  backdrop() {
    const g = this.add.graphics().setDepth(0);
    const rect = (letter, x, y, w, h) => g.fillStyle(color(letter)).fillRect(x, y, w, h);
    const w = SPAN.x1 - SPAN.x0;
    rect('A', SPAN.x0, SPAN.y0, w, WALL_END - SPAN.y0);
    rect('a', SPAN.x0, WALL_END - 3, w, 3);
    rect('R', SPAN.x0, WALL_END, w, SPAN.y1 - WALL_END);
    for (let y = WALL_END + 8; y < SPAN.y1; y += 8) rect('r', SPAN.x0, y, w, 1);
    // the counter: wood with an outline, items stand on its top edge
    rect('K', COUNTER.x - 1, COUNTER.y - 1, COUNTER.w + 2, COUNTER.h + 2);
    rect('R', COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h);
    rect('A', COUNTER.x, COUNTER.y, COUNTER.w, 2);
    rect('r', COUNTER.x, COUNTER.y + COUNTER.h - 2, COUNTER.w, 2);
  }

  // Items on the counter (outfits on the upper row, species on the counter) and the keeper; read from the saved state.
  draw() {
    const today = todayKey();
    this.day = today;
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    this.worn = null;
    const contract = this.current(today);
    const game = this.state.game ?? DEFAULT_GAME;
    const open = workshopOpen(contract, today);
    const look = lookOf(game, contract?.id);
    const items = open ? shelf(game) : [];
    this.counter(items);
    this.keeper(look);
    this.hud.render({ contract, open, game, look, items, week: BALANCE.opensInWeek.workshop });
  }

  add1(obj) { this.layer.push(obj); return obj; }

  // Species stand on the counter, outfits hang above it; what is not owned yet is paler.
  counter(items) {
    const row = (list, y) => list.forEach((item, i) => {
      const key = item.type === 'species' ? KEEPER[item.id].stand : item.id;
      const x = OX + 80 + (i - (list.length - 1) / 2) * 34;
      this.add1(this.add.image(Math.round(x), y, key).setOrigin(0.5, 1).setDepth(y).setAlpha(item.owned ? 1 : 0.45));
    });
    row(items.filter((i) => i.type === 'outfit'), COUNTER.y - 14);
    row(items.filter((i) => i.type === 'species'), COUNTER.y);
  }

  keeper({ species, outfit }) {
    const f = keeperFrames(species);
    const sprite = this.add1(this.add.sprite(KEEPER_AT.x, KEEPER_AT.y, f.stand).setOrigin(0.5, 1).setScale(KEEPER_AT.scale).setDepth(KEEPER_AT.y).play(keeperAnim(this, species)));
    this.sprite = sprite;
    const worn = dress(this, sprite, species, outfit);
    if (worn) this.add1(worn.img);
    this.worn = worn;
  }

  // One tap at a time: a second tap inside LOCK_MS is ignored, so a double tap never buys and then dresses.
  act(key, run) {
    const now = performance.now();
    if (now < this.lockUntil) return;
    this.lockUntil = now + LOCK_MS;
    this.focusKey = key;
    const today = todayKey();
    const contract = this.current(today);
    if (!workshopOpen(contract, today)) { this.draw(); this.hud.message(TEXTS.errors.closed); return; }
    run(contract, this.state.game ?? DEFAULT_GAME);
  }

  // Commits a result of buy/equip once, redraws and says it in one calm line; a refusal is the same line and nothing is saved.
  finish(result, line, dressed = false) {
    if (result.ok) this.commit({ ...this.state, game: result.game });
    this.draw();
    this.hud.message(result.ok ? line : TEXTS.errors[result.error] ?? TEXTS.errors.other);
    if (result.ok && dressed) hop(this, this.sprite, 4, 300);
  }

  buyItem(item) {
    this.act(`${item.type}:${item.id}`, (contract, game) => this.finish(buy(game, { type: item.type, id: item.id }), TEXTS.bought(this.nameOf(item))));
  }

  wearItem(item) {
    this.act(`${item.type}:${item.id}`, (contract, game) =>
      this.finish(wear(game, contract.id, item.type === 'species' ? { species: item.id } : { outfit: item.id }), TEXTS.nowWearing(this.nameOf(item)), true));
  }

  takeOff(item) {
    this.act(`${item.type}:${item.id}`, (contract, game) => this.finish(wear(game, contract.id, { outfit: null }), TEXTS.tookOff, true));
  }

  nameOf(item) { return (item.type === 'species' ? TEXTS.species : TEXTS.outfits)[item.id]; }

  back() { this.scene.start('oasis', { contractId: this.current(todayKey())?.id }); }

  makeHud() {
    const root = document.getElementById('hud');
    const backBtn = button('b-small px village-link', TEXTS.back, () => this.back());
    const title = el('h2', 'hud-habit px', TEXTS.title);
    const gems = el('p', 'gems px');
    const intro = el('p', 'hud-point');
    intro.setAttribute('role', 'status');
    const note = el('p', 'hint');
    note.setAttribute('role', 'status');
    note.hidden = true;
    const speciesHead = el('h3', 'coach-title', TEXTS.speciesTitle);
    const speciesList = el('ul', 'quests');
    const outfitsHead = el('h3', 'coach-title', TEXTS.outfitsTitle);
    const outfitsList = el('ul', 'quests');
    root.replaceChildren(backBtn, title, gems, intro, note, speciesHead, speciesList, outfitsHead, outfitsList);
    let timer = 0;

    const row = (item, look) => {
      const worn = item.type === 'species' ? look.species === item.id : look.outfit === item.id;
      const box = el('div', `district${worn ? ' done' : ''}`);
      box.append(el('span', 'd-name', this.nameOf(item)), el('span', 'd-meta', item.owned ? (worn ? TEXTS.worn : TEXTS.have) : TEXTS.price(item.price)));
      let act;
      if (!item.owned) act = button('b-sec px', TEXTS.buy, () => this.buyItem(item));
      else if (worn && item.type === 'outfit') act = button('b-sec px', TEXTS.take, () => this.takeOff(item));
      else if (worn) act = button('b-sec px', TEXTS.worn, () => {});
      else act = button('b-sec px', TEXTS.wear, () => this.wearItem(item));
      if (worn && item.type === 'species') act.disabled = true;
      act.dataset.key = `${item.type}:${item.id}`;
      const line = el('div', 'btns');
      line.append(box, act);
      const li = el('li');
      li.append(line);
      return li;
    };

    return {
      render: ({ contract, open, game, look, items }) => {
        gems.textContent = `◆ ${game.gems ?? 0}`;
        gems.setAttribute('aria-label', `${TEXTS.gems}: ${game.gems ?? 0}`);
        intro.textContent = !contract ? TEXTS.noHabit : open ? TEXTS.intro(contract.plan.action) : TEXTS.locked(BALANCE.opensInWeek.workshop);
        const shown = open && !!contract;
        for (const node of [gems, speciesHead, speciesList, outfitsHead, outfitsList]) node.hidden = !shown;
        speciesList.replaceChildren(...items.filter((i) => i.type === 'species').map((i) => row(i, look)));
        outfitsList.replaceChildren(...items.filter((i) => i.type === 'outfit').map((i) => row(i, look)));
        const again = root.querySelector(`[data-key="${this.focusKey}"]`);
        if (again && !again.disabled) again.focus();
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
