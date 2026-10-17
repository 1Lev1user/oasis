// Help: the «Как играть» screen (C-070). The keeper stands on plain sand; in #hud a title and short sections as <details> blocks
// (the question is the summary, the first one open) and one «Назад» back to the scene that opened it (data.from, default 'oasis').
// Numbers in the texts come from BALANCE (texts/help.js). Entry: the «?» in the oasis and the village, the link on the empty oasis.
import { WORLD, SAFE } from '../scale.js';
import { keeperFrames, keeperAnim, makeTextures } from '../art/textures.js';
import { color, applySettings } from '../world.js';
import { el, button } from '../hud.js';
import { TEXTS, sections } from '../texts/help.js';

const OY = (WORLD.h - SAFE.h) / 2;
const HORIZON = OY + 60;
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y0: -WORLD.h, y1: 2 * WORLD.h };

export class Help extends Phaser.Scene {
  constructor() { super('help'); }

  // data.from: the scene to return to; data.contractId: the habit its oasis showed (only the oasis takes it).
  init(data) {
    this.from = data?.from ?? 'oasis';
    this.contractId = data?.contractId ?? null;
  }

  create() {
    makeTextures(this);
    applySettings(this.registry.get('state')?.game?.settings);
    this.backdrop();
    this.hud = this.makeHud();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hud.destroy());
  }

  backdrop() {
    const g = this.add.graphics().setDepth(0);
    const rect = (letter, x, y, w, h) => g.fillStyle(color(letter)).fillRect(x, y, w, h);
    const w = SPAN.x1 - SPAN.x0;
    rect('j', SPAN.x0, SPAN.y0, w, HORIZON - SPAN.y0);
    rect('A', SPAN.x0, HORIZON, w, SPAN.y1 - HORIZON);
    rect('a', SPAN.x0, HORIZON, w, 3);
    const y = OY + 100;
    this.add.sprite(WORLD.w / 2, y, keeperFrames('lizard').stand).setOrigin(0.5, 1).setDepth(y).play(keeperAnim(this, 'lizard'));
  }

  back() { this.scene.start(this.from, this.contractId ? { contractId: this.contractId } : undefined); }

  makeHud() {
    const root = document.getElementById('hud');
    const items = sections().map((s, i) => {
      const item = el('details', 'help-item');
      item.open = i === 0;
      item.append(el('summary', '', s.title), ...s.body.map((line) => el('p', '', line)));
      return item;
    });
    root.replaceChildren(button('b-small px village-link', TEXTS.back, () => this.back()), el('h2', 'hud-habit px', TEXTS.title), ...items);
    return { destroy: () => root.replaceChildren() };
  }
}
