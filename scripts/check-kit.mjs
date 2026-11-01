// Validates the delivery-system files (Claude-only agents and skills, rule files, cards). Exit 1 with problems, 0 if OK.
// Override the repo root with KIT_ROOT (used for tests).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, readCards, CARD_FILE, isSystemPath, TIERS, WORKER_FOR_TIER, CARD_SETS, minimumTier, tierRank, AGENTS, isKit3,
  readinessProblems, ensureFullHistory, isTestPath, kitConfig, CONFIG_DEFAULTS } from './cards.mjs';
import { readLog, replayLog } from './board.mjs';

const ROOT = process.env.KIT_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
let checks = 0;
const check = (ok, msg) => { checks++; if (!ok) problems.push(msg); return ok; };
try { ensureFullHistory(ROOT); } catch (e) { check(false, e.message); }
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const isDir = (p) => existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isDirectory();
const list = (p) => (isDir(p) ? readdirSync(join(ROOT, p)).sort() : []);
const frontmatter = (text) => parseFrontmatter(text)?.data ?? null;
const str = (v) => typeof v === 'string' && v.trim() !== '';
// A test that a card deleted stays a valid test_edits entry: it is in git history (CI checks out with fetch-depth 0).
const inHistory = (p) => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%H', '--', p], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() !== '';
  } catch { return false; }
};
const CONFIG = kitConfig(ROOT);
const names = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

// Cursor and other tools load .claude/agents and .claude/skills too (compatibility). Everything there must say it is for
// Claude only, so an outside executor does not pick up lead, worker or reviewer work.
const CLAUDE_ONLY = /^Claude only\b/;
// Skills the implementing agents share (Cursor reads .claude/skills too): process/toolchain.md, owner 2026-10-25.
const WORKER_SKILL = /^Workers: Cursor and Claude\b/;

// Agents
const MODELS = ['opus', 'sonnet', 'haiku', 'fable', 'inherit'];
const TOOLCHAIN = {
  // plugin id -> the skills vendored from it. A plugin is either enabled or vendored, never both (duplicate skills).
  plugins: {
    'superpowers@superpowers-marketplace': ['test-driven-development', 'systematic-debugging', 'verification-before-completion'],
    'ponytail@ponytail': ['ponytail'],
    'impeccable@impeccable': ['impeccable'],
  },
  context7: 'https://mcp.context7.com/mcp',
  env: { PONYTAIL_DEFAULT_MODE: 'full', PONYTAIL_SUBAGENT_MATCHER: '^worker-' },
  workerTools: ['Skill', 'mcp__context7__resolve-library-id', 'mcp__context7__query-docs'],
};
const agents = new Map();
for (const f of list('.claude/agents').filter((x) => x.endsWith('.md'))) {
  const p = `.claude/agents/${f}`;
  const fm = frontmatter(read(p));
  if (!check(fm, `${p}: missing frontmatter`)) continue;
  agents.set(basename(f, '.md'), fm);
  check(str(fm.name), `${p}: empty name`);
  check(fm.name === basename(f, '.md'), `${p}: name "${fm.name}" != file basename`);
  check(CLAUDE_ONLY.test(fm.description ?? ''), `${p}: description must start with "Claude only"`);
  if (fm.model !== undefined) {
    check(MODELS.includes(fm.model) || fm.model.startsWith('claude-'), `${p}: bad model "${fm.model}"`);
  }
  for (const s of Array.isArray(fm.skills) ? fm.skills : []) {
    check(existsSync(join(ROOT, `.claude/skills/${s}/SKILL.md`)), `${p}: skill "${s}" has no .claude/skills/${s}/SKILL.md`);
  }
  // Only the lead (the main session) spawns agents; reviewers check, they never fix what they check.
  const tools = names(fm.tools);
  check(['Agent', 'Task'].every((t) => !tools.includes(t)), `${p}: only the lead spawns agents; remove Agent/Task from tools`);
  if (fm.name?.endsWith('reviewer')) {
    const denied = names(fm.disallowedTools);
    check(['Edit', 'Write'].every((t) => !tools.includes(t) && denied.includes(t)),
      `${p}: a reviewer must not have Edit or Write (list them in disallowedTools)`);
  }
}
// One worker per tier, on that tier's model.
for (const tier of TIERS) {
  const name = WORKER_FOR_TIER[tier];
  check(agents.get(name)?.model === tier, `.claude/agents/${name}.md: missing or model is not ${tier} (worker for tier ${tier})`);
}

// Toolchain (process/toolchain.md): plugins, context7 and ponytail scoping stay configured, workers can reach them.
const json = (f) => { try { return JSON.parse(read(f)); } catch { return null; } };
const settings = json('.claude/settings.json') ?? {};
for (const [plugin, skills] of Object.entries(TOOLCHAIN.plugins)) {
  const vendored = skills.every((d) => existsSync(join(ROOT, `.claude/skills/${d}/SKILL.md`)));
  const enabled = settings.enabledPlugins?.[plugin] === true;
  check(vendored !== enabled, `${plugin}: must be either enabled in .claude/settings.json or vendored as .claude/skills/{${skills.join(',')}}, not ${enabled ? 'both' : 'neither'}`);
}
// Every project file a hook command points at must exist.
for (const groups of Object.values(settings.hooks ?? {})) {
  for (const h of groups.flatMap((g) => g.hooks ?? [])) {
    for (const m of String(h.command ?? '').matchAll(/\$CLAUDE_PROJECT_DIR\/([\w./-]+)/g)) check(existsSync(join(ROOT, m[1])), `.claude/settings.json: hook points at missing ${m[1]}`);
  }
}
check(Object.keys(settings.hooks?.SubagentStart ?? {}).length > 0, '.claude/settings.json: SubagentStart hook (ponytail for workers) missing');
// Kit 3 gates (process/agents.md): the command guard runs before every shell command, git hooks live in the repository,
// and the decider only reads.
const preTool = (settings.hooks?.PreToolUse ?? []).filter((g) => (g.hooks ?? []).some((h) => String(h.command).includes('.claude/hooks/guard.mjs')));
check(preTool.some((g) => /Bash/.test(g.matcher ?? '') && /PowerShell/.test(g.matcher ?? '')), '.claude/settings.json: PreToolUse guard (.claude/hooks/guard.mjs) for Bash|PowerShell missing');
for (const h of ['pre-commit', 'pre-push']) check(existsSync(join(ROOT, `.githooks/${h}`)), `.githooks/${h}: missing`);
if (agents.has('decider')) {
  const d = agents.get('decider');
  check(d.model === 'haiku', '.claude/agents/decider.md: model must be haiku');
  check(['Edit', 'Write', 'Bash', 'PowerShell'].every((t) => !names(d.tools).includes(t)), '.claude/agents/decider.md: the decider only reads (no Edit, Write, Bash, PowerShell)');
}
check((settings.enabledMcpjsonServers ?? []).includes('context7'), '.claude/settings.json: enabledMcpjsonServers must include context7');
check(json('.mcp.json')?.mcpServers?.context7?.url === TOOLCHAIN.context7, `.mcp.json: context7 must point to ${TOOLCHAIN.context7}`);
for (const [k, v] of Object.entries(TOOLCHAIN.env)) check(settings.env?.[k] === v, `.claude/settings.json: env.${k} must be "${v}"`);
for (const tier of TIERS) {
  const tools = names(agents.get(WORKER_FOR_TIER[tier])?.tools);
  for (const t of TOOLCHAIN.workerTools) check(tools.includes(t), `.claude/agents/${WORKER_FOR_TIER[tier]}.md: tools must include ${t}`);
}

// Skills
for (const d of list('.claude/skills').filter((x) => isDir(`.claude/skills/${x}`))) {
  const p = `.claude/skills/${d}/SKILL.md`;
  if (!check(existsSync(join(ROOT, p)), `${p}: missing`)) continue;
  const fm = frontmatter(read(p));
  if (!check(fm, `${p}: missing frontmatter`)) continue;
  check(fm.name === d, `${p}: name "${fm.name}" != folder "${d}"`);
  check(CLAUDE_ONLY.test(fm.description ?? '') || WORKER_SKILL.test(fm.description ?? ''), `${p}: description must start with "Claude only" or "Workers: Cursor and Claude"`);
}

// Rule and state files. BOARD.md and feature_list.json belonged to the old file-driven board; git and cards.log are
// now the only status source (scripts/board.mjs), so they must not come back.
for (const f of ['CLAUDE.md', 'AGENTS.md', 'anchor.md', 'SPEC.md', 'STORYMAP.md']) check(existsSync(join(ROOT, f)), `${f}: missing`);
for (const f of ['BOARD.md', 'feature_list.json']) check(!existsSync(join(ROOT, f)), `${f}: retired, status comes from git and cards.log (npm run board)`);
for (const f of ['CLAUDE.md', 'AGENTS.md'].filter((x) => existsSync(join(ROOT, x)))) {
  const text = read(f);
  const n = text.split('\n').length;
  check(n < 200, `${f}: ${n} lines, must be < 200`);
  for (const ref of new Set(text.match(/\bprocess\/[\w-]+\.md\b/g) ?? [])) check(existsSync(join(ROOT, ref)), `${f}: refers to missing ${ref}`);
}

// Project settings (kit.config.json): known keys with the default's type.
const own = json('kit.config.json');
check(own !== null, 'kit.config.json: missing or not JSON');
for (const [k, v] of Object.entries(own ?? {})) {
  check(k in CONFIG_DEFAULTS, `kit.config.json: unknown key "${k}"`);
  if (k in CONFIG_DEFAULTS) check(Array.isArray(v) === Array.isArray(CONFIG_DEFAULTS[k]) && typeof v === typeof CONFIG_DEFAULTS[k], `kit.config.json: ${k} has the wrong type`);
}
try { new RegExp(CONFIG.testPattern); } catch { check(false, `kit.config.json: testPattern is not a regular expression`); }

// Cards (cards/C-NNN.md)
const SETS = CARD_SETS;
const FIELDS = ['id', 'title', 'story_step', 'size', 'priority', 'risk', 'start_tier', 'agent', 'slice', 'depends_on', 'allowed_paths', 'test_edits'];
const story = existsSync(join(ROOT, 'STORYMAP.md')) ? read('STORYMAP.md') : '';
const stepRow = (s) => new RegExp(`^\\|\\s*${String(s).replace(/\./g, '\\.')}\\s*\\|`, 'm').test(story);
check(isDir('cards'), 'cards/: missing');
const cards = readCards(ROOT);
const ids = new Set(cards.map((c) => c.id));
for (const f of list('cards').filter((x) => x.endsWith('.md'))) check(CARD_FILE.test(f), `cards/${f}: file name must be C-NNN.md`);
for (const c of cards) {
  const w = c.file;
  if (!check(!c.invalid, `${w}: ${c.invalid}`)) continue;
  check(c.id === basename(w, '.md'), `${w}: id "${c.id}" != file name`);
  for (const k of c.fields) check(FIELDS.includes(k), `${w}: unknown field "${k}" (a card holds no status; git and cards.log do)`);
  check(str(c.title), `${w}: empty title`);
  for (const k of Object.keys(SETS)) check(SETS[k].includes(c[k]), `${w}: ${k} "${c[k]}" not in ${SETS[k].join('|')}`);
  if (check(TIERS.includes(c.start_tier), `${w}: start_tier "${c.start_tier}" not in ${TIERS.join('|')}`)) {
    const min = minimumTier(c);
    check(tierRank(c.start_tier) >= tierRank(min), `${w}: start_tier "${c.start_tier}" is below the minimum "${min}" for size ${c.size}, risk ${c.risk} (process/ranking.md)`);
  }
  check(c.slice === null || Number.isInteger(c.slice), `${w}: slice must be a whole number`);
  check(str(c.story_step) && stepRow(c.story_step), `${w}: story_step "${c.story_step}" not found in STORYMAP.md`);
  check(c.acceptance.length > 0, `${w}: needs at least one bullet under "## Acceptance"`);
  check(c.allowed_paths.length > 0, `${w}: allowed_paths must not be empty`);
  if (c.agent !== undefined) check(AGENTS.includes(c.agent), `${w}: agent "${c.agent}" not in ${AGENTS.join('|')}`);
  if (isKit3(c, CONFIG)) for (const r of readinessProblems(c)) check(false, `${w}: not ready: ${r}`);
  for (const p of new Set([...c.allowed_paths, ...c.test_edits])) {
    check(!isSystemPath(p), `${w}: allowed path "${p}" covers a system file (planner only)`);
  }
  for (const t of c.test_edits) check(isTestPath(t, CONFIG) && (existsSync(join(ROOT, t)) || inHistory(t)), `${w}: test_edits "${t}" is not an existing test file (kit.config.json testPattern)`);
  for (const d of c.depends_on) check(ids.has(d), `${w}: depends_on "${d}" has no card file`);
}

// Card event log (cards.log): format, known cards, tier order, attempt ceilings.
const log = readLog(ROOT);
checks += log.events.length;
problems.push(...log.problems, ...replayLog(log.events, cards.filter((c) => !c.invalid)).problems);

if (problems.length) {
  console.error(`check-kit: ${problems.length} problem(s) in ${checks} checks`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-kit: OK (${checks} checks)`);
