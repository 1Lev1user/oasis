# ECC parts in this repository

Source: ECC (Everything Claude Code), github.com/affaan-m/ECC, version 2.2.3, commit ef648e01899ba3e8dc6371642deaaf64b4477775, MIT licence. Vendored by copying files by hand, not with its installer: its smallest profile (`minimal`, `--target claude-project`) writes 489 files into `.claude/`, and the `developer` profile adds 24 automatic hooks.

## Vendored
| File | ECC role | Role here |
|---|---|---|
| `.claude/agents/security-reviewer.md` | security reviewer, "use proactively" | second, independent reviewer for risk-high cards only (process/review.md Level 3) |
| `.claude/skills/santa-method/SKILL.md` | two independent reviewers must both pass | the protocol behind that double review |
| `.claude/skills/search-first/SKILL.md` | search registries, MCP, skills, GitHub before writing code | lead, while writing a card that would otherwise ask for custom utility code |

## Changes made to the vendored files
- Every description starts with "Claude only" and names the step that uses it (check-kit requires this; without it `npm run check:kit` fails).
- security-reviewer: `disallowedTools: Edit, Write` added, and a "Project overrides" section: read-only, no `npm audit` and no `npx eslint --plugin security` (both reach the network or install packages), fixed report format.
- Nothing else in the bodies was changed. Text in them that conflicts with this repository loses to the overrides below.

## Project overrides (this repository wins)
- ECC's 80% coverage target is not adopted. A card's acceptance commands decide.
- ECC's planning flow (planner agent, PRD, architecture docs, GitHub epics via `gh`) is not used. The story map and cards are the plan.
- search-first's "adopt: install the package" needs the owner's approval and a reason in the card. Workers never add dependencies.
- No ECC hooks, commands or rules are installed.

## Not vendored, and why
| ECC part | Reason |
|---|---|
| Hooks (developer profile, 24 hooks) | fire on every tool call; the doc-file warning hook would fire on every card and anchor.md; stop hooks run format and typecheck on every stop |
| Commands `/plan`, `/code-review`, `/checkpoint`, `/learn`, `/security-scan` | same names as built-in skills and the owner's "checkpoint" command |
| `code-reviewer` and about 25 language reviewers | compete with kit's single reviewer; a language reviewer can be added once the stack is known |
| `verification-loop` | duplicates review Level 1 and the owner's verify-before-done; built around TS/Python and 80% coverage |
| `build-error-resolver` | its recovery steps delete `node_modules` and the lock file and reinstall, which breaks the no-new-dependencies rule |
| `delivery-gate` | blocks finishing when disk is under 15 GB or "learning logs" are stale; unrelated to card quality |
| `tdd-workflow`, rules/common | 80% coverage rule and a second development workflow |

## Judging ECC
After the first slice, the retro compares: findings the security-reviewer raised that the kit reviewer missed, false alarms, and time spent. Keep, extend or remove on that evidence (process/retro.md).
