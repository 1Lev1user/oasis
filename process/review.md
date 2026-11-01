# Review: from In review to Done

Lead only. Nothing is Done on anyone's word. Evidence is command output.

## Start
1. `npm run board`: review only cards In review.
2. Find the pull request: branch `card/C-NNN-...`, title `C-NNN: ...`, number in the `pr` line of cards.log.
3. Use the card's worktree under `.worktrees/`, never the main checkout.

## Before the pull request (lead, after worker DONE)
- Run `/simplify` in the card's worktree. Apply fixes only inside the card's allowed_paths, commit on the card branch, rerun the acceptance commands and `check:card`. Append `simplify | changed` or `simplify | clean` to cards.log. It is not an attempt.
- UI card: `/impeccable audit` and `/impeccable critique`; fixes go back to the worker as a new attempt, findings go into the PR description. Other cards: "impeccable: N/A (no UI)" in the PR description.

## Level 1: checks
- The worker report has a TOOLS line with test-driven-development and verification-before-completion (or a reason why not), and context7 ids for library APIs used (process/toolchain.md). Missing: the card fails review.
- CI on the pull request is green: `npm test`, `npm run check:kit`, `check:card`.
- Run every acceptance command of the card yourself. Record command and exit code.

## Level 2: scope
- `check:card` passed: every changed file is inside `allowed_paths`, no existing test changed unless listed in `test_edits`.
- Read the diff for things the guard cannot see: secrets, new dependencies, network calls, changes outside a "Limit for" line.

## Level 3: fresh-context review
- Kit 3 (process/agents.md): on the owner's computer the reviewer comes from another vendor than the worker (`npm run dispatch -- C-NNN --review`) and the merge goes through `npm run merge -- C-NNN`. In the cloud session only Claude reviewers exist: log the review with `same-vendor: cloud session has only Claude`, and merge with the GitHub MCP merge tool (the guard blocks `gh pr merge`; `merge.mjs` refuses same-vendor reviews).
- Spawn `.claude/agents/reviewer.md` with the card file path, the branch, the base and the worktree path. Sonnet by default; model opus when the card risk is high. PASS is required.
- Risk high only: also spawn `.claude/agents/security-reviewer.md` with the same inputs, in parallel and without sharing the first reviewer's output (santa-method, process/ecc.md). Both must PASS. A finding only one of them raises is checked by the lead against the code before it counts.

## Level 4: acceptance
- Does the change satisfy the card Goal and its story step in STORYMAP.md?
- UI card: process/design-review.md; the owner has checked the screenshots.
- Manual items: the owner confirmed them.

## Close
- All levels pass: squash-merge the pull request with the title `C-NNN: title`, delete the branch and the worktree, append `review | pass` to cards.log and a line to claude-progress.txt. The squash commit makes the card Done.
- Any level fails: one PR comment with numbered findings (file:line, what is wrong, why it matters), append `review | fail` to cards.log. The next worker run gets the findings and counts as a new attempt (process/ranking.md).
- A problem found later in Done work becomes a new card. Done is never reopened.

## Report to the owner
RESULT (merged or returned), EVIDENCE (commands and exit codes), FINDINGS if any, UNVERIFIED if any. Five lines or fewer.
