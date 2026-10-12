// Settings: save the whole game to a file on the phone and load such a file back (C-059). The keeper stands on the sand; in #hud the
// two buttons, the line that nothing leaves the phone, and after a file is read what it holds with «Заменить мои данные» / «Отмена».
// The current data is kept on the device before it is replaced (settings-view.js), then the game restarts from the loaded state.
// The file's contents are untrusted: they are checked by parseBackup and only ever shown as text. Entry: the gear in the oasis and village.
import { WORLD, SAFE } from '../scale.js';
import { keeperFrames, keeperAnim, makeTextures } from '../art/textures.js';
import { color, applySettings } from '../world.js';
import { sound } from '../sound.js';
import { todayKey } from '../../lib/dates.js';
import { toBackup, parseBackup, saveState } from '../../lib/store.js';
import { DEFAULT_GAME } from '../../lib/game-state.js';
import { backupName, fileSummary, errorText, replaceState, tooBig } from '../settings-view.js';
import { startSceneFor } from '../village-view.js';
import { el, button } from '../hud.js';
import { TEXTS } from '../texts/settings.js';

const OY = (WORLD.h - SAFE.h) / 2;
const HORIZON = OY + 60;
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y0: -WORLD.h, y1: 2 * WORLD.h };
const MESSAGE_MS = 6000;
const REVOKE_MS = 1000; // the download has started by then; the object URL is freed

export class Settings extends Phaser.Scene {
  constructor() { super('settings'); }

  create() {
    this.alive = true; // a file read that ends after the scene closed is ignored
    this.pending = null; // the parsed state waiting for «Заменить мои данные»
    this.replacing = false;
    makeTextures(this);
    applySettings(this.state.game?.settings);
    this.backdrop();
    this.hud = this.makeHud();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.hud.destroy();
    });
  }

  get state() { return this.registry.get('state') ?? { contracts: [] }; }

  backdrop() {
    const g = this.add.graphics().setDepth(0);
    const rect = (letter, x, y, w, h) => g.fillStyle(color(letter)).fillRect(x, y, w, h);
    const w = SPAN.x1 - SPAN.x0;
    rect('j', SPAN.x0, SPAN.y0, w, HORIZON - SPAN.y0);
    rect('A', SPAN.x0, HORIZON, w, SPAN.y1 - HORIZON);
    rect('a', SPAN.x0, HORIZON, w, 3);
    const x = WORLD.w / 2;
    const y = OY + 100;
    this.add.sprite(x, y, keeperFrames('lizard').stand).setOrigin(0.5, 1).setDepth(y).play(keeperAnim(this, 'lizard'));
  }

  // One choice, kept at once: in the registry, in the saved game, and in effect (sound, shake, motion) from the next moment on.
  // Turning sound on is a tap, so it answers with a blip.
  choose(key, value) {
    const game = this.state.game ?? DEFAULT_GAME;
    const next = { ...this.state, game: { ...game, settings: { ...DEFAULT_GAME.settings, ...game.settings, [key]: value } } };
    this.registry.set('state', next);
    applySettings(next.game.settings);
    try { saveState(localStorage, next); } catch { this.hud.message(TEXTS.prefSaveFailed); }
    if (key === 'sound' && value) sound.play('tap');
  }

  back() { this.scene.start(startSceneFor(this.state, todayKey())); }

  // The whole state as a file through a temporary <a download>; nothing is sent anywhere.
  save() {
    const name = backupName(todayKey());
    try {
      const url = URL.createObjectURL(new Blob([toBackup(this.state)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);
      this.hud.message(TEXTS.saved(name));
    } catch {
      this.hud.message(TEXTS.exportFailed);
    }
  }

  // A chosen file: refused over the size limit before it is read, else read as text and checked.
  read(file) {
    this.hud.closeConfirm();
    if (tooBig(file.size)) { this.hud.message(errorText('too_big')); return; }
    const reader = new FileReader();
    reader.onload = () => { if (this.alive) this.offer(parseBackup(String(reader.result))); };
    reader.onerror = () => { if (this.alive) this.hud.message(errorText('read_failed')); };
    reader.readAsText(file);
  }

  offer(parsed) {
    if (!parsed.ok) { this.hud.message(errorText(parsed.error)); return; }
    this.pending = parsed.state;
    this.hud.openConfirm(TEXTS.summary(fileSummary(parsed.state, todayKey())));
  }

  cancel() {
    this.pending = null;
    this.hud.closeConfirm();
    this.hud.message(TEXTS.cancelled);
  }

  // Keeps the current data on the device, saves the loaded state, and restarts in its start scene so no scene keeps the old state.
  replace() {
    if (!this.pending || this.replacing) return;
    let next;
    try { next = replaceState(localStorage, this.state, this.pending, Date.now()); } catch (e) { this.hud.message(errorText(e?.code === 'bad_state' ? 'bad_state' : 'save_failed')); return; }
    this.replacing = true;
    this.hud.busy();
    this.registry.set('state', next);
    this.scene.start(startSceneFor(next, todayKey()));
  }

  // A titled row of buttons, one of them pressed: pick(i) is called with the index of the option tapped (booleans: 0 off, 1 on).
  choice(id, title, hint, options, current, pick) {
    const row = el('section', 'coach');
    const heading = el('h3', 'coach-title', title);
    heading.id = `pref-${id}`;
    const chips = el('div', options.length === 2 ? 'q-chips' : 's-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-labelledby', heading.id);
    const buttons = options.map((label, i) => button('q-chip', label, () => {
      pick(i);
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
    }));
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === current)));
    chips.append(...buttons);
    row.append(heading, el('p', 'q-hint', hint), chips);
    return row;
  }

  makeHud() {
    const root = document.getElementById('hud');
    const set = { ...DEFAULT_GAME.settings, ...this.state.game?.settings };
    const prefs = [
      this.choice('sound', TEXTS.soundTitle, TEXTS.soundHint, TEXTS.soundOptions, Number(set.sound), (i) => this.choose('sound', i === 1)),
      this.choice('shake', TEXTS.shakeTitle, TEXTS.shakeHint, TEXTS.shakeOptions, set.shake, (i) => this.choose('shake', i)),
      this.choice('motion', TEXTS.motionTitle, TEXTS.motionHint, TEXTS.motionOptions, Number(set.reducedMotion), (i) => this.choose('reducedMotion', i === 1)),
    ];
    const backBtn = button('b-small px village-link', TEXTS.back, () => this.back());
    const title = el('h2', 'hud-habit px', TEXTS.title);
    const data = el('section', 'coach');
    data.append(el('h3', 'coach-title', TEXTS.dataTitle), el('p', 'coach-why', TEXTS.privacy), el('p', 'q-hint', TEXTS.saveHint));
    const saveBtn = button('b-main px', TEXTS.save, () => this.save());
    // The label is the button: a tap opens the phone's file picker; the input stays visually hidden but reachable by keyboard.
    const pick = el('label', 'b-sec px file-btn', TEXTS.load);
    const input = el('input', 'p-sr');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.setAttribute('aria-label', TEXTS.fileLabel);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = ''; // the same file can be chosen again
      if (file) this.read(file);
    });
    pick.append(input);
    const note = el('p', 'hint');
    note.setAttribute('role', 'status');
    note.hidden = true;

    const confirm = el('section', 'coach file-confirm');
    confirm.hidden = true;
    const confirmTitle = el('h3', 'pause-title px', TEXTS.confirmTitle);
    confirmTitle.tabIndex = -1;
    const lines = el('ul', 'coach-points');
    const btns = el('div', 'btns');
    btns.append(button('b-main px', TEXTS.replace, () => this.replace()), button('b-sec px', TEXTS.cancel, () => this.cancel()));
    confirm.append(confirmTitle, lines, el('p', 'debt-note', TEXTS.replaceWarn), btns);

    root.replaceChildren(backBtn, title, ...prefs, data, saveBtn, pick, note, confirm);
    let timer = 0;
    return {
      message(line) {
        note.textContent = line;
        note.hidden = false;
        clearTimeout(timer);
        timer = setTimeout(() => { note.hidden = true; }, MESSAGE_MS);
      },
      openConfirm(summary) {
        lines.replaceChildren(...summary.map((line) => el('li', '', line)));
        confirm.hidden = false;
        confirm.scrollIntoView({ block: 'nearest' }); // the whole panel with its two buttons, not only the title
        confirmTitle.focus({ preventScroll: true });
      },
      closeConfirm() {
        const refocus = confirm.contains(document.activeElement);
        confirm.hidden = true;
        if (refocus) input.focus();
      },
      busy() {
        root.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
      },
      destroy() { clearTimeout(timer); root.replaceChildren(); },
    };
  }
}
