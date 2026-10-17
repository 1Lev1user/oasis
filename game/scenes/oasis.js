// The living oasis: world, ambient life, day and night by the device clock, tappable objects and the lizard's idle loop.
// Layout is the prototype's 160x140 safe area centred in the 240x200 world; the margin is sand, sky and dunes.
// Other cards call scene.stopIdle() before they take over the lizard and scene.startIdle() when they hand it back.
import { WORLD, SAFE } from '../scale.js';
import { readParams } from '../params.js';
import { timeOfDay } from '../clock.js';
import { IDLE, pickIdle } from '../idle.js';
import { keeperFrames, dress, makeTextures } from '../art/textures.js';
import { reducedMotion, applySettings, color, wait, tween, stopTweens, walkTo, hop, squash, float, burst, popAt, ripple } from '../world.js';
import { sound } from '../sound.js';
import { activeContracts } from '../../lib/contract.js';
import { recordCheckin } from '../../lib/checkin.js';
import { meterState, stageFor } from '../../lib/meter.js';
import { brokenNow } from '../../lib/breakage.js';
import { addPause } from '../../lib/pause.js';
import { habitOf } from '../../lib/habit.js';
import { pickVariant } from '../../lib/variants.js';
import { todayKey, addDays } from '../../lib/dates.js';
import { saveState } from '../../lib/store.js';
import { openQuests, completeQuest } from '../../lib/quests.js';
import { DEFAULT_GAME } from '../../lib/game-state.js';
import { openChest as openChestRule } from '../../lib/gems.js';
import { BALANCE } from '../../lib/balance.js';
import { settlement } from '../../lib/settle.js';
import { startSession, endSession, elapsed, formatTimer, awayMessageMinutes, sessionFor, modeOf, setLast, formatMeter, barSegments } from '../session.js';
import { seedDemo, demoMeter } from '../demo.js';
import { createHud, createBuildPanel, button, el, toolIcons } from '../hud.js';
import { startSceneFor } from '../village-view.js';
import { stageUp } from '../museum-view.js';
import { lookOf, workshopOpen, demoShop } from '../workshop-view.js';
import { rewardFor, rewardLine, chestReady, mineOf, demoRng, demoStorage } from '../gems-view.js';
import { coachView, doneThisWeek } from '../coach-view.js';
import { viewFor, demoBroken } from '../breakage-view.js';
import { buildings, builtIn, upgradeMine, construct, placed, rows, repairsFor, keepsOut } from '../build-view.js';
import { moneyLine, comebackLine, debtView, demoDebt, demoComeback, payDebt, stepDate, sessionContract } from '../money-view.js';
import { yesterdayOffer, pauseChoices, pausePreview, pauseErrorText, pausedUntil, dayLabel, hourFor } from '../pause-view.js';
import { trollIn, trollOut } from '../troll.js';
import { TEXTS } from '../texts/oasis.js';
import { TEXTS as WORKSHOP } from '../texts/workshop.js';
import { TEXTS as BUILD } from '../texts/build.js';
import { TEXTS as MUSEUM } from '../texts/museum.js';
import { TEXTS as CHEST } from '../texts/chest.js';
import { chestStands, chestLines, openEnded, owedReminders, transferOwed } from '../chest-view.js';
import { chestTextures } from './chest.js';
import { campfireTextures, fireGlow } from './campfire.js';
import { campfireState, campfireDay, demoSunday } from '../campfire-view.js';
import { TEXTS as CAMPFIRE } from '../texts/campfire.js';
import { activityPool } from '../anim/activities.js';
import { playCelebration } from '../anim/celebrations.js';
import { playRepairs } from '../anim/repairs.js';

const OX = (WORLD.w - SAFE.w) / 2;
const OY = (WORLD.h - SAFE.h) / 2;
const at = (x, y) => [x + OX, y + OY]; // prototype coordinates -> world coordinates

// Backdrop and light colours: palette letters only (art/palette.js), turned into numbers with color().
const BACK = { sky: 'j', dune: 'A', sand: 'A', horizon: 'a', speckleDark: 'a', speckleLight: 'Q', night: 'm', dusk: 'z', debug: 'F' };
const HORIZON = OY + 48;
const SPAN = { x0: -WORLD.w, x1: 2 * WORLD.w, y0: -WORLD.h, y1: 2 * WORLD.h }; // backdrop bands reach past the world so no screen shows an edge
const POND = { x: 56, y: 116, rx: 24, ry: 8 };
const BURROW = { x: 136, y: 76 };
const END_CHEST = { x: 78, y: 138 }; // the chest at the end of the term, in front of the pond
const FIRE = { x: 102, y: 124 }; // the Sunday campfire, beside the pond
const FIRE_FLICKER_MS = 200;
const SHADE = { night: 0.7, dusk: 0.18, rain: 0.15 };
// ?demo=1 only: the gym example's plan points, sliders and why, so the coach has something to show (demo.js stays as it is).
const DEMO_HABIT = {
  points: [
    { text: 'После того как выхожу с работы — тренировка в зале', when: 'day', main: true },
    { text: 'Кладу сумку с формой у двери', when: 'eve', main: false },
    { text: 'Если нет сил — делаю 10 минут дома', when: 'miss', main: false },
  ],
  sliders: { can: 2, opp: 4, want: 5 },
  why: 'Хочу, чтобы по вечерам хватало сил на близких',
};

export class Oasis extends Phaser.Scene {
  constructor() { super('oasis'); }

  // data.contractId (from the village): the habit to show. A fresh start (no ?scene=) with two or more active habits opens the village.
  init(data) {
    this.pick = data?.contractId ?? null;
    this.leaving = !this.pick && !readParams(location.search).scene && !!this.registry.get('state') && startSceneFor(this.registry.get('state'), todayKey()) === 'village';
  }

  create() {
    if (this.leaving) { this.scene.start('village'); return; }
    applySettings(this.registry.get('state')?.game?.settings); // the owner's sound, shake and motion choices, before anything animates
    // Per-run state lives here, not in the constructor: Phaser reuses the scene object when it restarts.
    this.tok = 0; // idle loop generation: a loop stops as soon as its token is no longer current
    this.view = null; // set by refresh(); applyTime() draws the buildings only once it is there
    this.bld = {}; // building id -> its image in the oasis (drawBuildings)
    this.cool = {}; // idle behaviour id -> time its cooldown ends
    this.last = null;
    this.tod = 'day';
    this.raining = false;
    this.sleeping = false;
    this.peeking = false;
    makeTextures(this);
    chestTextures(this);
    campfireTextures(this);
    this.endChest = null; // the chest at the end of the term, made the first time it stands
    this.fire = null; // the Sunday campfire (image, glow), made the first time it is lit
    this.frames = keeperFrames('lizard'); // the keeper's stand and blink textures; dressKeeper swaps them for another species
    this.look = { species: 'lizard', outfit: null, stage: 'teen' }; // the textures the sprite starts with: the teen lizard
    this.keepStage = false; // true while a step plays: the keeper keeps its old stage until its growth moment
    this.outfit = null;
    this.makeAnims();
    this.keepers = new Set(); // short-lived idle props, destroyed when the idle loop is stopped
    this.layer = new Set(); // props and drawings of the running session activity, removed when it ends
    this.brokenSprites = new Map(); // object id -> the broken image standing in the oasis
    this.keepBroken = false; // true while a repair plays: the broken things stay until it is over
    this.troll = null; // the debt troll's sprite while a debt is open
    this.buildWorld();
    this.applyTime(true);
    if (this.tod === 'night') this.liz.setPosition(...at(BURROW.x, BURROW.y + 2)); // already asleep when the app opens at night
    this.time.addEvent({ delay: 20000, loop: true, callback: () => { this.applyTime(false); if (!this.newDay()) this.momentChanged(); } });
    this.time.addEvent({ delay: 45000, loop: true, callback: () => { if (!this.raining && this.tod !== 'night' && Math.random() < 0.25) this.rain(16000); } });
    const onVisible = () => { if (!document.hidden) { this.applyTime(true); this.newDay(); this.welcomeBack(); } };
    document.addEventListener('visibilitychange', onVisible);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onVisible);
      this.stopTimer();
      this.hud.destroy();
      this.build.destroy();
      this.setKeeperAnims(keeperFrames('lizard'));
      this.tok++; // timers and tweens die with the scene, so anything still awaiting one never resumes; this also ends the loop if one does
    });
    this.startHud();
  }

  makeAnims() {
    const frames = keeperFrames('lizard');
    const make = (key, list, frameRate) => {
      if (!this.anims.exists(key)) this.anims.create({ key, frames: list.map((k) => ({ key: k })), frameRate, repeat: -1 });
    };
    make('idle', frames.idle, 2);
    make('walk', frames.walk, 8);
    make('bfly', ['bfly0', 'bfly1'], 8);
  }

  // world.js plays the global 'idle' and 'walk', so they carry the frames of the keeper on the screen. The lizard's come back when the
  // scene closes (the questionnaire scenes play 'idle' too). Removing an animation stops the sprites playing it.
  setKeeperAnims(f) {
    for (const [key, list, frameRate] of [['idle', f.idle, 2], ['walk', f.walk, 8]]) {
      this.anims.remove(key);
      this.anims.create({ key, frames: list.map((k) => ({ key: k })), frameRate, repeat: -1 });
    }
  }

  // ---------- world ----------
  buildWorld() {
    const g = this.add.graphics().setDepth(0);
    const rect = (letter, x, y, w, h) => g.fillStyle(color(letter)).fillRect(x, y, w, h);
    const w = SPAN.x1 - SPAN.x0;
    rect(BACK.sky, SPAN.x0, SPAN.y0, w, HORIZON - SPAN.y0);
    for (let x = SPAN.x0; x < SPAN.x1; x += 2) { // distant dunes
      const h = Math.max(1, Math.round(6 + 3 * Math.sin(x / 19) + 2 * Math.sin(x / 7.3)));
      rect(BACK.dune, x, HORIZON - h, 2, h);
    }
    rect(BACK.sand, SPAN.x0, HORIZON, w, SPAN.y1 - HORIZON);
    rect(BACK.horizon, SPAN.x0, HORIZON, w, 3);
    for (let i = 0; i < 260; i++) rect(Math.random() < 0.25 ? BACK.speckleDark : BACK.speckleLight, Math.floor(-30 + Math.random() * (WORLD.w + 60)), HORIZON + 4 + Math.floor(Math.random() * (WORLD.h - HORIZON + 30)), 1, 1);
    if (new URLSearchParams(location.search).get('debug') === '1') {
      g.lineStyle(1, color(BACK.debug)).strokeRect(OX, OY, SAFE.w, SAFE.h);
    }

    // sky: sun and moon (never darkened by the night shade), stars, clouds
    this.sun = this.add.circle(...at(140, 12), 6, color('O')).setStrokeStyle(2, color('o')).setDepth(951);
    this.moon = this.add.image(...at(140, 12), 'moon').setDepth(951);
    this.stars = Array.from({ length: 24 }, () => this.add.image(-20 + Math.random() * (WORLD.w + 40), 2 + Math.random() * (HORIZON - 8), 'dot').setDepth(950).setAlpha(0));
    this.clouds = [at(30, 12), at(110, 22), at(-30, 2)].map(([x, y], i) => this.add.image(x, y, 'cloud').setDepth(1).setAlpha(0.95 - i * 0.05));

    // pond: pixel ellipses drawn row by row so the edge stays on the world grid
    const [px, py] = at(POND.x, POND.y);
    const pg = this.add.graphics().setDepth(2);
    const disc = (c, cx, cy, rx, ry) => {
      pg.fillStyle(c);
      for (let dy = -ry; dy <= ry; dy++) {
        const half = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
        pg.fillRect(cx - half, cy + dy, 2 * half, 1);
      }
    };
    disc(color('K'), px, py, 26, 9);
    disc(color('B'), px, py, 24, 7);
    disc(color('b'), px, py + 3, 20, 3);
    this.shimmer = [this.add.rectangle(...at(46, 112), 6, 1, color('J')).setDepth(3), this.add.rectangle(...at(64, 115), 4, 1, color('J')).setDepth(3)];
    this.shimmer.forEach((s, i) => { if (!reducedMotion()) this.tweens.add({ targets: s, alpha: 0.15, duration: 1400 + i * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); });
    this.add.zone(px, py, 50, 18).setInteractive().on('pointerdown', (p) => ripple(this, p.worldX, p.worldY));

    // objects stand on their bottom edge; depth follows y
    const put = (key, x, y, world = false) => {
      const [wx, wy] = world ? [x, y] : at(x, y);
      return this.add.image(wx, wy, key).setOrigin(0.5, 1).setDepth(wy);
    };
    this.workshop = this.tappable(put('workshop', 50, 68), () => this.openWorkshop()).setVisible(false); // shown once the workshop is open
    this.palm = this.tappable(put('palm', 24, 104), () => this.tapPalm());
    this.cactus = this.tappable(put('cactus', 84, 80), () => popAt(this, 'flower', ...at(85, 66), 3000));
    this.fence = put('fence', 108, 78);
    this.burrow = this.tappable(put('burrow', BURROW.x, BURROW.y), () => this.tapBurrow());
    this.well = this.tappable(put('well', 146, 134), () => burst(this, 'drop', ...at(146, 124), 6, { angle: { min: 240, max: 300 }, speed: { min: 30, max: 60 }, gravityY: 160 }));
    this.sprouts = [38, 46, 54].map((x) => put('sprout', x, 86));
    for (const [x, y, k] of [[70, 92, 'flower'], [118, 98, 'flowerB'], [20, 128, 'flower'], [100, 136, 'flowerB'], [150, 100, 'flower']]) put(k, x, y);
    // margin, for wide screens: a few more flowers and pebbles
    for (const [x, y, k] of [[14, 110, 'flower'], [30, 172, 'flowerB'], [8, 148, 'flowerB'], [214, 118, 'flowerB'], [226, 166, 'flower'], [204, 188, 'flowerB'], [60, 190, 'flower'], [20, 190, 'pebble'], [196, 150, 'pebble'], [232, 134, 'pebble']]) put(k, x, y, true);

    // creatures
    this.liz = this.tappable(this.add.sprite(...at(94, 128), 'liz').setOrigin(0.5, 1).setDepth(OY + 128), () => this.tapLizard());
    this.liz.play('idle');
    this.bflies = [at(40, 70), at(120, 60)].map(([x, y]) => {
      const b = this.tappable(this.add.sprite(x, y, 'bfly0').setDepth(700), () => this.flyButterfly(b, true), 6).play('bfly');
      this.flyButterfly(b);
      return b;
    });
    this.fireflies = Array.from({ length: 8 }, () => {
      const f = this.add.image(OX + 10 + Math.random() * 140, OY + 70 + Math.random() * 60, 'firefly').setDepth(952);
      if (!reducedMotion()) this.tweens.add({ targets: f, alpha: 0.1, x: f.x + 8 - Math.random() * 16, y: f.y - 6, duration: 900 + Math.random() * 900, yoyo: true, repeat: -1 });
      return f;
    });

    // weather and light
    this.shade = this.add.rectangle(WORLD.w / 2, WORLD.h / 2, 3 * WORLD.w, 3 * WORLD.h, color(BACK.night)).setDepth(900).setAlpha(0);
    this.rainEm = this.add.particles(0, 0, 'drop', {
      x: { min: -20, max: WORLD.w + 20 }, y: -4, speedY: { min: 110, max: 140 }, speedX: -10,
      lifespan: 1700, frequency: reducedMotion() ? 50 : 20, emitting: false,
    }).setDepth(905);
  }

  // Makes an object react to taps; `pad` widens the hit area (in sprite pixels) for small things.
  tappable(obj, onTap, pad = 3) {
    obj.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-pad, -pad, obj.width + 2 * pad, obj.height + 2 * pad), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
    obj.on('pointerdown', () => { sound.play('tap'); onTap(); });
    return obj;
  }

  update(_, dt) {
    if (this.leaving) return;
    this.clouds.forEach((c, i) => { c.x += dt * (0.004 + i * 0.002); if (c.x > WORLD.w + 40) c.x = -40; });
    this.liz.setDepth(this.liz.y);
    this.outfit?.sync();
  }

  // ---------- time of day ----------
  applyTime(instant) {
    this.tod = timeOfDay(new Date(), readParams(location.search).time);
    if (this.view) this.drawBuildings(); // the lighthouse is lit at dusk and night
    this.fireLight();
    const night = this.tod === 'night';
    const dusk = this.tod === 'dusk';
    this.shade.setFillStyle(color(dusk ? BACK.dusk : BACK.night));
    this.setShade(instant);
    this.sun.setVisible(!night);
    this.moon.setVisible(night);
    this.stars.forEach((s) => {
      this.tweens.killTweensOf(s);
      s.setAlpha(night ? 0.8 : 0);
      if (night && !reducedMotion()) this.tweens.add({ targets: s, alpha: 0.2, duration: 800 + Math.random() * 1500, yoyo: true, repeat: -1 });
    });
    this.fireflies.forEach((f) => f.setVisible(night));
    this.bflies.forEach((b) => b.setVisible(!night));
  }

  setShade(instant) {
    const base = this.tod === 'night' ? SHADE.night : this.tod === 'dusk' ? SHADE.dusk : 0;
    const alpha = Math.max(base, this.raining ? SHADE.rain : 0);
    this.tweens.killTweensOf(this.shade);
    if (instant) this.shade.setAlpha(alpha);
    else this.tweens.add({ targets: this.shade, alpha, duration: 1500 });
  }

  rain(ms) {
    if (this.raining) return;
    this.raining = true;
    this.rainEm.start();
    this.setShade(false);
    this.time.delayedCall(ms, () => { this.rainEm.stop(); this.raining = false; this.setShade(false); });
  }

  // ---------- taps ----------
  tapLizard() {
    if (this.sleeping) return;
    squash(this, this.liz, 1.15, 0.82, 280);
    float(this, 'heart', this.liz.x, this.liz.y - 14);
  }

  tapPalm() {
    // a one-pixel shake: rotated sprites tear under roundPixels, so nothing in the oasis rotates
    if (!reducedMotion()) this.tweens.add({ targets: this.palm, x: this.palm.x + 1, duration: 60, yoyo: true, repeat: 3 });
    const nut = this.add.image(...at(26, 88), 'coconut').setDepth(OY + 120);
    const landed = reducedMotion()
      ? (nut.setPosition(OX + 34, OY + 106).setAlpha(0), tween(this, { targets: nut, alpha: 1, duration: 250 })) // a fade in place of the drop and roll
      : tween(this, { targets: nut, y: OY + 106, duration: 450, ease: 'Bounce.easeOut' }).then(() => tween(this, { targets: nut, x: OX + 34, duration: 500 }));
    landed.then(() => tween(this, { targets: nut, alpha: 0, duration: 1200, delay: 1200 })).then(() => nut.destroy());
  }

  async tapBurrow() {
    const [x, y] = at(BURROW.x, BURROW.y);
    burst(this, 'dust', x, y - 2, 5, { gravityY: 40 });
    if (!this.sleeping || this.peeking) return;
    this.peeking = true;
    this.liz.setPosition(x, y + 2).setAlpha(1).setTexture(this.frames.stand);
    float(this, 'heart', x, y - 14);
    await wait(this, 1100);
    if (this.sleeping) this.liz.setAlpha(0).setTexture(this.frames.blink);
    this.peeking = false;
  }

  // Butterflies wander on their own; a tap sends one off fast.
  flyButterfly(b, fast) {
    this.tweens.killTweensOf(b);
    const [tx, ty] = at(10 + Math.random() * 140, 30 + Math.random() * 90);
    b.setFlipX(tx < b.x);
    this.tweens.add({ targets: b, x: tx, y: ty, duration: fast ? 900 : 3000 + Math.random() * 3000, ease: 'Sine.easeInOut', onComplete: () => this.flyButterfly(b) });
  }

  // ---------- HUD and the habit session ----------
  get state() { return this.registry.get('state'); }

  // Keeps the new state in the registry and saves it; a failed save is shown, the game goes on.
  commit(next) {
    this.registry.set('state', next);
    try { saveState(localStorage, next); } catch { this.hud.message(TEXTS.saveFailed); }
  }

  startHud() {
    this.busy = false;
    this.noYesterday = null; // the day «Нет» was tapped on the "mark yesterday" offer (memory only)
    this.demoSeeded = false; // true when this load made the demo contract: only then may ?hour=N stand in for the clock
    this.hud = createHud(document.getElementById('hud'), {
      create: () => this.scene.start('setup'),
      help: () => { if (!this.busy) this.scene.start('help', { from: 'oasis' }); },
      start: () => this.beginSession(),
      mini: () => this.finishStep('mini'),
      already: () => this.finishStep('done'),
      finish: () => this.finishStep('done'),
      cancel: () => this.cancelSession(),
      pay: () => this.pay(),
      yesterday: () => this.markYesterday(),
      noYesterday: () => { this.noYesterday = this.view.today; this.refresh(); },
      openPause: () => this.openPause(),
      pause: (from, days) => this.setPause(from, days),
      quest: (id) => this.doQuest(id),
      chest: () => this.openChest(),
      village: () => this.scene.start('village'),
      openEnd: () => this.openEnd(),
      transfer: (contractId) => this.transfer(contractId),
    });
    // The way into the workshop (hud.js has no slot for it): a button under the others; before week 3 it leads to the closed workshop's note.
    this.workshopBtn = button('b-small px', WORKSHOP.enter, () => this.openWorkshop());
    this.workshopBtn.hidden = true;
    // «Стройка»: the panel for the mine, the storage and the effect buildings; the mine and the buildings in the oasis open it too.
    this.buildLock = 0; // performance.now() before which a tap on «Улучшить» or «Построить» is the same tap
    this.build = createBuildPanel({
      upgrade: () => this.buyBuild(upgradeMine, 'mine'),
      build: (id) => this.buyBuild((game, contract, today) => construct(game, contract, id, today), id),
      close: () => { this.build.close(); this.buildBtn.focus(); },
    });
    this.buildBtn = button('b-small px', BUILD.open, () => this.openBuild());
    this.buildBtn.hidden = true;
    this.extras = el('div', 'tools');
    this.extras.hidden = true;
    this.museumBtn = button('b-small px', MUSEUM.enter, () => { if (!this.busy) this.scene.start('museum'); });
    // «Костёр»: the way into the Sunday review for those who do not tap the fire; only while the fire is lit
    this.campfireBtn = button('b-small px', CAMPFIRE.enter, () => this.openCampfire());
    this.campfireBtn.hidden = true;
    this.extras.append(this.workshopBtn, this.buildBtn, this.campfireBtn, this.museumBtn);
    // The «?» to the help and the gear to the settings (save to a file, load it back): always there, also with no habit
    const icons = toolIcons(() => { if (!this.busy) this.scene.start('help', { from: 'oasis', contractId: this.pick }); }, () => { if (!this.busy) this.scene.start('settings'); });
    document.getElementById('hud').append(this.extras, this.build.node, icons);
    if (!this.registry.get('state')) this.registry.set('state', { contracts: [] });
    if (readParams(location.search).demo) {
      const today = todayKey();
      const seeded = seedDemo(this.state, today);
      // ?demo=1 with debt=1, comeback=1 or broken=1: the new demo contract starts with an open debt, an open comeback or two
      // things broken (never without ?demo=1)
      const last = seeded.contracts.length - 1;
      const q = new URLSearchParams(location.search);
      // yesterday=1: no check-in yesterday (the same contract as comeback=1), to try "mark yesterday"
      const shape = q.get('debt') === '1' ? demoDebt : q.get('comeback') === '1' || q.get('yesterday') === '1' ? demoComeback : q.get('broken') === '1' ? demoBroken : null;
      this.demoSeeded = seeded !== this.state;
      // ?day=sunday: the oasis and the campfire count the coming Sunday as today, for this whole page load (only on this seeding load)
      if (demoSunday(location.search, this.demoSeeded)) this.registry.set('demoSunday', true);
      if (seeded !== this.state) {
        // ?meter=N (demoMeter) sets the habit strength to start from
        const made = (c) => demoMeter(location.search, true, shape ? shape({ ...c, ...DEMO_HABIT }, today) : { ...c, ...DEMO_HABIT });
        // ?storage=N presets the demo contract's storage slots (demoStorage)
        const game = demoStorage(location.search, this.demoSeeded, seeded.game ?? DEFAULT_GAME, seeded.contracts[last].id);
        // ?gems=N and ?week=N (demoShop): gems for the workshop and the week of the habit, only on this seeded demo
        this.commit(demoShop(location.search, true, { ...seeded, game, contracts: seeded.contracts.map((c, i) => (i === last ? made(c) : c)) }, today));
      }
    }
    this.rng = demoRng(location.search, this.demoSeeded); // ?rare=1: the first roll is rare, only on a seeded demo load
    this.refresh();
    if (this.view.mode === 'session') { this.resumeSession(); } else { this.startIdle(); }
  }

  // Reads the saved state and draws the HUD: the running session's contract (also past midnight after its last term day), else the
  // one the village opened (data.contractId), else the first one whose term is over and not closed (its chest), else the first active
  // one, its strength, the money at stake and the mode. Once the term is over the chest stands (settle.js decides when it opens). While a debt is open the troll sits on the path and the HUD
  // shows the payment panel instead of the step buttons. While a session runs its step decides first: no debt panel, no troll, and
  // a session from an earlier day shows its start day (no comeback card, nothing burned or broken before the step is recorded).
  refresh() {
    const today = todayKey();
    if (this.state.game?.session && !sessionContract(this.state, today)) this.dropSession();
    const session = this.state.game?.session ?? null;
    const active = activeContracts(this.state.contracts, today);
    const open = [...openEnded(this.state, today), ...active];
    const contract = sessionContract(this.state, today) ?? open.find((c) => c.id === this.pick) ?? open[0] ?? null;
    const ending = contract && !session && chestStands(contract, today) ? settlement(contract, today, { hour: this.hourNow() }) : null;
    const ready = !!ending?.ok;
    const preview = ending && !ready ? ending.preview ?? null : null;
    const started = session ? todayKey(new Date(session.start)) : today;
    const day = started < today ? started : today;
    const meter = contract ? meterState(contract, day, habitOf(contract).meterBase).meter : 0;
    const mode = modeOf(this.state, contract, today);
    const debt = contract && !session && !ready ? debtView(contract, today) : null; // a debt never blocks the chest
    const refund = contract && day === today && !ending ? comebackLine(contract, today)?.refund : null;
    const yesterday = !!contract && !session && this.noYesterday !== today && yesterdayOffer(contract, today, this.hourNow());
    const pausedTo = contract && !session ? pausedUntil(contract, today) : null;
    const coach = ending ? null : this.coachFor(contract, today);
    const build = contract ? buildings(this.state.game, contract, today) : null;
    const stage = contract ? stageFor(meter) : 'teen'; // no habit yet: the lizard as it is
    this.view = { contract, today, meter, stage, mode, debt, yesterday, pausedTo, coach, build, ready, ending: !!ending };
    this.dressKeeper({ ...lookOf(this.state.game, contract?.id), stage: this.keepStage ? this.look.stage : stage });
    this.showWorkshop(workshopOpen(contract, today), !!contract && !ending);
    this.hud.render({
      mode, habit: contract?.plan.action, meterText: formatMeter(meter), filled: barSegments(meter),
      stakes: contract ? TEXTS.stakes(moneyLine(contract, day)) : null,
      comeback: refund ? TEXTS.comeback(refund) : null,
      debt,
      yesterday,
      paused: pausedTo ? TEXTS.paused(dayLabel(pausedTo)) : null,
      gems: this.state.game?.gems ?? 0,
      chest: chestReady(this.state.game, contract?.id),
      village: open.length > 1,
      coach,
      ending: ready ? { ready } : preview ? { lines: chestLines(preview).map((l) => l.text), opensAt: CHEST.opensAt() } : null,
      owed: owedReminders(this.state, contract ? habitOf(contract).habitId : null),
    });
    this.showEndChest(ready);
    this.showFire(!!contract && !session && campfireState(contract, this.state.game, this.campfireDay()).open);
    this.drawBuildings();
    this.build.render({ gems: this.state.game?.gems ?? 0, rows: build ? rows(build) : [] });
    if (!contract) this.build.close();
    if (!this.keepBroken) this.showBroken(contract ? viewFor(brokenNow(contract, day, builtIn(this.state.game, contract))) : [], ending ? 'done' : mode); // no step repairs once the term is over: the chest line stays
    if (debt && mode === 'idle') this.hud.caption(TEXTS.debtCaption);
    if (debt && !this.troll) this.troll = trollIn(this, () => this.hud.message(TEXTS.trollLine(this.view.debt.due)));
    if (!debt && this.troll) { trollOut(this, this.troll); this.troll = null; }
  }

  // The chest at the end of the term: it stands (and takes taps) while it can be opened.
  showEndChest(on) {
    if (on && !this.endChest) {
      const [x, y] = at(END_CHEST.x, END_CHEST.y);
      this.endChest = this.tappable(this.add.image(x, y, 'cchest_closed').setOrigin(0.5, 1).setDepth(y), () => this.openEnd());
    }
    if (!this.endChest) return;
    this.endChest.setVisible(on);
    this.endChest.input.enabled = on;
  }

  // «Открыть сундук» or a tap on the chest: today and the hour are read now; the chest scene shows the result.
  openEnd() {
    if (this.busy) return;
    const today = todayKey();
    if (!this.sameDay(today)) return;
    const { contract } = this.view;
    if (!contract || !chestStands(contract, today) || !settlement(contract, today, { hour: this.hourNow() }).ok) {
      this.refresh();
      this.hud.message(CHEST.notReady);
      return;
    }
    this.scene.start('chest', { contractId: contract.id, demo: this.demoSeeded });
  }

  // The day the campfire counts as today (the coming Sunday on a ?day=sunday demo load), read fresh.
  campfireDay() { return campfireDay(this.registry.get('demoSunday') === true, todayKey()); }

  // The Sunday campfire: lit and tappable while the review can be sat (a Sunday inside the term, no session running).
  showFire(on) {
    if (on && !this.fire) {
      const [x, y] = at(FIRE.x, FIRE.y);
      // above the lizard and the shade: a tap where the lizard stands beside it still reaches the fire
      const img = this.tappable(this.add.image(x, y, 'cfire_a').setOrigin(0.5, 1).setDepth(902), () => this.openCampfire(), 7);
      this.fire = { img, glow: fireGlow(this, x, y - 2, 901) };
      if (!reducedMotion()) this.time.addEvent({ delay: FIRE_FLICKER_MS, loop: true, callback: () => img.setTexture(img.texture.key === 'cfire_a' ? 'cfire_b' : 'cfire_a') });
    }
    this.campfireBtn.hidden = !on;
    if (!this.fire) return;
    this.fire.img.setVisible(on);
    this.fire.img.input.enabled = on;
    this.fireLight(on);
  }

  // The glow shows after dusk, above the shade.
  fireLight(on = this.fire?.img.visible) {
    this.fire?.glow.setVisible(!!on && this.tod !== 'day');
  }

  // A tap on the fire, «Костёр» or the Sunday quest: today is read now; the campfire scene shows the review.
  openCampfire() {
    if (this.busy || this.state.game?.session) return; // not while a session runs, like the fire and the button
    if (!this.sameDay(todayKey())) return;
    const { contract } = this.view;
    if (!contract || !campfireState(contract, this.state.game, this.campfireDay()).open) {
      this.refresh();
      this.hud.message(CAMPFIRE.notSunday);
      return;
    }
    this.scene.start('campfire', { contractId: contract.id });
  }

  // «Деньги переведены» on an owed reminder: the owner's word for a closed contract's transfer (the app never moves money).
  transfer(contractId) {
    if (this.busy) return;
    const paid = transferOwed(this.state, contractId, todayKey());
    if (paid.ok) this.commit(paid.state);
    this.refresh();
    if (paid.ok) this.hud.message(CHEST.afterTransfer);
  }

  // The building stands in the oasis once the habit's workshop is open; the button is there from the first day with a habit.
  showWorkshop(open, habit) {
    this.workshop.setVisible(open);
    this.workshop.input.enabled = open;
    this.workshopBtn.hidden = this.buildBtn.hidden = !habit;
    this.extras.hidden = !habit && !this.state.game?.museum?.houses?.length; // the museum outlives the habits
  }

  // ---------- buildings ----------
  // Draws the mine, the storage and the three effect buildings as build-view.js says (a silhouette until built), and the lamp that shines
  // above the night shade while a built lighthouse is lit.
  drawBuildings() {
    const { build } = this.view;
    const list = build ? placed(build, this.tod !== 'day') : [];
    const shown = new Set(list.map((p) => p.id));
    for (const p of list) {
      const [x, y] = at(p.x, p.y);
      const img = this.bld[p.id] ?? (this.bld[p.id] = p.over ? this.add.image(x, y, p.key).setOrigin(0.5, 1) : this.tappable(this.add.image(x, y, p.key).setOrigin(0.5, 1), () => this.openBuild()));
      if (img.texture.key !== p.key) {
        img.setTexture(p.key);
        img.input?.hitArea.setTo(-3, -3, img.width + 6, img.height + 6); // the mine grows: its tap area follows
      }
      img.setDepth(p.over ? 901 : y).setAlpha(p.key.endsWith('_locked') ? 0.55 : 1);
    }
    for (const [id, img] of Object.entries(this.bld)) img.setVisible(shown.has(id));
  }

  // The panel opens from its button and from a tap on the mine, the storage or any effect building.
  openBuild() {
    if (this.busy || !this.view.contract) return;
    this.hud.closePause();
    this.build.open();
  }

  // «Улучшить» / «Построить»: one tap buys once (a second tap within 400 ms is the same tap). Today and the habit are read fresh; the
  // result of buy is saved only when it is ok, and either way said in one calm line.
  buyBuild(run, id) {
    if (this.busy) return;
    const now = performance.now();
    if (now < this.buildLock) return;
    this.buildLock = now + 400;
    const today = todayKey();
    if (!this.sameDay(today)) return;
    const contract = activeContracts(this.state.contracts, today).find((c) => c.id === this.view.contract?.id);
    if (!contract) { this.refresh(); return; }
    const result = run(this.state.game ?? DEFAULT_GAME, contract, today);
    if (result.ok) this.commit({ ...this.state, game: result.game });
    this.refresh();
    this.build.message(result.line);
    if (!result.ok) return;
    const img = this.bld[id];
    burst(this, 'spark', img.x, img.y - img.height / 2, 10, { angle: { min: 0, max: 360 }, speed: { min: 20, max: 60 }, gravityY: 20, lifespan: 700 });
    squash(this, img, 1.1, 0.9, 260);
  }

  // The look of the habit on the screen: the species and outfit chosen in the workshop, at the stage its strength has reached. A new species
  // or stage swaps the frames of the global 'idle' and 'walk' (world.js plays those two); the outfit follows the lizard sprite from update()
  // (an egg and a baby wear none). Only a change does anything.
  dressKeeper(look) {
    if (look.species === this.look.species && look.outfit === this.look.outfit && look.stage === this.look.stage) return;
    if (look.species !== this.look.species || look.stage !== this.look.stage) {
      this.frames = keeperFrames(look.species, look.stage);
      this.setKeeperAnims(this.frames);
      this.liz.setTexture(this.frames.stand);
      if (!this.sleeping) this.liz.play('idle');
    }
    this.outfit?.img.destroy();
    this.outfit = dress(this, this.liz, look.species, look.outfit, look.stage);
    this.look = look;
  }

  // The step moved the keeper to a higher stage: it squashes, changes into the new look with a few sparkles and says so (1.5 s; with
  // reduced motion it fades out and in, with half the sparkles). A stage that did not go up is just shown.
  async grow() {
    this.keepStage = false;
    const { stage } = this.view;
    const to = { ...this.look, stage };
    if (!stageUp(this.look.stage, stage)) { this.dressKeeper(to); return; }
    const tok = this.tok;
    const L = this.liz;
    if (reducedMotion()) {
      await tween(this, { targets: L, alpha: 0, duration: 350 });
      if (!this.alive(tok)) return;
      this.dressKeeper(to);
      await tween(this, { targets: L, alpha: 1, duration: 350 });
    } else {
      await squash(this, L, 1.2, 0.8, 400);
      if (!this.alive(tok)) return;
      this.dressKeeper(to);
      burst(this, 'star', L.x, L.y - L.height / 2, 8, { angle: { min: 0, max: 360 }, speed: { min: 20, max: 55 }, gravityY: 20, lifespan: 700 });
      await squash(this, L, 0.85, 1.15, 400);
    }
    if (!this.alive(tok)) return;
    this.hud.caption(stage === 'baby' ? MUSEUM.hatched : MUSEUM.grew(stage));
    await wait(this, 700);
  }

  // «Мастерская»: read the habit fresh at the tap. The workshop scene itself says when it is still closed.
  openWorkshop() {
    if (this.busy) return;
    const today = todayKey();
    const contract = activeContracts(this.state.contracts, today).find((c) => c.id === this.view.contract?.id);
    if (!contract) { this.refresh(); return; }
    this.scene.start('workshop', { contractId: contract.id });
  }

  // What the coach shows now: today and the hour are read fresh each time (a ?hour=N demo hour stands in only through hourNow).
  coachFor(contract, today, hour = this.hourNow()) {
    return contract ? coachView(contract, this.state.game ?? DEFAULT_GAME, today, hour) : null;
  }

  // «Маленькие дела»: a tap pays an open quest once, saves, and a small gem floats up from the lizard.
  doQuest(id) {
    if (this.busy) return;
    const today = todayKey();
    if (!this.sameDay(today)) return;
    const { contract } = this.view;
    if (!contract) return;
    if (id.startsWith('sunday:')) { this.openCampfire(); return; } // the Sunday quest is paid at the fire, not by a tap on the list
    const game = this.state.game ?? DEFAULT_GAME;
    const open = openQuests(contract, today, this.hourNow(), doneThisWeek(game, today));
    const paid = completeQuest(game, today, id, open);
    if (!paid.ok) { this.refresh(); return; } // the list changed under the screen: show the current one
    this.commit({ ...this.state, game: paid.game });
    this.refresh();
    float(this, 'gem', this.liz.x, this.liz.y - 14);
  }

  // Ends a saved session whose contract can no longer take a step (a draft, closed, or its term over): it could never finish.
  dropSession() {
    this.commit(endSession(this.state));
    this.stopTimer();
    if (this.sessionRun) this.stopSession().then(() => this.startIdle());
  }

  // Redraws when the day changed since the screen was drawn (the app stayed open past midnight). True when it did.
  newDay() {
    if (todayKey() === this.view.today) return false;
    this.hud.closePause(); // its start days were for the old day
    this.refresh();
    return true;
  }

  // A tap on a screen drawn for another day records nothing: the screen is redrawn for `today` and says so. True when it was current.
  sameDay(today) {
    if (today === this.view.today) return true;
    this.hud.closePause();
    this.refresh();
    this.hud.message(TEXTS.dayTurned);
    return false;
  }

  // The local hour for "mark yesterday"; ?hour=N counts only when this load seeded the demo contract (hourFor).
  hourNow(now = new Date()) { return hourFor(location.search, this.demoSeeded, now); }

  // The clock moved on: redraw when the "mark yesterday" offer has ended (noon) or the coach has other points or quests (evening).
  momentChanged() {
    const { contract } = this.view;
    const today = todayKey();
    const offerEnded = this.view.yesterday && !yesterdayOffer(contract, today, this.hourNow());
    const opens = !!contract && !this.view.ready && !this.state.game?.session && chestStands(contract, today) && settlement(contract, today, { hour: this.hourNow() }).ok; // noon
    const coach = this.view.ending ? null : this.coachFor(contract, today);
    if (offerEnded || opens || JSON.stringify(coach) !== JSON.stringify(this.view.coach)) this.refresh();
  }

  // «Да, отметить вчера»: yesterday's step with today and the hour read now, then the repairs and a celebration.
  async markYesterday() {
    if (this.busy) return;
    const now = new Date();
    const today = todayKey(now);
    if (!this.sameDay(today)) return;
    const { contract } = this.view;
    if (!contract) return;
    const result = recordCheckin(contract, today, 'done', { date: addDays(today, -1), hour: this.hourNow(now) });
    if (!result.ok) { this.checkinFailed(result.error); return; }
    const fixing = repairsFor(contract, result.contract, today, builtIn(this.state.game, contract)); // not always everything: see markRepairs in pause-view.js (N per week)
    this.setBusy(true);
    const paid = this.payStep(result.contract, addDays(today, -1), 'done');
    this.commit({ ...this.state, game: paid.game, contracts: this.state.contracts.map((c) => (c.id === contract.id ? result.contract : c)) });
    await this.showStep(fixing, TEXTS.afterYesterday, 'done', paid);
  }

  // «Пауза»: the panel with today's start days and the days still free, for the contract on the screen.
  openPause() {
    if (this.busy) return;
    this.build.close();
    this.newDay();
    const { contract, today } = this.view;
    if (!contract) return;
    const { starts, maxDays } = pauseChoices(contract, today);
    if (!starts.length || maxDays < 1) { this.hud.message(pauseErrorText(starts.length ? 'too_long' : 'outside')); return; }
    this.pauseFor = contract.id;
    this.hud.openPause({
      starts: starts.map((from) => ({ from, label: from === today ? TEXTS.pauseToday : TEXTS.pauseTomorrow })),
      maxDays,
      endFor: (from, days) => dayLabel(pausePreview(contract, from, days)),
    });
  }

  // «Поставить паузу»: addPause with today read now; a refusal is one calm line and the panel stays open.
  setPause(from, days) {
    if (this.busy) return;
    const today = todayKey();
    if (!this.sameDay(today)) return;
    const contract = this.state.contracts.find((c) => c.id === this.pauseFor);
    if (!contract) { this.hud.closePause(); return; }
    const result = addPause(contract, from, days, today);
    if (!result.ok) { this.hud.message(pauseErrorText(result.error)); return; }
    this.commit({ ...this.state, contracts: this.state.contracts.map((c) => (c.id === contract.id ? result.contract : c)) });
    this.hud.closePause();
    this.refresh();
    if (this.view.pausedTo) this.startIdle(); // paused from today: the lizard naps at once
    else this.hud.caption(TEXTS.afterPause(dayLabel(result.contract.endDate)));
  }

  // «Да, переведено»: the owner's word that the debt was transferred (the app never moves money). Saved, then the troll leaves.
  // Never with a stale date or amount: after midnight the panel is redrawn with today's amount and asks again.
  pay() {
    if (this.busy) return;
    const paid = payDebt(this.state, this.view.contract.id, this.view.today, todayKey());
    if (paid.ok) this.commit(paid.state);
    this.refresh();
    if (paid.ok) this.hud.caption(TEXTS.afterPaid);
    else if (paid.error === 'day_changed') this.hud.message(TEXTS.dayChanged);
  }

  // A refused check-in: the day or the debt may have changed under the screen, so redraw it. An open debt shows the payment
  // panel and the troll instead of its error line.
  checkinFailed(error) {
    this.refresh();
    if (error !== 'debt') this.hud.message(TEXTS.errors[error] ?? TEXTS.errors.other);
  }

  // ---------- broken things ----------
  addBroken(item) {
    const [x, y] = at(item.x, item.y);
    this.brokenSprites.set(item.id, this.add.image(x, y, item.key).setOrigin(0.5, 1).setDepth(y));
  }

  // Draws exactly these broken things (what the contract says is broken now); the HUD says so while the habit waits.
  showBroken(items, mode) {
    const ids = new Set(items.map((item) => item.id));
    for (const [id, img] of this.brokenSprites) {
      if (!ids.has(id)) { img.destroy(); this.brokenSprites.delete(id); }
    }
    for (const item of items) if (!this.brokenSprites.has(item.id)) this.addBroken(item);
    if (items.length && mode === 'idle') this.hud.caption(TEXTS.brokenLine);
  }

  stopTimer() { clearInterval(this.ticker); }

  startTimer() {
    this.stopTimer();
    const show = () => this.hud.timer(formatTimer(elapsed(sessionFor(this.state, this.view.contract), Date.now())));
    show();
    this.ticker = setInterval(show, 1000);
  }

  // Back in the app with a session running: refresh the timer and say how long it has been.
  welcomeBack() {
    if (this.view.mode !== 'session') return;
    this.startTimer();
    const minutes = awayMessageMinutes(sessionFor(this.state, this.view.contract), Date.now());
    if (minutes) this.hud.message(TEXTS.away(minutes));
  }

  async beginSession() {
    if (this.busy) return;
    this.newDay();
    const { contract, today } = this.view;
    if (!contract) return;
    const check = recordCheckin(contract, today, 'done'); // today's step must be possible, else the session would be for nothing
    if (!check.ok) { this.checkinFailed(check.error); return; }
    this.commit(startSession(this.state, contract.id, habitOf(contract).theme, Date.now()));
    this.refresh();
    this.startTimer();
    this.sessionRun = this.runSession();
  }

  resumeSession() {
    this.welcomeBack();
    this.sessionRun = this.runSession();
  }

  // Activity after activity until the generation token changes (stopSession).
  async runSession() {
    this.stopIdle();
    const tok = this.tok;
    const theme = sessionFor(this.state, this.view.contract).theme;
    const pool = `activities:${theme}`;
    while (this.alive(tok)) {
      const pick = pickVariant(activityPool(theme), { meter: this.view.meter, last: this.state.game?.last?.[pool] ?? null });
      if (!pick) return;
      this.commit(setLast(this.state, pool, pick.id)); // saved at once, so a reload does not repeat the activity
      this.hud.caption(pick.caption);
      await pick.run(this, tok);
      this.clearLayer();
      if (!this.alive(tok)) return;
      await wait(this, 400);
    }
  }

  // Ends the running activity and hands the lizard back, standing and upright.
  async stopSession() {
    this.stopIdle();
    await this.sessionRun; // the activity ends at its next step
    this.sessionRun = null;
    this.clearLayer();
    this.stopIdle();
  }

  hold(obj) { this.layer.add(obj); return obj; }

  clearLayer() {
    this.layer.forEach((o) => { stopTweens(this, o); o.destroy(); });
    this.layer.clear();
    this.sprouts.forEach((s) => { stopTweens(this, s); s.setScale(1); });
    this.liz.setCrop();
  }

  async finishStep(kind) {
    if (this.busy) return;
    const hadSession = !!this.state.game?.session;
    this.newDay();
    const now = new Date();
    const today = todayKey(now);
    // the running session's own contract, so a session started on the last term day can still be finished after midnight
    const session = this.state.game?.session ?? null;
    if (hadSession && !session) return; // the redraw ended a session that could no longer take a step: no step on another contract
    const contract = session ? sessionContract(this.state, today) : this.view.contract;
    if (!contract) { if (session) this.refresh(); return; } // refresh ends a session whose contract can no longer take a step
    // a session started before midnight counts for its start day while yesterday can still be marked
    const result = stepDate(contract, session ? todayKey(new Date(session.start)) : today, today, now.getHours(), kind);
    if (!result.ok) {
      if (result.error === 'debt' && session) await this.cancelSession(); // the step is refused for the debt: the session ends, the payment panel shows
      this.checkinFailed(result.error);
      return;
    }
    const fixing = repairsFor(contract, result.contract, today, builtIn(this.state.game, contract)); // what this step repairs; a sprite that stays broken is never hidden
    this.setBusy(true);
    const contracts = this.state.contracts.map((c) => (c.id === contract.id ? result.contract : c));
    const paid = this.payStep(result.contract, result.date, kind); // paid for the day the step was recorded for
    this.commit(endSession({ ...this.state, game: paid.game, contracts }));
    sound.play('step');
    this.stopTimer();
    await this.showStep(fixing, kind === 'mini' ? TEXTS.afterMini : TEXTS.afterDone, kind, paid);
  }

  // The gems of a step recorded for `date`: { reward, mine, game } from gems-view; the mine level is read before the step is applied.
  payStep(contract, date, kind) {
    const game = this.state.game ?? DEFAULT_GAME;
    return { ...rewardFor(contract, game, date, kind, this.rng), mine: mineOf(game, contract.id) };
  }

  // The line with the amount, a few gems floating up from the lizard and, on a rare roll, a sparkle (half the particles with reduced motion).
  showGems({ reward, mine }) {
    const parts = rewardLine(reward, mine);
    this.hud.message(TEXTS.gemLine(parts));
    const { x, y } = this.liz;
    const floats = [-6, 0, 6].map((dx, i) => wait(this, i * 150).then(() => float(this, 'gem', x + dx, y - 14, { rise: 20, drift: dx })));
    if (parts.rare) {
      floats.push(burst(this, 'spark', x, y - 8, 16, { angle: { min: 0, max: 360 }, speed: { min: 25, max: 70 }, gravityY: 30, lifespan: 900 }));
      floats.push(burst(this, 'star', x, y - 8, 6, { angle: { min: 200, max: 340 }, speed: { min: 20, max: 50 }, lifespan: 900 }));
    }
    return Promise.all(floats);
  }

  // The chest icon: opens a full storage for the bonus gems, saves, and a chest rises with the line.
  async openChest() {
    if (this.busy) return;
    const today = todayKey();
    if (!this.sameDay(today)) return;
    const { contract } = this.view;
    if (!contract) return;
    const opened = openChestRule(this.state.game ?? DEFAULT_GAME, contract.id);
    if (!opened.ok) { this.refresh(); return; } // the storage is not full any more: show the current screen
    this.commit({ ...this.state, game: opened.game });
    this.refresh();
    this.hud.message(TEXTS.chestOpened(BALANCE.storage.chestGems));
    const { x, y } = this.liz;
    await Promise.all([
      float(this, 'chest', x, y - 14, { rise: 18, ms: 1500 }),
      wait(this, 200).then(() => float(this, 'gem', x - 6, y - 14, { rise: 22, drift: -6 })),
      wait(this, 400).then(() => float(this, 'gem', x + 6, y - 14, { rise: 22, drift: 6 })),
    ]);
  }

  // After a step is saved (busy is on): the repairs of `fixing`, the gems, the celebration, then idle life again.
  async showStep(fixing, after, kind, paid) {
    try {
      await this.stopSession();
      this.keepBroken = true;
      this.keepStage = true; // the stage the step reached shows after the celebration (grow)
      this.refresh();
      this.stopIdle();
      for (const item of fixing) if (!this.brokenSprites.has(item.id)) this.addBroken(item);
      if (fixing.length) wait(this, 900).then(() => sound.play('repair')); // when the lizard reaches the broken thing and starts work
      await playRepairs(this, fixing.map((item) => { const [x, y] = at(item.x, item.y); return { ...item, x, y }; }));
      this.keepBroken = false;
      const { contract, today } = this.view; // redrawn from the saved state after the step: what is still broken stays
      this.showBroken(contract ? viewFor(brokenNow(contract, today, builtIn(this.state.game, contract))) : [], 'done');
      this.hud.caption(after);
      const gems = paid ? this.showGems(paid) : null;
      await playCelebration(this, kind, {});
      this.hud.caption(after);
      await this.grow();
      await gems;
    } finally {
      this.keepBroken = false;
      if (this.keepStage) { this.keepStage = false; this.dressKeeper({ ...this.look, stage: this.view.stage }); }
      this.startIdle();
      this.setBusy(false);
    }
  }

  async cancelSession() {
    if (this.busy) return;
    this.setBusy(true);
    this.commit(endSession(this.state));
    this.stopTimer();
    try {
      await this.stopSession();
      this.refresh();
      this.hud.caption(TEXTS.afterCancel);
    } finally {
      this.startIdle();
      this.setBusy(false);
    }
  }

  setBusy(on) { this.busy = on; this.hud.busy(on); }

  // ---------- idle life ----------
  alive(tok) { return tok === this.tok; }

  // Begins the lizard's own life; any loop already running ends at its next step.
  startIdle() {
    this.stopIdle();
    this.runIdle(this.tok);
  }

  // Ends the idle loop now and leaves the lizard standing, upright and visible, for another card to use.
  stopIdle() {
    this.tok++;
    this.sleeping = false;
    this.peeking = false;
    stopTweens(this, this.liz);
    this.keepers.forEach((o) => o.destroy());
    this.keepers.clear();
    this.liz.setScale(1).setAngle(0).setAlpha(1).play('idle', true);
    this.liz.input.enabled = true;
  }

  keep(obj) { this.keepers.add(obj); return obj; }

  async runIdle(tok) {
    while (this.alive(tok)) {
      if (this.tod === 'night') { await this.sleepInBurrow(tok); continue; }
      if (this.view.pausedTo) { await this.id_nap(tok); continue; } // a paused day: the lizard rests
      const pick = pickIdle(IDLE, this.time.now, this.cool, this.last);
      this.last = pick.id;
      this.cool[pick.id] = this.time.now + pick.cooldownMs;
      await this[`id_${pick.id}`](tok);
      if (!this.alive(tok)) return;
      await wait(this, 500 + Math.random() * 1200);
    }
  }

  // Random walkable spot in the safe area, off the pond and the well.
  randSpot() {
    for (let i = 0; i < 30; i++) {
      const x = 12 + Math.random() * 136;
      const y = 90 + Math.random() * 44;
      const px = (x - POND.x) / (POND.rx + 8);
      const py = (y - POND.y) / (POND.ry + 6);
      if (px * px + py * py < 1 || (x > 130 && y > 118) || keepsOut(x, y) || (this.fire?.img.visible && Math.abs(x - FIRE.x) < 9 && Math.abs(y - FIRE.y) < 7)) continue;
      return at(x, y);
    }
    return at(100, 120);
  }

  async id_wander(tok) { await walkTo(this, this.liz, ...this.randSpot(), 22); }

  async id_look(tok) {
    for (let i = 0; i < 3 && this.alive(tok); i++) {
      await wait(this, 500 + Math.random() * 500);
      if (!this.alive(tok)) return;
      this.liz.setFlipX(Math.random() < 0.5);
    }
  }

  async id_fly(tok) {
    const L = this.liz;
    const side = Math.random() < 0.5 ? -1 : 1;
    const fly = this.keep(this.add.image(L.x + side * 30, L.y - 18, 'fly').setDepth(830));
    this.tweens.add({ targets: fly, x: fly.x + 6, y: fly.y + 3, duration: 300, yoyo: true, repeat: -1 });
    await walkTo(this, L, Phaser.Math.Clamp(L.x + side * 14, OX + 12, OX + 148), L.y, 30);
    if (!this.alive(tok)) return;
    L.setFlipX(side < 0);
    await wait(this, 300);
    if (!this.alive(tok)) return;
    const mouth = { x: L.x + (L.flipX ? -9 : 9), y: L.y - 8 };
    const tongue = this.keep(this.add.graphics().setDepth(831));
    tongue.lineStyle(1, color('U')).lineBetween(mouth.x, mouth.y, fly.x, fly.y);
    await wait(this, 120);
    if (!this.alive(tok)) return;
    this.tweens.killTweensOf(fly);
    tongue.destroy(); fly.destroy();
    this.keepers.delete(tongue); this.keepers.delete(fly);
    burst(this, 'spark', mouth.x, mouth.y - 2, 3, { gravityY: 0, speed: { min: 8, max: 20 }, lifespan: 400 });
    await squash(this, L, 1.05, 0.9, 220);
    if (!this.alive(tok)) return;
    await squash(this, L, 1.05, 0.9, 220);
  }

  async id_drink(tok) {
    const L = this.liz;
    await walkTo(this, L, ...at(84, 118), 26);
    if (!this.alive(tok)) return;
    L.setFlipX(true);
    for (let i = 0; i < 3 && this.alive(tok); i++) {
      await squash(this, L, 1.06, 0.88, 500); // the head dips to the water
      if (!this.alive(tok)) return;
      ripple(this, ...at(78, 118));
      await wait(this, 300);
    }
  }

  async id_sun(tok) {
    const L = this.liz;
    await tween(this, { targets: L, scaleY: 0.8, scaleX: 1.08, duration: 400 });
    for (let i = 0; i < 3 && this.alive(tok); i++) {
      float(this, 'spark', L.x + Math.random() * 10 - 5, L.y - 10, { ms: 900 });
      await wait(this, 700);
    }
    if (this.alive(tok)) await tween(this, { targets: L, scaleY: 1, scaleX: 1, duration: 300 });
  }

  async id_nap(tok) {
    const L = this.liz;
    L.anims.stop();
    L.setTexture(this.frames.blink);
    for (let i = 0; i < 3 && this.alive(tok); i++) {
      float(this, 'zz', L.x + 6, L.y - 12, { drift: 6, ms: 1400 });
      await wait(this, 900);
    }
    if (this.alive(tok)) L.play('idle');
  }

  async id_chase(tok) {
    const L = this.liz;
    const b = this.bflies[Math.floor(Math.random() * this.bflies.length)];
    for (let i = 0; i < 2 && this.alive(tok); i++) {
      await walkTo(this, L, Phaser.Math.Clamp(b.x, OX + 12, OX + 148), Phaser.Math.Clamp(b.y + 30, OY + 90, OY + 134), 40);
      if (!this.alive(tok)) return;
      await hop(this, L, 8, 260);
      this.flyButterfly(b, true);
    }
  }

  async sleepInBurrow(tok) {
    const L = this.liz;
    const [bx, by] = at(BURROW.x, BURROW.y + 2);
    await walkTo(this, L, bx, by, 24);
    if (!this.alive(tok)) return;
    this.sleeping = true;
    L.anims.stop();
    L.setTexture(this.frames.blink);
    L.input.enabled = false; // the burrow gets the taps while the lizard sleeps inside
    await tween(this, { targets: L, alpha: 0, duration: 300 });
    while (this.alive(tok) && this.tod === 'night') {
      float(this, 'zz', bx + 4, by - 12, { drift: 6, ms: 1600 });
      await wait(this, 1500);
    }
    if (!this.alive(tok)) return;
    this.sleeping = false;
    L.input.enabled = true;
    L.setAlpha(1).play('idle');
    await walkTo(this, L, ...at(130, 92), 24);
  }
}
