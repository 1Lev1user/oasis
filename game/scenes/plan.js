// The plan editor: the drafted plan is the owner's to change. The lizard waits by the campfire; the list is HTML in #hud.
// The rules live in plan-edit.js (pure, tested); this scene only shows them and calls them. The draft lives in this scene
// until the contract scene takes it (started with { draft }); ?scene=plan&demo=1 opens it with the gym example.
import { WORLD, SAFE } from '../scale.js';
import { readParams } from '../params.js';
import { timeOfDay } from '../clock.js';
import { FRAMES, makeTextures } from '../art/textures.js';
import { reducedMotion, color, squash } from '../world.js';
import { el, button } from '../hud.js';
import { editPoint, setWhen, setMain, addPoint, removePoint, setSchedule, demoDraft } from '../plan-edit.js';
import { setScheduleType, toggleDay, groupPoints } from '../setup-flow.js';
import { TEXTS, errorText } from '../texts/setup.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const at = (x, y) => [x + OX, y + OY]; // prototype coordinates -> world coordinates
const HORIZON = OY + 48;
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y1: 2 * WORLD.h };
const SHADE = { night: { letter: 'm', alpha: 0.7 }, dusk: { letter: 'z', alpha: 0.18 } }; // as in the oasis
const WHENS = ['eve', 'day', 'miss'];
const POINT_MAX = 120;

export class Plan extends Phaser.Scene {
  constructor() { super('plan'); }

  init(data) {
    this.draft = data?.draft ?? (readParams(location.search).demo ? demoDraft() : null);
  }

  create() {
    if (!this.draft) { this.scene.start('oasis'); return; } // nothing to edit: opened without a draft
    this.sched = structuredClone(this.draft.habit.schedule); // the picker may hold a half-made choice (days, none picked yet)
    this.adding = null; // the moment whose "new point" form is open
    this.nodding = false;
    makeTextures(this);
    if (!this.anims.exists('idle')) this.anims.create({ key: 'idle', frames: FRAMES.idle.map((key) => ({ key })), frameRate: 2, repeat: -1 });
    this.buildWorld();

    this.root = document.getElementById('hud');
    const onFocus = (e) => this.reveal(e.target);
    this.root.addEventListener('focusin', onFocus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.root.removeEventListener('focusin', onFocus);
      this.root.replaceChildren();
    });
    this.render();
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
    const put = (key, x, y) => this.add.image(...at(x, y), key).setOrigin(0.5, 1).setDepth(OY + y);
    put('palm', 24, 104);
    put('cactus', 130, 84);
    put('pebble', 96, 120);

    const shade = SHADE[timeOfDay(new Date(), readParams(location.search).time)];
    this.fire = put('fire', 104, 118).setDepth(950);
    this.liz = this.add.sprite(...at(80, 118), 'liz').setOrigin(0.5, 1).setDepth(951).play('idle');
    if (shade) this.add.rectangle(WORLD.w / 2, WORLD.h / 2, 3 * WORLD.w, 3 * WORLD.h, color(shade.letter)).setDepth(900).setAlpha(shade.alpha);
    if (!reducedMotion()) this.tweens.add({ targets: this.fire, scaleY: 0.85, duration: 180, yoyo: true, repeat: -1 });
  }

  // The lizard nods once; taps in a row do not pile up tweens.
  async nod() {
    if (this.nodding) return;
    this.nodding = true;
    await squash(this, this.liz, 1.05, 0.88, 300);
    this.nodding = false;
  }

  // The buttons stick to the bottom of the screen: scroll a field or the error line up when they would cover it.
  reveal(node) {
    const nav = this.root.querySelector('.q-nav');
    if (nav && node.getBoundingClientRect().bottom > nav.getBoundingClientRect().top) node.scrollIntoView({ block: 'end' });
  }

  // ---------- screen ----------
  // Rebuilds the whole list from the draft; `focus` is a selector for the control to keep the keyboard on.
  render(focus) {
    this.checks = []; // run by Next: each returns the control to focus when its field is not saved yet
    const T = TEXTS.plan;
    const title = el('h2', 'q-title px', T.title);
    title.tabIndex = -1;
    const page = el('div', 'q-form');
    page.append(title, el('p', 'q-sub', T.sub));
    const points = this.draft.habit.points;
    for (const when of WHENS) {
      const group = groupPoints(points).find((g) => g.when === when);
      const list = el('ul', 'q-points');
      for (const p of group?.points ?? []) list.append(this.card(p, points.indexOf(p)));
      page.append(el('h3', 'q-group px', TEXTS.draft.groups[when]), list, this.adding === when ? this.addForm(when) : this.addButton(when));
    }
    page.append(this.scheduleBox());
    page.append(this.nav());
    this.root.replaceChildren(page);
    (focus && this.root.querySelector(focus) || title).focus();
  }

  // Shows a calm error line (the one that belongs to the control).
  fail(line, code) {
    line.textContent = errorText(code);
    line.hidden = false;
    this.reveal(line);
  }

  // Runs an operation: on success the draft changes and the list is redrawn, else the error shows at `line`.
  apply(result, line, focus) {
    if (!result.ok) { this.fail(line, result.error); return; }
    this.draft = result.draft;
    this.nod();
    this.render(focus);
  }

  card(p, i) {
    const T = TEXTS.plan;
    const item = el('li', `p-card${p.main ? ' main' : ''}`);
    item.dataset.i = i;
    const error = el('p', 'hint q-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const input = el('input', 'q-input');
    input.id = `p-${i}`;
    input.type = 'text';
    input.value = p.text;
    input.maxLength = POINT_MAX;
    input.autocomplete = 'off';
    // Valid text is saved while typing; invalid text stays in the field (the draft keeps the last good one) and is named on leaving it.
    const save = (show) => {
      const r = editPoint(this.draft, i, input.value);
      if (r.ok) { this.draft = r.draft; error.hidden = true; } else if (show) this.fail(error, r.error);
      return r.ok;
    };
    input.addEventListener('input', () => save(false));
    input.addEventListener('change', () => save(true));
    this.checks.push(() => (input.value.trim() === this.draft.habit.points[i].text || save(true) ? null : input));
    const label = el('label', 'p-sr', T.pointLabel(i + 1));
    label.htmlFor = input.id;

    const whens = el('div', 'p-whens');
    whens.setAttribute('role', 'group');
    whens.setAttribute('aria-label', T.when);
    for (const when of WHENS) {
      const b = button('q-chip p-when', T.whens[when], () => when !== p.when && this.apply(setWhen(this.draft, i, when), error, `[data-i="${i}"] .p-when[aria-pressed="true"]`));
      b.setAttribute('aria-pressed', String(p.when === when));
      whens.append(b);
    }
    const remove = button('q-chip p-remove', '×', () => this.apply(removePoint(this.draft, i), error, `[data-add="${p.when}"]`));
    remove.setAttribute('aria-label', `${T.remove}: ${p.text}`);
    remove.title = T.remove;
    const top = el('div', 'p-top');
    top.append(input, remove);
    const row = el('div', 'p-row');
    row.append(whens);
    if (p.when === 'day') {
      const star = button('q-chip p-star', '★', () => !p.main && this.apply(setMain(this.draft, i), error, `[data-i="${i}"] .p-star`));
      star.setAttribute('aria-pressed', String(p.main));
      star.setAttribute('aria-label', T.makeMain);
      star.title = T.makeMain;
      row.append(star);
    }

    if (p.main) item.append(el('strong', 'q-tag', T.mainTag));
    item.append(label, top, error, row);
    return item;
  }

  addButton(when) {
    const b = button('b-small px p-addbtn', TEXTS.plan.add, () => { this.adding = when; this.render(`#p-new-${when}`); });
    b.dataset.add = when;
    return b;
  }

  addForm(when) {
    const T = TEXTS.plan;
    const form = el('form', 'q-field p-addform');
    form.noValidate = true;
    const input = el('input', 'q-input');
    input.id = `p-new-${when}`;
    input.type = 'text';
    input.maxLength = POINT_MAX;
    input.autocomplete = 'off';
    input.enterKeyHint = 'done';
    const error = el('p', 'hint q-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    input.addEventListener('input', () => { error.hidden = true; });
    const label = el('label', 'q-label', T.addLabel);
    label.htmlFor = input.id;
    const close = () => { this.adding = null; this.render(`[data-add="${when}"]`); };
    const ok = el('button', 'b-small px', T.addConfirm);
    ok.type = 'submit';
    const row = el('div', 'p-row');
    row.append(ok, button('b-small px', T.addCancel, close));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = addPoint(this.draft, when, input.value);
      if (!r.ok) { this.fail(error, r.error); return; }
      this.draft = r.draft;
      this.adding = null;
      this.nod();
      this.render(`[data-add="${when}"]`);
    });
    form.append(label, input, error, row);
    return form;
  }

  // The schedule: every day, chosen weekdays or N times a week. The picker may be half made; only a valid choice reaches the draft.
  scheduleBox() {
    const q = TEXTS.questions.schedule;
    const T = TEXTS.plan;
    const box = el('fieldset', 'q-field');
    box.appendChild(el('legend', 'q-label', q.label));
    const error = el('p', 'hint q-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const save = (show) => {
      const r = setSchedule(this.draft, this.sched);
      if (r.ok) { this.draft = r.draft; error.hidden = true; } else if (show) this.fail(error, r.error);
      return r.ok;
    };

    const days = el('div', 'q-days');
    days.setAttribute('role', 'group');
    days.setAttribute('aria-label', q.daysLabel);
    const pressed = (d) => String(!!this.sched.days?.includes(d));
    const dayButtons = q.days.map((name, d) => button('q-chip', name, () => {
      this.sched = toggleDay(this.sched, d);
      save(true);
      sync();
    }));

    const count = el('div', 'p-step');
    const out = el('output', 'px p-out');
    out.setAttribute('aria-live', 'polite');
    const step = (by) => () => {
      this.sched = { type: 'count', perWeek: Math.min(6, Math.max(1, this.sched.perWeek + by)) };
      save(true);
      sync();
    };
    const less = button('q-chip', '−', step(-1));
    const more = button('q-chip', '+', step(1));
    less.setAttribute('aria-label', T.countLess);
    more.setAttribute('aria-label', T.countMore);
    count.append(less, out, more);

    const sync = () => {
      days.hidden = this.sched.type !== 'days';
      count.hidden = this.sched.type !== 'count';
      dayButtons.forEach((b, d) => b.setAttribute('aria-pressed', pressed(d)));
      if (this.sched.type === 'count') out.textContent = q.count(this.sched.perWeek);
    };
    const radios = Object.entries(q.kinds).map(([type, text]) => {
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'p-kind';
      radio.checked = this.sched.type === type;
      radio.addEventListener('change', () => {
        this.sched = setScheduleType({ schedule: this.sched }, type).schedule;
        save(false);
        error.hidden = true;
        sync();
      });
      const opt = el('label', 'q-opt');
      opt.append(radio, el('span', '', text));
      box.append(opt);
      return radio;
    });
    days.append(...dayButtons);
    box.append(days, count, error);
    sync();
    this.checks.push(() => (save(true) ? null : radios.find((r) => r.checked)));
    return box;
  }

  next() {
    for (const check of this.checks) {
      const bad = check();
      if (bad) { bad.focus(); return; }
    }
    this.scene.start('sign', { draft: this.draft });
  }

  nav() {
    const nav = el('div', 'q-nav');
    const hasSign = this.scene.get('sign');
    nav.append(button(hasSign ? 'b-sec px' : 'b-main px', TEXTS.toOasis, () => this.scene.start('oasis')));
    if (hasSign) nav.append(button('b-main px', TEXTS.plan.next, () => this.next()));
    return nav;
  }
}
