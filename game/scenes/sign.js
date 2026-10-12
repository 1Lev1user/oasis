// The contract: the owner signs the plan with themself. The lizard waits by the campfire with a scroll; the form is HTML in #hud.
// The rules live in sign-form.js and app/lib (pure, tested); this scene only shows them, saves the signed contract and opens the oasis.
// Started from the plan scene with { draft }; ?scene=sign&demo=1 opens it with the gym example. The app never moves money.
// The chest scene starts it with { draft, renewalOf }: the renewal draft prefills the form, and signing carries the old contract's
// mine, storage, outfit and last picks over to the new one (chest-view.js addSigned).
import { WORLD, SAFE } from '../scale.js';
import { readParams } from '../params.js';
import { timeOfDay } from '../clock.js';
import { FRAMES, makeTextures } from '../art/textures.js';
import { SPRITES } from '../art/sprites.js';
import { PALETTE } from '../art/palette.js';
import { reducedMotion, color, wait, hop, squash, burst } from '../world.js';
import { el, button } from '../hud.js';
import { demoDraft } from '../plan-edit.js';
import { buildContract, perMissCents, formDefaults, startRange } from '../sign-form.js';
import { addSigned } from '../chest-view.js';
import { saveState } from '../../lib/store.js';
import { money } from '../../lib/format.js';
import { todayKey } from '../../lib/dates.js';
import { TEXTS, signErrorText } from '../texts/setup.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const at = (x, y) => [x + OX, y + OY]; // prototype coordinates -> world coordinates
const HORIZON = OY + 48;
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y1: 2 * WORLD.h };
const SHADE = { night: { letter: 'm', alpha: 0.7 }, dusk: { letter: 'z', alpha: 0.18 } }; // as in the oasis
const WEEKS = ['6', '7', '8'];
const ICONS = { pet: 'egg', jar: 'jar', lock: 'lock' }; // centrepiece -> pixel map
const ICON_SCALE = 3;
const TEXT_MAX = 120; // as stake.js allows
const SIGNATURE_MAX = 60;

// A pixel map drawn on a small canvas, shown at a whole-number scale (never stretched).
function pixelIcon(key) {
  const rows = SPRITES[key];
  const w = Math.max(...rows.map((r) => r.length));
  const canvas = el('canvas', 's-icon');
  canvas.width = w;
  canvas.height = rows.length;
  canvas.style.width = `${w * ICON_SCALE}px`;
  canvas.style.height = `${rows.length * ICON_SCALE}px`;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      ctx.fillStyle = PALETTE[row[x]];
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

export class Sign extends Phaser.Scene {
  constructor() { super('sign'); }

  init(data) {
    this.draft = data?.draft ?? (readParams(location.search).demo ? demoDraft() : null);
    this.renewalOf = data?.renewalOf ?? this.draft?.renewalOf ?? null; // the plan scene hands the draft back with renewalOf in it
  }

  create() {
    if (!this.draft) { this.scene.start('oasis'); return; } // nothing to sign: opened without a draft
    this.today = todayKey();
    this.form = formDefaults(this.today, this.draft);
    this.signing = false;
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

  get state() { return this.registry.get('state') ?? { contracts: [] }; }

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
    put('pebble', 112, 120);

    const shade = SHADE[timeOfDay(new Date(), readParams(location.search).time)];
    this.fire = put('fire', 116, 118).setDepth(950);
    this.liz = this.add.sprite(...at(78, 118), 'liz').setOrigin(0.5, 1).setDepth(951).play('idle');
    this.scroll = put('scroll', 96, 119).setDepth(952);
    if (shade) this.add.rectangle(WORLD.w / 2, WORLD.h / 2, 3 * WORLD.w, 3 * WORLD.h, color(shade.letter)).setDepth(900).setAlpha(shade.alpha);
    if (!reducedMotion()) this.tweens.add({ targets: this.fire, scaleY: 0.85, duration: 180, yoyo: true, repeat: -1 });
  }

  // The signing moment (about 1.5 s): the lizard hops onto the scroll, the stamp lands, a few sparks. No rotation.
  async stamp() {
    await hop(this, this.liz, 6, 360);
    const [x, y] = [this.scroll.x, this.scroll.y];
    this.add.rectangle(x + 2, y - 3, 2, 2, color('U')).setDepth(953); // the seal
    await Promise.all([squash(this, this.scroll, 1.2, 0.7, 240), burst(this, 'spark', x, y - 4, 6, { lifespan: 500 })]);
    await wait(this, 300);
  }

  // The buttons stick to the bottom of the screen: scroll a field or the error list up when they would cover it.
  reveal(node) {
    const nav = this.root.querySelector('.q-nav');
    if (nav && node.getBoundingClientRect().bottom > nav.getBoundingClientRect().top) node.scrollIntoView({ block: 'end' });
  }

  // ---------- form ----------
  render() {
    const T = TEXTS.sign;
    const form = el('form', 'q-form');
    form.noValidate = true;
    const title = el('h2', 'q-title px', T.title);
    title.tabIndex = -1;

    this.perMiss = el('p', 's-permiss px');
    this.perMiss.setAttribute('aria-live', 'polite');
    this.errors = el('ul', 'hint q-error s-errors');
    this.errors.setAttribute('role', 'alert');
    this.errors.hidden = true;

    form.append(
      title, el('p', 'q-sub', T.sub),
      this.weeksField(),
      this.textField('start', T.start, T.startHint, (input) => {
        input.type = 'date';
        Object.assign(input, startRange(this.today));
        input.value = this.form.startDate;
      }, 'startDate'),
      this.textField('stake', T.stake, T.stakeHint, (input) => { input.inputMode = 'decimal'; }, 'stake'),
      this.perMiss,
      this.setAsideField(),
      this.textField('antigoal', T.antiGoal, T.antiGoalHint, (input) => { input.maxLength = TEXT_MAX; }, 'antiGoal'),
      this.textField('reward', T.reward, T.rewardHint, (input) => { input.maxLength = TEXT_MAX; }, 'reward'),
      this.centrepieceField(),
      this.textField('signature', T.signature, T.signatureHint, (input) => { input.maxLength = SIGNATURE_MAX; input.enterKeyHint = 'done'; }, 'signature'),
      this.errors,
      this.nav(),
    );
    form.addEventListener('submit', (e) => { e.preventDefault(); this.sign(); });
    this.root.replaceChildren(form);
    this.root.scrollTop = 0;
    this.changed();
    title.focus();
  }

  // A labelled input bound to this.form[key]; `setup` sets its type and limits.
  textField(id, label, hint, setup, key) {
    const input = el('input', 'q-input');
    input.id = `s-${id}`;
    input.type = 'text';
    input.autocomplete = 'off';
    input.value = this.form[key];
    setup(input);
    input.addEventListener('input', () => { this.form[key] = input.value; this.changed(); });
    const l = el('label', 'q-label', label);
    l.htmlFor = input.id;
    const note = el('p', 'q-hint', hint);
    note.id = `${input.id}-hint`;
    input.setAttribute('aria-describedby', note.id);
    const box = el('div', 'q-field');
    box.append(l, note, input);
    return box;
  }

  // A group of pressed-state chips: one value of this.form[key].
  chips(legend, key, values, content) {
    const box = el('fieldset', 'q-field');
    box.append(el('legend', 'q-label', legend));
    const row = el('div', `s-chips s-${key}`);
    const buttons = values.map((v) => {
      const b = button('q-chip', '', () => {
        this.form[key] = v;
        buttons.forEach((x, i) => x.setAttribute('aria-pressed', String(values[i] === v)));
        this.changed();
      });
      b.append(...content(v));
      b.setAttribute('aria-pressed', String(this.form[key] === v));
      return b;
    });
    row.append(...buttons);
    box.append(row);
    return box;
  }

  weeksField() {
    const T = TEXTS.sign;
    return this.chips(T.weeks, 'weeks', WEEKS, (n) => [el('span', 'px s-weeks-n', T.weeksOption(n))]);
  }

  centrepieceField() {
    const T = TEXTS.sign;
    return this.chips(T.centrepiece, 'centrepiece', Object.keys(ICONS), (k) => [pixelIcon(ICONS[k]), el('span', '', T.centrepieces[k])]);
  }

  setAsideField() {
    const T = TEXTS.sign;
    const box = el('div', 'q-field');
    const tick = el('input');
    tick.type = 'checkbox';
    tick.id = 's-setaside';
    tick.checked = this.form.setAside;
    tick.addEventListener('change', () => { this.form.setAside = tick.checked; this.changed(); });
    const opt = el('label', 'q-opt');
    opt.append(tick, el('span', '', T.setAside));
    const note = el('p', 'q-hint', T.setAsideHint);
    note.id = 's-setaside-hint';
    tick.setAttribute('aria-describedby', note.id);
    box.append(opt, note);
    return box;
  }

  nav() {
    const nav = el('div', 'q-nav');
    const submit = el('button', 'b-main px', TEXTS.sign.submit);
    submit.type = 'submit';
    nav.append(button('b-sec px', TEXTS.sign.back, () => this.scene.start('plan', { draft: { ...this.draft, renewalOf: this.renewalOf } })), submit);
    return nav;
  }

  // After every change: the price of one miss, and the error list goes away until the next try. (Not `update`: Phaser calls that every frame.)
  changed() {
    const cents = perMissCents(this.draft, this.form, this.state, this.today);
    this.perMiss.textContent = cents === null ? '' : TEXTS.sign.perMiss(money(cents));
    this.perMiss.hidden = cents === null;
    this.errors.hidden = true;
  }

  showErrors(lines) {
    this.errors.replaceChildren(...lines.map((line) => el('li', '', line)));
    this.errors.hidden = false;
    this.reveal(this.errors);
  }

  sign() {
    if (this.signing) return;
    this.today = todayKey(); // the form may have stayed open past midnight
    const r = buildContract(this.draft, this.form, this.state, this.today);
    if (!r.ok) { this.showErrors(r.errors.map(signErrorText)); return; }
    const next = addSigned(this.state, r.contract, this.renewalOf);
    try { saveState(localStorage, next); } catch { this.showErrors([TEXTS.sign.saveFailed]); return; }
    this.registry.set('state', next);
    this.signing = true;
    this.root.querySelectorAll('button, input').forEach((n) => { n.disabled = true; });
    const done = el('p', 'step-done px s-done', TEXTS.sign.stamped);
    done.setAttribute('role', 'status');
    this.root.querySelector('.q-nav').replaceChildren(done);
    document.activeElement?.blur(); // closes the keyboard
    window.scrollTo(0, 0); // the world is at the top: the owner sees the stamp
    this.stamp().catch(() => {}).finally(() => this.scene.start('oasis')); // the owner reaches the oasis even if the animation fails
  }
}
