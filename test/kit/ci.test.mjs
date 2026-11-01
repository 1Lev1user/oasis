// Tests for the CI mode of scripts/git-hooks.mjs: project tests first, then ciCommand; the first failure decides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ciChecks, cleanGitEnv } from '../../scripts/git-hooks.mjs';

test('ci runs testCommand, then ciCommand, and stops at the first failure', () => {
  const runs = [];
  const exec = (codes) => (cmd) => { runs.push(cmd); return codes[cmd] ?? 0; };
  assert.equal(ciChecks({ testCommand: 'npm test', ciCommand: 'npm run build' }, exec({})), 0);
  assert.deepEqual(runs.splice(0), ['npm test', 'npm run build']);
  assert.equal(ciChecks({ testCommand: 'npm test', ciCommand: 'npm run build' }, exec({ 'npm test': 1 })), 1);
  assert.deepEqual(runs.splice(0), ['npm test']);
  assert.equal(ciChecks({ testCommand: 'npm test', ciCommand: 'npm run build' }, exec({ 'npm run build': 2 })), 2);
  assert.equal(ciChecks({ testCommand: 'npm test', ciCommand: '' }, exec({})), 0);
  assert.deepEqual(runs.splice(0), ['npm test', 'npm run build', 'npm test']);
});

test('checks started by a git hook do not inherit the hook\'s repository variables', () => {
  const env = cleanGitEnv({ GIT_DIR: 'C:/repo/.git/worktrees/x', GIT_COMMON_DIR: 'C:/repo/.git', GIT_INDEX_FILE: 'i', git_work_tree: 'w', GIT_SSH_COMMAND: 'ssh', PATH: '/bin' });
  assert.deepEqual(env, { GIT_SSH_COMMAND: 'ssh', PATH: '/bin' });
});
