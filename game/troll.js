// The debt troll: while a debt is open it walks in from the edge of the world and sits on the path beside the lizard; after the
// payment it stands up, waves and walks off (about 2.5 s: 0.7 s waving, 1.8 s walking). Nothing rotates.
// Reduced motion: it fades in and out where it sits.
// It only shows what the scene tells it; whether a debt is open comes from app/lib/debt.js through money-view.js.
import { WORLD, SAFE } from './scale.js';
import { FRAMES } from './art/textures.js';
import { reducedMotion, wait, tween } from './world.js';

const SPOT = { x: (WORLD.w - SAFE.w) / 2 + 122, y: (WORLD.h - SAFE.h) / 2 + 120 }; // world px, bottom centre: right of the pond, by the lizard
const EDGE_X = WORLD.w + 12; // just past the world, so no screen sees it appear
const WALK_PX_S = 50;
const WAVE_MS = 180;

const walkMs = (from, to) => (Math.abs(to - from) / WALK_PX_S) * 1000;

// Adds the troll and brings it to its spot; tapping it calls onTap. Returns the sprite.
export function trollIn(scene, onTap) {
  if (!scene.anims.exists('trollWalk')) scene.anims.create({ key: 'trollWalk', frames: FRAMES.trollWalk.map((key) => ({ key })), frameRate: 6, repeat: -1 });
  const troll = scene.add.sprite(SPOT.x, SPOT.y, 'troll_sit').setOrigin(0.5, 1).setDepth(SPOT.y);
  scene.tappable(troll, onTap);
  if (reducedMotion()) {
    troll.setAlpha(0);
    tween(scene, { targets: troll, alpha: 1, duration: 400 });
    return troll;
  }
  troll.setX(EDGE_X).setFlipX(true).play('trollWalk');
  tween(scene, { targets: troll, x: SPOT.x, duration: walkMs(EDGE_X, SPOT.x) }).then((done) => {
    if (done) troll.stop().setTexture('troll_sit').setFlipX(false);
  });
  return troll;
}

// Stands up, waves twice and leaves (walks back to the edge, or fades out); the sprite is destroyed at the end.
export async function trollOut(scene, troll) {
  troll.disableInteractive();
  scene.tweens.killTweensOf(troll);
  troll.stop().setFlipX(false);
  for (let i = 0; i < 2; i++) {
    troll.setTexture('troll_wave');
    await wait(scene, WAVE_MS);
    troll.setTexture('troll');
    await wait(scene, WAVE_MS);
  }
  if (reducedMotion()) await tween(scene, { targets: troll, alpha: 0, duration: 600 });
  else {
    troll.play('trollWalk');
    await tween(scene, { targets: troll, x: EDGE_X, duration: walkMs(troll.x, EDGE_X) });
  }
  troll.destroy();
}
