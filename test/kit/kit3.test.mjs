// Tests for the kit 3 gates: shallow-clone repair, card readiness, external agents and cross-vendor review in the log,
// the Claude command guard, the git hooks, dispatch and merge preconditions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseCard, readinessProblems, ensureFullHistory, isKit3 } from '../../scripts/cards.mjs';
import { parseLog, replayLog, buildBoard } from '../../scripts/board.mjs';
import { blockReason } from '../../.claude/hooks/guard.mjs';
import { findSecrets, pushProblems } from '../../scripts/git-hooks.mjs';
import { planDispatch, reviewerFor } from '../../scripts/dispatch.mjs';
import { mergeProblems } from '../../scripts/merge.mjs';

const cardText = ({ id = 'C-072', agent = 'cursor', acceptance = ['`npm test` exits 0', '`node --test test/a.test.js` exits 0'],
  goal = 'Something works.', dnt = '- existing tests', paths = ['src/a.js'], deps = '[]' } = {}) => `---
id: ${id}
title: "Card ${id}"
story_step: S1.1
size: S
priority: P1
risk: low
start_tier: sonnet
${agent === null ? '' : `agent: ${agent}\n`}depends_on: ${deps}
allowed_paths:
${paths.map((p) => `  - ${p}`).join('\n')}
test_edits: []
---

## Goal
${goal}

## Acceptance
${acceptance.map((a) => `- ${a}`).join('\n')}

## Do not touch
${dnt}

## Notes
None.
`;
const card = (o = {}) => parseCard(cardText(o), `cards/${o.id ?? 'C-072'}.md`);
const ev = (rest, id = 'C-072') => `2026-10-23 | ${id} | ${rest}`;
const events = (lines) => parseLog(lines.join('\n')).events;
const problemsOf = (lines, cards) => replayLog(events(lines), cards).problems.join('\n');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('ensureFullHistory turns a shallow clone into a full one, and fails loudly when it cannot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit3-git-'));
  try {
    const src = join(dir, 'src');
    execFileSync('git', ['init', '-q', '-b', 'main', src]);
    for (const n of [1, 2, 3]) { writeFileSync(join(src, 'f.txt'), String(n)); git(src, 'add', '.'); git(src, 'commit', '-qm', `c${n}`); }
    const clone = join(dir, 'clone');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${src}`, clone]);
    assert.equal(git(clone, 'rev-parse', '--is-shallow-repository'), 'true');
    ensureFullHistory(clone);
    assert.equal(git(clone, 'rev-parse', '--is-shallow-repository'), 'false');
    assert.equal(git(clone, 'rev-list', '--count', 'HEAD'), '3');

    const orphan = join(dir, 'orphan');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${src}`, orphan]);
    git(orphan, 'remote', 'remove', 'origin');
    assert.throws(() => ensureFullHistory(orphan), /shallow git clone/);
    ensureFullHistory(dir); // not a git repository: nothing to repair, no error
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readiness: a kit 3 card needs agent, goal, checkable acceptance, npm test, allowed paths and do-not-touch', () => {
  assert.deepEqual(readinessProblems(card()), []);
  assert.deepEqual(readinessProblems(card({ acceptance: ['`npm test` exits 0', 'Manual (owner): looks right'] })), []);
  const bad = readinessProblems(card({ agent: 'gpt', goal: '', dnt: '', acceptance: ['The screen looks good'], paths: [] })).join('\n');
  for (const re of [/agent "gpt" not in cursor\|claude-code/, /## Goal is empty/, /## Do not touch is empty/,
    /acceptance "The screen looks good" is neither/, /acceptance must include `npm test` exits 0/, /allowed_paths must not be empty/]) {
    assert.match(bad, re);
  }
  assert.match(readinessProblems(card({ agent: null })).join('\n'), /agent "undefined"/);
  assert.equal(isKit3(card({ id: 'C-001' })), true);
  assert.equal(isKit3(card({ id: 'C-071' }), { readyFrom: 72 }), false);
  assert.equal(isKit3(card({ id: 'C-072' }), { readyFrom: 72 }), true);
});

test('log: external agents attempt kit 3 cards up to their ceiling; the review must come from another vendor', () => {
  const c = card();
  assert.equal(problemsOf([ev('attempt | cursor | started via ao'), ev('pr | 70 | -'), ev('review | pass | sonnet PASS')], [c]), '');
  assert.match(problemsOf([ev('attempt | cursor | x'), ev('review | pass | cursor PASS')], [c]), /reviewer cursor is the same vendor as the worker/);
  const three = [ev('attempt | cursor | a'), ev('attempt | cursor | b'), ev('attempt | cursor | c'), ev('switch | claude-code | cursor 3 attempts')];
  assert.equal(problemsOf([...three, ev('attempt | sonnet | x'), ev('review | pass | sonnet PASS same-vendor: cloud session has only Claude')], [c]), '');
  assert.match(problemsOf([ev('attempt | cursor | x'), ev('review | pass | looks fine')], [c]), /review note must start with the reviewer/);
  assert.match(problemsOf(Array(4).fill(ev('attempt | cursor | x')), [c]), /4 attempts on cursor, ceiling 3/);
  const old = card({ id: 'C-071', agent: null });
  assert.match(problemsOf([ev('attempt | cursor | x', 'C-071')], [old]), /attempt by cursor needs a card with an agent field/);
  assert.equal(problemsOf([ev('attempt | sonnet | x', 'C-071'), ev('review | pass | reviewer sonnet PASS', 'C-071')], [old]), '');
});

test('guard blocks bypasses and destructive commands, lets ordinary work through', () => {
  for (const cmd of ['ao spawn --name x --agent cursor --prompt hi', 'gh pr merge 5 --squash', 'ao pr merge 5', 'git push --force origin card/C-072-x',
    'git push -f', 'git push origin +main', 'git push --force-with-lease', 'git reset --hard HEAD~1', 'git clean -fdx', 'git commit --no-verify -m x',
    'rm -rf /', 'rm -fr ~', 'rm -rf .', 'git config core.hooksPath /dev/null', 'git -c core.hooksPath= commit -m x',
    'git config --unset core.hooksPath', 'Remove-Item -Recurse -Force C:\\',
    // holes found by the kit 3 review (2026-10-23)
    'git config core.hookspath /dev/null', 'git config core.hooksPath .githooks-off', 'git -c core.hooksPath=.githooks/none commit -m x',
    'git commit -n -m x', 'git commit -nm x', 'git clean -d -f', 'git clean --force', 'rm -Rf .', 'rm -r -f .', 'rm -rf ./', 'rm -rf ~/',
    'rm -rf "$HOME"', 'git push -fu origin x', 'gh api -X PUT repos/o/r/pulls/5/merge', 'bash -c "git reset --hard"']) {
    assert.ok(blockReason(cmd), `should block: ${cmd}`);
  }
  for (const cmd of ['npm run dispatch -- C-072', 'npm run merge -- C-072', 'git push -u origin card/C-072-x', 'git push origin main', 'rm -rf .worktrees/C-072',
    'git config core.hooksPath .githooks', 'git config --get core.hooksPath', 'gh pr view 5', 'git reset --soft HEAD~1', 'ls -la',
    'grep -n "ao spawn" process/agents.md', 'git log --grep "gh pr merge"', 'git commit -m "explain why --no-verify is blocked"',
    'git commit --amend --no-edit', 'git merge --no-ff card/C-072-x']) {
    assert.equal(blockReason(cmd), null, `should allow: ${cmd}`);
  }
});

test('secret scan finds common key shapes and honours the allow marker', () => {
  const aws = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  const gh = 'ghp_' + 'a1'.repeat(18);
  const pem = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
  const ant = 'sk-ant-' + 'api03-' + 'x'.repeat(30);
  const text = [`const k = "${aws}";`, `token=${gh}`, pem, `ANTHROPIC=${ant}`, 'const ok = "hello world";', `x = "${aws}" // secret-scan: allow`].join('\n');
  assert.deepEqual(findSecrets(text).map((f) => f.line), [1, 2, 3, 4]);
  assert.deepEqual(findSecrets('apiKey: "abcdefghijklmnop1234"').map((f) => f.kind), ['assigned secret']); // secret-scan: allow
  assert.deepEqual(findSecrets('const password = input.value;'), []);
});

test('pre-push blocks force pushes, deleting main, card work and local card merges pushed to main', () => {
  const Z = '0'.repeat(40);
  const files = { appcommit: ['app/main.js'], dockercommit: ['Dockerfile', 'scripts/preview.mjs'], plan: ['cards/C-072.md', 'package.json'] };
  const deps = {
    isAncestor: (a, b) => !(a === 'old' && b === 'rewritten'),
    changedFiles: (a, b) => files[b] ?? ['cards/C-072.md'],
    subjects: (a, b) => (b === 'localmerge' ? ['C-072: Preview every change in a private Docker copy'] : ['Plan: C-073 x']),
  };
  const up = (localSha, remoteRef, remoteSha) => ({ localRef: 'x', localSha, remoteRef, remoteSha });
  assert.deepEqual(pushProblems([up('plan', 'refs/heads/main', 'old')], deps), []);
  assert.deepEqual(pushProblems([up('new', 'refs/heads/card/C-072-x', Z)], deps), []);
  assert.match(pushProblems([up('rewritten', 'refs/heads/card/C-072-x', 'old')], deps).join('\n'), /not a fast-forward/);
  assert.match(pushProblems([up(Z, 'refs/heads/main', 'old')], deps).join('\n'), /deletes main/);
  assert.match(pushProblems([up('appcommit', 'refs/heads/main', 'old')], deps).join('\n'), /app\/main\.js.*card branch/);
  assert.match(pushProblems([up('dockercommit', 'refs/heads/main', 'old')], deps).join('\n'), /Dockerfile, scripts\/preview\.mjs/);
  assert.match(pushProblems([up('localmerge', 'refs/heads/main', 'old')], deps).join('\n'), /local card merge/);
});

test('dispatch starts only a ready card that fits the WIP and path rules; review goes to another vendor', () => {
  const c = card();
  const board = (cards, branchIds = new Set(), evs = []) => buildBoard(cards, events(evs), new Set(), branchIds);
  const planned = events([ev('advice | agy | a'), ev('checklist | plan | pass')]);
  const ok = planDispatch({ card: c, board: board([c]), hooksPath: '.githooks', today: '2026-10-23', events: planned });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.agent, 'cursor');
  assert.deepEqual(ok.args.slice(0, 7), ['spawn', '--name', 'C-072', '--kind', 'worker', '--agent', 'cursor']);
  assert.match(ok.args.at(-1), /cards\/C-072\.md/);
  assert.match(ok.args.at(-1), /git switch card\/C-072-card-c-072 and git pull; otherwise git switch -c card\/C-072-card-c-072/);
  assert.doesNotMatch(ok.args.at(-1), /Findings from the last review/);
  const failed = events([ev('advice | agy | a'), ev('checklist | plan | pass'), ev('attempt | cursor | x'), ev('pr | 70 | -'), ev('review | fail | sonnet FAIL head 9d7d79d: 1. a.js:3 off by one')]);
  const retry = planDispatch({ card: c, board: board([c], new Set(), failed.map((e) => `${e.date} | ${e.card} | ${e.event} | ${e.value} | ${e.note}`)), hooksPath: '.githooks', events: failed });
  assert.deepEqual(retry.problems, []);
  assert.match(retry.args.at(-1), /Findings from the last review, fix every one: sonnet FAIL head 9d7d79d: 1\. a\.js:3 off by one/);
  const cc = card({ agent: 'claude-code' });
  const switchedLines = [ev('advice | agy | a'), ev('checklist | plan | pass'), ev('attempt | cursor | a'), ev('attempt | cursor | b'), ev('attempt | cursor | c'), ev('switch | claude-code | cursor 3 attempts')];
  const switched = events(switchedLines);
  assert.match(planDispatch({ card: cc, board: board([cc], new Set(), switchedLines), hooksPath: '.githooks', events: switched }).problems.join('\n'), /set the Claude model of the Orchestrator project to sonnet, then add --model sonnet/);
  assert.deepEqual(planDispatch({ card: cc, board: board([cc], new Set(), switchedLines), hooksPath: '.githooks', model: 'sonnet', events: switched }).problems, []);
  assert.equal(ok.logLine, '2026-10-23 | C-072 | attempt | cursor | started via ao');
  assert.match(planDispatch({ card: c, board: board([c]), hooksPath: '' }).problems.join('\n'), /git hooks are off/);
  assert.match(planDispatch({ card: card({ goal: '' }), board: board([card({ goal: '' })]), hooksPath: '.githooks' }).problems.join('\n'), /## Goal is empty/);
  const others = ['C-073', 'C-074', 'C-075'].map((id, i) => card({ id, paths: [`src/${i}.js`] }));
  const full = board([c, ...others], new Set(others.map((o) => o.id)));
  assert.match(planDispatch({ card: c, board: full, hooksPath: '.githooks' }).problems.join('\n'), /WIP limit/);
  const twin = card({ id: 'C-073' });
  assert.match(planDispatch({ card: c, board: board([c, twin], new Set(['C-073'])), hooksPath: '.githooks' }).problems.join('\n'), /shares src\/a\.js with C-073/);
  const dep = card({ deps: '[C-070]' });
  assert.match(planDispatch({ card: dep, board: board([dep, card({ id: 'C-070' })]), hooksPath: '.githooks' }).problems.join('\n'), /waits for C-070/);

  assert.equal(reviewerFor('cursor'), 'claude-code');
  assert.equal(reviewerFor('sonnet'), 'cursor');
  const inReview = board([c], new Set(), [ev('attempt | cursor | x'), ev('pr | 70 | -')]);
  const rv = planDispatch({ card: c, board: inReview, hooksPath: '.githooks', review: true, events: events([ev('attempt | cursor | x'), ev('pr | 70 | -')]) });
  assert.deepEqual(rv.problems, []);
  assert.equal(rv.agent, 'claude-code');
  assert.match(rv.args.at(-1), /Review pull request #70 only/);
  assert.equal(rv.logLine, null);
  assert.match(planDispatch({ card: c, board: board([c]), hooksPath: '.githooks', review: true, events: [] }).problems.join('\n'), /not In review/);
});

test('merge needs a cross-vendor PASS after the pull request, green checks and the card title', () => {
  const c = card();
  const lines = [ev('attempt | cursor | x'), ev('pr | 70 | -'), ev('review | pass | sonnet PASS head 9d7d79d'), ev('checklist | accept | pass')];
  const pr = { number: 70, title: 'C-072: Card C-072', headRefName: 'card/C-072-card-c-072', headRefOid: '9d7d79dabc', state: 'OPEN' };
  const base = { card: c, events: events(lines), logProblems: [], pr, checksOk: true };
  assert.deepEqual(mergeProblems(base), []);
  assert.match(mergeProblems({ ...base, pr: { ...pr, headRefOid: 'ffff000' } }).join('\n'), /not the reviewed commit 9d7d79d; review again/);
  assert.match(mergeProblems({ ...base, events: events([...lines.slice(0, 2), ev('review | pass | sonnet PASS'), lines[3]]) }).join('\n'), /must name the reviewed commit/);
  assert.match(mergeProblems({ ...base, checksOk: false }).join('\n'), /checks are not green/);
  assert.match(mergeProblems({ ...base, pr: { ...pr, title: 'fix stuff' } }).join('\n'), /title must be "C-072: Card C-072"/);
  assert.match(mergeProblems({ ...base, events: events(lines.slice(0, 2)) }).join('\n'), /no review pass after pull request #70/);
  assert.match(mergeProblems({ ...base, events: events([ev('attempt | sonnet | x'), ev('pr | 70 | -'), ev('review | pass | opus PASS same-vendor: busy')]) }).join('\n'),
    /same-vendor review is not enough to merge/);
  assert.match(mergeProblems({ ...base, logProblems: ['cards.log:3: bad'] }).join('\n'), /cards\.log:3: bad/);
});

test('progress turns card statuses into one percentage for the status line', async () => {
  const { progress } = await import('../../scripts/board.mjs');
  const rows = [{ id: 'C-1', status: 'Done' }, { id: 'C-2', status: 'In review' }, { id: 'C-3', status: 'Backlog' }, { id: 'C-4', status: 'Dropped' }];
  assert.deepEqual(progress(rows, ['C-1', 'C-2', 'C-3', 'C-4']), { percent: 57, done: 1, total: 3 });
  assert.deepEqual(progress(rows, []), { percent: 0, done: 0, total: 0 });
});
