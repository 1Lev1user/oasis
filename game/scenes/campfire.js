// The Sunday campfire: dusk light, the lizard by the fire (embers rise), and in #hud the weekly review: the week in numbers, four 1-7
// automaticity questions (SRBAI), «Что помешало на этой неделе?» with a plan field, «Готово». Finishing pays the Sunday quest once
// and may add an if-then point. The rules live in campfire-view.js and app/lib; this scene only shows them and saves.
// Started from the oasis with { contractId }; ?scene=campfire&demo=1 opens it with the demo habit, counted as Sunday.
import { WORLD, SAFE } from '../scale.js';
import { FRAMES, makeTextures } from '../art/textures.js';
import { PALETTE } from '../art/palette.js';
import { reducedMotion, color, wait, float, burst } from '../world.js';
import { el, button } from '../hud.js';
import { campfireState, summaryLines, finish, campfireDay, demoCampfire, FIRE_SPRITES, PLAN_MAX, LABEL_MAX } from '../campfire-view.js';
import { openEnded } from '../chest-view.js';
import { activeContracts } from '../../lib/contract.js';
import { weekSummary, SRBAI } from '../../lib/campfire.js';
import { OBSTACLES, SUGGESTIONS } from '../../lib/questionnaire.js';
import { DEFAULT_GAME } from '../../lib/game-state.js';
import { saveState } from '../../lib/store.js';
import { todayKey } from '../../lib/dates.js';
import { TEXTS } from '../texts/campfire.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const at = (x, y) => [x + OX, y + OY]; // prototype coordinates -> world coordinates
const HORIZON = OY + 48;
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y1: 2 * WORLD.h };
const DUSK = { letter: 'z', alpha: 0.22 }; // the campfire is always lit by the evening light
const FLICKER_MS = 200;
const RATES = [1, 2, 3, 4, 5, 6, 7];

// 'cfire_a' and 'cfire_b': the two frames of the lit fire (campfire-view.js), made once.
export function campfireTextures(scene) {
  for (const [name, rows] of Object.entries(FIRE_SPRITES)) {
    const key = `cfire_${name}`;
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, rows[0].length, rows.length);
    const ctx = tex.getContext();
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = PALETTE[ch];
      ctx.fillRect(x, y, 1, 1);
    }));
    tex.refresh();
  }
}

// The fire's light on the sand: two pixel ellipses (rows, so the edge stays on the world grid) in the fire's orange, one on the other.
export function fireGlow(scene, x, y, depth) {
  const g = scene.add.graphics().setDepth(depth).setAlpha(0.16);
  g.fillStyle(color('Z'));
  for (const [rx, ry] of [[18, 7], [10, 4]]) {
    for (let dy = -ry; dy <= ry; dy++) {
      const half = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
      g.fillRect(x - half, y + dy, 2 * half, 1);
    }
  }
  return g;
}

export class Campfire extends Phaser.Scene {
  constructor() { super('campfire'); }

  // The habit comes from the oasis ({ contractId }), else the first one with a chest waiting or an active term. A straight
  // ?scene=campfire&demo=1 load makes the demo habit and counts as the demo Sunday for this whole page load (registry 'demoSunday').
  init(data) {
    let state = this.registry.get('state') ?? { contracts: [] };
    const today = todayKey();
    if (!data?.contractId) {
      const seeded = demoCampfire(state, today, location.search);
      if (seeded !== state) {
        state = seeded;
        this.registry.set('demoSunday', true);
        this.commit(state);
      }
    }
    const open = [...openEnded(state, today), ...activeContracts(state.contracts, today)];
    this.contract = open.find((c) => c.id === data?.contractId) ?? open[0] ?? null;
    this.leaving = !this.contract;
  }

  create() {
    if (this.leaving) { this.scene.start('oasis'); return; }
    makeTextures(this);
    campfireTextures(this);
    if (!this.anims.exists('idle')) this.anims.create({ key: 'idle', frames: FRAMES.idle.map((key) => ({ key })), frameRate: 2, repeat: -1 });
    this.buildWorld();
    this.hud = this.makeHud();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hud.destroy());
    this.hud.show();
  }

  get state() { return this.registry.get('state') ?? { contracts: [] }; }

  // Today is read fresh each time; with the demo Sunday it is the coming Sunday.
  day() { return campfireDay(this.registry.get('demoSunday') === true, todayKey()); }

  // ---------- world ----------
  buildWorld() {
    const g = this.add.graphics().setDepth(0);
    const rect = (letter, x, y, w, h) => g.fillStyle(color(letter)).fillRect(x, y, w, h);
    const w = SPAN.x1 - SPAN.x0;
    rect('j', SPAN.x0, -WORLD.h, w, HORIZON + WORLD.h);
    for (let x = SPAN.x0; x < SPAN.x1; x += 2) { // distant dunes
      const h = Math.max(1, Math.round(6 + 3 * Math.sin(x / 19) + 2 * Math.sin(x / 7.3)));
      rect('A', x, HORIZON - h, 2, h);
    }
    rect('A', SPAN.x0, HORIZON, w, SPAN.y1 - HORIZON);
    rect('a', SPAN.x0, HORIZON, w, 3);
    const put = (key, x, y) => this.add.image(...at(x, y), key).setOrigin(0.5, 1).setDepth(OY + y);
    put('palm', 22, 100);
    put('cactus', 138, 90);
    put('pebble', 100, 124);
    put('pebble', 58, 126);
    this.liz = this.add.sprite(...at(58, 122), 'liz').setOrigin(0.5, 1).setDepth(OY + 122).play('idle');
    this.add.rectangle(WORLD.w / 2, WORLD.h / 2, 3 * WORLD.w, 3 * WORLD.h, color(DUSK.letter)).setDepth(900).setAlpha(DUSK.alpha);

    // the fire and its light stay above the evening tint
    const [fx, fy] = at(82, 120);
    fireGlow(this, fx, fy - 2, 901);
    this.fire = this.add.image(fx, fy, 'cfire_a').setOrigin(0.5, 1).setDepth(902);
    const reduced = reducedMotion();
    if (!reduced) this.time.addEvent({ delay: FLICKER_MS, loop: true, callback: () => this.fire.setTexture(this.fire.texture.key === 'cfire_a' ? 'cfire_b' : 'cfire_a') });
    // embers: tiny orange pixels rising from the flame; reduced motion halves them and the flame does not flicker
    this.add.particles(fx, fy - 8, 'crumb', {
      speedY: { min: -26, max: -12 }, speedX: { min: -6, max: 6 }, lifespan: 1100, frequency: reduced ? 440 : 220, alpha: { start: 1, end: 0 },
    }).setDepth(903);
  }

  // Keeps the new state in the registry and saves it; a failed save is said, the game goes on.
  commit(next) {
    this.registry.set('state', next);
    try { saveState(localStorage, next); } catch { this.hud?.message(TEXTS.saveFailed); }
  }

  // The gems of the finished review rise from the lizard (half the sparks with reduced motion).
  async celebrate() {
    const { x, y } = this.liz;
    const gems = [-6, 0, 6].map((dx, i) => wait(this, i * 150).then(() => float(this, 'gem', x + dx, y - 14, { rise: 20, drift: dx })));
    await Promise.all([...gems, burst(this, 'spark', x, y - 8, 8, { angle: { min: 0, max: 360 }, speed: { min: 20, max: 50 }, gravityY: 20, lifespan: 700 })]);
  }

  // ---------- HUD ----------
  makeHud() {
    const root = document.getElementById('hud');
    const title = el('h2', 'hud-habit px', TEXTS.title);
    const habit = el('p', 'hud-point', this.contract.plan.action);
    const status = el('p', 'hint');
    status.setAttribute('role', 'status');
    status.hidden = true;
    let timer = 0;
    const back = () => button('b-sec px', TEXTS.back, () => this.scene.start('oasis', { contractId: this.contract.id }));
    const put = (...parts) => {
      root.replaceChildren(title, habit, ...parts, status);
      root.scrollTop = 0;
    };

    // one calm sentence in a box, and the way back (the review is done, or cannot be done today)
    const notice = (text, className) => {
      const note = el('p', className, text);
      note.setAttribute('role', 'status');
      const home = back();
      put(note, home);
      home.focus();
    };

    const stat = () => {
      const section = el('section', 'coach');
      section.append(el('h3', 'coach-title', TEXTS.weekTitle), el('ul', 'coach-points'));
      section.lastChild.append(...summaryLines(weekSummary(this.contract, this.day())).map((l) => el('li', '', l.text)));
      return section;
    };

    // one SRBAI item: its seven buttons 1..7 (a group with the item as its name); the pressed one is the answer
    const rate = (item, set) => {
      const box = el('fieldset', 'q-field');
      box.append(el('legend', 'q-label', item.text));
      const row = el('div', 'rate-row');
      const buttons = RATES.map((n) => button('q-chip px', String(n), () => { set(n); buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(RATES[i] === n))); }));
      buttons.forEach((b, i) => { b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', TEXTS.rate(RATES[i])); });
      row.append(...buttons);
      const wrap = el('div', 'rate-wrap');
      const ends = el('p', 'rate-ends q-hint');
      ends.append(el('span', '', TEXTS.scaleLow), el('span', '', TEXTS.scaleHigh));
      wrap.append(row, ends);
      box.append(wrap);
      return box;
    };

    const review = () => {
      const answers = {};
      const form = el('form', 'q-form');
      form.noValidate = true;

      const scale = el('section', 'coach cf-scale');
      scale.append(el('h3', 'coach-title', TEXTS.scaleTitle), el('p', 'q-hint', TEXTS.scaleHint), ...SRBAI.map((item) => rate(item, (n) => { answers[item.id] = n; clear(); })));

      // what got in the way: a chip per obstacle (a second tap lets it go), the plan field prefilled with the suggestion until it is edited
      let obstacle = null;
      let edited = false;
      const chips = el('div', 'q-chips');
      chips.setAttribute('role', 'group');
      chips.setAttribute('aria-label', TEXTS.obstacleTitle);
      const ids = [...OBSTACLES, 'other'];
      const chipButtons = ids.map((id) => button('q-chip', TEXTS.obstacles[id], () => {
        obstacle = obstacle === id ? null : id;
        if (obstacle === null) { plan.value = ''; edited = false; } // no chip, no plan: the plan box is hidden
        else if (!edited) plan.value = SUGGESTIONS[obstacle] ?? '';
        sync();
        clear();
      }));
      const labelInput = el('input', 'q-input');
      labelInput.id = 'cf-label';
      labelInput.type = 'text';
      labelInput.maxLength = LABEL_MAX;
      labelInput.autocomplete = 'off';
      labelInput.addEventListener('input', () => { sync(); clear(); });
      const labelBox = el('div', 'q-field');
      const labelLabel = el('label', 'q-label', TEXTS.otherLabel);
      labelLabel.htmlFor = labelInput.id;
      labelBox.append(labelLabel, labelInput);
      const plan = el('input', 'q-input');
      plan.id = 'cf-plan';
      plan.type = 'text';
      plan.maxLength = PLAN_MAX;
      plan.autocomplete = 'off';
      plan.addEventListener('input', () => { edited = true; clear(); });
      const planLabel = el('label', 'q-label');
      planLabel.htmlFor = plan.id;
      const planHint = el('p', 'q-hint', TEXTS.planHint);
      plan.setAttribute('aria-describedby', (planHint.id = 'cf-plan-hint'));
      const planBox = el('div', 'q-field');
      planBox.append(planLabel, planHint, plan);
      const name = () => (obstacle === 'other' ? labelInput.value.trim() : TEXTS.obstacles[obstacle]?.toLowerCase() ?? '');
      function sync() {
        chipButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(ids[i] === obstacle)));
        labelBox.hidden = obstacle !== 'other';
        planBox.hidden = obstacle === null;
        planLabel.textContent = TEXTS.planLabel(name() || '…');
      }
      chips.append(...chipButtons);
      const why = el('section', 'coach');
      why.append(el('h3', 'coach-title', TEXTS.obstacleTitle), el('p', 'q-hint', TEXTS.obstacleHint), chips, labelBox, planBox);

      const error = el('p', 'hint q-error');
      error.setAttribute('role', 'alert');
      error.hidden = true;
      function clear() { error.hidden = true; }
      const submit = el('button', 'b-main px', TEXTS.done);
      submit.type = 'submit';
      form.append(scale, why, error, submit);
      sync();

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const res = finish(this.state, this.contract.id, this.day(), { answers, obstacle, plan: obstacle === null ? '' : plan.value, label: labelInput.value });
        if (!res.ok) {
          if (res.error === 'already') { this.hud.show(); return; }
          error.textContent = TEXTS.errors[res.error] ?? TEXTS.errors.other;
          error.hidden = false;
          error.scrollIntoView({ block: 'center' });
          return;
        }
        this.commit(res.state);
        this.contract = res.state.contracts.find((c) => c.id === this.contract.id);
        finished(res);
      });
      return form;
    };

    // the end: the gems, the score and the new point on the plan
    const finished = (res) => {
      const list = el('ul', 'coach-points');
      list.append(el('li', '', TEXTS.finished(res.gems)), el('li', '', TEXTS.score(String(res.score).replace('.', ','))));
      if (res.point) list.append(el('li', '', `${TEXTS.newPoint} ${res.point}`));
      const section = el('section', 'coach end');
      section.setAttribute('role', 'status');
      section.append(list);
      const home = back();
      put(section, home);
      home.focus();
      this.celebrate();
    };

    return {
      // what the review shows now: done already, not a Sunday, or the review itself
      show: () => {
        const day = this.day();
        const { open, done } = campfireState(this.contract, this.state.game ?? DEFAULT_GAME, day);
        if (done) notice(TEXTS.already, 'step-done px');
        else if (!open) notice(TEXTS.notSunday, 'hint');
        else put(stat(), review());
      },
      message: (line) => {
        status.textContent = line;
        status.hidden = false;
        clearTimeout(timer);
        timer = setTimeout(() => { status.hidden = true; }, 6000);
      },
      destroy: () => { clearTimeout(timer); root.replaceChildren(); },
    };
  }
}
