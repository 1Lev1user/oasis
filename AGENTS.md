# AGENTS.md: Oasis

Rules for every agent that implements or reviews a card in Agent Orchestrator: Cursor (implements every card), Claude Code (reviews; implements only a card the lead switched after 3 failed Cursor attempts). The lead follows CLAUDE.md, which imports this file. Any other tool that reads this file follows the same rules.

## How work flows
1. The lead writes the card on `main` and starts you with `npm run dispatch -- C-NNN`.
2. You implement that one card on branch `card/C-NNN-short-name` (the prompt names it) and commit there.
3. You push the branch, open a pull request titled `C-NNN: <card title>` into `main` and run `ao report --done`.
4. A reviewer from another vendor checks it; the lead merges (Done) or starts a new attempt with the findings.

## Rules for implementing a card
- The card is the file `cards/C-NNN.md`. Read all of it first: Goal, Acceptance, Do not touch, Notes, `allowed_paths`, `test_edits`.
- One card per branch and per pull request. No work without a card.
- Edit only files under `allowed_paths` (a path ending in `/` means that folder). CI fails the pull request otherwise (`scripts/check-card.mjs`).
- Never edit, rename or delete an existing test (`testPattern` in kit.config.json), unless the card lists that file in `test_edits`. You may add new test files inside `allowed_paths`.
- Never edit planning and system files: `cards/`, `cards.log`, `process/`, `.claude/`, `CLAUDE.md`, `AGENTS.md`, `anchor.md`, `SPEC.md`, `STORYMAP.md`, `DESIGN.md`, `claude-progress.txt`, `kit.config.json`, `test/kit/`, the check scripts and workflows. If the card looks wrong, stop and report it with `ao report`; the lead changes the card.
- Write the smallest change that meets the acceptance list. No extra features, no unrelated refactors or renames, no new dependencies.
- Run every acceptance command and `npm test` before reporting done. Report the real output tail with the exit codes.
- Manual acceptance items (marked Manual) are for the owner. List them in the report.
- Something irreversible, a secret, or data outside the repository: stop and report.
- Do not merge, write to `cards.log` or start other agents.
- Git hooks (`.githooks`, enabled by `npm run setup`) check every commit and push: secrets, allowed_paths, existing tests, no app code on main, no force push. Never use `--no-verify`, never change `core.hooksPath`, never force-push. A blocked commit means fix the change, not the hook.
- Acceptance commands decide done, not your judgement: red/green (write the failing test first and see it fail), then all commands exit 0.
- Tools (process/toolchain.md): use the skills in `.claude/skills` whose description starts with "Workers": test-driven-development, systematic-debugging, verification-before-completion, ponytail (smallest solution, stdlib first), impeccable (UI cards: audit and critique before the pull request); context7 for library APIs. You may use your own subagents for reading, research or parallel checks; they follow these rules and never widen the card's allowed_paths.

## Kit commands (everyone)
- `npm run setup`: turns on the git hooks. `npm run check:kit`: cards, log and rule files. `npm run board`: the board (read-only).
- `npm run check:card -- --base origin/main`: the card guard, also run by CI on pull requests.
- `npm run test:kit`: the kit's own tests (system files).
- Branches: work goes to `main` through card pull requests, squash-merged with the title `C-NNN: <card title>`.

## Project conventions (everyone)
- (fill in: runtime, tests, layout, design tokens)
