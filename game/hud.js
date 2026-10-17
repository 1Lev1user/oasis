// The HUD under the oasis (DOM in #hud): the habit, its strength, one caption line and the buttons for the current mode.
// It only shows what it is given and reports taps; the rules live in app/lib and the flow in the scene. Texts come from texts/oasis.js.
import { TEXTS } from './texts/oasis.js';
import { TEXTS as SETUP } from './texts/setup.js';
import { TEXTS as COACH } from './texts/quests.js';
import { TEXTS as VILLAGE } from './texts/village.js';
import { TEXTS as BUILD } from './texts/build.js';
import { TEXTS as CHEST } from './texts/chest.js';
import { TEXTS as SETTINGS } from './texts/settings.js';
import { TEXTS as HELP } from './texts/help.js';

const MESSAGE_MS = 6000;

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export const button = (className, text, onTap) => {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onTap);
  return b;
};

// The small gear that opens the settings (the oasis and the village): a pixel gear drawn in CSS (.gear), named for screen readers.
export function gearButton(onTap) {
  const b = button('b-small gear', '', onTap);
  b.setAttribute('aria-label', SETTINGS.gear);
  return b;
}

// The «?» next to the gear, and the two together as the row at the bottom right (the oasis and the village).
export function toolIcons(onHelp, onGear) {
  const help = button('b-small px help', '?', onHelp);
  help.setAttribute('aria-label', HELP.gear);
  const row = el('div', 'icons');
  row.append(help, gearButton(onGear));
  return row;
}

// on: { create, help, start, mini, already, finish, cancel, pay, yesterday, noYesterday, openPause, pause(from, days), quest(id), chest, village,
//   openEnd, transfer(contractId) }.
// Returns { render, caption, message, timer, busy, openPause, closePause, destroy }.
export function createHud(root, on) {
  const villageBtn = button('b-small px village-link', VILLAGE.toVillage, () => on.village());
  villageBtn.hidden = true;
  const habit = el('h2', 'hud-habit px');
  const mainPoint = el('p', 'hud-point');
  const empty = el('p', 'hud-empty', SETUP.noHabit);
  const createBtn = button('b-main px', SETUP.createHabit, on.create);
  const helpLink = button('link-btn', HELP.link, on.help); // the empty oasis only: what the game is, before the first habit
  const meterValue = el('span', 'px');
  const gems = el('span', 'gems px');
  const bar = el('div', 'bar');
  bar.setAttribute('role', 'img');
  const segments = Array.from({ length: 20 }, () => bar.appendChild(el('i')));
  const meterRow = el('div', 'row');
  const figures = el('span', 'figures');
  figures.append(gems, meterValue);
  meterRow.append(el('span', '', TEXTS.meterLabel), figures);
  const meter = el('div', 'meter');
  const stakes = el('p', 'stakes');
  const chestBtn = button('b-small px chest', TEXTS.chestFull, () => on.chest());
  chestBtn.hidden = true;
  meter.append(meterRow, chestBtn, bar, stakes);

  const comeback = el('p', 'comeback');

  // The end of the term: «Открыть сундук» instead of the step buttons, or the preliminary result while the last day can still be marked.
  const ending = el('section', 'coach');
  const endTitle = el('h3', 'coach-title', CHEST.previewTitle);
  const endList = el('ul', 'coach-points');
  const endWhen = el('p', 'debt-note');
  const openEndBtn = button('b-main px', CHEST.open, () => on.openEnd());
  ending.append(endTitle, endList, endWhen);

  // Owed at term end: a calm line per closed contract still owing, with its «Деньги переведены» (honour system).
  const owed = el('ul', 'quests owed');
  let owedKey = '';
  function drawOwed(list) {
    const key = JSON.stringify(list);
    if (key === owedKey) return;
    owedKey = key;
    owed.replaceChildren(...list.map((r) => {
      const item = el('li', 'owed-line');
      const b = button('b-small px', CHEST.transferred, () => on.transfer(r.contractId));
      b.disabled = isBusy;
      item.append(el('span', 'debt-to', r.text), b);
      return item;
    }));
  }

  // "Mark yesterday" offer (until 12:00): «Да» calls on.yesterday, «Нет» on.noYesterday.
  const offer = el('section', 'offer');
  const offerBtns = el('div', 'btns');
  offerBtns.append(button('b-main px', TEXTS.yesterdayYes, () => on.yesterday()), button('b-sec px', TEXTS.yesterdayNo, () => on.noYesterday()));
  offer.append(el('p', 'offer-ask', TEXTS.yesterdayAsk), offerBtns);

  // The coach: the small quests (tap = done) and, after a miss, the owner's own if-then points and why.
  const questsTitle = el('h3', 'coach-title', COACH.title);
  const questList = el('ul', 'quests');
  const quests = el('section', 'coach');
  quests.append(questsTitle, questList);
  const missTitle = el('h3', 'coach-title', COACH.missTitle);
  const missList = el('ul', 'coach-points');
  const whyLabel = el('p', 'coach-title', COACH.whyLabel);
  const whyText = el('p', 'coach-why');
  const miss = el('section', 'coach');
  miss.append(missTitle, missList, whyLabel, whyText);

  const timer = el('span', 'timer px', '00:00');
  timer.setAttribute('role', 'timer');
  timer.setAttribute('aria-label', TEXTS.timerLabel);
  const text = el('span', 'cap-text');
  const caption = el('div', 'caption');
  caption.append(timer, text);
  text.setAttribute('aria-live', 'polite');

  const note = el('p', 'hint');
  note.setAttribute('role', 'status');
  note.hidden = true;

  const idle = el('div', 'actions');
  const row = el('div', 'btns');
  const startBtn = button('b-main px', TEXTS.start, on.start);
  const miniBtn = button('b-sec px', TEXTS.mini, on.mini);
  const alreadyBtn = button('b-small px', TEXTS.already, on.already);
  const pauseBtn = button('b-small px', TEXTS.pause, () => on.openPause());
  const tools = el('div', 'tools');
  tools.append(alreadyBtn, pauseBtn);
  row.append(startBtn, miniBtn);
  idle.append(row);
  const pausedNote = el('p', 'paused-note');

  const session = el('div', 'btns');
  const finishBtn = button('b-main px', TEXTS.finish, on.finish);
  const cancelBtn = button('b-sec px', TEXTS.cancel, on.cancel);
  session.append(finishBtn, cancelBtn);

  const doneNote = el('p', 'step-done px', TEXTS.stepDone);

  // Debt: replaces the step buttons. «Деньги переведены» asks once more; only «Да, переведено» calls on.pay (honour system).
  const debt = el('section', 'debt');
  debt.setAttribute('aria-label', TEXTS.debtLabel);
  const dueValue = el('span', 'px');
  const dueRow = el('div', 'row');
  dueRow.append(el('span', '', TEXTS.debtLabel), dueValue);
  const debtTo = el('p', 'debt-to');
  const paidBtn = button('b-main px', TEXTS.paid, () => askPaid(true));
  const ask = el('p', 'debt-ask', TEXTS.paidAsk); // stands where the button was, so a double tap does not confirm
  ask.tabIndex = -1;
  const confirm = el('div', 'btns');
  confirm.append(button('b-main px', TEXTS.paidYes, () => on.pay()), button('b-sec px', TEXTS.paidBack, () => askPaid(false)));
  debt.append(dueRow, debtTo, el('p', 'debt-note', TEXTS.debtNote), paidBtn, ask, confirm);
  function askPaid(asking) {
    paidBtn.hidden = asking;
    ask.hidden = confirm.hidden = !asking;
    if (asking) ask.focus();
    else if (document.activeElement && debt.contains(document.activeElement)) paidBtn.focus();
  }

  // Pause panel: start day, days 1..maxDays, the new end date; «Поставить паузу» calls on.pause(from, days).
  const panel = el('section', 'pause');
  panel.setAttribute('aria-label', TEXTS.pause);
  panel.hidden = true;
  let stepperLimits = null; // keeps the pause stepper's − and + disabled at their limits when busy(false) enables every button
  function openPause({ starts, maxDays, endFor }) {
    let from = starts[0].from;
    let days = 1;
    const title = el('h3', 'pause-title px', TEXTS.pauseTitle);
    title.tabIndex = -1;
    const startRow = el('div', 'q-chips');
    startRow.setAttribute('role', 'group');
    startRow.setAttribute('aria-label', TEXTS.pauseStart);
    const startBtns = starts.map((s) => button('q-chip', s.label, () => { from = s.from; show(); }));
    startRow.append(...startBtns);
    const less = button('q-chip px', '−', () => { days = Math.max(1, days - 1); show(); });
    const more = button('q-chip px', '+', () => { days = Math.min(maxDays, days + 1); show(); });
    less.setAttribute('aria-label', TEXTS.pauseLess);
    more.setAttribute('aria-label', TEXTS.pauseMore);
    const out = el('output', 'p-out px');
    const step = el('div', 'p-step');
    step.setAttribute('role', 'group');
    step.setAttribute('aria-label', TEXTS.pauseDays);
    step.append(less, out, more);
    const end = el('p', 'pause-end');
    end.setAttribute('aria-live', 'polite');
    const actions = el('div', 'btns');
    actions.append(button('b-main px', TEXTS.pauseSet, () => on.pause(from, days)), button('b-sec px', TEXTS.pauseCancel, closePause));
    function limits() {
      less.disabled = days <= 1;
      more.disabled = days >= maxDays;
    }
    function show() {
      startBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(starts[i].from === from)));
      out.textContent = String(days);
      limits();
      end.textContent = TEXTS.pauseEnd(endFor(from, days));
    }
    stepperLimits = limits;
    panel.replaceChildren(title, el('p', 'q-label', TEXTS.pauseStart), startRow, el('p', 'q-label', TEXTS.pauseDays), step, end, actions);
    show();
    panel.hidden = false;
    if (last) render(last);
    title.focus();
  }
  function closePause() {
    if (panel.hidden) return;
    const refocus = panel.contains(document.activeElement);
    panel.hidden = true;
    stepperLimits = null;
    panel.replaceChildren();
    if (last) render(last);
    if (refocus && !pauseBtn.hidden) pauseBtn.focus();
  }

  root.replaceChildren(villageBtn, habit, mainPoint, empty, createBtn, helpLink, meter, comeback, openEndBtn, ending, owed, offer, quests, miss, caption, note, idle, pausedNote, session, debt, doneNote, tools, panel);

  let noteTimer = 0;
  let last = null;
  let isBusy = false;
  let coachKey = '';

  // Redraws the quest list only when the coach view changed, so a tap is never lost to a redraw of the same list.
  function drawQuests(coach) {
    const key = JSON.stringify(coach);
    if (key === coachKey) return;
    coachKey = key;
    const open = new Set(coach.quests.map((q) => q.text));
    const kept = coach.evePoints.filter((text) => !open.has(text)); // preparation points whose quest is done today (coachView counts only today's daily ids)
    questList.replaceChildren(
      ...kept.map((text) => el('li', 'quest-done', text)),
      ...coach.quests.map((q) => {
        const item = el('li');
        const b = button('quest', '', () => on.quest(q.id));
        b.append(el('span', 'q-box'), el('span', 'q-text', q.text), el('span', 'q-gems px', COACH.reward(q.gems)));
        b.disabled = isBusy;
        item.append(b);
        return item;
      }),
    );
    missList.replaceChildren(...coach.missPoints.map((text) => el('li', '', text)));
    whyText.textContent = coach.why;
  }
  // view: { mode: none | idle | session | done, habit, meterText, filled, stakes, comeback, debt: { due, antiGoal } | null,
  //   yesterday: true while yesterday can be marked, paused: the paused-today line or null, gems: the gem count, chest: true while the storage is full,
  //   coach: coachView() result, village: true with two or more habits to show (the way back to the village),
  //   ending: { ready: true } once the chest can be opened, { lines, opensAt } for the preliminary result, else null,
  //   owed: [{ contractId, text }] reminders of what closed contracts still owe }
  function render(view) {
    last = view;
    const { mode } = view;
    villageBtn.hidden = !view.village;
    habit.textContent = view.habit ?? '';
    habit.hidden = meter.hidden = mode === 'none';
    gems.textContent = `◆ ${view.gems ?? 0}`;
    gems.setAttribute('aria-label', `${COACH.gems}: ${view.gems ?? 0}`);
    chestBtn.hidden = mode === 'none' || !view.chest;
    mainPoint.textContent = view.coach?.mainPoint ?? '';
    mainPoint.hidden = mode === 'none' || !mainPoint.textContent;
    empty.hidden = createBtn.hidden = helpLink.hidden = mode !== 'none';
    meterValue.textContent = view.meterText ?? '';
    bar.setAttribute('aria-label', `${TEXTS.meterLabel} ${view.meterText ?? ''}`);
    segments.forEach((s, i) => s.classList.toggle('on', i < (view.filled ?? 0)));
    const steps = mode === 'idle' || mode === 'done';
    const pausing = !panel.hidden;
    offer.hidden = !steps || !view.yesterday || pausing; // the pause panel stands alone while it is open
    timer.hidden = mode !== 'session';
    const closing = mode !== 'none' && !!view.ending;
    const ready = closing && !!view.ending.ready;
    text.textContent = ready ? CHEST.standing : mode === 'idle' || mode === 'done' ? TEXTS.idleCaption : '';
    ending.hidden = !closing || ready;
    openEndBtn.hidden = !ready;
    if (closing && !ready) {
      endList.replaceChildren(...view.ending.lines.map((line) => el('li', '', line)));
      endWhen.textContent = view.ending.opensAt;
    }
    drawOwed(view.owed ?? []);
    owed.hidden = !view.owed?.length;
    stakes.textContent = view.stakes ?? '';
    stakes.hidden = !view.stakes;
    comeback.textContent = view.comeback ?? '';
    comeback.hidden = mode === 'none' || !view.comeback;
    const owing = mode !== 'none' && !!view.debt;
    debt.hidden = !owing;
    if (owing) {
      dueValue.textContent = view.debt.due;
      debtTo.textContent = TEXTS.debtTo(view.debt.due, view.debt.antiGoal);
      askPaid(false);
    }
    const resting = mode === 'idle' && !owing && !!view.paused; // paused today: the line stands instead of the step buttons
    pausedNote.textContent = view.paused ?? '';
    pausedNote.hidden = !resting;
    caption.hidden = mode === 'none' || resting;
    idle.hidden = mode !== 'idle' || owing || resting || pausing || closing;
    session.hidden = mode !== 'session' || owing;
    doneNote.hidden = mode !== 'done';
    alreadyBtn.hidden = mode !== 'idle' || owing || resting || closing;
    pauseBtn.hidden = !steps || closing;
    tools.hidden = pausing || (alreadyBtn.hidden && pauseBtn.hidden);
    const coaching = steps && !owing && !pausing && !!view.coach;
    if (view.coach) drawQuests(view.coach);
    quests.hidden = !coaching || !(questList.childElementCount);
    miss.hidden = !coaching || !(view.coach.missPoints.length || view.coach.why);
    missList.hidden = !view.coach?.missPoints.length;
    whyLabel.hidden = whyText.hidden = !view.coach?.why;
    if (!steps || closing) closePause();
  }

  return {
    render,
    caption(line) { text.textContent = line; },
    timer(line) { timer.textContent = line; },
    // One calm line (an error or a notice) that goes away by itself.
    message(line) {
      note.textContent = line;
      note.hidden = false;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { note.hidden = true; }, MESSAGE_MS);
    },
    busy(now) {
      isBusy = now;
      root.querySelectorAll('button').forEach((b) => { b.disabled = now; });
      if (!now && stepperLimits) stepperLimits();
    },
    openPause,
    closePause,
    destroy() { clearTimeout(noteTimer); root.replaceChildren(); },
  };
}

// The «Стройка» panel: the mine, the storage and the effect buildings as lines (build-view.js rows()), a button on the lines that can be
// acted on. on: { upgrade, build(id), close }. Returns { node, render({ gems, rows }), open, close, message, destroy }.
export function createBuildPanel(on) {
  const title = el('h3', 'pause-title px', BUILD.title);
  title.tabIndex = -1;
  const gems = el('span', 'gems px');
  const head = el('div', 'build-head');
  head.append(title, gems);
  const status = el('p', 'hint');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const list = el('ul', 'quests');
  const node = el('section', 'build');
  node.setAttribute('aria-label', BUILD.title);
  node.hidden = true;
  node.append(head, status, list, button('b-sec px', BUILD.close, () => on.close()));
  let timer = 0;
  let focusId = null; // the line whose button was tapped: its button (or the title) takes the focus after the redraw
  let drawn = '';

  const line = (r) => {
    const box = el('div', 'district');
    box.append(el('span', 'd-name', r.name), el('span', 'd-meta', r.meta));
    if (r.slots) {
      const pips = el('div', 'pips');
      pips.style.setProperty('--slots', String(r.slots));
      pips.setAttribute('role', 'img');
      pips.setAttribute('aria-label', BUILD.storageLabel(r.filled, r.slots));
      for (let i = 0; i < r.slots; i++) pips.append(el('i', i < r.filled ? 'on' : ''));
      box.append(pips);
    }
    const item = el('li');
    if (!r.action) { item.append(box); return item; }
    const act = button('b-sec px', r.action === 'upgrade' ? BUILD.upgrade : BUILD.build, () => { focusId = r.id; if (r.action === 'upgrade') on.upgrade(); else on.build(r.id); });
    act.dataset.row = r.id;
    const pair = el('div', 'btns');
    pair.append(box, act);
    item.append(pair);
    return item;
  };

  return {
    node,
    isOpen: () => !node.hidden,
    open() { node.hidden = false; title.focus(); },
    close() { node.hidden = true; status.hidden = true; },
    render(view) {
      const key = JSON.stringify(view);
      if (key !== drawn) {
        drawn = key;
        gems.textContent = `◆ ${view.gems}`;
        gems.setAttribute('aria-label', `${BUILD.gems}: ${view.gems}`);
        list.replaceChildren(...view.rows.map(line));
      }
      if (focusId === null) return;
      (list.querySelector(`[data-row="${focusId}"]`) ?? title).focus();
      focusId = null;
    },
    message(text) {
      status.textContent = text;
      status.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(() => { status.hidden = true; }, MESSAGE_MS);
    },
    destroy() { clearTimeout(timer); },
  };
}
