// Boot: wait for the two fonts (never longer than FONT_WAIT_MS), then start the scene from ?scene= or the oasis.
import { readParams } from '../params.js';

const FONT_WAIT_MS = 2000;
const FONTS = ["800 16px Handjet", "400 16px Nunito"];

export class Boot extends Phaser.Scene {
  constructor() { super('boot'); }

  create() {
    const fonts = Promise.all(FONTS.map((f) => document.fonts.load(f, 'Оазис ящерицы 0123')));
    const timeout = new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS));
    Promise.race([fonts, timeout]).catch(() => {}).then(() => {
      const wanted = readParams(location.search).scene;
      this.scene.start(wanted && wanted !== 'boot' && this.scene.get(wanted) ? wanted : 'oasis');
    });
  }
}
