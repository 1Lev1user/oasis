// An owner's `unblocked` answer at the opus ceiling allows exactly one more attempt (process/ranking.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCard } from '../../scripts/cards.mjs';
import { parseLog, replayLog, tierState } from '../../scripts/board.mjs';

const card = parseCard(`---
id: C-001
title: "Card C-001"
story_step: S1.1
size: M
priority: P1
risk: high
start_tier: opus
depends_on: []
allowed_paths:
  - src/a.js
test_edits: []
---

## Goal
Something works.

## Acceptance
- \`npm test\` exits 0

## Do not touch
- existing tests

## Notes
None.
`, 'cards/C-001.md');
const ev = (rest) => `2026-10-11 | C-001 | ${rest}`;
const replay = (lines) => replayLog(parseLog(lines.join('\n')).events, [card]);
const two = [ev('attempt | opus | x'), ev('attempt | opus | x'), ev('blocked | - | q')];

test('a third opus attempt without an owner answer exceeds the ceiling', () => {
  assert.match(replay([...two, ev('attempt | opus | x')]).problems.join('\n'), /3 attempts on opus, ceiling 2/);
});

test('unblocked at the ceiling allows exactly one more attempt', () => {
  const lines = [...two, ev('unblocked | - | a'), ev('attempt | opus | x')];
  const r = replay(lines);
  assert.deepEqual(r.problems, []);
  const t = tierState(r.state.get('C-001'));
  assert.deepEqual([t.used, t.ceiling, t.mustBlock], [3, 3, true]);
  assert.match(replay([...lines, ev('attempt | opus | x')]).problems.join('\n'), /4 attempts on opus, ceiling 3/);
});

test('unblocked below the ceiling grants nothing', () => {
  const r = replay([ev('attempt | opus | x'), ev('blocked | - | q'), ev('unblocked | - | a'), ev('attempt | opus | x'), ev('attempt | opus | x')]);
  assert.match(r.problems.join('\n'), /3 attempts on opus, ceiling 2/);
});
