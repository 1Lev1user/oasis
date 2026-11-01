# Ranking: which card next, on which model, how many tries

Lead only. Combines kit 2.0 classification (priority, size, risk) with the kit 1.x model tiers. The tier heuristic is the same one ECC's `/model-route` uses (haiku for mechanical low-risk work, sonnet for normal implementation, opus for architecture and high risk), so there is one rule, not three.

## 1. Pull order (which card next)
1. Only Backlog cards whose `depends_on` cards are all Done.
2. P0 before P1 before P2 (process/card-writing.md defines them).
3. Same priority: lower card id first.
4. Respect the WIP limits (3 In progress, 2 In review) and never run two cards with overlapping allowed_paths.

`npm run board` prints this queue as "Next to pull".

## 2. Start tier (which model implements it)
Written into the card as `start_tier`. `npm run check:kit` enforces the minimum.

| Card | Minimum start_tier | Worker agent |
|---|---|---|
| risk high | opus | worker-heavy |
| size M or L, or risk medium, or no automatic check | sonnet | worker-standard |
| size S + risk low + at least one acceptance command besides `npm test` | haiku | worker-light |

The lead may start a card higher than the minimum (for example architecture or a new module layout) and says why in the card Notes. Never lower.

## 2a. Agent (kit 3)
Every card names the executing agent (`agent`): `cursor`. Cursor has 3 attempts per card; then the lead switches the card to `claude-code` (`switch` event), and the tiers and ceilings below apply. Table and fallback circle: process/agents.md.

## 3. Attempt ceilings and escalation
One attempt = one worker run on the card, whatever its outcome, including a run that comes back after a failed review.

| Tier | Attempts before escalation |
|---|---|
| haiku | 6 |
| sonnet | 4 |
| opus | 2 |

- Ceiling reached on haiku or sonnet: log `escalate` to the next tier (one tier at a time; check-kit rejects skips), then continue with that tier's worker. The lead may escalate earlier when the reports show the tier is out of its depth (same error twice, misreads the card); the reason goes into the NOTE column.
- Ceiling reached on opus: log `blocked`, ask the owner one question with options and a recommended default. Typical causes: the card is too big (split it), the acceptance is wrong, a decision is missing. When the owner allows another try, log `unblocked`: each `unblocked` logged while the card is at its opus ceiling raises that ceiling by exactly one attempt (owner, 2026-10-11).
- `RESULT: CARD-PROBLEM` from a worker is not counted against the tier's skill: the lead fixes the card on `main` first, then retries. It still counts as an attempt in the log, so a card that keeps bouncing shows up.
- `npm run check:kit` fails when a log line exceeds a ceiling or attempts a tier the card is not on.

## 4. Review tier
- Default: `reviewer` on sonnet.
- risk high: `reviewer` on opus plus `security-reviewer` as a second, independent reviewer (santa-method, process/ecc.md). Both must PASS.

## 5. What gets measured
Every attempt, escalation and review result is a line in `cards.log`. The retro (process/retro.md) reads it: attempts per tier, escalations, returns from review, blocks. That is how the tier rules and the ECC parts get judged on evidence instead of impressions.
