#!/usr/bin/env node
// Git hooks for every agent (Claude, Cursor, Antigravity) and for people: they all commit through git, so the gates live
// here, not in one tool's settings. Enabled per clone with `npm run setup` (core.hooksPath = .githooks). CI repeats the
// secret scan, because `--no-verify` skips local hooks (process/agents.md).
// Usage: node scripts/git-hooks.mjs pre-commit | pre-push <remote> <url> (refs on stdin) | scan | test | ci
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { CARD_BRANCH, CARDS_DIR, CARD_ID, parseCard, isSystemPath, MAIN_FILES, isMain, CONFIG } from './cards.mjs';
import { checkCard } from './check-card.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZERO = /^0+$/;
const ALLOW = 'secret-scan: allow';
// main takes planning and system files directly; everything else arrives only as GitHub's squash merge of a card PR.
const mainOk = (f) => isSystemPath(f) || MAIN_FILES.includes(f);
const CARD_SUBJECT = new RegExp(`^${CARD_ID}:`);

const SECRETS = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI key', /\bsk-(proj-)?[A-Za-z0-9]{32,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Stripe key', /\b[rs]k_live_[A-Za-z0-9]{20,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['assigned secret', /\b(api[_-]?key|secret|password|passwd|token)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i],
];

// Lines (1-based) that look like a credential. A line holding "secret-scan: allow" is skipped on purpose.
export function findSecrets(text) {
  const out = [];
  String(text).split('\n').forEach((line, i) => {
    if (line.includes(ALLOW)) return;
    const hit = SECRETS.find(([, re]) => re.test(line));
    if (hit) out.push({ line: i + 1, kind: hit[0] });
  });
  return out;
}

// updates: the refs git hands pre-push. deps.isAncestor(a, b), deps.changedFiles(a, b) and deps.subjects(a, b) wrap git.
export function pushProblems(updates, deps) {
  const p = [];
  for (const u of updates) {
    const main = u.remoteRef === 'refs/heads/main';
    if (ZERO.test(u.localSha)) { if (main) p.push('this push deletes main'); continue; }
    if (ZERO.test(u.remoteSha)) continue; // a new branch
    if (!deps.isAncestor(u.remoteSha, u.localSha)) p.push(`${u.remoteRef}: not a fast-forward; history on a shared branch is never rewritten`);
    else if (main) {
      const work = deps.changedFiles(u.remoteSha, u.localSha).filter((f) => !mainOk(f));
      if (work.length) p.push(`main gets card work directly (${work.join(', ')}); it goes through a card branch and a pull request`);
      const merged = deps.subjects(u.remoteSha, u.localSha).filter((s) => CARD_SUBJECT.test(s));
      if (merged.length) p.push(`main gets a local card merge ("${merged[0]}"); cards are merged on GitHub (npm run merge), never pushed`);
    }
  }
  return p;
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
const mainRef = () => ['origin/main', 'main'].find((r) => tryGit('rev-parse', '--verify', '--quiet', r) !== null) ?? null;

function preCommit() {
  const problems = [];
  // Secrets in the added lines of the staged diff.
  let file = null;
  let n = 0;
  let prev = '';
  for (const line of git('diff', '--cached', '-U0', '--no-color', '--no-ext-diff').split('\n')) {
    const header = line.startsWith('+++ ') && prev.startsWith('--- ');
    prev = line;
    if (header) { file = line.slice(6); continue; }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { n = Number(hunk[1]); continue; }
    if (line.startsWith('+')) {
      for (const s of findSecrets(line.slice(1))) problems.push(`${file}:${n}: looks like a ${s.kind}; remove it (or mark a false alarm with "${ALLOW}")`);
      n++;
    }
  }
  const branch = tryGit('rev-parse', '--abbrev-ref', 'HEAD')?.trim() ?? '';
  const staged = git('diff', '--cached', '--name-status', '-M').split('\n').filter(Boolean).map((l) => {
    const [status, a, b] = l.split('\t');
    return status.startsWith('R') || status.startsWith('C') ? { status, oldPath: a, path: b } : { status, path: a };
  });
  if (branch === 'main') {
    const work = staged.flatMap((c) => [c.path, c.oldPath]).filter((f) => f && !mainOk(f));
    if (work.length) problems.push(`card work committed on main (${work.join(', ')}); use a card branch`);
  }
  const id = branch.match(CARD_BRANCH)?.[1];
  const base = mainRef();
  if (id && base) {
    const f = `${CARDS_DIR}/${id}.md`;
    const text = tryGit('show', `${base}:${f}`);
    const card = text === null ? null : parseCard(text, f);
    const existedAtBase = (p) => tryGit('cat-file', '-e', `${base}:${p}`) !== null;
    problems.push(...checkCard({ id, card, changes: staged, existedAtBase }));
  }
  return problems;
}

// Git runs hooks with GIT_DIR (and in a worktree GIT_COMMON_DIR, GIT_INDEX_FILE ...) set. The checks a hook starts must
// not inherit them: a test that runs git in its own temporary repository would act on this repository instead
// (found in Agent Orchestrator worktrees, 2026-10-25).
const GIT_REPO_VARS = /^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE)$/i;
export const cleanGitEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !GIT_REPO_VARS.test(k)));

function prePush() {
  const updates = readFileSync(0, 'utf8').split('\n').filter(Boolean).map((l) => {
    const [localRef, localSha, remoteRef, remoteSha] = l.split(' ');
    return { localRef, localSha, remoteRef, remoteSha };
  });
  const problems = pushProblems(updates, {
    isAncestor: (a, b) => tryGit('merge-base', '--is-ancestor', a, b) !== null,
    changedFiles: (a, b) => git('diff', '--name-only', a, b).split('\n').filter(Boolean),
    subjects: (a, b) => git('log', '--format=%s', `${a}..${b}`).split('\n').filter(Boolean),
  });
  if (problems.length || !updates.some((u) => !ZERO.test(u.localSha))) return problems;
  // Same checks as CI before anything leaves the machine.
  for (const args of [['--test', 'test/kit/*.test.mjs'], [join(ROOT, 'scripts/check-kit.mjs')]]) {
    const r = spawnSync(process.execPath, args, { cwd: ROOT, env: cleanGitEnv(), stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.status !== 0) problems.push(`node ${args.join(' ')} failed (exit ${r.status}); fix it before pushing`);
  }
  if (projectTests('ignore') !== 0) problems.push(`${CONFIG.testCommand} failed; fix it before pushing`);
  return problems;
}

// The project's own checks (kit.config.json), through the shell because they are command lines. null status = not run.
const run = (command, stdout = 'inherit') => spawnSync(command, { cwd: ROOT, shell: true, env: cleanGitEnv(), stdio: ['ignore', stdout, 'inherit'] }).status ?? 1;
const projectTests = (stdout = 'inherit') => run(CONFIG.testCommand, stdout);
// CI: the tests, then ciCommand (lint, type check, build) when set.
export const ciChecks = (config = CONFIG, exec = run) => exec(config.testCommand) || (config.ciCommand ? exec(config.ciCommand) : 0);

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|ogg|wav|zip|gz|pdf)$/i;
function scan() {
  const problems = [];
  for (const f of git('ls-files', '-z').split('\0').filter(Boolean)) {
    if (BINARY.test(f) || CONFIG.scanSkip.some((p) => f.startsWith(p))) continue;
    let text;
    try { if (statSync(join(ROOT, f)).size > 1024 * 1024) continue; text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    for (const s of findSecrets(text)) problems.push(`${f}:${s.line}: looks like a ${s.kind}`);
  }
  return problems;
}

if (isMain(import.meta.url)) {
  const mode = process.argv[2]?.trim(); // .trim(): a CRLF checkout of .githooks passes "pre-commit\r
  if (mode === 'test') process.exit(projectTests());
  if (mode === 'ci') process.exit(ciChecks());
  const check = { 'pre-commit': preCommit, 'pre-push': prePush, scan }[mode];
  if (!check) { console.error('usage: node scripts/git-hooks.mjs pre-commit | pre-push | scan | test | ci'); process.exit(1); }
  const problems = check();
  if (problems.length) {
    console.error(`${mode}: blocked, ${problems.length} problem(s) (scripts/git-hooks.mjs)`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (mode === 'scan') console.log('scan: no secrets found');
}
