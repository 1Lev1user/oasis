# Toolchain: which tool runs at which step of every card

Decided by the owner on 2026-10-07: find-skills, context7, ponytail, superpowers, simplify and impeccable are part of every card. Each has a fixed step and a fixed owner (lead or worker), so a tool never replaces a process step and two tools never do the same job.

## Per card
| Step | Who | Tool | Mandatory | Evidence |
|---|---|---|---|---|
| Write the card | lead | `find-skills` (owner's skill): is there a skill or plugin that already does this? | every card | one line in card Notes: "find-skills: <result>" |
| Write the card | lead | `search-first` (ECC): is there a package or existing tool? Adopting one needs the owner's approval | every card that would add utility code | line in Notes |
| Write the card | lead | context7: check every library API the Notes mention | every card that names a library API | library id in Notes |
| Implement | worker | ponytail (mode full, injected by its hook): smallest solution, stdlib first | always on for workers | automatic |
| Implement | worker | `test-driven-development` (superpowers): failing test first | every card | TOOLS line of the worker report |
| Implement | worker | context7 for any library API used | every card that calls a library | TOOLS line |
| Implement | worker | `systematic-debugging` (superpowers) on a failure not understood at once | when it happens | TOOLS line |
| Implement | worker | `verification-before-completion` (superpowers) before DONE | every card | TOOLS line + COMMANDS |
| Review | Claude reviewer | `/simplify` and, on UI cards, `/impeccable critique` in report-only mode; findings that matter are FAIL findings Cursor fixes in the next attempt | every card | review note |
| Implement | Cursor | the "Workers" skills in `.claude/skills` and its own subagents (AGENTS.md, Tools) | when useful | report |
| Before the PR | lead | `/impeccable audit` and `/impeccable critique` | every UI card; other cards "N/A" in the PR | PR description |
| Review | reviewer, security-reviewer | none of the above; ponytail is not injected into reviewers | - | - |

A worker report without a TOOLS line, or with TDD or verification missing without a reason, fails review Level 1 (process/review.md).

## Precedence
- The owner's grill-first rule, task-harness and this kit decide how work is planned. superpowers' `using-superpowers` bootstrap (it asks for skills before clarifying questions and for brainstorming before plans) loses to them.
- superpowers planning skills (brainstorming, writing-plans, executing-plans, subagent-driven-development, dispatching-parallel-agents, using-git-worktrees, finishing-a-development-branch, requesting-code-review) are not used for cards: the story map and cards are the plan, the lead dispatches workers, process/review.md is the review.
- ponytail and simplify both push toward less code: ponytail while writing, simplify after. Neither may drop an acceptance item.
- impeccable ideas never override the thresholds in process/design-review.md.

## Where each tool comes from
Cloud containers start empty and Claude Code does not install project-declared plugins in them (tested 2026-10-07: a SessionStart installer works only from the next start). So the parts in use are vendored into the repository and load on the first start of every session. The three plugins stay declared in `.claude/settings.json` but disabled.

| Tool | Source | Installed as |
|---|---|---|
| find-skills | owner's skill (1Lev1user/claude-code-setup, skills/find-skills) and the Cowork copy | owner's global skills |
| search-first | ECC v2.2.3, vendored (process/ecc.md) | `.claude/skills/search-first` |
| context7 | Upstash, hosted HTTP MCP `https://mcp.context7.com/mcp`, anonymous | `.mcp.json`, enabled in `.claude/settings.json` |
| ponytail | ponytail 4.13.0, github.com/DietrichGebert/ponytail, commit 552acd5, MIT | `.claude/skills/ponytail` + hooks `.claude/hooks/ponytail-*.js` |
| superpowers | superpowers 6.4.2, github.com/obra/superpowers, commit 8ca22db, MIT | `.claude/skills/{test-driven-development,systematic-debugging,verification-before-completion}` |
| impeccable | impeccable 4.5.0, github.com/pbakaus/impeccable, commit ffeda44, Apache-2.0 | `.claude/skills/impeccable` (its launcher downloads the engine binary into `~/.impeccable` on first use) |
| simplify | built into Claude Code | - |

Changes to vendored files: descriptions start with "Claude only" and name their step (check-kit); `superpowers:` prefixes in systematic-debugging point at the vendored names; `.claude/hooks/package.json` marks the ponytail hooks as CommonJS (the project is ES modules). Not vendored: superpowers' using-superpowers bootstrap hook and its planning skills; ponytail's other five skills.

## Hooks (`.claude/settings.json`)
| Event | Hook | Effect |
|---|---|---|
| SessionStart | ponytail-activate.js | ponytail full mode in the main session |
| SubagentStart | ponytail-subagent.js | ponytail in workers only (`PONYTAIL_SUBAGENT_MATCHER=^worker-`) |
| UserPromptSubmit | ponytail-mode-tracker.js | `/ponytail lite|full|ultra|off` switches mode |
| SessionStart, PostToolUse (Edit/Write), Stop | impeccable `hook` | UI change checks and the design deep pass |

Verified 2026-10-07 in a fresh config: vendored skills, ponytail mode and context7 present at the first start; ponytail reached worker-light and not reviewer; using-superpowers absent.

## Switching to plugins later
Once the environment's setup script installs the plugins (lines in anchor.md, "Cloud setup"): set the three `enabledPlugins` to true, delete the vendored skill folders and `.claude/hooks/ponytail-*`, remove the matching hooks from `.claude/settings.json`. check-kit enforces "enabled or vendored, never both". Keep `PONYTAIL_SUBAGENT_MATCHER`.

## Settings that make it work (`.claude/settings.json`)
- `enabledMcpjsonServers: ["context7"]`: approves the project MCP server.
- `env.PONYTAIL_DEFAULT_MODE = full`; `env.PONYTAIL_SUBAGENT_MATCHER = ^worker-`.
- `hooks`: the table above.

`npm run check:kit` fails when any of these is missing or a hook points at a missing file.

## Known side effects
- impeccable runs a hook after every Edit/Write and a "design deep pass" at every stop, also on non-UI work. Watch the retro for cost or noise.
- Vendored copies do not update themselves. Updating: copy the new version, keep the description lines, record version and commit here.
