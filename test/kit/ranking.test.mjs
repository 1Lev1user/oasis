// Tests for the tier ranking (scripts/cards.mjs), the event log and board (scripts/board.mjs), and their check-kit rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseCard, minimumTier, hasAutomaticCheck } from '../../scripts/cards.mjs';
import { parseLog, replayLog, tierState, cardStatus, readyQueue, buildBoard } from '../../scripts/board.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const cardText = ({ id = 'C-001', size = 'S', risk = 'low', priority = 'P1', tier = 'haiku', deps = '[]', paths = ['src/a.js'],
  acceptance = ['`npm test` exits 0', '`node --test test/a.test.js` exits 0'] } = {}) => `---
id: ${id}
title: "Card ${id}"
story_step: S1.1
size: ${size}
priority: ${priority}
risk: ${risk}
start_tier: ${tier}
depends_on: ${deps}
allowed_paths:
${paths.map((p) => `  - ${p}`).join('\n')}
test_edits: []
---

## Goal
Something works.

## Acceptance
${acceptance.map((a) => `- ${a}`).join('\n')}

## Do not touch
- existing tests

## Notes
None.
`;
const card = (o) => parseCard(cardText(o), `cards/${o?.id ?? 'C-001'}.md`);
const ev = (rest, id = 'C-001') => `2026-10-07 | ${id} | ${rest}`;
const log = (lines) => parseLog(lines.join('\n')).events;
const problemsOf = (lines, cards) => replayLog(log(lines), cards).problems.join('\n');
const stateOf = (c, lines) => tierState(replayLog(log(lines), [c]).state.get(c.id));

test('minimum tier follows size, risk and automatic checks', () => {
  assert.equal(minimumTier(card({})), 'haiku');
  assert.equal(minimumTier(card({ risk: 'medium' })), 'sonnet');
  assert.equal(minimumTier(card({ size: 'M' })), 'sonnet');
  assert.equal(minimumTier(card({ size: 'L' })), 'sonnet');
  assert.equal(minimumTier(card({ risk: 'high' })), 'opus');
  assert.equal(minimumTier(card({ acceptance: ['`npm test` exits 0'] })), 'sonnet');
  assert.equal(hasAutomaticCheck(card({ acceptance: ['`npm test` exits 0', 'Manual (owner): looks right'] })), false);
});

test('parseLog skips comments and reports short lines', () => {
  const { events, problems } = parseLog('# header\n\n2026-10-07 | C-001 | attempt | haiku | DONE\nbroken line\n');
  assert.equal(events.length, 1);
  assert.deepEqual([events[0].card, events[0].event, events[0].value, events[0].line], ['C-001', 'attempt', 'haiku', 3]);
  assert.equal(problems.length, 1);
});

test('tierState counts attempts and follows escalations', () => {
  const c = card({});
  const six = Array(6).fill(ev('attempt | haiku | STUCK'));
  assert.equal(stateOf(c, six).mustEscalate, true);
  const after = stateOf(c, [...six, ev('escalate | sonnet | ceiling'), ev('attempt | sonnet | STUCK')]);
  assert.deepEqual([after.current, after.used, after.ceiling, after.worker, after.mustEscalate], ['sonnet', 1, 4, 'worker-standard', false]);
  assert.equal(stateOf(card({ risk: 'high', tier: 'opus' }), [ev('attempt | opus | x'), ev('attempt | opus | x')]).mustBlock, true);
});

test('replayLog enforces ceilings, tier order and values', () => {
  const cards = [card({})];
  assert.equal(problemsOf([ev('attempt | haiku | ok'), ev('simplify | clean | -'), ev('pr | 4 | -'), ev('review | pass | ok'), ev('blocked | - | q')], cards), '');
  assert.match(problemsOf([ev('simplify | done | x')], cards), /simplify value "done" must be changed\|clean/);
  assert.match(problemsOf(Array(7).fill(ev('attempt | haiku | x')), cards), /7 attempts on haiku, ceiling 6/);
  assert.match(problemsOf([ev('attempt | opus | x')], cards), /is on tier "haiku"/);
  assert.match(problemsOf([ev('escalate | haiku | x')], cards), /next tier after "haiku" \(sonnet\)/);
  assert.match(problemsOf([ev('escalate | opus | skip')], cards), /next tier after "haiku"/);
  assert.match(problemsOf([ev('attempt | haiku | x', 'C-009')], cards), /no card file/);
  assert.match(problemsOf(['07.10.2026 | C-001 | review | maybe | x'], cards), /not YYYY-MM-DD[\s\S]*pass\|fail/);
  assert.match(problemsOf([ev('pr | abc | x')], cards), /pull request number/);
  assert.match(problemsOf([ev('blocked | yes | x')], cards), /blocked value "yes" must be -/);
  // An invalid escalation is ignored, so the board shows the same tier check-kit accepts.
  assert.equal(stateOf(card({}), [ev('escalate | opus | skip')]).current, 'haiku');
});

test('cardStatus derives the column from git facts and the log', () => {
  const c = card({});
  const none = new Set();
  assert.equal(cardStatus(c, [], none, none), 'Backlog');
  assert.equal(cardStatus(c, [], none, new Set(['C-001'])), 'In progress');
  const pr = log([ev('attempt | haiku | ok'), ev('pr | 4 | -')]);
  assert.equal(cardStatus(c, pr, none, none), 'In review');
  assert.equal(cardStatus(c, [...pr, ...log([ev('review | fail | x')])], none, none), 'In progress');
  assert.equal(cardStatus(c, [...pr, ...log([ev('blocked | - | q')])], none, none), 'Blocked');
  assert.equal(cardStatus(c, [...pr, ...log([ev('blocked | - | q'), ev('unblocked | - | a')])], none, none), 'In review');
  assert.equal(cardStatus(c, pr, new Set(['C-001']), none), 'Done');
});

test('readyQueue orders by priority, then id, and waits for dependencies', () => {
  const rows = [
    { id: 'C-001', status: 'Backlog', priority: 'P2', depends_on: [] },
    { id: 'C-002', status: 'Backlog', priority: 'P0', depends_on: ['C-004'] },
    { id: 'C-003', status: 'Backlog', priority: 'P1', depends_on: [] },
    { id: 'C-004', status: 'Done', priority: 'P0', depends_on: [] },
    { id: 'C-005', status: 'Backlog', priority: 'P0', depends_on: ['C-001'] },
    { id: 'C-006', status: 'Backlog', priority: 'P1', depends_on: [] },
  ];
  assert.deepEqual(readyQueue(rows), ['C-002', 'C-003', 'C-006', 'C-001']);
});

test('buildBoard warns about shared paths, WIP and ceilings', () => {
  const cards = [card({ id: 'C-001', paths: ['src/'] }), card({ id: 'C-002', paths: ['src/a.js'] })];
  const branches = new Set(['C-001', 'C-002']);
  const { warnings, rows } = buildBoard(cards, log(Array(6).fill(ev('attempt | haiku | x'))), new Set(), branches);
  assert.deepEqual(rows.map((r) => r.status), ['In progress', 'In progress']);
  assert.match(warnings.join('\n'), /C-001 and C-002 run in parallel but share src\//);
  assert.match(warnings.join('\n'), /C-001: 6\/6 attempts on haiku, escalate/);
  const many = Array.from({ length: 4 }, (_, i) => card({ id: `C-00${i + 1}`, paths: [`src/${i}.js`] }));
  assert.match(buildBoard(many, [], new Set(), new Set(many.map((c) => c.id))).warnings.join('\n'), /4 cards In progress, limit 3/);
});

// check-kit against a copy of this repository's kit files plus fixture cards.
function kitCopy(cardFiles, logLines) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-'));
  for (const p of ['.claude', '.githooks', '.mcp.json', 'process', 'CLAUDE.md', 'AGENTS.md', 'anchor.md', 'SPEC.md']) cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  // The fixture cards test the tier rules only; kit 3 readiness (agent field) has its own tests in kit3.test.mjs.
  writeFileSync(join(dir, 'kit.config.json'), JSON.stringify({ readyFrom: 999 }));
  writeFileSync(join(dir, 'STORYMAP.md'), '| S1.1 | Owner | Uses | Step | Value | P1 | planned |\n');
  mkdirSync(join(dir, 'cards'));
  for (const [name, text] of Object.entries(cardFiles)) writeFileSync(join(dir, 'cards', name), text);
  if (logLines) writeFileSync(join(dir, 'cards.log'), logLines.join('\n'));
  return dir;
}
const runKit = (dir) => spawnSync(process.execPath, [join(ROOT, 'scripts/check-kit.mjs')], { env: { ...process.env, KIT_ROOT: dir }, encoding: 'utf8' });

test('check-kit accepts a valid card and log, rejects a tier below the minimum and an over-ceiling log', () => {
  const ok = kitCopy({ 'C-001.md': cardText({}) }, [ev('attempt | haiku | ok')]);
  const low = kitCopy({ 'C-001.md': cardText({ risk: 'high', tier: 'sonnet' }) });
  const over = kitCopy({ 'C-001.md': cardText({}) }, Array(7).fill(ev('attempt | haiku | x')));
  try {
    const a = runKit(ok);
    assert.equal(a.status, 0, a.stderr);
    const b = runKit(low);
    assert.equal(b.status, 1);
    assert.match(b.stderr, /start_tier "sonnet" is below the minimum "opus"/);
    const c = runKit(over);
    assert.equal(c.status, 1);
    assert.match(c.stderr, /ceiling 6/);
  } finally {
    for (const d of [ok, low, over]) rmSync(d, { recursive: true, force: true });
  }
});

test('check-kit rejects a reviewer that can edit and an agent that can spawn agents', () => {
  const dir = kitCopy({});
  try {
    writeFileSync(join(dir, '.claude/agents/extra-reviewer.md'), '---\nname: extra-reviewer\ndescription: "Claude only. test"\ntools: Read, Edit, Agent\n---\nbody\n');
    const r = runKit(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /only the lead spawns agents/);
    assert.match(r.stderr, /reviewer must not have Edit or Write/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check-kit rejects a broken toolchain: plugin twice, missing hook file, context7, ponytail scoping, worker tools', () => {
  const dir = kitCopy({});
  try {
    const sp = join(dir, '.claude/settings.json');
    const settings = JSON.parse(readFileSync(sp, 'utf8'));
    settings.enabledPlugins['ponytail@ponytail'] = true;
    delete settings.env.PONYTAIL_SUBAGENT_MATCHER;
    writeFileSync(sp, JSON.stringify(settings));
    rmSync(join(dir, '.mcp.json'));
    rmSync(join(dir, '.claude/hooks/ponytail-subagent.js'));
    const wp = join(dir, '.claude/agents/worker-light.md');
    writeFileSync(wp, readFileSync(wp, 'utf8').replace(', Skill,', ','));
    const r = runKit(dir);
    assert.equal(r.status, 1);
    for (const re of [/ponytail@ponytail: must be either enabled .* not both/, /PONYTAIL_SUBAGENT_MATCHER/, /\.mcp\.json: context7/,
      /hook points at missing \.claude\/hooks\/ponytail-subagent\.js/, /worker-light\.md: tools must include Skill/]) {
      assert.match(r.stderr, re);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
