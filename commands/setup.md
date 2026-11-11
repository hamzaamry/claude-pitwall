---
description: Let pitwall read your limits (wraps your status line, asks before changing anything)
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

The pitwall dashboard works without this command. Setup does two optional things: **A.** adds the **LIMITS** box (context, 5-hour and weekly usage) by putting a tiny wrapper in front of the user's status line, and **B.** prepares the team (advisor model, cheaper Explore agent). Show the plan for each part, and apply it only after the user says yes to that part.

**Never change `~/.claude/settings.json` before the user has seen the exact change and said yes.**

## Part A: the LIMITS box

1. Read `~/.claude/settings.json` and note `statusLine` (it may be missing). If its command already contains `statusline-tee.mjs`, say part A is already done and go to part B.
2. Work out the plugin folder: `${CLAUDE_PLUGIN_ROOT}` if it was replaced by a real path, otherwise `ls -d ~/.claude/plugins/cache/*/pitwall/*/ | tail -1`.
3. Prepare, but do not apply, this plan:
   - copy `${CLAUDE_PLUGIN_ROOT}/bin/statusline-tee.mjs` (with the plugin folder from step 2 in place of `${CLAUDE_PLUGIN_ROOT}`) to `~/.claude/pitwall/bin/statusline-tee.mjs` (a copy, so it keeps working when the plugin updates);
   - write `~/.claude/pitwall/config.json` as `{ "wrappedStatusLine": "<the old statusLine.command>" }`, or `{}` when there was no status line;
   - set `statusLine.command` in `~/.claude/settings.json` to `node <home>/.claude/pitwall/bin/statusline-tee.mjs` (real absolute path). Keep `type` and every other `statusLine` field as they are.
4. **Show the user** the exact before and after `statusLine.command`, and the exact `config.json`. Then ask with AskUserQuestion: apply, or cancel.
5. Only after a yes: save the old `statusLine` object to `~/.claude/pitwall/statusline-backup.json`, create the files from step 3, and edit `settings.json` with the Edit tool (change nothing else in it).
6. Check it: run `echo '{"session_id":"setup-test"}' | node ~/.claude/pitwall/bin/statusline-tee.mjs` and confirm the output is the same as the old command gives for the same input. Delete `~/.claude/pitwall/statusline/setup-test.json`.
7. Tell the user how to undo it: put the old `statusLine` object from `~/.claude/pitwall/statusline-backup.json` back into `settings.json` (or just the old `command`). The LIMITS box fills after the next message in a session.

## Part B: the team

The Opus advisor and the cheaper Explore agent need two settings. Show both changes exactly, then ask with AskUserQuestion (apply both, apply one, or skip). **Only after a yes**, apply what was approved.

8. **Advisor model.** Read `advisorModel` in `~/.claude/settings.json`. If it is not `"opus"`, the planned change is adding `"advisorModel": "opus"` (show the before and after of that key only; change nothing else in the file). This switches on Claude Code's native advisor. The advisor is an experimental feature that also needs Anthropic's feature flag, which needs telemetry to be on; tell the user, and that if it still does not work the team falls back to the reviewer.
9. **Cheaper Explore.** Claude Code's built-in `Explore` agent runs on the main model, and a plugin cannot replace it (verified). A file in `~/.claude/agents/` can. If `~/.claude/agents/Explore.md` does not exist, the planned change is creating it with this exact content (show it): frontmatter `name: Explore`, `description: Fast read-only search of the codebase.`, `model: haiku`, `tools: Read, Grep, Glob, Bash`, followed by one line `Search and answer briefly, with file:line references. Never edit files.` If the file exists already, show it and ask before touching it.
10. **Main model.** Suggest the user runs `/model sonnet` in their session. Never change the model yourself, and never write a `model` key to settings.
11. Tell the user how to undo each change: remove the `advisorModel` key, delete `~/.claude/agents/Explore.md`. Then tell them to use `/pitwall:on` to start the team in a session, and that the dashboard shows an `Explore` card on `haiku` when the override works.
