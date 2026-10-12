// Scene helpers for the oasis: every one takes the scene first and returns a promise, so cards can chain them.
// Later cards (session activities, celebrations, repairs) import these. They respect reduced motion (the phone's
// prefers-reduced-motion or the owner's own setting): no shake or flash, half the particles, bounces become a short fade.
import { PALETTE } from './art/palette.js';
import { sound } from './sound.js';

// The owner's choices from the saved game (settings.reducedMotion, settings.shake); the scenes set them on load and on change.
let prefs = { reduced: false, shake: 1 };
export function setMotionPrefs(p) {
  prefs = { reduced: p?.reduced === true, shake: [0, 1, 2].includes(p?.shake) ? p.shake : 1 };
}
// Reads game.settings (may be missing) into the motion choices and the sound switch.
export function applySettings(settings) {
  setMotionPrefs({ reduced: settings?.reducedMotion, shake: settings?.shake });
  sound.setEnabled(settings?.sound === true);
}

export const reducedMotion = () => prefs.reduced || !!globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// [duration ms, camera intensity] by strength: 1 light, 2 normal. Intensity is a share of the screen size, so these are a pixel or three.
const SHAKES = [null, [120, 0.004], [180, 0.008]];

// A short camera shake; nothing at strength 0 or with reduced motion. Without a strength the saved one is used.
export function shake(scene, strength = prefs.shake) {
  const s = SHAKES[strength];
  if (s && !reducedMotion()) scene.cameras.main.shake(...s);
}

// '#rrggbb' palette letter -> number for Phaser fills and strokes.
export const color = (letter) => parseInt(PALETTE[letter].slice(1), 16);

export const wait = (scene, ms) => new Promise((resolve) => scene.time.delayedCall(ms, resolve));

// A tween as a promise: true when it ran to the end, false when it was stopped early (see stopTweens).
export const tween = (scene, config) =>
  new Promise((resolve) => scene.tweens.add({ ...config, onComplete: () => resolve(true), onStop: () => resolve(false) }));

// Stops (not kills) the tweens on a target, so pending promises settle with false instead of hanging.
export const stopTweens = (scene, target) => scene.tweens.getTweensOf(target).forEach((t) => t.stop());

// Walks to (x, y) at `speed` world px/s facing the way it goes; needs the animations 'walk' and 'idle'.
export function walkTo(scene, sprite, x, y, speed = 28) {
  const d = Phaser.Math.Distance.Between(sprite.x, sprite.y, x, y);
  if (d < 1) return Promise.resolve();
  if (Math.abs(x - sprite.x) > 1) sprite.setFlipX(x < sprite.x);
  sprite.play('walk', true);
  return tween(scene, { targets: sprite, x, y, duration: Math.max(120, (d / speed) * 1000) }).then((done) => {
    if (done) sprite.play('idle', true);
  });
}

const fade = (scene, sprite, ms) => tween(scene, { targets: sprite, alpha: 0.6, duration: ms / 2, yoyo: true });

export function hop(scene, sprite, h = 6, ms = 300) {
  if (reducedMotion()) return fade(scene, sprite, ms);
  return tween(scene, { targets: sprite, y: sprite.y - h, duration: ms / 2, yoyo: true, ease: 'Quad.easeOut' });
}

export function squash(scene, sprite, sx = 1.15, sy = 0.82, ms = 260) {
  if (reducedMotion()) return fade(scene, sprite, ms);
  return tween(scene, { targets: sprite, scaleX: sx, scaleY: sy, duration: ms / 2, yoyo: true });
}

// A small image that rises, drifts and fades out (heart, zz, spark).
export function float(scene, key, x, y, opts = {}) {
  const img = scene.add.image(x, y, key).setDepth(820);
  return tween(scene, { targets: img, y: y - (opts.rise ?? 14), x: x + (opts.drift || 0), alpha: 0, duration: opts.ms || 1200, ease: 'Sine.easeOut' })
    .then(() => img.destroy());
}

// Particles from a point; `opts` is a Phaser emitter config. Resolves when the emitter is gone.
export function burst(scene, key, x, y, n, opts = {}) {
  if (reducedMotion()) n = Math.max(1, Math.ceil(n / 2));
  const emitter = scene.add.particles(x, y, key, { speed: { min: 20, max: 55 }, angle: { min: 200, max: 340 }, lifespan: 800, gravityY: 90, emitting: false, ...opts }).setDepth(830);
  emitter.explode(n);
  return wait(scene, (opts.lifespan || 800) + 600).then(() => emitter.destroy());
}

// A prop that pops up (scales in, or fades in when motion is reduced), stays `ms`, then fades out.
export function popAt(scene, key, x, y, ms = 2500) {
  const img = scene.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y + 1);
  const shown = reducedMotion()
    ? (img.setAlpha(0), tween(scene, { targets: img, alpha: 1, duration: 250 }))
    : (img.setScale(0), tween(scene, { targets: img, scale: 1, duration: 250, ease: 'Back.easeOut' }));
  return shown.then(() => wait(scene, ms)).then(() => tween(scene, { targets: img, alpha: 0, duration: 400 })).then(() => img.destroy());
}

// A ring that widens on the water and fades.
export function ripple(scene, x, y) {
  const ring = scene.add.ellipse(x, y, 4, 2).setStrokeStyle(1, color('J')).setDepth(4);
  return tween(scene, { targets: ring, scaleX: 4, scaleY: 3, alpha: 0, duration: 900 }).then(() => ring.destroy());
}
