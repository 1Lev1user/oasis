// The museum: a small hall with one house per finished contract (the newest on the floor) and a shelf of trophies (earned ones lit, the
// others as silhouettes). The scene only shows what museum-view.js says; the HUD lists the same houses and trophies, with the one-line
// hint of each trophy still to come, so the canvas is never the only way in. Entry: «Музей» in the village and the oasis.
import { WORLD, SAFE } from '../scale.js';
import { readParams } from '../params.js';
import { makeTextures } from '../art/textures.js';
import { color } from '../world.js';
import { todayKey } from '../../lib/dates.js';
import { saveState } from '../../lib/store.js';
import { seedDemo } from '../demo.js';
import { hall, houseSpots, trophySpots, demoMuseum, MAX_SHOWN } from '../museum-view.js';
import { startSceneFor } from '../village-view.js';
import { dayLabel } from '../pause-view.js';
import { el, button } from '../hud.js';
import { TEXTS } from '../texts/museum.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y0: -WORLD.h, y1: 2 * WORLD.h };
const WALL_END = OY + 90; // the wall stops here, the floor starts
const SHELF = { x: OX + 8, w: 144 };

export class Museum extends Phaser.Scene {
  constructor() { super('museum'); }

  create() {
    this.layer = []; // the drawing of the current state: shelves, trophies, houses
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

  // ?demo=1 with no habit yet: the demo habit and one demo house (museum-view.js). Never over the owner's own habit.
  seedForDemo() {
    if (!readParams(location.search).demo) return;
    const today = todayKey();
    const seeded = seedDemo(this.state, today);
    if (seeded === this.state) return;
    const next = demoMuseum(location.search, true, seeded, today);
    this.registry.set('state', next);
    try { saveState(localStorage, next); } catch { /* the demo is still shown from memory */ }
  }

  backdrop() {
    const g = this.add.graphics().setDepth(0);
    const rect = (letter, x, y, w, h) => g.fillStyle(color(letter)).fillRect(x, y, w, h);
    const w = SPAN.x1 - SPAN.x0;
    rect('A', SPAN.x0, SPAN.y0, w, WALL_END - SPAN.y0);
    rect('a', SPAN.x0, WALL_END - 3, w, 3);
    rect('S', SPAN.x0, WALL_END, w, SPAN.y1 - WALL_END);
    for (let y = WALL_END + 8; y < SPAN.y1; y += 8) rect('s', SPAN.x0, y, w, 1);
  }

  // Shelves, trophies and houses for today (read fresh), and the HUD lists.
  draw() {
    const today = todayKey();
    this.day = today;
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    const { houses, trophies } = hall(this.state, today);
    const g = this.add1(this.add.graphics().setDepth(1));
    const spots = trophySpots(trophies.length);
    for (const y of new Set(spots.map((s) => s.y))) {
      g.fillStyle(color('R')).fillRect(SHELF.x, y, SHELF.w, 2);
      g.fillStyle(color('r')).fillRect(SHELF.x, y + 2, SHELF.w, 1);
      g.fillStyle(color('K')).fillRect(SHELF.x, y + 3, SHELF.w, 1);
    }
    trophies.forEach((t, i) => this.spot(spots[i], t.earned ? 'trophy' : 'trophy_locked', () => this.hud.message(this.trophyLine(t))));
    const shown = houses.slice(0, MAX_SHOWN);
    houseSpots(shown.length).forEach((at, i) => this.spot(at, 'house', () => this.hud.message(`${shown[i].action}: ${this.houseMeta(shown[i])}`)));
    this.hud.render({ houses, trophies });
  }

  add1(obj) { this.layer.push(obj); return obj; }

  // A picture standing on (x, y) with a tap area over it; the tap says its line in the HUD.
  spot({ x, y }, key, onTap) {
    const img = this.add1(this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y));
    this.add1(this.add.zone(x, y - img.height / 2, Math.max(img.width, 20), Math.max(img.height, 20)).setInteractive({ useHandCursor: true }).on('pointerdown', onTap));
  }

  houseMeta(h) { return TEXTS.houseMeta(dayLabel(h.endDate), h.stage); }

  trophyLine(t) {
    const { name, hint } = TEXTS.trophies[t.id];
    return `${name}: ${t.earned ? TEXTS.earned : hint}`;
  }

  back() { this.scene.start(startSceneFor(this.state, todayKey())); }

  makeHud() {
    const root = document.getElementById('hud');
    const backBtn = button('b-small px village-link', TEXTS.back, () => this.back());
    const title = el('h2', 'hud-habit px', TEXTS.title);
    const note = el('p', 'hint');
    note.setAttribute('role', 'status');
    note.hidden = true;
    const housesHead = el('h3', 'coach-title', TEXTS.housesTitle);
    const housesList = el('ul', 'districts');
    const empty = el('p', 'hud-point', TEXTS.noHouses);
    const trophiesHead = el('h3', 'coach-title', TEXTS.trophiesTitle);
    const trophiesList = el('ul', 'districts');
    root.replaceChildren(backBtn, title, note, housesHead, empty, housesList, trophiesHead, trophiesList);
    let timer = 0;

    const row = (name, meta, done) => {
      const box = el('div', `district${done ? ' done' : ''}`);
      box.append(el('span', 'd-name', name), el('span', 'd-meta', meta));
      const li = el('li');
      li.append(box);
      return li;
    };

    return {
      render: ({ houses, trophies }) => {
        empty.hidden = houses.length > 0;
        housesList.replaceChildren(...houses.map((h) => row(h.action, this.houseMeta(h), false)));
        trophiesList.replaceChildren(...trophies.map((t) => row(TEXTS.trophies[t.id].name, t.earned ? TEXTS.earned : TEXTS.trophies[t.id].hint, t.earned)));
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
