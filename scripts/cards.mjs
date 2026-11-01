// Card files: cards/C-NNN.md, one card per file. Frontmatter holds the fields, the body holds Goal, Acceptance, Notes.
// Cards never hold a status: git (card branches, squash merges on main) and cards.log are the only status source.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Project settings (kit.config.json at the repository root, a system file). Missing file or key = the default.
//   testCommand  the project's own full test run (CI and pre-push run it; kit tests run separately with node)
//   testPattern  regular expression for test files: an existing one changes only when a card lists it in test_edits
//   scanSkip     path prefixes the secret scan skips (vendored third-party files)
//   ciCommand    extra checks CI runs after testCommand (lint, type check, build); empty = none
//   readyFrom    first card number that must pass readinessProblems() (older cards are history)
//   securityPaths path prefixes that make a card sensitive (security review before merge)
export const CONFIG_FILE = 'kit.config.json';
export const CONFIG_DEFAULTS = { testCommand: 'npm test', ciCommand: '', testPattern: '^test/', scanSkip: [], readyFrom: 1,
  securityPaths: ['.github/', '.githooks/', 'scripts/', '.env'] };
export function kitConfig(root) {
  let own = {};
  try { own = JSON.parse(readFileSync(join(root, CONFIG_FILE), 'utf8')); } catch { /* defaults */ }
  return { ...CONFIG_DEFAULTS, ...own };
}
export const CONFIG = kitConfig(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
export const isTestPath = (p, config = CONFIG) => new RegExp(config.testPattern).test(p);

export const CARDS_DIR = 'cards';
export const CARD_ID = 'C-\\d{3}';
export const CARD_FILE = new RegExp(`^${CARD_ID}\\.md$`);
export const CARD_BRANCH = new RegExp(`^card/(${CARD_ID})(?:-|$)`);

// Files only the lead (planner) changes. No card may list them, and a card branch may not touch them.
export const SYSTEM_PATHS = ['cards/', 'process/', '.claude/', 'CLAUDE.md', 'AGENTS.md', 'anchor.md', 'SPEC.md', 'STORYMAP.md',
  'cards.log', 'claude-progress.txt', 'DESIGN.md', 'research/',
  'scripts/cards.mjs', 'scripts/check-card.mjs', 'scripts/check-kit.mjs', 'scripts/board.mjs',
  'scripts/dispatch.mjs', 'scripts/merge.mjs', 'scripts/advise.mjs', 'scripts/git-hooks.mjs', '.githooks/', '.github/', '.gitattributes', '.mcp.json', '.cursor/',
  'test/kit/', CONFIG_FILE];
// Besides system files, the only file a planning commit on main may carry (cards add npm scripts; CI never runs them).
export const MAIN_FILES = ['package.json'];

const unquote = (v) => {
  v = v.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) return v.slice(1, -1);
  return v;
};

// Tiny frontmatter parser: "key: value", quoted values, inline lists "[a, b]", block lists "- item".
// Returns { data, body } or null when the text has no frontmatter.
export function parseFrontmatter(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  if (lines[0].trim() !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const data = {};
  let key = null;
  for (const line of lines.slice(1, end)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const raw = kv[2].trim();
    const inline = raw.match(/^\[(.*)\]$/);
    data[key] = inline ? inline[1].split(',').map(unquote).filter(Boolean) : unquote(raw);
  }
  return { data, body: lines.slice(end + 1).join('\n').replace(/^\n+/, '') };
}

const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Body text per "## Heading", trimmed.
function sectionsOf(body) {
  const out = {};
  let key = null;
  for (const line of body.split('\n')) {
    const h = line.match(/^##\s+(.*?)\s*$/);
    if (h) { key = h[1]; out[key] = ''; continue; }
    if (key) out[key] += `${line}\n`;
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}

// Bullets under "## Acceptance".
const acceptanceOf = (sections) => (sections.Acceptance ?? '').split('\n').map((l) => l.match(/^\s*-\s+(.*)$/)?.[1].trim()).filter(Boolean);

export function parseCard(text, file = '') {
  const fm = parseFrontmatter(text);
  if (!fm) return { file, invalid: 'missing frontmatter' };
  const d = fm.data;
  const sections = sectionsOf(fm.body);
  return {
    file,
    fields: Object.keys(d),
    id: d.id, title: d.title, story_step: d.story_step, size: d.size, priority: d.priority, risk: d.risk, start_tier: d.start_tier,
    agent: d.agent, slice: d.slice == null || d.slice === '' ? null : Number(d.slice),
    depends_on: list(d.depends_on), allowed_paths: list(d.allowed_paths), test_edits: list(d.test_edits),
    body: fm.body, sections, acceptance: acceptanceOf(sections),
  };
}

// names: card file names; read(name) returns the file text or null.
export function loadCards(names, read) {
  return names.filter((n) => CARD_FILE.test(n)).sort()
    .map((n) => [n, read(n)]).filter(([, t]) => t != null)
    .map(([n, t]) => parseCard(t, `${CARDS_DIR}/${n}`));
}

export function readCards(root) {
  const dir = join(root, CARDS_DIR);
  if (!existsSync(dir)) return [];
  return loadCards(readdirSync(dir), (n) => readFileSync(join(dir, n), 'utf8'));
}

// An allowed_paths entry ending in "/" allows everything under that folder; any other entry allows that exact file.
export function pathAllowed(path, allowed) {
  return allowed.some((a) => (a.endsWith('/') ? path.startsWith(a) : path === a));
}

// True when two allowed_paths-style entries share any file (either may be a folder).
export const pathsOverlap = (a, b) => pathAllowed(a, [b]) || pathAllowed(b, [a]);
export const isSystemPath = (p) => SYSTEM_PATHS.some((s) => pathsOverlap(p, s));

// Model tiers (kit 1.x ranking, same heuristic as ECC /model-route). Order matters: escalation goes left to right.
export const TIERS = ['haiku', 'sonnet', 'opus'];
// Worker runs allowed per tier before the card escalates to the next tier; after opus the card is Blocked.
export const CEILINGS = { haiku: 6, sonnet: 4, opus: 2 };
export const WORKER_FOR_TIER = { haiku: 'worker-light', sonnet: 'worker-standard', opus: 'worker-heavy' };

// An automatic check is an acceptance command other than the plain full test run.
export const hasAutomaticCheck = (card) =>
  card.acceptance.some((a) => /`[^`]+`\s+exits\s+0/.test(a) && !/^`npm test`/.test(a));

// Lowest tier a card may start on: risk high = opus; size M or L, risk medium, or no automatic check = sonnet;
// size S + risk low + an automatic check = haiku. The lead may start higher (architecture work), never lower.
export function minimumTier(card) {
  if (card.risk === 'high') return 'opus';
  if (card.size !== 'S' || card.risk !== 'low' || !hasAutomaticCheck(card)) return 'sonnet';
  return 'haiku';
}
export const tierRank = (t) => TIERS.indexOf(t);
export const nextTier = (t) => TIERS[tierRank(t) + 1] ?? null;

// Allowed values of the classification fields; the order of PRIORITY is the pull order.
export const CARD_SETS = { size: ['S', 'M', 'L'], priority: ['P0', 'P1', 'P2'], risk: ['low', 'medium', 'high'] };

// Kit 3.0 roles (owner, 2026-10-24, process/agents.md): Cursor implements every card; claude-code takes a card only
// after EXTERNAL_CEILING failed Cursor attempts and a "switch" event, and then runs on the card's tier. agy only advises
// while planning (scripts/advise.mjs); it never implements or reviews. Orchestrator harness ids.
export const IMPLEMENTER = 'cursor';
export const FALLBACK = 'claude-code';
export const AGENTS = [IMPLEMENTER, FALLBACK];
export const EXTERNAL_AGENTS = [IMPLEMENTER];
export const EXTERNAL_CEILING = 3;
export const ADVISOR = 'agy';
// Who made the model behind a worker or reviewer id. A review must come from another vendor than the work.
export const VENDOR = { haiku: 'anthropic', sonnet: 'anthropic', opus: 'anthropic', 'claude-code': 'anthropic', cursor: 'cursor' };

// A sensitive card gets a security review before merge: risk medium or high, or an allowed path that touches one of
// config.securityPaths (CI, hooks, scripts, environment files).
export function isSensitive(card, config = CONFIG) {
  if (card.risk === 'medium' || card.risk === 'high') return true;
  return card.allowed_paths.some((p) => config.securityPaths.some((s) => p.startsWith(s) || s.startsWith(p)));
}
// Cards from config.readyFrom on must pass readinessProblems(); older cards were written before kit 3 and are history.
export const isKit3 = (card, config = CONFIG) => Number(String(card.id ?? '').slice(2)) >= config.readyFrom;
export const isCommandBullet = (a) => /^`[^`]+`\s+exits\s+0\b/.test(a);

// Definition of ready: what a card needs before any agent may start it. Empty list = ready.
export function readinessProblems(card) {
  const p = [];
  if (!AGENTS.includes(card.agent)) p.push(`agent "${card.agent}" not in ${AGENTS.join('|')}`);
  for (const s of ['Goal', 'Do not touch']) if (!card.sections?.[s]) p.push(`## ${s} is empty`);
  for (const a of card.acceptance) {
    if (!isCommandBullet(a) && !/^Manual\b/.test(a)) p.push(`acceptance "${a}" is neither \`command\` exits 0 nor Manual (...): ...`);
  }
  if (!card.acceptance.some((a) => /^`npm test`\s+exits\s+0\b/.test(a))) p.push('acceptance must include `npm test` exits 0');
  if (!card.allowed_paths.length) p.push('allowed_paths must not be empty');
  return p;
}

// Cloud sessions clone 50 commits deep; Done cards and deleted tests then look missing. Fetch the rest of the history,
// or throw so no script reports a wrong board. Outside a git repository there is nothing to repair.
export function ensureFullHistory(root) {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try { if (git('rev-parse', '--is-shallow-repository') !== 'true') return; } catch { return; }
  try { git('fetch', '--quiet', '--unshallow'); } catch { /* reported below */ }
  if (git('rev-parse', '--is-shallow-repository') === 'true') {
    throw new Error('shallow git clone: board and history checks would be wrong. Run: git fetch --unshallow');
  }
}

// True when the module at importMetaUrl is the script node was started with. realpath on both sides: a symlinked,
// junctioned or subst project path must not turn a gate into a silent no-op.
export function isMain(importMetaUrl) {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(importMetaUrl)); } catch { return false; }
}
