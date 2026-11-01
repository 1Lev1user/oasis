# Card writing

Lead only. One card is one story step slice that one worker can finish in one run and the reviewer can check in one review.

## File
`cards/C-NNN.md`, the next free number. Frontmatter fields, all required except `slice`:

```
---
id: C-NNN
title: "Short imperative title"
story_step: S2.4
size: S | M | L
priority: P0 | P1 | P2
risk: low | medium | high
start_tier: haiku | sonnet | opus   # process/ranking.md
agent: cursor      # process/agents.md; claude-code only after a switch
slice: 2            # optional
depends_on: []      # card ids
allowed_paths:      # folders end with /
  - src/views/month.js
  - test/entryUndo.test.js
test_edits: []      # existing test files the owner approved editing
---
```

Body sections, in this order: `## Goal`, `## Acceptance` (bullets), `## Do not touch`, `## Notes`.

No status field: the board holds the status. `npm run check:kit` rejects unknown fields.

## Classification
- Size S: one file area, about an hour, clear behaviour. M: several files, one module. L: cross-module; split it first.
- Risk high: payments, personal data, migrations, data format, publishing, security, irreversible actions.
- Priority: P0 fixes a break or blocks other cards; P1 is wanted next; P2 later.
- Start tier: the minimum from process/ranking.md (risk high = opus; M, L, risk medium or no automatic check = sonnet; S + low + an automatic check = haiku). Higher only with a reason in Notes.

## Ready (kit 3)
No agent starts a card that is not ready. `check:kit`, `dispatch` and `merge` enforce it (scripts/cards.mjs `readinessProblems`): `agent` is cursor (or claude-code after a switch); `## Goal` and `## Do not touch` not empty; allowed_paths not empty; every acceptance bullet is `` `command` exits 0 `` or starts with "Manual"; `npm test` is one of them. Before dispatch the card also needs agy's advice (`npm run advise`, answered in an `agy:` line in Notes) and a passed decider `plan` checklist.

## Acceptance
- Commands that exit 0 when the card is done, written as `` `command` exits 0 ``. `npm test` is always one of them. A bullet that is neither a command nor Manual ("the screen looks right") fails check:kit: write the command.
- Manual checks start with "Manual (owner):" or "Manual (design-review):".
- No automatic check possible: write one first as its own card, or a manual check the reviewer can run.

## Allowed paths
- The smallest set of files or folders the card needs. CI enforces it on the pull request.
- Never planning or system files (cards/, process/, .claude/, CLAUDE.md, AGENTS.md, anchor.md, SPEC.md, STORYMAP.md, the check scripts and their workflows). `check:kit` rejects them.
- Finer limits ("lines 563-701 only") go under Do not touch as "Limit for `path`: ...".
- Existing tests are never editable unless the owner approved it; then list the file in `test_edits` and say so in Notes.

## Size guide
About 100 changed lines is a normal card; 1000 is too many. 200 lines in one file is fine; the same lines over 50 files are not (Google eng-practices, small CLs).

## UI cards
Acceptance includes the process/design-review.md checks: screenshots at 390, 768 and 1280 px, light and dark.

## Writing for the executor
The card must stand alone: the worker sees only the repository and the card. Give file and line references, function names, the exact messages, and what a test must assert. Label anything not checked in the code as unverified.

## Placeholders
A card that creates stubs or placeholders for later cards never asks for tests that pin the placeholder behaviour (empty output, empty exports). Test the contract (exports exist, types), not the placeholder. Otherwise every later card breaks a test it may not edit (C-009, 2026-10-08).

## Rejects
A card without a story step, acceptance or allowed paths, or with two unrelated goals, is not written.

## Tools while writing (process/toolchain.md)
- Run `find-skills` before every card; record the result in Notes as `find-skills: <result>`.
- Card that would add utility code: run `search-first`; adopting a package needs the owner's approval.
- Notes that name a library API: check it with context7 and give the library id.
- Card that changes what an existing function returns or accepts: grep `test/` for that function and for exact-shape assertions on its output (`deepEqual`, fixtures, placeholder tests such as "until C-NNN"). Every test the change breaks goes into `test_edits` with the allowed change named in Notes. Three cards (C-035, C-038, C-044) went back to the lead on 2026-10-10 because this step was skipped. Grep every test file, not only the module's own test: fixtures that hold a whole data shape (for example a full game object in store-game.test.js) break too (C-040, 2026-10-11).

## After writing
Add the story step to STORYMAP.md if it is new, run `npm run check:kit`, commit with the message `Plan: C-NNN title` straight to `main`, push. The card is now in Backlog (`npm run board`).
