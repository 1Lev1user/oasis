// The habit questionnaire: the lizard sits by a campfire and nods while the owner answers ten questions, one per screen.
// The world is pixels; the questions are HTML fields in #hud (labels, 44 px targets). The rules live in setup-flow.js and app/lib.
// Answers live in this scene only; leaving it drops them (the plan is signed in a later card).
import { WORLD, SAFE } from '../scale.js';
import { readParams } from '../params.js';
import { timeOfDay } from '../clock.js';
import { FRAMES, makeTextures } from '../art/textures.js';
import { reducedMotion, color, squash, float } from '../world.js';
import { el, button } from '../hud.js';
import { QUESTIONS, LIMITS, newAnswers, stepError, nextStep, prevStep, setScheduleType, toggleDay, toggleObstacle, prefillPlans, toDraftInput, groupPoints } from '../setup-flow.js';
import { draftPlan } from '../../lib/questionnaire.js';
import { TEXTS, errorText } from '../texts/setup.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const at = (x, y) => [x + OX, y + OY]; // prototype coordinates -> world coordinates
const HORIZON = OY + 48;
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y1: 2 * WORLD.h };
const SHADE = { night: { letter: 'm', alpha: 0.7 }, dusk: { letter: 'z', alpha: 0.18 } }; // as in the oasis
const TEXT_STEPS = ['action', 'why', 'anchor', 'place', 'prep', 'mini'];
const SLIDERS = ['can', 'opp', 'want'];

export class Setup extends Phaser.Scene {
  constructor() { super('setup'); }

  create() {
    // Per-run state lives here, not in the constructor: Phaser reuses the scene object when it restarts.
    this.answers = newAnswers();
    this.step = 0;
    this.nodding = false;
    makeTextures(this);
    if (!this.anims.exists('idle')) this.anims.create({ key: 'idle', frames: FRAMES.idle.map((key) => ({ key })), frameRate: 2, repeat: -1 });
    this.buildWorld();

    this.root = document.getElementById('hud');
    // Under the on-screen keyboard the active field would be hidden: bring it into view.
    const reveal = () => document.activeElement?.matches?.('input, select')
      && document.activeElement.scrollIntoView({ block: 'center' });
    window.visualViewport?.addEventListener('resize', reveal);
    const onFocus = (e) => this.reveal(e.target);
    this.root.addEventListener('focusin', onFocus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.visualViewport?.removeEventListener('resize', reveal);
      this.root.removeEventListener('focusin', onFocus);
      this.root.replaceChildren();
    });
    this.show(0);
  }

  // ---------- world ----------
  buildWorld() {
    const g = this.add.graphics().setDepth(0);
    const rect = (letter, x, y, w, h) => g.fillStyle(color(letter)).fillRect(x, y, w, h);
    const w = SPAN.x1 - SPAN.x0;
    rect('j', SPAN.x0, -WORLD.h, w, HORIZON + WORLD.h);
    rect('A', SPAN.x0, HORIZON, w, SPAN.y1 - HORIZON);
    rect('a', SPAN.x0, HORIZON, w, 3);
    for (let x = SPAN.x0; x < SPAN.x1; x += 2) { // distant dunes
      const h = Math.max(1, Math.round(6 + 3 * Math.sin(x / 19) + 2 * Math.sin(x / 7.3)));
      rect('A', x, HORIZON - h, 2, h);
    }
    for (let i = 0; i < 200; i++) rect(Math.random() < 0.25 ? 'a' : 'Q', Math.floor(-30 + Math.random() * (WORLD.w + 60)), HORIZON + 4 + Math.floor(Math.random() * (WORLD.h - HORIZON + 30)), 1, 1);

    const put = (key, x, y) => this.add.image(...at(x, y), key).setOrigin(0.5, 1).setDepth(OY + y);
    put('palm', 24, 104);
    put('cactus', 130, 84);
    for (const [x, y, k] of [[56, 96, 'flower'], [120, 100, 'flowerB'], [12, 128, 'flower'], [140, 136, 'flowerB']]) put(k, x, y);
    put('pebble', 96, 120); put('pebble', 112, 120);

    const shade = SHADE[timeOfDay(new Date(), readParams(location.search).time)];
    this.fire = put('fire', 104, 118).setDepth(950);
    this.liz = this.add.sprite(...at(80, 118), 'liz').setOrigin(0.5, 1).setDepth(951).play('idle');
    if (shade) this.add.rectangle(WORLD.w / 2, WORLD.h / 2, 3 * WORLD.w, 3 * WORLD.h, color(shade.letter)).setDepth(900).setAlpha(shade.alpha); // the fire and the lizard stay lit
    if (!reducedMotion()) {
      this.tweens.add({ targets: this.fire, scaleY: 0.85, duration: 180, yoyo: true, repeat: -1 });
      this.time.addEvent({ delay: 1100, loop: true, callback: () => float(this, 'spark', this.fire.x + Math.random() * 4 - 2, this.fire.y - 8, { ms: 900 }) });
    }
  }

  // The buttons stick to the bottom of the screen: scroll a field or the error line up when they would cover it.
  reveal(node) {
    const nav = this.root.querySelector('.q-nav');
    if (nav && node.getBoundingClientRect().bottom > nav.getBoundingClientRect().top) node.scrollIntoView({ block: 'end' });
  }

  // The lizard nods once; taps in a row do not pile up tweens.
  async nod() {
    if (this.nodding) return;
    this.nodding = true;
    await squash(this, this.liz, 1.05, 0.88, 300);
    this.nodding = false;
  }

  // ---------- screens ----------
  show(step) {
    this.step = step;
    this.screen(step === QUESTIONS.length ? this.draftScreen() : this.questionScreen());
  }

  screen(parts) {
    this.root.replaceChildren(...parts);
    this.root.scrollTop = 0;
    (this.root.querySelector('input, select, button.q-chip') ?? this.root.querySelector('.q-title'))?.focus();
  }

  progress() {
    const bar = el('div', 'bar q-bar');
    const text = TEXTS.progress(Math.min(this.step + 1, QUESTIONS.length), QUESTIONS.length);
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', text);
    QUESTIONS.forEach((_, i) => bar.appendChild(el('i')).classList.toggle('on', i <= this.step));
    return [el('p', 'q-progress px', text), bar];
  }

  // One question: the fields of the step, a calm error line and the Back / Next buttons.
  questionScreen() {
    const id = QUESTIONS[this.step].id;
    const form = el('form', 'q-form');
    form.noValidate = true;
    const error = el('p', 'hint q-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const clear = () => { error.hidden = true; };
    form.append(...this.fields(id, clear, error), error);
    form.append(this.nav(this.step === 0 ? TEXTS.toOasis : TEXTS.back, () => (this.step === 0 ? this.scene.start('oasis') : this.show(prevStep(this.step))), TEXTS.next));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = stepError(this.answers, this.step);
      if (code) {
        error.textContent = errorText(code);
        error.hidden = false;
        this.reveal(error);
        return;
      }
      this.nod();
      const next = nextStep(this.answers, this.step);
      this.show(next);
    });
    return [...this.progress(), form];
  }

  nav(backText, onBack, nextText) {
    const nav = el('div', 'q-nav');
    const next = el('button', 'b-main px', nextText);
    next.type = 'submit';
    nav.append(button('b-sec px', backText, onBack), next);
    return nav;
  }

  // The labelled fields for one step; `clear` hides the error line when the owner changes something.
  fields(id, clear, error) {
    const q = TEXTS.questions[id];
    const set = (patch) => { this.answers = { ...this.answers, ...patch }; clear(); };
    if (TEXT_STEPS.includes(id)) return [this.textField(id, q.label + (q.optional ? TEXTS.optional : ''), q.hint, this.answers[id], LIMITS[id] ?? LIMITS.mini, (v) => set({ [id]: v }))];
    if (id === 'schedule') return this.scheduleFields(q, set);
    if (id === 'obstacles') return this.obstacleFields(q, set, error);
    if (id === 'plans') return this.planFields(q, set);
    return this.sliderFields(q, set);
  }

  textField(id, label, hint, value, max, onInput) {
    const input = el('input', 'q-input');
    input.id = `q-${id}`;
    input.type = 'text';
    input.value = value;
    input.maxLength = max;
    input.autocomplete = 'off';
    input.enterKeyHint = 'next';
    input.addEventListener('input', () => onInput(input.value));
    const parts = [this.label(input.id, label)];
    if (hint) {
      const note = el('p', 'q-hint', hint);
      note.id = `q-${id}-hint`;
      input.setAttribute('aria-describedby', note.id);
      parts.push(note);
    }
    return this.wrap([...parts, input]);
  }

  label(forId, text) {
    const l = el('label', 'q-label', text);
    l.htmlFor = forId;
    return l;
  }

  wrap(children) {
    const box = el('div', 'q-field');
    box.append(...children);
    return box;
  }

  scheduleFields(q, set) {
    const box = el('fieldset', 'q-field');
    box.appendChild(el('legend', 'q-label', q.label));
    const days = el('div', 'q-days');
    days.setAttribute('role', 'group');
    days.setAttribute('aria-label', q.daysLabel);
    const pressed = (d) => String(!!this.answers.schedule.days?.includes(d));
    const dayButtons = q.days.map((name, d) => {
      const b = button('q-chip', name, () => {
        set({ schedule: toggleDay(this.answers.schedule, d) });
        b.setAttribute('aria-pressed', pressed(d));
      });
      b.setAttribute('aria-pressed', pressed(d));
      return b;
    });
    days.append(...dayButtons);
    const count = el('select', 'q-input');
    count.id = 'q-count';
    for (let n = 1; n <= 6; n++) count.add(new Option(q.count(n), n));
    count.value = this.answers.schedule.perWeek ?? 3;
    count.addEventListener('change', () => set({ schedule: { type: 'count', perWeek: Number(count.value) } }));
    const countBox = this.wrap([this.label('q-count', q.countLabel), count]);
    const sync = () => {
      const type = this.answers.schedule.type;
      days.hidden = type !== 'days';
      countBox.hidden = type !== 'count';
      dayButtons.forEach((b, d) => b.setAttribute('aria-pressed', pressed(d)));
    };
    for (const [type, text] of Object.entries(q.kinds)) {
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'q-kind';
      radio.checked = this.answers.schedule.type === type;
      radio.addEventListener('change', () => {
        set({ schedule: setScheduleType(this.answers, type).schedule });
        sync();
      });
      const opt = el('label', 'q-opt');
      opt.append(radio, el('span', '', text));
      box.append(opt);
    }
    box.append(days, countBox);
    sync();
    return [box];
  }

  obstacleFields(q, set, error) {
    const box = el('fieldset', 'q-field');
    box.appendChild(el('legend', 'q-label', q.label));
    const chips = el('div', 'q-chips');
    const ids = Object.keys(q.options);
    const buttons = ids.map((id) => button('q-chip', q.options[id], () => {
      const next = toggleObstacle(this.answers, id);
      if (next === this.answers) { error.textContent = errorText('obstacles_range'); error.hidden = false; this.reveal(error); return; }
      set({ obstacles: next.obstacles });
      sync();
    }));
    const sync = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(this.answers.obstacles.some((o) => o.id === ids[i]))));
    sync();
    chips.append(...buttons);
    box.append(chips);
    return [box];
  }

  planFields(q, set) {
    this.answers = prefillPlans(this.answers);
    const options = TEXTS.questions.obstacles.options;
    const box = el('fieldset', 'q-field');
    box.appendChild(el('legend', 'q-label', q.label));
    box.appendChild(el('p', 'q-hint', q.hint));
    for (const o of this.answers.obstacles) {
      const input = el('input', 'q-input');
      input.id = `q-plan-${o.id}`;
      input.type = 'text';
      input.value = o.plan;
      input.maxLength = LIMITS.plan;
      input.autocomplete = 'off';
      input.addEventListener('input', () => set({ obstacles: this.answers.obstacles.map((x) => (x.id === o.id ? { ...x, plan: input.value } : x)) }));
      box.append(this.wrap([this.label(input.id, q.field(options[o.id].toLowerCase())), input]));
    }
    return [box];
  }

  sliderFields(q, set) {
    const box = el('fieldset', 'q-field');
    box.appendChild(el('legend', 'q-label', q.label));
    for (const key of SLIDERS) {
      const range = el('input', 'q-range');
      range.id = `q-${key}`;
      range.type = 'range';
      range.min = 1; range.max = 5; range.step = 1;
      range.value = this.answers.sliders[key];
      const out = el('output', 'q-out px', range.value);
      out.htmlFor = range.id;
      range.addEventListener('input', () => {
        out.textContent = range.value;
        set({ sliders: { ...this.answers.sliders, [key]: Number(range.value) } });
      });
      const row = el('div', 'q-slider');
      row.append(range, out);
      box.append(this.wrap([this.label(range.id, q[key]), row]));
    }
    return [box];
  }

  // The drafted plan: points grouped by moment, the main one marked. Next goes on to the plan scene once it exists.
  draftScreen() {
    const result = draftPlan(toDraftInput(this.answers));
    const title = el('h2', 'q-title px', TEXTS.draft.title);
    title.tabIndex = -1;
    const parts = [title];
    const back = () => this.show(prevStep(QUESTIONS.length));
    if (!result.ok) {
      parts.push(el('p', 'hint', TEXTS.draft.failed), this.draftNav(back, null));
      return parts;
    }
    parts.push(el('p', 'q-sub', this.scheduleLine(result.habit.schedule)));
    for (const group of groupPoints(result.habit.points)) {
      const list = el('ul', 'q-points');
      for (const p of group.points) {
        const item = el('li', p.main ? 'main' : '');
        if (p.main) item.append(el('strong', 'q-tag', TEXTS.draft.main), ' ');
        item.append(p.text);
        list.append(item);
      }
      parts.push(el('h3', 'q-group px', TEXTS.draft.groups[group.when]), list);
    }
    parts.push(el('p', 'q-sub', TEXTS.draft.caption), this.draftNav(back, { plan: result.plan, habit: result.habit }));
    return parts;
  }

  scheduleLine(schedule) {
    const t = TEXTS.draft.schedule;
    if (schedule.type === 'days') return t.days(schedule.days.map((d) => TEXTS.questions.schedule.days[d]).join(', '));
    return schedule.type === 'count' ? t.count(schedule.perWeek) : t.daily;
  }

  draftNav(onBack, draft) {
    const nav = el('div', 'q-nav');
    const hasPlan = draft && this.scene.get('plan');
    nav.append(button('b-sec px', TEXTS.back, onBack));
    if (hasPlan) nav.append(button('b-main px', TEXTS.next, () => this.scene.start('plan', { draft })));
    else if (draft) nav.append(button('b-main px', TEXTS.toOasis, () => this.scene.start('oasis')));
    return nav;
  }
}
