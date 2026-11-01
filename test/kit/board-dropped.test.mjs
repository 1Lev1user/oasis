// Tests for the "dropped" event (process/board.md): a superseded card leaves every active column for good.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLog, replayLog, cardStatus, buildBoard } from '../../scripts/board.mjs';

const card = { id: 'C-001', title: 'x', priority: 'P1', size: 'S', risk: 'low', start_tier: 'haiku', depends_on: [], allowed_paths: ['src/a.js'] };
const ev = (text) => parseLog(`2026-10-10 | C-001 | ${text}`).events;

test('dropped needs "-" as value', () => {
  assert.equal(replayLog(ev('dropped | - | superseded'), [card]).problems.length, 0);
  assert.match(replayLog(ev('dropped | yes | x'), [card]).problems.join(), /dropped value "yes" must be -/);
});

test('a dropped card is Dropped even with a branch or an open pull request, but Done wins', () => {
  const none = new Set();
  const own = [...ev('attempt | haiku | ok'), ...ev('pr | 4 | -'), ...ev('dropped | - | superseded')];
  assert.equal(cardStatus(card, own, none, new Set(['C-001'])), 'Dropped');
  assert.equal(cardStatus(card, own, new Set(['C-001']), none), 'Done');
});

test('dropped cards are not pulled and raise no WIP or ceiling warnings', () => {
  const events = [...ev('attempt | haiku | ok'), ...ev('dropped | - | superseded')];
  const board = buildBoard([card], events, new Set(), new Set(['C-001']));
  assert.equal(board.rows[0].status, 'Dropped');
  assert.deepEqual(board.ready, []);
  assert.deepEqual(board.warnings, []);
});
