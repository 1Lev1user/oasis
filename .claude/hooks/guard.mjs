#!/usr/bin/env node
// PreToolUse guard for Claude's shell tools (Bash, PowerShell): blocks commands that skip a kit gate or destroy work.
// Exit 2 blocks the call and shows the reason to Claude (process/agents.md). Cursor and Antigravity are held by the git
// hooks (.githooks) and CI instead, because this hook only runs inside Claude Code.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// One shell statement: stops at ; & | or a newline.
const S = '[^;&|\\n]*';
const RULES = [
  [/\bao\s+spawn\b/, 'start agents with `npm run dispatch -- C-NNN` (it checks that the card is ready first)'],
  [/\b(gh|ao)\s+pr\s+merge\b|\bgh\s+api\b[^;&|\n]*\/merge\b/, 'merge with `npm run merge -- C-NNN` (it checks CI and the cross-vendor review)'],
  [new RegExp(`\\bgit\\s+push\\b(?=${S}(\\s-[a-zA-Z]*f|\\s--force\\b|\\s--force-with-lease\\b|\\s--mirror\\b|\\s\\+[\\w/.-]))`), 'no force push: history on a shared branch is never rewritten'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard throws work away; use git stash or a new commit'],
  [new RegExp(`\\bgit\\s+clean\\b(?=${S}(\\s-[a-zA-Z]*f|\\s--force\\b))`), 'git clean -f deletes untracked files for good'],
  [new RegExp(`--no-verify\\b|\\bgit\\s+(commit|merge|am)\\b(?=${S}\\s-[a-zA-Z]*n)`), 'git hooks may not be skipped (--no-verify, -n)'],
  [/(?<!--get(-all)?\s+)core\.hookspath(?!(\s+|=)\.githooks(?=$|[\s"';&|]))/i, 'core.hooksPath must stay .githooks'],
  [new RegExp(`\\brm\\b(?=${S}\\s-(\\w*[rR]\\w*|-recursive))(?=${S}\\s-(\\w*f\\w*|-force))${S}\\s["']?(/|~/?|\\$HOME/?|\\$\\{HOME\\}/?|\\.{1,2}/?|\\*)["']?(\\s|$)`),
    'rm -rf on /, ~, $HOME, ., .. or * is blocked'],
  [new RegExp(`\\bRemove-Item\\b(?=${S}-Recurse)(?=${S}-Force)${S}\\s(['"]?)([A-Za-z]:\\\\?|~|\\$HOME|\\$env:USERPROFILE|\\\\|/|\\.)\\1(\\s|$)`, 'i'),
    'Remove-Item -Recurse -Force on a drive, the home folder or . is blocked'],
];

// A quoted phrase (it holds a space) is text, not a command: grep "ao spawn", commit messages, echo. Quoted single
// tokens stay, so rm -rf "$HOME" is still seen. A quoted string handed to a shell (bash -c, pwsh -Command, eval) is code.
const SHELL = /\b(ba|z)?sh(\.exe)?\s+-\w*c\b|\b(pwsh|powershell)(\.exe)?\b[^;&|\n]*\s-(c|command)\b|\bcmd(\.exe)?\s+\/[ck]\b|\beval\b|\bInvoke-Expression\b|\biex\b/i;
const unphrase = (cmd) => (SHELL.test(cmd) ? cmd : cmd.replace(/"[^"\n]*\s[^"\n]*"|'[^'\n]*\s[^'\n]*'/g, '""'));

export function blockReason(command) {
  const text = unphrase(String(command ?? ''));
  for (const [re, why] of RULES) if (re.test(text)) return why;
  return null;
}

let main = false;
try { main = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { /* imported */ }
if (main) {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* not JSON: nothing to check */ }
  const why = blockReason(input.tool_input?.command);
  if (why) {
    process.stderr.write(`Blocked by the kit guard (.claude/hooks/guard.mjs): ${why}.\n`);
    process.exit(2);
  }
}
