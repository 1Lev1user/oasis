// What the lizard does while the owner does the habit: 6 activities per theme and 3 for any theme, each 6-8 s long.
// A variant is data plus one run(scene, tok) that only uses the scene helpers (world.js); it stops when scene.alive(tok) turns false.
// Nothing rotates (rotated sprites tear under roundPixels): moves are walks, hops, squashes, floats, offsets and crops.
// Props and drawings go through scene.hold(), so the scene removes them when the activity ends.
import { WORLD, SAFE } from '../scale.js';
import { unlockAt } from '../../lib/variants.js';
import { TEXTS } from '../texts/oasis.js';
import { reducedMotion, color, wait, tween, walkTo, hop, squash, float, burst, ripple } from '../world.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const at = (x, y) => [x + OX, y + OY]; // 160x140 safe-area coordinates -> world coordinates

// ---------- small helpers ----------
const go = (s, x, y, speed = 45) => walkTo(s, s.liz, ...at(x, y), speed);
const face = (s, dir) => s.liz.setFlipX(dir < 0);
const mouth = (s) => ({ x: s.liz.x + (s.liz.flipX ? -9 : 9), y: s.liz.y - 8 });

// An image standing on its bottom edge at safe-area (x, y), removed with the activity.
const img = (s, key, x, y, depth = OY + y) => s.hold(s.add.image(...at(x, y), key).setOrigin(0.5, 1).setDepth(depth));

// An image that follows the lizard at (dx, dy) in front of it (mirrored with the lizard); tween `off` to move it. Returns { img, off }.
function prop(s, key, dx, dy) {
  const off = { x: 0, y: 0 };
  const image = s.hold(s.add.image(0, 0, key).setOrigin(0.5, 1));
  const place = () => {
    const L = s.liz;
    image.setPosition(L.x + (dx + off.x) * (L.flipX ? -1 : 1), L.y + dy + off.y).setFlipX(L.flipX).setDepth(L.depth + 1);
  };
  place();
  s.events.on('update', place);
  image.once('destroy', () => s.events.off('update', place));
  return { img: image, off };
}

// There and back again; with reduced motion only the time passes.
const pulse = (s, targets, props, ms) => (reducedMotion() ? wait(s, ms) : tween(s, { targets, ...props, duration: ms / 2, yoyo: true }));

// An activity of `ms` milliseconds: body(scene, tok, each); each(beat) repeats beat(i) until the time is used up (at least once).
const act = (id, ms, body) => ({
  id,
  caption: TEXTS.captions[id],
  async run(s, tok) {
    const end = s.time.now + ms;
    const each = async (beat) => {
      for (let i = 0; s.alive(tok) && (i === 0 || s.time.now < end); i++) await beat(i);
    };
    await body(s, tok, each);
  },
});

const group = (list) => list.map((a, i) => ({ ...a, unlockAt: unlockAt('activities', i) }));

export const ACTIVITIES = {
  sport: group([
    act('laps', 6500, async (s, tok, each) => {
      // eight points around the pond, clear of the mine (left) and the tall buildings (right): build-view keepsOut
      const pts = Array.from({ length: 8 }, (_, i) => [60 + Math.cos((i / 8) * Math.PI * 2) * 26, 116 + Math.sin((i / 8) * Math.PI * 2) * 16]);
      await each(async (i) => {
        await go(s, ...pts[i % 8], 60);
        burst(s, 'dust', s.liz.x, s.liz.y, 2, { gravityY: 0, speed: { min: 5, max: 15 }, lifespan: 400 });
      });
    }),
    act('lift', 6500, async (s, tok, each) => {
      await go(s, 100, 120);
      const stone = prop(s, 'pebbleBig', 2, -10);
      await each(async (i) => {
        await pulse(s, stone.off, { y: -5 }, 700);
        await squash(s, s.liz, 1.12, 0.85, 300);
        if (i % 3 === 2) float(s, 'spark', s.liz.x, s.liz.y - 24);
      });
    }),
    act('push', 6500, async (s, tok, each) => {
      await go(s, 112, 124);
      await each(async (i) => {
        await pulse(s, s.liz, { scaleY: 0.7 }, 520);
        if (i % 4 === 3) float(s, 'spark', s.liz.x, s.liz.y - 14);
        await wait(s, 120);
      });
    }),
    act('rope', 6500, async (s, tok, each) => {
      await go(s, 104, 122);
      const rope = s.hold(s.add.graphics().setDepth(800));
      await each(async (i) => {
        rope.clear().lineStyle(1, color('r')).strokeEllipse(s.liz.x, s.liz.y - 6 + (i % 2 ? -4 : 4), 26, i % 2 ? 18 : 6);
        await hop(s, s.liz, 9, 300);
      });
    }),
    act('swim', 6500, async (s, tok, each) => {
      await go(s, 84, 118);
      face(s, -1);
      await tween(s, { targets: s.liz, x: at(66, 120)[0], y: at(66, 120)[1], duration: 600 });
      s.liz.setCrop(0, 0, 20, 6); // only the head and back show above the water
      await each(async () => {
        const [x, y] = at(44 + Math.random() * 26, 118 + Math.random() * 4);
        face(s, x < s.liz.x ? -1 : 1);
        await tween(s, { targets: s.liz, x, y, duration: 1100 });
        ripple(s, s.liz.x, s.liz.y - 2);
      });
      s.liz.setCrop();
      if (s.alive(tok)) await go(s, 84, 118);
    }),
    act('sprint', 7000, async (s, tok, each) => {
      await each(async (i) => {
        await go(s, ...(i % 2 ? [34, 108] : [118, 92]), 75);
        burst(s, 'dust', s.liz.x, s.liz.y, 4, { gravityY: 0, lifespan: 500 });
        if (i % 2) s.tapPalm();
      });
    }),
  ]),
  mind: group([
    act('read', 6500, async (s, tok, each) => {
      await go(s, 36, 112);
      face(s, 1);
      const scroll = prop(s, 'scroll', 9, -2);
      await each(async (i) => {
        await wait(s, 900);
        if (i % 2) float(s, 'spark', scroll.img.x, scroll.img.y - 8, { ms: 700 });
        await squash(s, s.liz, 1.03, 0.96, 300);
      });
    }),
    act('stars', 6500, async (s, tok, each) => {
      await go(s, 116, 128);
      await each(async () => {
        float(s, 'star', ...at(20 + Math.random() * 120, 30), { rise: -10, ms: 1500 });
        await pulse(s, s.liz, { scaleY: 1.1 }, 600);
        await wait(s, 400);
      });
    }),
    act('calm', 6500, async (s, tok, each) => {
      await go(s, 84, 120);
      face(s, -1);
      await each(async (i) => {
        const t = i * 1.3;
        float(s, 'leaf', s.liz.x + Math.cos(t) * 14, s.liz.y - 6 + Math.sin(t) * 6, { rise: 8, drift: 4, ms: 1600 });
        await pulse(s, s.liz, { scaleX: 1.06, scaleY: 1.06 }, 1800);
      });
    }),
    act('write', 7000, async (s, tok, each) => {
      await go(s, 112, 118);
      face(s, 1);
      const slab = img(s, 'slab', 126, 120);
      const ink = s.hold(s.add.graphics().setDepth(slab.depth + 1));
      await each(async (i) => {
        await hop(s, s.liz, 2, 200);
        ink.fillStyle(color('K')).fillRect(slab.x - 3 + (Math.floor(i / 3) % 6), slab.y - 5 + (i % 3), 1, 1);
        await wait(s, 350);
      });
    }),
    act('think', 6500, async (s, tok, each) => {
      await go(s, 90, 124); // in front of the lighthouse (BUILD_SPOTS), clear of the Sunday campfire
      const bubble = s.hold(s.add.image(s.liz.x + 8, s.liz.y - 22, 'bubble').setDepth(840));
      const mark = s.hold(s.add.image(bubble.x, bubble.y - 1, 'qmark').setDepth(841));
      await each(async (i) => {
        face(s, i % 2 ? 1 : -1);
        await wait(s, 650);
        if (i === 7 && s.alive(tok)) {
          mark.setTexture('bang');
          burst(s, 'spark', bubble.x, bubble.y, 6, { gravityY: 0, angle: { min: 0, max: 360 } });
        }
      });
    }),
    act('stones', 7000, async (s, tok, each) => {
      await go(s, 92, 128);
      await each(async (i) => {
        const x = 96 + (i % 8) * 5;
        await go(s, x - 6, 128, 40);
        face(s, 1);
        img(s, 'pebble', x, 129);
        await hop(s, s.liz, 3, 200);
      });
    }),
  ]),
  food: group([
    act('water', 6500, async (s, tok, each) => {
      await go(s, 30, 92);
      face(s, 1);
      const can = prop(s, 'can', 9, -4);
      await each(async (i) => {
        const sprout = s.sprouts[i % 3];
        await walkTo(s, s.liz, sprout.x - 9, sprout.y + 6, 40);
        face(s, 1);
        await pulse(s, can.off, { x: 2, y: 2 }, 500);
        burst(s, 'drop', sprout.x, sprout.y - 10, 4, { angle: { min: 80, max: 100 }, speed: { min: 10, max: 25 }, gravityY: 120, lifespan: 500 });
        await pulse(s, sprout, { scaleY: 1.2 }, 600);
      });
    }),
    act('carrot', 6500, async (s, tok, each) => {
      await go(s, 46, 96);
      await each(async (i) => {
        await squash(s, s.liz, 1.1, 0.8, 360);
        if (!s.alive(tok)) return;
        const c = s.hold(s.add.image(s.liz.x + 4, s.liz.y - 6, 'carrot').setDepth(OY + 140));
        await tween(s, { targets: c, x: OX + 30 + (i % 6) * 6, y: OY + 104, duration: 500, ease: 'Quad.easeIn' });
      });
    }),
    act('cook', 7000, async (s, tok, each) => {
      await go(s, 92, 124);
      face(s, 1);
      const fire = img(s, 'fire', 106, 128);
      if (!reducedMotion()) s.tweens.add({ targets: fire, scaleY: 0.85, duration: 180, yoyo: true, repeat: -1 });
      await each(async () => {
        float(s, 'puff', ...at(106 + Math.random() * 4 - 2, 118), { rise: 16, ms: 1300 });
        await squash(s, s.liz, 1.04, 0.95, 400);
        await wait(s, 300);
      });
    }),
    act('sweep', 6500, async (s, tok, each) => {
      await go(s, 100, 126);
      const broom = prop(s, 'broom', 7, 1);
      await each(async (i) => {
        await tween(s, { targets: broom.off, x: i % 2 ? 3 : -3, duration: 260 });
        burst(s, 'dust', broom.img.x, broom.img.y, 3, { gravityY: 0, speed: { min: 6, max: 18 }, lifespan: 500 });
        if (i % 3 === 2) await walkTo(s, s.liz, s.liz.x + (i % 2 ? 8 : -8), s.liz.y, 20);
      });
    }),
    act('tidy', 7000, async (s, tok, each) => {
      let carried = null;
      await each(async (i) => {
        if (i % 2 === 0) {
          await go(s, 120, 94);
          if (s.alive(tok)) carried = prop(s, 'plank', 2, -9);
        } else {
          await go(s, 128, 128);
          carried?.img.destroy();
          carried = null;
          if (s.alive(tok)) img(s, 'plank', 130, 130 - ((i >> 1) % 5) * 3);
        }
      });
    }),
    act('snack', 6000, async (s, tok, each) => {
      await go(s, 70, 100);
      prop(s, 'carrot', 9, -2);
      await each(async () => {
        await squash(s, s.liz, 1.05, 0.9, 240);
        burst(s, 'crumb', mouth(s).x, mouth(s).y, 2, { lifespan: 400 });
        await wait(s, 150);
      });
    }),
  ]),
  sleep: group([
    act('draw', 7000, async (s, tok, each) => {
      await go(s, 104, 122);
      const sand = s.hold(s.add.graphics().setDepth(60));
      let [px, py] = [s.liz.x, s.liz.y];
      await each(async () => {
        const [nx, ny] = at(90 + Math.random() * 40, 118 + Math.random() * 14);
        await walkTo(s, s.liz, nx, ny, 22);
        sand.lineStyle(1, color('a')).lineBetween(px, py, nx, ny);
        [px, py] = [nx, ny];
      });
    }),
    act('flute', 7000, async (s, tok, each) => {
      await go(s, 36, 112);
      face(s, 1);
      const flute = prop(s, 'flute', 10, -5);
      await each(async () => {
        float(s, 'note', flute.img.x + 6, flute.img.y - 8, { drift: 8 - Math.random() * 16, ms: 1500 });
        await squash(s, s.liz, 1.04, 0.96, 450);
      });
    }),
    act('stretch', 6000, async (s, tok, each) => {
      await each(async (i) => {
        await pulse(s, s.liz, { scaleX: 1.25, scaleY: 0.85 }, 1400);
        if (i % 2) float(s, 'zz', s.liz.x + 6, s.liz.y - 12);
        await wait(s, 300);
      });
    }),
    act('castle', 7000, async (s, tok, each) => {
      await go(s, 108, 126);
      face(s, 1);
      const castle = img(s, 'castle', 122, 128).setCrop(0, 5, 8, 1);
      await each(async (i) => {
        burst(s, 'dust', ...at(122, 126), 3, { lifespan: 500 });
        await hop(s, s.liz, 3, 220);
        const rows = Math.min(castle.height, 1 + i); // the castle grows from the ground, one pixel row at a time
        castle.setCrop(0, castle.height - rows, castle.width, rows);
      });
    }),
    act('paint', 6500, async (s, tok, each) => {
      await go(s, 112, 118);
      face(s, 1);
      const brush = prop(s, 'brush', 8, -2);
      const rock = img(s, 'slab', 126, 120);
      const paint = s.hold(s.add.graphics().setDepth(rock.depth + 1));
      await each(async (i) => {
        await pulse(s, brush.off, { x: 2 }, 400);
        paint.fillStyle(color('FBOGD'[i % 5])).fillRect(rock.x - 4 + Math.floor(Math.random() * 8), rock.y - 5 + Math.floor(Math.random() * 4), 1, 1);
      });
    }),
    act('nest', 6000, async (s, tok, each) => {
      await go(s, 128, 90);
      await each(async (i) => {
        face(s, i % 2 ? 1 : -1);
        await squash(s, s.liz, 1.1, 0.8, 400);
        burst(s, 'leaf', s.liz.x, s.liz.y - 2, 2, { lifespan: 600 });
      });
    }),
  ]),
  any: group([
    act('tower', 6500, async (s, tok, each) => {
      await go(s, 100, 126);
      face(s, 1);
      await each(async (i) => {
        await hop(s, s.liz, 3, 220);
        img(s, 'pebble', 112, 127 - (i % 8) * 3, OY + 130 + i);
      });
      if (s.alive(tok)) burst(s, 'pebble', ...at(112, 112), 6, { lifespan: 700 });
    }),
    act('dance', 6000, async (s, tok, each) => {
      await each(async (i) => {
        face(s, i % 2 === 0 ? -1 : 1);
        await hop(s, s.liz, 6, 260);
        if (i % 2) float(s, 'note', s.liz.x, s.liz.y - 14, { drift: 6 });
      });
    }),
    act('explore', 7000, async (s, tok, each) => {
      await each(async () => {
        await walkTo(s, s.liz, ...s.randSpot(), 40);
        float(s, 'qmark', s.liz.x, s.liz.y - 14, { ms: 700 });
        await wait(s, 400);
      });
    }),
  ]),
};

// The activities a theme can show (before the meter filters them): its own six plus the three for any theme.
export function activityPool(theme) {
  if (theme === 'any') return ACTIVITIES.any;
  return (ACTIVITIES[theme] ?? ACTIVITIES.sport).concat(ACTIVITIES.any);
}
