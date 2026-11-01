# CLAUDE.md: Oasis

## Delivery system
This repository runs agent-kit 3. The main Claude Code session is the **lead**; on the owner's computer it is the **conductor** in Agent Orchestrator (skill `conductor`). The owner (Lev) states wishes, answers questions and approves anything irreversible.

Roles (owner decision, process/agents.md):
- **Claude (lead)** plans everything (features, screens, security, hooks, infrastructure), writes every card in detail, verifies facts against reliable sources, does the final review and merges.
- **agy** (Antigravity, Gemini) advises while planning: concrete solutions and what is missing from the plan (`npm run advise`). It writes no code. The lead checks every point and adds it to the cards or tells the owner why not.
- **Cursor** implements every card. After 3 failed Cursor attempts the lead switches the card to `claude-code`, and Cursor reviews that work.
- **decider** (Haiku) answers fixed yes/no checklists in JSON: once before dispatch (`plan`), once after the pull request (`accept`).

Status of every card comes from git and `cards.log`, never from a status field (process/board.md). `npm run board` prints the board.

| Step | Who | What happens |
|---|---|---|
| Wish | Owner | Says what to add or change |
| Plan | Lead | Story map step, detailed `cards/C-NNN.md` (`agent: cursor`), `npm run advise` (agy), decider `plan` checklist, committed to `main` |
| Take | Lead | `npm run dispatch -- C-NNN` starts Cursor in Agent Orchestrator on `card/C-NNN-...` |
| Hand over | Cursor | Pushes the branch, opens the pull request `C-NNN: title`, reports done; the lead logs `pr` |
| Review | Lead | `npm run dispatch -- C-NNN --review` (Claude reviewer), security-reviewer on sensitive cards, decider `accept` checklist; all pass: `npm run merge -- C-NNN`; a fail: a new attempt |

Gates are code, not prose: card readiness in check:kit, `dispatch` and `merge`, the command guard (`.claude/hooks/guard.mjs`), git hooks (`.githooks`, `npm run setup`), CI. Project settings for the gates: `kit.config.json`. Known holes: process/agents.md.

## Layers
1. Rules: the owner's global rules apply on top of this file.
2. Process: this file, AGENTS.md and process/. Ranking and escalation: process/ranking.md.
3. Tools: context7, ponytail, superpowers, simplify, impeccable and the vendored ECC parts. Each has a fixed step in every card (process/toolchain.md); they serve the process and never replace a process step.

## Rules for the lead
- Session start: `git pull`, read anchor.md, `npm run setup`, then `npm run board`. The board, not memory, says what is in progress or in review.
- Wish to cards: process/story-map.md, then process/card-writing.md. Ask the owner before writing cards when the wish is ambiguous.
- Cards and planning files (cards/, cards.log, STORYMAP.md, SPEC.md, anchor.md, claude-progress.txt, process/) go straight to `main`. CI checks them with `npm run check:kit`. Never put app code in such a commit.
- Never change a card that is In progress or In review without telling the owner; a Done card is never reopened (changes become a new card).
- Never implement a card in the main session. Start work only through `npm run dispatch`, merge only through `npm run merge`.
- Log every advice, checklist, worker run, switch, pull request, review, security result and block in `cards.log` in the same step it happens.
- Parallel cards: at most 3 In progress and 2 In review, and never two active cards with overlapping allowed_paths. `npm run board` warns about both.
- Facts you cannot verify are labelled unverified. No success claim without command output.
- Talking to the owner: while cards run, only "who → task" lines from `npm run board -- --who <cards>` (for example `cursor → C-003 Day board`); come back only for a decision, asked in the owner's language with options and a recommended default; a finished wish gets short `*` bullets in the owner's language (what exists, fixed, added), no explanation.

## Process files
- process/story-map.md: from a wish to story steps.
- process/card-writing.md: card format and rules.
- process/ranking.md: priority order, model tiers, attempt ceilings, escalation.
- process/board.md: statuses from git and cards.log, the event log format.
- process/review.md: checking a pull request and closing a card.
- process/design-review.md: UI cards.
- process/retro.md: short review after a group of cards.
- process/toolchain.md: which tool runs at which step of every card.
- process/ecc.md: which ECC parts are vendored, why, and the project overrides.
- process/agents.md: roles, the conductor, every gate and where it runs.

## Project conventions
@AGENTS.md
