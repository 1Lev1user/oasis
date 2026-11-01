// Tests for the kit 3.0 roles (owner, 2026-10-24): Cursor implements, agy advises while planning, Claude reviews and
// merges, claude-code only after 3 failed Cursor attempts, yes/no checklists before dispatch and before merge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, readinessProblems, isSensitive, AGENTS, IMPLEMENTER, FALLBACK } from '../../scripts/cards.mjs';
import { parseLog, replayLog, buildBoard, whoLines } from '../../scripts/board.mjs';
import { planDispatch, reviewerFor, modeFor, reviewModelFor } from '../../scripts/dispatch.mjs';
import { mergeProblems } from '../../scripts/merge.mjs';
import { advisePlan, briefPlan } from '../../scripts/advise.mjs';

const cardText = ({ id = 'C-001', agent = 'cursor', risk = 'low', paths = ['src/a.js'] } = {}) => `---
id: ${id}
title: "Card ${id}"
story_step: S1.1
size: S
priority: P1
risk: ${risk}
start_tier: sonnet
agent: ${agent}
depends_on: []
allowed_paths:
${paths.map((p) => `  - ${p}`).join('\n')}
test_edits: []
---

## Goal
Something works.

## Acceptance
- \`npm test\` exits 0
- \`node --test test/a.test.js\` exits 0

## Do not touch
- existing tests

## Notes
None.
`;
const card = (o = {}) => parseCard(cardText(o), `cards/${o.id ?? 'C-001'}.md`);
const ev = (rest, id = 'C-001') => `2026-10-24 | ${id} | ${rest}`;
const events = (lines) => parseLog(lines.join('\n')).events;
const problemsOf = (lines, cards) => replayLog(events(lines), cards).problems.join('\n');
const planned = [ev('advice | agy | .ao/advice/C-001.md'), ev('checklist | plan | pass')];
const board = (cards, lines = []) => buildBoard(cards, events(lines), new Set(), new Set());
const dispatchOf = (c, lines, extra = {}) => planDispatch({ card: c, board: board([c], lines), hooksPath: '.githooks', events: events(lines), ...extra });

test('Cursor is the implementer, claude-code the fallback, agy never implements', () => {
  assert.equal(IMPLEMENTER, 'cursor');
  assert.equal(FALLBACK, 'claude-code');
  assert.deepEqual(AGENTS, ['cursor', 'claude-code']);
  assert.match(readinessProblems(card({ agent: 'agy' })).join('\n'), /agent "agy" not in cursor\|claude-code/);
  assert.deepEqual(readinessProblems(card()), []);
  assert.match(problemsOf([ev('attempt | agy | x')], [card()]), /attempt value "agy"/);
  assert.equal(reviewerFor('cursor'), 'claude-code');
  assert.equal(reviewerFor('sonnet'), 'cursor');
});

test('claude-code works a card only after 3 Cursor attempts and a switch event', () => {
  const cc = card({ agent: 'claude-code' });
  assert.match(problemsOf([], [cc]), /C-001: agent claude-code needs a "switch" event after 3 cursor attempts/);
  const three = [ev('attempt | cursor | a'), ev('attempt | cursor | b'), ev('attempt | cursor | c')];
  assert.match(problemsOf([ev('attempt | cursor | a'), ev('switch | claude-code | too early')], [cc]), /switch to claude-code after 1 cursor attempt\(s\); needs 3/);
  assert.match(problemsOf([...three, ev('attempt | sonnet | x')], [cc]), /attempt on sonnet before the switch/);
  assert.equal(problemsOf([...three, ev('switch | claude-code | cursor 3 attempts'), ev('attempt | sonnet | x')], [cc]), '');
  assert.match(dispatchOf(cc, planned, { model: 'sonnet' }).problems.join('\n'), /claude-code needs a "switch" event/);
});

test('dispatch needs agy advice and a passed plan checklist', () => {
  const c = card();
  assert.match(dispatchOf(c, []).problems.join('\n'), /no agy advice in cards\.log \(npm run advise -- C-001\)/);
  assert.match(dispatchOf(c, []).problems.join('\n'), /no passed plan checklist/);
  assert.match(dispatchOf(c, [planned[0], ev('checklist | plan | fail')]).problems.join('\n'), /no passed plan checklist/);
  assert.deepEqual(dispatchOf(c, planned).problems, []);
});

test('log values for advice, checklist, security and switch are checked', () => {
  const c = card();
  assert.match(problemsOf([ev('advice | gemini | x')], [c]), /advice value "gemini" must be agy/);
  assert.match(problemsOf([ev('checklist | review | pass')], [c]), /checklist value "review" must be plan\|accept/);
  assert.match(problemsOf([ev('checklist | plan | maybe')], [c]), /checklist note must start with pass or fail/);
  assert.match(problemsOf([ev('security | ok | x')], [c]), /security value "ok" must be pass\|fail/);
  assert.match(problemsOf([ev('switch | agy | x')], [c]), /switch value "agy" must be claude-code/);
});

test('sensitive cards: risk medium or high, or a path under securityPaths', () => {
  const config = { securityPaths: ['.github/', '.env'] };
  assert.equal(isSensitive(card(), config), false);
  assert.equal(isSensitive(card({ risk: 'medium' }), config), true);
  assert.equal(isSensitive(card({ risk: 'high' }), config), true);
  assert.equal(isSensitive(card({ paths: ['.github/workflows/'] }), config), true);
  assert.equal(isSensitive(card({ paths: ['.env.example'] }), config), true);
});

test('merge needs a passed accept checklist, and a security pass on a sensitive card', () => {
  const pr = { number: 7, title: 'C-001: Card C-001', headRefName: 'card/C-001-card-c-001', headRefOid: '9d7d79dabc', state: 'OPEN' };
  const done = [...planned, ev('attempt | cursor | x'), ev('pr | 7 | -'), ev('review | pass | claude-code PASS head 9d7d79d')];
  const config = { securityPaths: ['.github/'] };
  const base = { card: card(), events: events(done), logProblems: [], pr, checksOk: true, config };
  assert.match(mergeProblems(base).join('\n'), /no passed accept checklist after pull request #7/);
  const accepted = [...done, ev('checklist | accept | pass')];
  assert.deepEqual(mergeProblems({ ...base, events: events(accepted) }), []);
  const risky = { ...base, card: card({ risk: 'medium' }), events: events(accepted) };
  assert.match(mergeProblems(risky).join('\n'), /sensitive card: no security pass after pull request #7/);
  assert.deepEqual(mergeProblems({ ...risky, events: events([...accepted, ev('security | pass | security-reviewer no findings')]) }), []);
  assert.match(mergeProblems({ ...risky, events: events([...accepted, ev('security | fail | token in log')]) }).join('\n'), /no security pass/);
});

test('status lines say only who works on which card', () => {
  const rows = [{ id: 'C-001', title: 'Day board', agent: 'cursor', status: 'In progress' }, { id: 'C-002', title: 'Week', agent: 'claude-code', status: 'Backlog' }];
  assert.deepEqual(whoLines(rows, ['C-001', 'C-002']), ['cursor → C-001 Day board', 'claude-code → C-002 Week']);
});

test('advise asks agy for solutions and gaps and logs one advice line per card', () => {
  const plan = advisePlan({ ids: ['C-001', 'C-002'], today: '2026-10-24' });
  assert.deepEqual(plan.args.slice(0, 7), ['spawn', '--name', 'advise-C-001-C-002', '--kind', 'worker', '--agent', 'agy']);
  assert.ok(plan.args.includes('--output') && plan.args[plan.args.indexOf('--output') + 1] === 'artifact');
  const prompt = plan.args.at(-1);
  for (const h of ['## Solutions', '## Missing from the plan', 'security', 'edge cases', 'tests', 'infrastructure', 'UX']) assert.ok(prompt.includes(h), h);
  assert.match(prompt, /Do not change files, do not push/);
  assert.deepEqual(plan.logLines, ['2026-10-24 | C-001 | advice | agy | advise-C-001-C-002', '2026-10-24 | C-002 | advice | agy | advise-C-001-C-002']);
  assert.doesNotMatch(prompt, /## As the user/);
});

test('deep advice adds the user and the senior developer view on every area', () => {
  const plan = advisePlan({ ids: ['C-001'], today: '2026-10-25', deep: true });
  assert.equal(plan.args[2], 'advise-deep-C-001');
  const prompt = plan.args.at(-1);
  for (const h of ['## As the user', '## As a senior developer', '## Missing from the plan']) assert.ok(prompt.includes(h), h);
  for (const area of ['security', 'frontend', 'backend', 'the plan itself', 'logic', 'structure']) assert.ok(prompt.includes(area), area);
  assert.deepEqual(plan.logLines, ['2026-10-25 | C-001 | advice | agy | advise-deep-C-001']);
});

test('a void line cancels a Cursor run that failed on setup, never a real one without a reason', () => {
  const c = card();
  const three = [ev('attempt | cursor | a'), ev('attempt | cursor | b'), ev('attempt | cursor | c')];
  assert.match(dispatchOf(c, [...planned, ...three]).problems.join('\n'), /3 attempts on cursor, ceiling 3/);
  const voided = [...planned, ...three, ev('void | cursor | setup: approval prompts, no commits')];
  assert.deepEqual(dispatchOf(c, voided).problems, []);
  assert.equal(problemsOf([...three, ev('void | cursor | setup: crash'), ev('attempt | cursor | d')], [c]), '');
  assert.match(problemsOf([ev('attempt | cursor | a'), ev('void | cursor | it was bad')], [c]), /void note must start with "setup: <what failed>"/);
  assert.match(problemsOf([ev('void | cursor | setup: x')], [c]), /void without a cursor attempt/);
});

test('Cursor workers start in the terminal mode, so they never wait on a command prompt', () => {
  assert.deepEqual(modeFor('cursor'), ['--mode', 'tui']);
  assert.deepEqual(modeFor('claude-code'), []);
  const args = dispatchOf(card(), planned).args;
  assert.deepEqual(args.slice(7, 9), ['--mode', 'tui']);
  assert.equal(args.at(-2), '--prompt');
});

test('a research brief goes to agy as a file-only task', () => {
  const plan = briefPlan({ name: 'Questions about Secretary', brief: '## Task\nAsk what if.' });
  assert.deepEqual(plan.args.slice(0, 9), ['spawn', '--name', 'research-questions-about-secretary', '--kind', 'worker', '--agent', 'agy', '--output', 'artifact']);
  assert.match(plan.args.at(-1), /Do not change files, do not push/);
  assert.match(plan.args.at(-1), /## Task\nAsk what if\./);
});

test('a Claude reviewer runs on sonnet, on opus only for a risk-high card', () => {
  assert.deepEqual(reviewModelFor('claude-code', card()), ['--model', 'claude-sonnet-5-5']);
  assert.deepEqual(reviewModelFor('claude-code', card({ risk: 'high' })), ['--model', 'claude-opus-5-5']);
  assert.deepEqual(reviewModelFor('cursor', card()), []);
});
