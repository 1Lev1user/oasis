#!/usr/bin/env node
// The only way the conductor starts an agent in Agent Orchestrator (process/agents.md). Refuses a card that is not ready
// (scripts/cards.mjs readinessProblems) or without agy advice and a passed plan checklist, not next on the board, over the WIP limit, sharing paths with active work, or
// when the git hooks are off. Then runs `ao spawn` and logs the attempt in cards.log.
// Usage: node scripts/dispatch.mjs C-NNN [--model haiku|sonnet|opus] [--review] [--dry-run]
// --model: claude-code cards only. Orchestrator cannot pick the model per run, so the conductor sets the project's Claude
// model to the card's tier first and confirms it here; dispatch refuses a mismatch.
import { appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { readCards, readinessProblems, ensureFullHistory, pathsOverlap, VENDOR, EXTERNAL_AGENTS, EXTERNAL_CEILING, isMain, FALLBACK, IMPLEMENTER } from './cards.mjs';
import { readLog, gitFacts, buildBoard, WIP_LIMITS, LOG_FILE } from './board.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const localDate = () => new Date().toLocaleDateString('sv-SE');
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');

// Work by Cursor is reviewed by Claude Code; work by Claude (a switched card) by Cursor.
// Cursor runs in the terminal interface: there Agent Orchestrator starts it with --force under the project's auto
// permission mode, so it never stalls on a command prompt; .cursor/cli.json still denies the dangerous commands.
// In Chat mode auto only adds Cursor's own review and every shell command waits for a click (found 2026-10-25).
export const modeFor = (agent) => (agent === IMPLEMENTER ? ['--mode', 'tui'] : []);

// Claude is the only agent that runs out of limits (owner, 2026-10-25): a Claude reviewer runs on sonnet, on opus only for
// a risk-high card.
// Agent Orchestrator accepts only full model ids from its catalog (curl /api/v1/agents/claude-code/models).
export const CLAUDE_MODEL = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
export const reviewModelFor = (agent, card) => (agent === FALLBACK ? ['--model', CLAUDE_MODEL[card.risk === 'high' ? 'opus' : 'sonnet']] : []);

export const reviewerFor = (worker) => (VENDOR[worker] === 'anthropic' ? 'cursor' : 'claude-code');

const workerPrompt = (c, branch, findings) => [
  `You implement card ${c.id} in this repository. Follow AGENTS.md exactly.`,
  `1. Read AGENTS.md and cards/${c.id}.md in full before anything else.`,
  `2. Work on branch ${branch} (the card guard reads the card id from its name): if it exists, git switch ${branch} and git pull; otherwise git switch -c ${branch}.`,
  "3. Edit only the card's allowed_paths. Never edit an existing test unless the card lists it in test_edits. No new dependencies, no secrets.",
  '4. Red/green: write the failing test first and see it fail, then the smallest code that makes it pass.',
  '5. Run every acceptance command of the card and npm test. All must exit 0.',
  `6. Commit "${c.id}: ${c.title}" and run git push -u origin ${branch}. If no pull request exists for the branch yet, gh pr create --title "${c.id}: ${c.title}" with a body that lists every command and its exit code; if one exists, the push updates it.`,
  '7. Run: ao report --done --note "<pull request URL>; commands and exit codes".',
  ...(findings ? [`Findings from the last review, fix every one: ${findings}`] : []),
  'If the card is wrong, unclear or impossible inside allowed_paths: change nothing more and run ao report with your question.',
  'Never merge, never force-push, never use --no-verify.',
].join('\n');

const reviewPrompt = (c, pr) => [
  `Review pull request #${pr} only, for card ${c.id} (cards/${c.id}.md). Do not change code, do not push, do not merge.`,
  `1. Read AGENTS.md and cards/${c.id}.md. Check the branch out with gh pr checkout ${pr}.`,
  '2. Run every acceptance command of the card and npm test; note each exit code.',
  "3. Check: the Goal is met; every changed file is inside allowed_paths; no existing test was weakened or deleted; no secrets, network calls or new dependencies; the code is correct for edge cases.",
  '4. Run /simplify and, on a UI card, /impeccable critique in report-only mode: list their findings, change no code. A finding that matters (dead code, duplication, a needless abstraction, a broken design rule) is a FAIL finding. You may use subagents for parallel checks.',
  '5. Run: ao report --done --note "PASS head <sha>" or "FAIL head <sha>: 1. file:line what is wrong and why ..." where <sha> is git rev-parse HEAD of the reviewed branch (numbered findings, facts only).',
].join('\n');

// events: cards.log events of all cards. Returns { problems, agent, args, logLine }.
export function planDispatch({ card, board, hooksPath, review = false, events = [], model = null, today = localDate() }) {
  const problems = [];
  if (hooksPath !== '.githooks') problems.push('git hooks are off: run `npm run setup` (core.hooksPath must be .githooks)');
  problems.push(...readinessProblems(card).map((p) => `${card.id} is not ready: ${p}`));
  const row = board.rows.find((r) => r.id === card.id);
  if (!row) return { problems: [...problems, `${card.id}: not on the board`], agent: null, args: [], logLine: null };
  const own = events.filter((e) => e.card === card.id);

  if (review) {
    if (row.status !== 'In review') problems.push(`${card.id} is ${row.status}, not In review`);
    const pr = own.filter((e) => e.event === 'pr').at(-1)?.value;
    const worker = own.filter((e) => e.event === 'attempt').at(-1)?.value;
    const agent = reviewerFor(worker);
    return { problems, agent, args: ['spawn', '--name', `${card.id}-review`, '--kind', 'worker', '--agent', agent, ...modeFor(agent), ...reviewModelFor(agent, card), '--prompt', reviewPrompt(card, pr)], logLine: null };
  }

  // Planning gates (process/agents.md): agy advised on the card and the decider's yes/no plan checklist passed.
  if (!own.some((e) => e.event === 'advice')) problems.push(`${card.id}: no agy advice in cards.log (npm run advise -- ${card.id})`);
  if (!/^pass\b/.test(own.filter((e) => e.event === 'checklist' && e.value === 'plan').at(-1)?.note ?? '')) {
    problems.push(`${card.id}: no passed plan checklist in cards.log (decider plan, then "checklist | plan | pass")`);
  }
  if (card.agent === FALLBACK && !own.some((e) => e.event === 'switch')) {
    problems.push(`${card.id}: ${FALLBACK} needs a "switch" event after ${EXTERNAL_CEILING} ${IMPLEMENTER} attempts`);
  }
  if (!['Backlog', 'In progress'].includes(row.status)) problems.push(`${card.id} is ${row.status}; only Backlog or In progress cards start`);
  const status = new Map(board.rows.map((r) => [r.id, r.status]));
  for (const d of row.depends_on) if (status.get(d) !== 'Done') problems.push(`${card.id} waits for ${d} (${status.get(d) ?? 'missing'})`);
  const active = board.rows.filter((r) => r.id !== card.id && (r.status === 'In progress' || r.status === 'In review'));
  if (row.status === 'Backlog' && active.filter((r) => r.status === 'In progress').length >= WIP_LIMITS['In progress']) {
    problems.push(`WIP limit: ${WIP_LIMITS['In progress']} cards already In progress`);
  }
  for (const r of active) {
    const shared = row.allowed_paths.filter((p) => r.allowed_paths.some((q) => pathsOverlap(p, q)));
    if (shared.length) problems.push(`${card.id} shares ${shared.join(', ')} with ${r.id} (${r.status})`);
  }
  const agent = card.agent;
  let value = agent;
  if (EXTERNAL_AGENTS.includes(agent)) {
    const used = own.filter((e) => e.event === 'attempt' && e.value === agent).length - own.filter((e) => e.event === 'void').length;
    if (used >= EXTERNAL_CEILING) problems.push(`${card.id}: ${used} attempts on ${agent}, ceiling ${EXTERNAL_CEILING}; switch the agent on the card or block it`);
  } else {
    value = row.tier;
    if (row.mustEscalate || row.mustBlock) problems.push(`${card.id}: ${row.attempts}/${row.ceiling} attempts on ${row.tier}; escalate or block first (process/ranking.md)`);
    if (model !== row.tier) problems.push(`${card.id} runs on ${row.tier}: set the Claude model of the Orchestrator project to ${row.tier}, then add --model ${row.tier}`);
  }
  const lastAttempt = own.findLastIndex((e) => e.event === 'attempt');
  const findings = own.slice(lastAttempt + 1).filter((e) => e.event === 'review' && e.value === 'fail').at(-1)?.note ?? null;
  const branch = `card/${card.id}-${slug(card.title)}`;
  return {
    problems, agent,
    args: ['spawn', '--name', card.id, '--kind', 'worker', '--agent', agent, ...modeFor(agent), '--prompt', workerPrompt(card, branch, findings)],
    logLine: `${today} | ${card.id} | attempt | ${value} | started via ao`,
  };
}

function main(argv) {
  const id = argv.find((a) => /^C-\d{3}$/.test(a));
  if (!id) { console.error('usage: node scripts/dispatch.mjs C-NNN [--review] [--dry-run]'); return 1; }
  ensureFullHistory(ROOT);
  const cards = readCards(ROOT);
  const card = cards.find((c) => c.id === id && !c.invalid);
  if (!card) { console.error(`dispatch: no valid card ${id}`); return 1; }
  const { events } = readLog(ROOT);
  const facts = gitFacts(ROOT);
  const board = buildBoard(cards, events, facts.doneIds, facts.branchIds);
  let hooksPath = '';
  try { hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* unset */ }
  const model = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : null;
  const plan = planDispatch({ card, board, hooksPath, review: argv.includes('--review'), events, model });
  if (plan.problems.length) {
    console.error(`dispatch: ${id} refused, ${plan.problems.length} problem(s)`);
    for (const p of plan.problems) console.error(`  - ${p}`);
    return 1;
  }
  if (argv.includes('--dry-run')) { console.log(JSON.stringify(['ao', ...plan.args], null, 2)); return 0; }
  const r = spawnSync('ao', plan.args, { cwd: ROOT, stdio: 'inherit' });
  if (r.error) { console.error(`dispatch: could not run ao (${r.error.code}); install Agent Orchestrator and check \`ao --version\``); return 1; }
  if (r.status !== 0) { console.error(`dispatch: ao spawn failed (exit ${r.status})`); return r.status ?? 1; }
  if (plan.logLine) {
    appendFileSync(join(ROOT, LOG_FILE), `${plan.logLine}\n`);
    console.log(`dispatch: logged "${plan.logLine}"; commit ${LOG_FILE} to main`);
  }
  return 0;
}

if (isMain(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`dispatch: ${e.message}`); process.exit(1); }
}
