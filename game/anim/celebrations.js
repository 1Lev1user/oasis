// What the lizard does when a step is recorded: 8 step celebrations (more unlock as the habit grows) and 5 mini-step ones.
// An item is { id, name, caption, unlockAt, run(scene) }; run returns a promise, takes 1.5-3 s and leaves nothing behind.
// Nothing rotates (rotated sprites tear under roundPixels): moves are hops, squashes, floats, positions and fades.
// Reduced motion comes from the world.js helpers (no shake, no flash, half the particles, fades for bounces). The camera shake (the palm)
// follows the owner's choice (settings.shake); the celebration cue plays as each one starts.
import { WORLD, SAFE } from '../scale.js';
import { unlockAt, pickVariant } from '../../lib/variants.js';
import { setLast } from '../session.js';
import { reducedMotion, color, wait, tween, stopTweens, walkTo, hop, squash, float, burst, popAt, shake } from '../world.js';
import { sound } from '../sound.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const at = (x, y) => [x + OX, y + OY]; // 160x140 safe-area coordinates -> world coordinates
const between = (a, b) => a + Math.random() * (b - a);
const MIN_MS = 1500;

// A free spot on the ground for a flower: inside the safe area, off the pond.
function groundSpot() {
  for (;;) {
    const x = between(10, 150);
    const y = between(84, 136);
    if (((x - 56) / 28) ** 2 + ((y - 116) / 12) ** 2 > 1) return at(x, y);
  }
}

// body(scene, fx): fx.keep(obj) removes obj when the celebration ends; fx.later(promise) is awaited at the end.
// The run lasts at least MIN_MS and always gives the lizard back upright and untinted.
function celebration(id, name, caption, body) {
  return {
    id,
    name,
    caption,
    async run(s) {
      const start = s.time.now;
      wait(s, 300).then(() => sound.play('celebration')); // after the step blip
      const held = [];
      const pending = [];
      const fx = { keep: (obj) => (held.push(obj), obj), later: (promise) => (pending.push(promise), promise) };
      try {
        await body(s, fx);
        await Promise.all(pending);
        await wait(s, Math.max(0, MIN_MS - (s.time.now - start)));
      } finally {
        held.forEach((obj) => { stopTweens(s, obj); obj.destroy(); });
        s.liz.setScale(1).clearTint();
      }
    },
  };
}

const STEP = [
  celebration('coins', 'Монетный дождь', 'Монеты падают в сундук', async (s, fx) => {
    const L = s.liz;
    const x = L.x + 18 > OX + 150 ? L.x - 18 : L.x + 18;
    const chest = fx.keep(s.add.image(x, Math.min(OY + 134, L.y + 6), 'chest').setDepth(840));
    if (reducedMotion()) await tween(s, { targets: chest.setAlpha(0), alpha: 1, duration: 250 });
    else await tween(s, { targets: chest.setScale(0), scale: 1, duration: 250, ease: 'Back.easeOut' });
    for (let i = 0; i < (reducedMotion() ? 3 : 6); i++) {
      const coin = fx.keep(s.add.image(chest.x - 6 + Math.random() * 12, chest.y - 50, 'coin').setDepth(850));
      fx.later(tween(s, { targets: coin, y: chest.y - 8, duration: 500, ease: 'Quad.easeIn' }).then(() => {
        coin.destroy();
        if (!reducedMotion()) s.tweens.add({ targets: chest, scaleY: 0.9, duration: 60, yoyo: true });
      }));
      await wait(s, 110);
    }
    await wait(s, 450);
    fx.later(float(s, 'gem', chest.x, chest.y - 14, { rise: 14, ms: 800 }));
    await wait(s, 700);
    await tween(s, { targets: chest, alpha: 0, duration: 250 });
  }),
  celebration('fireworks', 'Салют', 'Салют над оазисом', async (s, fx) => {
    for (let i = 0; i < 4; i++) {
      fx.later(burst(s, i % 2 ? 'spark' : 'star', ...at(between(30, 130), between(14, 36)), 12, { gravityY: 30, speed: { min: 20, max: 50 }, angle: { min: 0, max: 360 }, lifespan: 700 }));
      fx.later(hop(s, s.liz, 4, 200));
      await wait(s, 400);
    }
  }),
  celebration('dance', 'Победный танец', 'Ящерица танцует победный танец', async (s, fx) => {
    for (let i = 0; i < 6; i++) {
      s.liz.setFlipX(i % 2 === 0);
      fx.later(float(s, 'note', s.liz.x, s.liz.y - 16, { drift: 6 - i * 2, ms: 800 }));
      await hop(s, s.liz, 8, 280);
    }
  }),
  celebration('bloom', 'Цветение', 'Вокруг расцветают цветы', async (s, fx) => {
    const n = reducedMotion() ? 5 : 10;
    for (let i = 0; i < n; i++) {
      fx.later(popAt(s, i % 2 ? 'flower' : 'flowerB', ...groundSpot(), 900));
      await wait(s, 120);
    }
    await squash(s, s.liz);
  }),
  celebration('rainbow', 'Радуга', 'Над оазисом радуга', async (s, fx) => {
    const g = fx.keep(s.add.graphics().setDepth(860));
    const bands = ['U', 'Z', 'O', 'G', 'B'];
    const draw = (t) => {
      g.clear();
      bands.forEach((letter, i) => {
        g.lineStyle(2, color(letter)).beginPath();
        g.arc(...at(80, 70), 52 - i * 2, Math.PI, Math.PI + Math.PI * t, false);
        g.strokePath();
      });
    };
    if (reducedMotion()) {
      draw(1);
      await tween(s, { targets: g.setAlpha(0), alpha: 1, duration: 500 });
    } else {
      const sweep = { t: 0 };
      await tween(s, { targets: sweep, t: 1, duration: 1000, onUpdate: () => draw(sweep.t) });
    }
    await hop(s, s.liz, 6);
    await wait(s, 500);
    await tween(s, { targets: g, alpha: 0, duration: 400 });
  }),
  celebration('gems', 'Фонтан самоцветов', 'Из норки бьёт фонтан самоцветов', async (s, fx) => {
    for (let i = 0; i < 3; i++) {
      fx.later(burst(s, 'gem', ...at(136, 68), 5, { angle: { min: 240, max: 300 }, speed: { min: 40, max: 70 }, gravityY: 140, lifespan: 900 }));
      await wait(s, 400);
    }
    await hop(s, s.liz, 6);
  }),
  celebration('palm', 'Щедрая пальма', 'Пальма осыпает монетами', async (s, fx) => {
    const [x, y] = at(40, 102);
    const dist = Math.hypot(s.liz.x - x, s.liz.y - y);
    await walkTo(s, s.liz, x, y, Math.max(60, dist / 0.8)); // never more than 0.8 s on the way
    for (let i = 0; i < 3; i++) {
      shake(s); // the palm shakes the coins down: a light camera shake (none when off or with reduced motion)
      if (s.palm && !reducedMotion()) fx.later(tween(s, { targets: s.palm, x: s.palm.x + 1, duration: 60, yoyo: true, repeat: 1 }));
      fx.later(burst(s, 'coin', ...at(24, 86), 3, { angle: { min: 60, max: 120 }, speed: { min: 10, max: 30 }, gravityY: 160, lifespan: 500 }));
      await wait(s, 350);
    }
    await hop(s, s.liz, 6);
  }),
  celebration('swirl', 'Звёздный вихрь', 'Звёзды кружат вокруг ящерицы', async (s, fx) => {
    const L = s.liz;
    const stars = Array.from({ length: 8 }, () => fx.keep(s.add.image(0, 0, 'star').setDepth(860)));
    const place = (t, radius) => stars.forEach((star, i) => {
      const a = t * 8 + (i * Math.PI) / 4;
      star.setPosition(L.x + Math.cos(a) * radius, L.y - 6 + Math.sin(a) * radius * 0.6);
    });
    if (reducedMotion()) {
      place(0, 14);
      stars.forEach((star) => star.setAlpha(0));
      await tween(s, { targets: stars, alpha: 1, duration: 300 });
      await wait(s, 700);
      await tween(s, { targets: stars, alpha: 0, duration: 300 });
    } else {
      const spin = { t: 0 };
      await tween(s, { targets: spin, t: 1, duration: 1500, onUpdate: () => place(spin.t, 22 * (1 - spin.t) + 2) });
      stars.forEach((star) => star.setVisible(false));
      L.setTint(color('W')).setTintMode(Phaser.TintModes.FILL); // a one-frame white flash (never with reduced motion)
      await wait(s, 120);
      L.clearTint();
    }
    await hop(s, L, 8);
  }),
];

const MINI = [
  celebration('m-hop', 'Подскок', 'Мини-шаг засчитан', async (s, fx) => {
    fx.later(float(s, 'spark', s.liz.x, s.liz.y - 14, { ms: 800 }));
    await hop(s, s.liz, 6);
    await hop(s, s.liz, 4, 260);
  }),
  celebration('m-coin', 'Монетка', 'Мини-шаг: монетка в копилку', async (s, fx) => {
    fx.later(float(s, 'coin', s.liz.x, s.liz.y - 16, { rise: 12, ms: 1100 }));
    await hop(s, s.liz, 5, 260);
    await squash(s, s.liz, 1.1, 0.85, 240);
  }),
  celebration('m-leaf', 'Листок', 'Мини-шаг: листок на удачу', async (s, fx) => {
    fx.later(float(s, 'leaf', s.liz.x, s.liz.y - 12, { drift: 10, ms: 1300 }));
    await squash(s, s.liz);
  }),
  celebration('m-heart', 'Кивок', 'Мини-шаг: ящерица довольно кивает', async (s, fx) => {
    await squash(s, s.liz, 1.05, 0.88, 220);
    await squash(s, s.liz, 1.05, 0.88, 220);
    fx.later(float(s, 'heart', s.liz.x, s.liz.y - 14, { ms: 900 }));
  }),
  celebration('m-flower', 'Цветок', 'Рядом вырос цветок', async (s, fx) => {
    fx.later(popAt(s, 'flower', s.liz.x + 12, s.liz.y, 900));
    await hop(s, s.liz, 4);
  }),
];

export const CELEBRATIONS = STEP.map((c, i) => ({ ...c, unlockAt: unlockAt('celebrations', i) }));
export const MINI_CELEBRATIONS = MINI.map((c) => ({ ...c, unlockAt: 0 }));

// kind: 'done' or 'mini'. ctx may give { meter, last, setLast(id), caption(text) }; what it leaves out is read from the scene.
export async function playCelebration(scene, kind, ctx = {}) {
  const key = `celebrations:${kind}`;
  const meter = ctx.meter ?? scene.view?.meter ?? 0;
  const last = ctx.last ?? scene.state?.game?.last?.[key] ?? null;
  const pick = pickVariant(kind === 'mini' ? MINI_CELEBRATIONS : CELEBRATIONS, { meter, last });
  if (!pick) return;
  if (ctx.setLast) ctx.setLast(pick.id);
  else scene.commit?.(setLast(scene.state, key, pick.id));
  (ctx.caption ?? ((text) => scene.hud?.caption(text)))(pick.caption);
  await pick.run(scene);
}
