# SPEC

Source of truth for what the project is. Only the owner and the lead (Claude) edit this file.

## Product goal
One or two sentences. What outcome exists when the project is finished.

## Users (actors)
- Actor: who they are, what they need.

## Out of scope
- What this project will not do.

## Constraints
- Stack, budget, deadlines, legal, security, hosting.

## Definition of Done (project level)
- Every card in Done passed process/review.md and its pull request is merged into `main`.
- Every story map step in the current slice has a Done card.
- Checks that must exit 0: the project tests (`testCommand` in kit.config.json), `npm run check:kit`, the kit tests (`node --test "test/kit/*.test.mjs"`); on pull requests also the card guard in CI.

## Board
- `npm run board`: statuses come from git and cards.log only (process/board.md).

## Open questions
- Question, owner, date.
