#!/usr/bin/env node
// agy's planning advice (process/agents.md): before cards are dispatched, the conductor asks agy (Antigravity, Gemini)
// for concrete solutions and for what is missing from the plan. agy writes a file only (Orchestrator "artifact"
// output), never code. The conductor checks every point, adds it to the cards or tells the owner why not.
// Starts agy through `ao spawn` (the shell guard blocks a direct `ao spawn`) and logs one advice line per card.
// Usage: node scripts/advise.mjs C-NNN [C-NNN...] [--deep] [--dry-run]
//        node scripts/advise.mjs --brief <file.md> [--dry-run]   research for the owner, no cards, no log line
import { appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readCards, isMain, ADVISOR, CARD_ID } from './cards.mjs';
import { LOG_FILE } from './board.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const localDate = () => new Date().toLocaleDateString('sv-SE');

// --deep (owner, 2026-10-25): when agy has quota to spare, it also reviews the whole plan from two sides.
const DEEP_AREAS = 'security, frontend, backend, the plan itself, logic, structure';
const advicePrompt = (ids, deep) => [
  `You advise on a plan; you do not implement it. Do not change files, do not push, do not open pull requests.`,
  `Read AGENTS.md, SPEC.md, STORYMAP.md and these cards in full: ${ids.map((id) => `cards/${id}.md`).join(', ')}.`,
  ...(deep ? ['Also read the code the cards touch. You may use subagents for reading and research.'] : []),
  'Write one markdown file as your output with exactly these sections:',
  '## Solutions: for each card, concrete ways to meet its Goal and Acceptance (libraries, patterns, file layout), with sources.',
  '## Missing from the plan: what the cards do not cover and should, under these headings: security, edge cases, tests, infrastructure, UX.',
  '## Risks: what could break for the user, most likely first.',
  ...(deep ? [
    `## As the user: walking through the product as its only user, what is missing or wrong, under these headings: ${DEEP_AREAS}.`,
    `## As a senior developer: reviewing the plan and the code, what is missing or wrong, under these headings: ${DEEP_AREAS}.`,
  ] : []),
  'Facts only with a source link; mark anything you could not verify as unverified. Short bullets, no introduction.',
  `When done run: ao report --done --note "advice for ${ids.join(', ')}"`,
].join('\n');

export function advisePlan({ ids, today = localDate(), deep = false }) {
  const name = `advise-${deep ? 'deep-' : ''}${ids.join('-')}`;
  return {
    args: ['spawn', '--name', name, '--kind', 'worker', '--agent', ADVISOR, '--output', 'artifact', '--prompt', advicePrompt(ids, deep)],
    logLines: ids.map((id) => `${today} | ${id} | advice | ${ADVISOR} | ${name}`),
  };
}

// --brief (owner, 2026-10-25): an open research task for agy while it has nothing to advise on. Same limits: a file
// as output, no code, no push. The conductor checks the result like any advice before anything becomes a card.
export function briefPlan({ name, brief }) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const prompt = [
    'You research for the owner; you do not implement anything. Do not change files, do not push, do not open pull requests.',
    'Read AGENTS.md, SPEC.md, STORYMAP.md, PRODUCT.md and README.md first. You may use subagents for reading and research.',
    String(brief).trim(),
    'Write one markdown file as your output. Facts only with a source link; mark anything you could not verify as unverified.',
    `When done run: ao report --done --note "research ${slug}"`,
  ].join('\n');
  return { args: ['spawn', '--name', `research-${slug}`, '--kind', 'worker', '--agent', ADVISOR, '--output', 'artifact', '--prompt', prompt] };
}

function main(argv) {
  if (argv.includes('--brief')) {
    const file = argv[argv.indexOf('--brief') + 1];
    if (!file) { console.error('usage: node scripts/advise.mjs --brief <file.md> [--dry-run]'); return 1; }
    const plan = briefPlan({ name: file.replace(/^.*[\\/]/, '').replace(/\.md$/, ''), brief: readFileSync(file, 'utf8') });
    if (argv.includes('--dry-run')) { console.log(JSON.stringify(['ao', ...plan.args], null, 2)); return 0; }
    const r = spawnSync('ao', plan.args, { cwd: ROOT, stdio: 'inherit' });
    return r.error ? 1 : (r.status ?? 1);
  }
  const ids = argv.filter((a) => new RegExp(`^${CARD_ID}$`).test(a));
  if (!ids.length) { console.error('usage: node scripts/advise.mjs C-NNN [C-NNN...] [--deep] [--dry-run]'); return 1; }
  const known = new Set(readCards(ROOT).filter((c) => !c.invalid).map((c) => c.id));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length) { console.error(`advise: no valid card ${missing.join(', ')}`); return 1; }
  const plan = advisePlan({ ids, deep: argv.includes('--deep') });
  if (argv.includes('--dry-run')) { console.log(JSON.stringify(['ao', ...plan.args], null, 2)); return 0; }
  const r = spawnSync('ao', plan.args, { cwd: ROOT, stdio: 'inherit' });
  if (r.error) { console.error(`advise: could not run ao (${r.error.code}); install Agent Orchestrator and check \`ao --version\``); return 1; }
  if (r.status !== 0) { console.error(`advise: ao spawn failed (exit ${r.status})`); return r.status ?? 1; }
  appendFileSync(join(ROOT, LOG_FILE), `${plan.logLines.join('\n')}\n`);
  console.log(`advise: logged ${plan.logLines.length} advice line(s); read agy's output, then commit ${LOG_FILE} with the updated cards`);
  return 0;
}

if (isMain(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`advise: ${e.message}`); process.exit(1); }
}
