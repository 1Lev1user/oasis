# Agents: kit 3 (one conductor, one implementer, one advisor)

Owner decisions 2026-10-23 and 2026-10-24. The owner talks only to the conductor: the main Claude Code session in Agent Orchestrator (`ao`), skill `conductor`.

## Roles
| Who | Does | Never |
|---|---|---|
| Claude (conductor) | plans everything (features, screens, security, hooks, infrastructure), writes every card in detail, verifies facts against reliable sources, reviews, merges | writes app code |
| agy (Antigravity, Gemini) | while planning, `npm run advise`: concrete solutions and what is missing from the plan (security, edge cases, tests, infrastructure, UX) | implements or reviews a card |
| Cursor | implements every card (`agent: cursor`); reviews a card that claude-code implemented | merges, plans |
| claude-code (worker) | reviews Cursor's work (`npm run dispatch -- C-NNN --review`); implements a card only after 3 failed Cursor attempts and a `switch` event | merges |
| decider (Haiku) | yes/no checklist in JSON, mode `plan` before dispatch and mode `accept` before merge | reasons, edits |
| security-reviewer | security review of a sensitive card before merge | edits |

agy's spare capacity goes to research for the owner (`npm run advise -- --brief`), only when agy is idle, no advice is due soon and it has plenty of quota left (not measurable through Agent Orchestrator; assume plenty unless it hit a limit in the last 24 hours). Results become cards only after the owner's yes.

agy's points are input, not decisions: the conductor checks each one, adds it to the cards or tells the owner in one line why not, and writes an `agy:` line in the card's Notes.

Rules are advice; gates are code. Every repeated mistake becomes a gate, not a new sentence.

## Gates
| Gate | Where | Holds |
|---|---|---|
| Card ready: agent cursor (claude-code only after a switch), Goal, Do not touch, allowed_paths, every acceptance bullet a `command` exits 0 or Manual, `npm test` among them | `check:kit`, `dispatch`, `merge` | conductor, CI |
| Planning done: an `advice | agy` line and a passed `checklist | plan` for the card | `scripts/dispatch.mjs` | conductor |
| Start only through `npm run dispatch -- C-NNN`: board status, depends_on Done, WIP 3, no shared paths, hooks on, ceilings | `scripts/dispatch.mjs` + `.claude/hooks/guard.mjs` blocks `ao spawn` | conductor |
| claude-code works a card only after 3 Cursor attempts and a `switch` line | `check:kit` (cards.log replay), `dispatch` | conductor |
| Merge only through `npm run merge -- C-NNN`: open PR `C-NNN: title` on its card branch, green checks, PASS from another vendor naming the head commit, a passed `checklist | accept`, and a `security | pass` on a sensitive card | `scripts/merge.mjs` + guard blocks `gh pr merge` and `ao pr merge` | conductor |
| No force push, `reset --hard`, `clean -f`, `--no-verify`, hook path changes, `rm -rf` on / ~ . .. * | `.claude/hooks/guard.mjs` | Claude |
| The same for Cursor, plus no `gh pr merge`, `ao spawn`, reading `.env` / `.env.local`; holds even in Cursor's `--force` mode (tested 2026-10-25) | `.cursor/cli.json` deny list | Cursor |
| No secrets; card branch commits stay inside allowed_paths and leave existing tests alone; on main only system files and package.json | `.githooks/pre-commit` | every agent |
| No force push, no deleting main; main takes only system files and package.json, and never a local `C-NNN:` merge commit; kit tests, check:kit and the project tests pass before any push | `.githooks/pre-push` | every agent |
| Kit tests, check:kit, secret scan, project tests and `ciCommand` run with node directly; the card guard runs from the base branch | CI (`.github/workflows/test.yml`) | everyone |

A sensitive card: risk medium or high, or an allowed path under `securityPaths` in kit.config.json. `.gitattributes` keeps every text file LF, so the sh hooks also run on a Windows checkout.

Known holes, not closed by code:
- A private repository on the GitHub Free plan cannot have branch protection. An agent that skips the local hooks and merges on GitHub itself is caught only afterwards, by CI on main and the board.
- The guard sees only Claude's shell tools. A GitHub MCP merge tool is outside it.
- The `review`, `checklist` and `security` lines are written into cards.log by the conductor; nothing ties a line to a real run.
- The pre-push hook tests the working tree, not each pushed commit; CI tests the pushed commit.
- Every check the pre-push hook runs must pass on the owner's Windows computer, or nothing can be pushed. The installer checks this once; a test that fails only on Windows is a P0 card.

Setup per clone: `npm run setup` (sets `core.hooksPath` to `.githooks`; worktrees share it). `dispatch` refuses to start anything while it is off.

## Review across vendors
Work by Cursor is reviewed by Claude Code; work by claude-code (after a switch) by Cursor on a non-Claude model (the owner sets the model in Cursor; unverified that `ao` can pin it). The `review` line in cards.log starts with the reviewer id and names the reviewed commit (`claude-code PASS head 9d7d79d ...`); check-kit rejects a same-vendor review without a `same-vendor: <reason>` note, and `merge` rejects it always. `merge` squash-merges only that reviewed commit (`--match-head-commit`): a push after the review needs a new review.

## Flow on the owner's computer
1. The owner states a wish in the conductor's chat. Ambiguous: the conductor asks first, with options and a recommended default.
2. The conductor writes detailed cards (process/story-map.md, card-writing.md), `agent: cursor`, runs `npm run check:kit`, commits them to main, pushes.
3. `npm run advise -- <cards>`: agy's solutions and gaps. The conductor folds them into the cards or tells the owner why not.
4. decider `plan` per card: `checklist | plan | pass`. Commit and push.
5. `npm run dispatch -- C-NNN` for each card in "Next to pull", up to 3. It logs the attempt; commit cards.log to main.
6. Cursor follows AGENTS.md: card branch, red/green, acceptance commands, push, PR `C-NNN: title`, `ao report --done`.
7. Conductor: `pr` line, `npm run dispatch -- C-NNN --review` (Claude Code), the security-reviewer on a sensitive card, decider `accept`.
8. Any FAIL: logged with numbered findings, then `npm run dispatch -- C-NNN` again (a new attempt that carries the findings). All pass: `npm run merge -- C-NNN`.
9. After 3 failed Cursor attempts: `switch | claude-code`, the card's agent changes on main, the owner gets one line.

Stop and ask the owner before anything irreversible or costly: deleting data or branches the conductor did not create, paid services, secrets, repository settings.

## Talking to the owner
- While cards run: only "who → task" lines, `npm run board -- --who <the wish's cards>`, for example `cursor → C-003 Day board`. No details of what was done.
- The conductor comes back only when a decision is needed: an ambiguous wish, a blocked card, a gate it cannot satisfy, two failed reviews in a row, anything irreversible or costly. A decision question is in the owner's current language, with options and a recommended default.
- When a wish is done: a short bullet list (`*`) in the owner's language of what now exists, what was fixed, what was added. No explanation, no closing text.
- Everything else (status, cards, commits, pull requests, files) is in English.
