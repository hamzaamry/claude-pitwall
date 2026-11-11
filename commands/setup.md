---
description: Let pitwall read your limits (wraps your status line, asks before changing anything)
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

The pitwall dashboard works without this command. Setup only adds the **LIMITS** box (context, 5-hour and weekly usage), which needs data that Claude Code gives only to the status line. Setup puts a tiny wrapper in front of the user's existing status line. The wrapper saves that data to a file and then passes everything on to the existing command, so the user's status line looks exactly the same.

**Never change `~/.claude/settings.json` before the user has seen the exact change and said yes.**

1. Read `~/.claude/settings.json` and note `statusLine` (it may be missing). If its command already contains `statusline-tee.mjs`, say pitwall is already set up and stop.
2. Work out the plugin folder: `${CLAUDE_PLUGIN_ROOT}` if it was replaced by a real path, otherwise `ls -d ~/.claude/plugins/cache/*/pitwall/*/ | tail -1`.
3. Prepare, but do not apply, this plan:
   - copy `${CLAUDE_PLUGIN_ROOT}/bin/statusline-tee.mjs` (with the plugin folder from step 2 in place of `${CLAUDE_PLUGIN_ROOT}`) to `~/.claude/pitwall/bin/statusline-tee.mjs` (a copy, so it keeps working when the plugin updates);
   - write `~/.claude/pitwall/config.json` as `{ "wrappedStatusLine": "<the old statusLine.command>" }`, or `{}` when there was no status line;
   - set `statusLine.command` in `~/.claude/settings.json` to `node <home>/.claude/pitwall/bin/statusline-tee.mjs` (real absolute path). Keep `type` and every other `statusLine` field as they are.
4. **Show the user** the exact before and after `statusLine.command`, and the exact `config.json`. Then ask with AskUserQuestion: apply, or cancel.
5. Only after a yes: save the old `statusLine` object to `~/.claude/pitwall/statusline-backup.json`, create the files from step 3, and edit `settings.json` with the Edit tool (change nothing else in it).
6. Check it: run `echo '{"session_id":"setup-test"}' | node ~/.claude/pitwall/bin/statusline-tee.mjs` and confirm the output is the same as the old command gives for the same input. Delete `~/.claude/pitwall/statusline/setup-test.json`.
7. Tell the user how to undo it: put the old `statusLine` object from `~/.claude/pitwall/statusline-backup.json` back into `settings.json` (or just the old `command`). The LIMITS box fills after the next message in a session.
