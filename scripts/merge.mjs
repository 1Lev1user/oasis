#!/usr/bin/env node
// The only way the conductor merges a card (process/agents.md): the card's pull request must be open, titled
// "C-NNN: <title>", on its card branch, with green checks and a PASS review from another vendor than the worker, logged
// in cards.log after the pull request, naming the reviewed head commit ("head <sha>"). Then squash-merges exactly that
// commit (--match-head-commit), which makes the card Done. A push after the review needs a new review. Also needs the
// decider's passed accept checklist and, on a sensitive card (cards.mjs isSensitive), a security pass.
// Usage: node scripts/merge.mjs C-NNN [--dry-run]
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { readCards, readinessProblems, ensureFullHistory, CARD_BRANCH, VENDOR, isMain, isSensitive, CONFIG } from './cards.mjs';
import { readLog, replayLog } from './board.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// events: this card's cards.log events; logProblems: replay problems for them; pr: gh pr view JSON.
export function mergeProblems({ card, events, logProblems, pr, checksOk, config = CONFIG }) {
  const p = [...logProblems, ...readinessProblems(card).map((r) => `${card.id} is not ready: ${r}`)];
  const own = events.filter((e) => e.card === card.id);
  const prAt = own.findLastIndex((e) => e.event === 'pr');
  if (prAt < 0) return [...p, `${card.id}: no pull request in cards.log`];
  const number = Number(own[prAt].value);
  if (pr.number !== number) p.push(`pull request #${pr.number} is not the card's #${number} from cards.log`);
  if (pr.state !== 'OPEN') p.push(`pull request #${pr.number} is ${pr.state}`);
  const title = `${card.id}: ${card.title}`;
  if (pr.title !== title) p.push(`pull request title must be "${title}"`);
  if (pr.headRefName?.match(CARD_BRANCH)?.[1] !== card.id) p.push(`branch "${pr.headRefName}" is not a card branch of ${card.id}`);
  if (!checksOk) p.push(`checks are not green on #${pr.number} (gh pr checks ${pr.number})`);
  const after = own.slice(prAt + 1);
  const review = after.filter((e) => e.event === 'review').at(-1);
  if (!review || review.value !== 'pass' || after.some((e) => e.event === 'attempt')) {
    p.push(`no review pass after pull request #${number} in cards.log`);
  } else {
    const worker = own.slice(0, prAt).filter((e) => e.event === 'attempt').at(-1)?.value;
    const reviewer = review.note.trim().split(/\s+/)[0]?.toLowerCase();
    if (!VENDOR[reviewer] || VENDOR[reviewer] === VENDOR[worker]) p.push(`same-vendor review is not enough to merge: ${worker} work needs a reviewer from another vendor (npm run dispatch -- ${card.id} --review)`);
    const sha = review.note.match(/\bhead ([0-9a-f]{7,40})\b/)?.[1];
    if (!sha) p.push('the review note must name the reviewed commit: "head <sha>"');
    else if (!pr.headRefOid?.startsWith(sha)) p.push(`the pull request head ${pr.headRefOid?.slice(0, 7)} is not the reviewed commit ${sha}; review again`);
  }
  // Claude's final check (process/agents.md): the decider's yes/no accept checklist, and a security review on sensitive cards.
  const last = (event, value) => after.filter((e) => e.event === event && (value === undefined || e.value === value)).at(-1);
  if (!/^pass\b/.test(last('checklist', 'accept')?.note ?? '')) p.push(`no passed accept checklist after pull request #${number} in cards.log`);
  if (isSensitive(card, config) && last('security')?.value !== 'pass') p.push(`sensitive card: no security pass after pull request #${number} in cards.log`);
  return p;
}

const gh = (...a) => execFileSync('gh', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function main(argv) {
  const id = argv.find((a) => /^C-\d{3}$/.test(a));
  if (!id) { console.error('usage: node scripts/merge.mjs C-NNN [--dry-run]'); return 1; }
  ensureFullHistory(ROOT);
  const card = readCards(ROOT).find((c) => c.id === id && !c.invalid);
  if (!card) { console.error(`merge: no valid card ${id}`); return 1; }
  const events = readLog(ROOT).events.filter((e) => e.card === id);
  const logProblems = replayLog(events, [card]).problems;
  const number = events.filter((e) => e.event === 'pr').at(-1)?.value;
  const pr = number ? JSON.parse(gh('pr', 'view', number, '--json', 'number,title,headRefName,headRefOid,state')) : {};
  const checksOk = number ? spawnSync('gh', ['pr', 'checks', number], { cwd: ROOT, stdio: 'ignore' }).status === 0 : false;
  const problems = mergeProblems({ card, events, logProblems, pr, checksOk });
  if (problems.length) {
    console.error(`merge: ${id} refused, ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  const args = ['pr', 'merge', number, '--squash', '--delete-branch', '--match-head-commit', pr.headRefOid, '--subject', `${id}: ${card.title} (#${number})`];
  if (argv.includes('--dry-run')) { console.log(JSON.stringify(['gh', ...args])); return 0; }
  return spawnSync('gh', args, { cwd: ROOT, stdio: 'inherit' }).status ?? 1;
}

if (isMain(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`merge: ${e.message}`); process.exit(1); }
}
