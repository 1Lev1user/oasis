// Game shell: boots Phaser into #game, keeps the camera at a whole-number zoom and exposes the scene-check hook.
import { WORLD, zoomFor } from './scale.js';
import { loadState, saveState } from '../lib/store.js';
import { Boot } from './scenes/boot.js';
import { Oasis } from './scenes/oasis.js';
import { Setup } from './scenes/setup.js';
import { Plan } from './scenes/plan.js';
import { Sign } from './scenes/sign.js';
import { Village } from './scenes/village.js';
import { Workshop } from './scenes/workshop.js';
import { Museum } from './scenes/museum.js';
import { Chest } from './scenes/chest.js';
import { Campfire } from './scenes/campfire.js';
import { Settings } from './scenes/settings.js';
import { Help } from './scenes/help.js';
import { seedVillage } from './village-view.js';
import { demoShop } from './workshop-view.js';
import { demoEnded } from './chest-view.js';
import { todayKey } from '../lib/dates.js';

const check = (window.__sceneCheck = { ready: false, scene: null, zoom: 0 });

// Whole-number zoom, centred on the world; bigger screens show more world, never bigger pixels.
function fit(scene) {
  const { width, height } = scene.scale;
  check.zoom = zoomFor(width, height);
  scene.cameras.main.setZoom(check.zoom).centerOn(WORLD.w / 2, WORLD.h / 2);
}

const scenes = [new Boot(), new Oasis(), new Setup(), new Plan(), new Sign(), new Village(), new Workshop(), new Museum(), new Chest(), new Campfire(), new Settings(), new Help()];
const onCreate = (scene) => {
  fit(scene);
  if (scene.sys.settings.key !== 'boot' && !scene.leaving) { // an oasis that hands over to the village is not ready
    check.scene = scene.sys.settings.key;
    check.ready = true;
  }
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#a8dcea',
  scale: { mode: Phaser.Scale.RESIZE },
  dom: { createContainer: true },
  scene: scenes,
  callbacks: { postBoot: () => scenes.forEach((scene) => scene.sys.events.on(Phaser.Scenes.Events.CREATE, () => onCreate(scene))) },
});
game.scale.on(Phaser.Scale.Events.RESIZE, () => game.scene.getScenes(true).forEach(fit));

let state;
try { state = loadState(localStorage); } catch { state = { contracts: [] }; }
// ?demo=3: three demo habits for the village, only on a state with no active habit (never over the owner's own); ?demo=ended: one
// contract whose term ended yesterday, so the chest can be tried (also only with no active habit and no chest waiting)
const demo = demoEnded(seedVillage(state, todayKey(), location.search), todayKey(), location.search);
if (demo !== state) {
  state = demoShop(location.search, true, demo, todayKey()); // ?gems=N and ?week=N, only on a load that seeded the demo
  try { saveState(localStorage, state); } catch { /* the demo is still shown from memory */ }
}
game.registry.set('state', state);
