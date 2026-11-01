# Board

There is no GitHub Project board. The status of a card is derived from git and from `cards.log`; `npm run board` prints it. No card file holds a status.

## Statuses
| Status | Derived from | Who causes it |
|---|---|---|
| Backlog | card file on `main`, nothing else | lead writes the card |
| In progress | a branch `card/C-NNN-...` exists, or `cards.log` has an `attempt` | lead creates the branch and spawns a worker |
| In review | the last `attempt`/`pr`/`review` event is `pr` | lead opens the pull request |
| Blocked | the last `blocked`/`unblocked` event is `blocked` | lead, after the opus ceiling or a missing decision |
| Done | a commit on `main` whose subject starts with `C-NNN:` (the squash merge) | lead merges after review |
| Dropped | `cards.log` has a `dropped` event | lead, when the owner's decision supersedes the card; its open pull request is closed and its branch deleted |

A failed review (`review | fail`) puts the card back to In progress automatically, because the last work event is no longer `pr`.

## cards.log
Append only, lead only, committed to `main` together with the step it records. One line per event:

```
DATE | C-NNN | EVENT | VALUE | NOTE
```

| EVENT | VALUE | When |
|---|---|---|
| attempt | `cursor`, or the tier that ran (haiku, sonnet, opus) for `claude-code` after a `switch` | once per worker run: `npm run dispatch` writes it at the start ("started via ao"); in the cloud the lead writes it once with RESULT. Never a "started" and a "DONE" line for the same run (until 2026-10-23 that counted each run twice) |
| escalate | the new tier | ceiling reached, or the lead escalates early (reason in the note) |
| pr | pull request number | pull request opened |
| simplify | changed or clean | after the lead's /simplify pass, before the pull request; not an attempt |
| review | pass or fail | after process/review.md; findings summary in the note. Cards with an `agent` field: the note starts with the reviewer id (haiku, sonnet, opus, claude-code, cursor); a reviewer of the worker's own vendor needs `same-vendor: <reason>` in the note (process/agents.md) |
| blocked | - | the card cannot continue; the question to the owner in the note |
| unblocked | - | the owner answered |
| dropped | - | the owner's decision superseded the card; reason in the note. Final: the work moves to new cards |
| advice | agy | `npm run advise` writes it: agy advised on the card; the note names the advise session. Required before dispatch |
| checklist | plan or accept | the decider's yes/no checklist; the note starts with pass or fail. `plan` pass is required before dispatch, `accept` pass after the pull request before merge |
| security | pass or fail | the security-reviewer on a sensitive card (risk medium/high or a path in kit.config.json securityPaths); pass required before merge |
| void | cursor | a Cursor run that never reached the card (crash, approval stall, broken setup); the note starts with `setup: <what failed>`; it does not count toward the 3 attempts |
| switch | claude-code | after 3 cursor attempts the lead hands the card to claude-code (the card's agent field changes in the same commit) |

Example:
```
2026-10-08 | C-001 | attempt | haiku | DONE, acceptance exit 0
2026-10-08 | C-001 | pr | 3 | -
2026-10-08 | C-001 | review | pass | reviewer sonnet PASS
```

`npm run check:kit` validates every line: date, card, event, tier order and attempt ceilings (process/ranking.md).

## Hygiene
- WIP limits: 3 In progress, 2 In review. `npm run board` warns above them.
- Two active cards must not share allowed_paths. `npm run board` warns.
- A card In progress across more than two sessions gets split or blocked.
- Merged card branches are deleted after the merge, so the branch list stays short.
