// What the lizard does when a step repairs the broken things: 6 repair variants, 3-5 s each (the short form 3-4 s).
// A variant is { id, caption, unlockAt, run(scene, target, { short }) }; target = { id, x, y, sprite } with x, y the object's bottom centre
// in world coordinates and sprite its broken image. A run has three stages: the lizard walks up (0.9 s), works in 2-3 beats of 0.7 s,
// then the broken sprite hides and the whole object pops up with a small burst, stays and fades out.
// Nothing rotates (rotated sprites tear under roundPixels): tools hop, objects lift or fade. Reduced motion comes from the world.js
// helpers (fades for bounces, half the particles); the beats that move things by hand wait instead.
import { WORLD, SAFE } from '../scale.js';
import { SPRITES } from '../art/sprites.js';
import { fixedSprite } from '../breakage-view.js';
import { TEXTS } from '../texts/oasis.js';
import { unlockAt, pickVariant } from '../../lib/variants.js';
import { setLast } from '../session.js';
import { reducedMotion, wait, tween, stopTweens, walkTo, hop, squash, float, burst, popAt } from '../world.js';

const OX = (WORLD.w - SAFE.w) / 2;
const APPROACH_MS = 900;
const BEAT_MS = 700;

// A tool image next to the lizard, facing the object, removed when the repair ends.
const tool = (c, key, dx, dy) => c.fx.keep(c.s.add.image(c.s.liz.x + c.dir * dx, c.s.liz.y + dy, key).setOrigin(0.5, 1).setDepth(840));

// A small back-and-forth move by hand; with reduced motion only the time passes.
const nudge = (s, obj, dx, ms) => (reducedMotion() ? wait(s, ms * 2) : tween(s, { targets: obj, x: obj.x + dx, duration: ms, yoyo: true }));

// The lizard walks up beside the object (on the side with room), in 0.9 s however far it is, and faces it.
async function approach(s, t, fx) {
  const rows = SPRITES[fixedSprite(t.id)];
  const w = rows[0].length;
  const h = rows.length;
  const side = t.x - w / 2 - 12 >= OX + 10 ? -1 : 1;
  const sx = Math.min(OX + 150, Math.max(OX + 10, t.x + side * (w / 2 + 12)));
  const sy = t.y + 2;
  const L = s.liz;
  const d = Math.hypot(sx - L.x, sy - L.y);
  await Promise.all([walkTo(s, L, sx, sy, Math.max(20, d / 0.8)), wait(s, APPROACH_MS)]);
  L.setFlipX(side > 0);
  return { s, t, fx, w, h, dir: -side, mid: t.y - h / 2, top: t.y - h };
}

// The whole object pops up where the broken one stood, a burst of sparks, then it fades out (1.25 s).
async function reveal(c) {
  const { s, t, fx } = c;
  t.sprite.setVisible(false);
  const whole = fx.keep(s.add.image(t.x, t.y, fixedSprite(t.id)).setOrigin(0.5, 1).setDepth(t.y + 1));
  const shown = reducedMotion()
    ? (whole.setAlpha(0), tween(s, { targets: whole, alpha: 1, duration: 250 }))
    : (whole.setScale(0), tween(s, { targets: whole, scale: 1, duration: 250, ease: 'Back.easeOut' }));
  fx.later(burst(s, 'spark', t.x, c.mid, 10, { angle: { min: 0, max: 360 }, speed: { min: 15, max: 40 }, gravityY: 20, lifespan: 500 }));
  fx.later(hop(s, s.liz, 6, 300));
  await shown;
  await wait(s, 600);
  await tween(s, { targets: whole, alpha: 0, duration: 400 });
}

// work.setup(c) runs once after the approach; work.beat(c, i) is one beat of the work, padded to BEAT_MS.
function repair(id, work) {
  return {
    id,
    caption: TEXTS.repairCaptions[id],
    async run(s, t, { short = false } = {}) {
      const held = [];
      const pending = [];
      const fx = { keep: (obj) => (held.push(obj), obj), later: (promise) => (pending.push(promise), promise) };
      try {
        const c = await approach(s, t, fx);
        work.setup?.(c);
        for (let i = 0; i < (short ? 2 : 3); i++) await Promise.all([work.beat(c, i), wait(s, BEAT_MS)]);
        await reveal(c);
        await Promise.all(pending);
      } finally {
        held.forEach((obj) => { stopTweens(s, obj); obj.destroy(); });
        s.liz.setScale(1).clearTint();
      }
    },
  };
}

const VARIANTS = [
  // planks on the ground, a tiny hammer taps, sparks fly
  repair('hammer', {
    setup(c) {
      c.fx.keep(c.s.add.image(c.t.x - c.dir * (c.w / 2 + 4), c.t.y + 1, 'plank').setOrigin(0.5, 1).setDepth(c.t.y + 2));
      c.hammer = tool(c, 'hammer', 9, -4);
    },
    async beat(c, i) {
      await hop(c.s, c.hammer, 5, 240);
      c.fx.later(float(c.s, 'spark', c.t.x + (i - 1) * 4, c.top + 2, { rise: 8, ms: 400 }));
      await squash(c.s, c.s.liz, 1.06, 0.9, 200);
    },
  }),
  // the pieces blink and sparkle as they stick together
  repair('glue', {
    async beat(c, i) {
      c.fx.later(float(c.s, 'spark', c.t.x - 4, c.mid, { rise: 8, ms: 450 }));
      c.fx.later(float(c.s, 'spark', c.t.x + 4 + i, c.mid + 2, { rise: 8, ms: 450 }));
      await Promise.all([tween(c.s, { targets: c.t.sprite, alpha: 0.5, duration: 150, yoyo: true }), squash(c.s, c.s.liz, 1.06, 0.9, 260)]);
    },
  }),
  // digs the base, lifts the object and sets it upright
  repair('dig', {
    async beat(c) {
      c.fx.later(burst(c.s, 'dust', c.t.x, c.t.y, 4, { angle: { min: 200, max: 340 }, gravityY: 40, lifespan: 400 }));
      await Promise.all([hop(c.s, c.t.sprite, 2, 300), squash(c.s, c.s.liz, 1.1, 0.85, 260)]);
    },
  }),
  // waters the spot; a flower grows beside it
  repair('water', {
    setup(c) { c.can = tool(c, 'can', 9, -2); },
    async beat(c, i) {
      c.fx.later(burst(c.s, 'drop', c.t.x, c.top - 2, 5, { angle: { min: 80, max: 100 }, speed: { min: 10, max: 25 }, gravityY: 140, lifespan: 400 }));
      if (i === 1) c.fx.later(popAt(c.s, 'flower', c.t.x + c.dir * (c.w / 2 + 3), c.t.y, 400));
      await hop(c.s, c.can, 3, 240);
    },
  }),
  // sweeps the pieces into a heap
  repair('sweep', {
    setup(c) { c.broom = tool(c, 'broom', 8, 0); },
    async beat(c) {
      c.fx.later(burst(c.s, 'crumb', c.t.x, c.t.y - 1, 3, { angle: { min: 200, max: 340 }, gravityY: 60, lifespan: 400 }));
      await nudge(c.s, c.broom, c.dir * 4, 150);
      await nudge(c.s, c.broom, c.dir * 4, 150);
    },
  }),
  // a last touch with the brush
  repair('paint', {
    setup(c) { c.brush = tool(c, 'brush', 8, -3); },
    async beat(c, i) {
      c.fx.later(float(c.s, 'star', c.t.x + (i - 1) * 5, c.mid, { rise: 8, ms: 450 }));
      await Promise.all([hop(c.s, c.brush, 4, 240), squash(c.s, c.s.liz, 1.05, 0.9, 220)]);
    },
  }),
];

export const REPAIRS = VARIANTS.map((v, i) => ({ ...v, unlockAt: unlockAt('celebrations', i) }));

// One repair per target, in order; the second and the following use the short form, so three objects stay under 12 s.
// targets: [{ id, x, y }] in world coordinates; the broken images are in scene.brokenSprites (id -> image).
// ctx.pool may replace REPAIRS. The pick is saved after each choice, so a reload does not repeat it.
export async function playRepairs(scene, targets, ctx = {}) {
  for (const [i, t] of targets.entries()) {
    const pick = pickVariant(ctx.pool ?? REPAIRS, { meter: scene.view?.meter ?? 0, last: scene.state?.game?.last?.repair ?? null });
    if (!pick) return;
    scene.commit?.(setLast(scene.state, 'repair', pick.id));
    scene.hud?.caption(pick.caption);
    await pick.run(scene, { ...t, sprite: scene.brokenSprites.get(t.id) }, { short: i > 0 });
  }
}
