#!/usr/bin/env node
// The board, derived from files and git. No GitHub Project, no network.
// Status of a card:  Done        a commit on main whose subject starts with "C-NNN:" (the squash merge)
//                    Dropped     cards.log has a "dropped" event (superseded; never worked on again)
//                    Blocked     the last blocked/unblocked event in cards.log is "blocked"
//                    In review   the last attempt/pr/review event in cards.log is "pr"
//                    In progress a card branch card/C-NNN-... exists, or cards.log has an attempt
//                    Backlog     none of the above
// cards.log lines: DATE | C-NNN | EVENT | VALUE | NOTE   (see process/board.md)
// Usage: node scripts/board.mjs [--json]
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readCards, CARD_ID, CARD_BRANCH, CARD_SETS, pathsOverlap, TIERS, CEILINGS, WORKER_FOR_TIER, nextTier, EXTERNAL_AGENTS, EXTERNAL_CEILING,
  VENDOR, ensureFullHistory, IMPLEMENTER, FALLBACK, ADVISOR } from './cards.mjs';

export const LOG_FILE = 'cards.log';
// Event -> test for its VALUE column (process/board.md describes the same table).
export const EVENT_SPEC = {
  attempt: { value: (v) => TIERS.includes(v) || EXTERNAL_AGENTS.includes(v), want: [...TIERS, ...EXTERNAL_AGENTS].join('|') },
  escalate: { value: (v) => TIERS.includes(v), want: TIERS.join('|') },
  pr: { value: (v) => /^\d+$/.test(v), want: 'the pull request number' },
  simplify: { value: (v) => v === 'changed' || v === 'clean', want: 'changed|clean' },
  review: { value: (v) => v === 'pass' || v === 'fail', want: 'pass|fail' },
  blocked: { value: (v) => v === '-', want: '-' },
  unblocked: { value: (v) => v === '-', want: '-' },
  dropped: { value: (v) => v === '-', want: '-' },
  advice: { value: (v) => v === ADVISOR, want: ADVISOR },
  checklist: { value: (v) => v === 'plan' || v === 'accept', want: 'plan|accept' },
  security: { value: (v) => v === 'pass' || v === 'fail', want: 'pass|fail' },
  switch: { value: (v) => v === FALLBACK, want: FALLBACK },
  // A Cursor run that never reached the card (crash, approval stall, broken setup) does not count toward the ceiling.
  void: { value: (v) => v === IMPLEMENTER, want: IMPLEMENTER },
};
export const STATUSES = ['Backlog', 'In progress', 'In review', 'Blocked', 'Done', 'Dropped'];
export const WIP_LIMITS = { 'In progress': 3, 'In review': 2 };
const DONE_SUBJECT = new RegExp(`^(${CARD_ID}):`);

// Returns { events, problems }. Comment lines (#) and blank lines are skipped.
export function parseLog(text) {
  const events = [];
  const problems = [];
  String(text ?? '').replace(/\r/g, '').split('\n').forEach((line, i) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return;
    const parts = line.split('|').map((x) => x.trim());
    if (parts.length < 4) { problems.push(`${LOG_FILE}:${i + 1}: want "DATE | C-NNN | EVENT | VALUE | NOTE"`); return; }
    const [date, card, event, value, ...rest] = parts;
    events.push({ line: i + 1, date, card, event, value, note: rest.join(' | ') });
  });
  return { events, problems };
}

export function readLog(root) {
  const p = join(root, LOG_FILE);
  return parseLog(existsSync(p) ? readFileSync(p, 'utf8') : '');
}

// Replays the log once: per card the current tier and attempts per tier, plus every rule violation.
// Invalid events are reported and ignored, so the board and check-kit always agree on the state.
export function replayLog(events, cards) {
  const state = new Map(cards.map((c) => [c.id, { current: c.start_tier, attempts: Object.fromEntries([...TIERS, ...EXTERNAL_AGENTS].map((t) => [t, 0])),
    extra: 0, kit3: c.agent !== undefined, workerVendor: null, switched: false }]));
  const problems = [];
  for (const e of events) {
    const w = `${LOG_FILE}:${e.line}`;
    const fail = (msg) => problems.push(`${w}: ${msg}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) fail(`date "${e.date}" is not YYYY-MM-DD`);
    const s = state.get(e.card);
    if (!s) { fail(`card "${e.card}" has no card file`); continue; }
    const spec = EVENT_SPEC[e.event];
    if (!spec) { fail(`event "${e.event}" not in ${Object.keys(EVENT_SPEC).join('|')}`); continue; }
    if (!spec.value(e.value)) { fail(`${e.event} value "${e.value}" must be ${spec.want}`); continue; }
    if (e.event === 'checklist' && !/^(pass|fail)\b/.test(e.note)) fail('checklist note must start with pass or fail');
    if (e.event === 'void') {
      if (!/^setup: \S/.test(e.note)) fail('void note must start with "setup: <what failed>"');
      else if (s.attempts[IMPLEMENTER] < 1) fail(`void without a ${IMPLEMENTER} attempt to cancel`);
      else s.attempts[IMPLEMENTER] -= 1;
    }
    if (e.event === 'switch') {
      if (s.attempts[IMPLEMENTER] < EXTERNAL_CEILING) fail(`switch to ${FALLBACK} after ${s.attempts[IMPLEMENTER]} ${IMPLEMENTER} attempt(s); needs ${EXTERNAL_CEILING}`);
      else s.switched = true;
    } else if (e.event === 'attempt' && s.kit3 && TIERS.includes(e.value) && !s.switched) {
      fail(`attempt on ${e.value} before the switch: ${FALLBACK} works a card only after ${EXTERNAL_CEILING} ${IMPLEMENTER} attempts`);
    }
    if (e.event === 'attempt' && EXTERNAL_AGENTS.includes(e.value)) {
      if (!s.kit3) fail(`attempt by ${e.value} needs a card with an agent field (kit 3)`);
      else if (++s.attempts[e.value] > EXTERNAL_CEILING) fail(`${e.card} has ${s.attempts[e.value]} attempts on ${e.value}, ceiling ${EXTERNAL_CEILING}; switch the agent or block`);
      s.workerVendor = VENDOR[e.value];
    } else if (e.event === 'review' && s.kit3) {
      // Kit 3: the note starts with the reviewer id; a reviewer of the worker's own vendor needs a written reason.
      const reviewer = e.note.trim().split(/\s+/)[0]?.toLowerCase();
      if (!VENDOR[reviewer]) fail(`review note must start with the reviewer (${Object.keys(VENDOR).join('|')})`);
      else if (VENDOR[reviewer] === s.workerVendor && !/same-vendor:/.test(e.note)) {
        fail(`reviewer ${reviewer} is the same vendor as the worker; use another vendor or write "same-vendor: <reason>"`);
      }
    } else if (e.event === 'attempt') {
      s.workerVendor = VENDOR[e.value];
      if (e.value !== s.current) fail(`attempt on tier "${e.value}" but ${e.card} is on tier "${s.current}"`);
      else if (++s.attempts[e.value] > CEILINGS[e.value] + s.extra) {
        fail(`${e.card} has ${s.attempts[e.value]} attempts on ${e.value}, ceiling ${CEILINGS[e.value] + s.extra}; escalate or block first`);
      }
    } else if (e.event === 'escalate') {
      if (e.value !== nextTier(s.current)) fail(`escalate to "${e.value}" must go to the next tier after "${s.current}" (${nextTier(s.current) ?? 'none'})`);
      else s.current = e.value;
    } else if (e.event === 'unblocked' && nextTier(s.current) === null && s.attempts[s.current] >= CEILINGS[s.current] + s.extra) {
      s.extra += 1; // the owner's answer to a top-tier block allows exactly one more attempt (process/ranking.md)
    }
  }
  for (const c of cards) {
    if (c.agent === FALLBACK && !state.get(c.id).switched) problems.push(`${c.id}: agent ${FALLBACK} needs a "switch" event after ${EXTERNAL_CEILING} ${IMPLEMENTER} attempts (process/agents.md)`);
  }
  return { state, problems };
}

// Tier view of one card's replayed state.
export function tierState({ current, attempts, extra = 0 }) {
  const used = attempts[current] ?? 0;
  const ceiling = (CEILINGS[current] ?? 0) + (nextTier(current) === null ? extra : 0);
  const atCeiling = used >= ceiling;
  const top = nextTier(current) === null;
  return { current, used, ceiling, worker: WORKER_FOR_TIER[current], mustEscalate: atCeiling && !top, mustBlock: atCeiling && top };
}

// own: this card's events; doneIds: card ids squash-merged into main; branchIds: card ids with a card branch.
export function cardStatus(card, own, doneIds, branchIds) {
  if (doneIds.has(card.id)) return 'Done';
  if (own.some((e) => e.event === 'dropped')) return 'Dropped';
  const lastBlock = own.filter((e) => e.event === 'blocked' || e.event === 'unblocked').at(-1);
  if (lastBlock?.event === 'blocked') return 'Blocked';
  const lastWork = own.filter((e) => ['attempt', 'pr', 'review'].includes(e.event)).at(-1);
  if (lastWork?.event === 'pr') return 'In review';
  if (branchIds.has(card.id) || own.some((e) => e.event === 'attempt')) return 'In progress';
  return 'Backlog';
}

// Pull order: Backlog cards whose dependencies are all Done, by priority, then card id.
const rank = (p) => (CARD_SETS.priority.includes(p) ? CARD_SETS.priority.indexOf(p) : CARD_SETS.priority.length);
export function readyQueue(rows) {
  const done = new Set(rows.filter((r) => r.status === 'Done').map((r) => r.id));
  return rows
    .filter((r) => r.status === 'Backlog' && r.depends_on.every((d) => done.has(d)))
    .sort((a, b) => rank(a.priority) - rank(b.priority) || a.id.localeCompare(b.id))
    .map((r) => r.id);
}

export function buildBoard(cards, events, doneIds, branchIds) {
  const valid = cards.filter((c) => !c.invalid);
  const { state, problems } = replayLog(events, valid);
  const byCard = Map.groupBy(events, (e) => e.card);
  const rows = valid.map((c) => {
    const t = tierState(state.get(c.id));
    return {
      id: c.id, title: c.title, priority: c.priority, size: c.size, risk: c.risk, depends_on: c.depends_on, agent: c.agent ?? null,
      allowed_paths: c.allowed_paths, start_tier: c.start_tier, tier: t.current, worker: t.worker,
      attempts: t.used, ceiling: t.ceiling, status: cardStatus(c, byCard.get(c.id) ?? [], doneIds, branchIds),
      mustEscalate: t.mustEscalate, mustBlock: t.mustBlock,
    };
  });
  const warnings = [];
  for (const [status, limit] of Object.entries(WIP_LIMITS)) {
    const n = rows.filter((r) => r.status === status).length;
    if (n > limit) warnings.push(`WIP: ${n} cards ${status}, limit ${limit}`);
  }
  const active = rows.filter((r) => r.status === 'In progress' || r.status === 'In review');
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const shared = active[i].allowed_paths.filter((p) => active[j].allowed_paths.some((q) => pathsOverlap(p, q)));
      if (shared.length) warnings.push(`${active[i].id} and ${active[j].id} run in parallel but share ${shared.join(', ')}`);
    }
  }
  for (const r of rows.filter((x) => !['Done', 'Blocked', 'Dropped'].includes(x.status))) {
    if (r.mustEscalate) warnings.push(`${r.id}: ${r.attempts}/${r.ceiling} attempts on ${r.tier}, escalate before the next attempt`);
    if (r.mustBlock) warnings.push(`${r.id}: opus ceiling reached, mark Blocked and ask the owner`);
  }
  return { rows, ready: readyQueue(rows), warnings, logProblems: problems };
}

// Share of a wish that is finished, for the one-line status to the owner (process/agents.md). Dropped cards do not count.
export const STATUS_WEIGHT = { Backlog: 0, 'In progress': 30, Blocked: 30, 'In review': 70, Done: 100 };
export function progress(rows, ids) {
  const picked = rows.filter((r) => ids.includes(r.id) && r.status !== 'Dropped');
  const percent = picked.length ? Math.round(picked.reduce((s, r) => s + STATUS_WEIGHT[r.status], 0) / picked.length) : 0;
  return { percent, done: picked.filter((r) => r.status === 'Done').length, total: picked.length };
}

// The owner's status lines while cards run: who works on which card, nothing else (process/agents.md).
export const whoLines = (rows, ids) => ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean)
  .map((r) => `${r.agent ?? FALLBACK} → ${r.id} ${r.title}`);

function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; }
}

export function gitFacts(root) {
  const refs = git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes']).split('\n').filter(Boolean);
  const main = ['origin/main', 'main'].find((r) => refs.includes(r));
  const doneIds = new Set();
  if (main) {
    for (const s of git(root, ['log', main, '--format=%s']).split('\n')) {
      const m = s.match(DONE_SUBJECT);
      if (m) doneIds.add(m[1]);
    }
  }
  const branchIds = new Set(refs.map((r) => r.replace(/^origin\//, '').match(CARD_BRANCH)?.[1]).filter(Boolean));
  return { main, doneIds, branchIds };
}

function main(argv) {
  const root = process.env.KIT_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
  try { ensureFullHistory(root); } catch (e) { console.error(`board: ${e.message}`); return 1; }
  const cards = readCards(root);
  const { events, problems } = readLog(root);
  const facts = gitFacts(root);
  const board = buildBoard(cards, events, facts.doneIds, facts.branchIds);
  const pick = argv[argv.indexOf('--progress') + 1];
  if (argv.includes('--progress')) {
    const ids = String(pick ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const unknown = ids.filter((id) => !board.rows.some((r) => r.id === id));
    if (!ids.length || unknown.length) { console.error(`board: --progress needs card ids on the board (C-NNN,C-NNN); unknown: ${unknown.join(', ') || 'none given'}`); return 1; }
    const p = progress(board.rows, ids);
    console.log(`Status: ${p.percent}% (${p.done}/${p.total} done)`);
    return 0;
  }
  if (argv.includes('--who')) {
    const ids = String(argv[argv.indexOf('--who') + 1] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const lines = whoLines(board.rows, ids);
    if (!ids.length || lines.length !== ids.length) { console.error('board: --who needs card ids on the board (C-NNN,C-NNN)'); return 1; }
    console.log(lines.join('\n'));
    return 0;
  }
  if (argv.includes('--json')) {
    board.logProblems.unshift(...problems);
    console.log(JSON.stringify({ main: facts.main ?? null, ...board }, null, 2));
    return 0;
  }
  console.log(`Board (main ref: ${facts.main ?? 'none yet'}; ${cards.length} card(s))`);
  for (const status of STATUSES) {
    const rows = board.rows.filter((r) => r.status === status);
    console.log(`\n${status} (${rows.length})`);
    for (const r of rows) {
      const who = r.agent && r.agent !== 'claude-code' ? `agent ${r.agent}` : `tier ${r.tier} (${r.worker}) attempts ${r.attempts}/${r.ceiling}`;
      console.log(`  ${r.id} ${r.priority} ${r.size}/${r.risk} ${who}  ${r.title}`);
    }
  }
  console.log(`\nNext to pull: ${board.ready.join(', ') || 'nothing'}`);
  for (const w of [...problems, ...board.logProblems, ...board.warnings]) console.log(`WARNING: ${w}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
