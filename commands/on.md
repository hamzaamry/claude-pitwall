---
description: Turn the pitwall team on for this session (scouts, runner, advisor, reviewer)
allowed-tools: Bash(mkdir:*), Bash(touch:*), Bash(grep:*), Bash(node:*), Skill
---

Turn the pitwall team on for this session.

1. Check the advisor: run `grep -c advisorModel "$HOME/.claude/settings.json"` with Bash. A count of 1 or more means advisorModel is set.
2. Open the dashboard in a new terminal window. Work out the plugin folder: use `${CLAUDE_PLUGIN_ROOT}` if it was replaced by a real path, otherwise find it with `ls -d ~/.claude/plugins/cache/*/pitwall/*/ | tail -1`. Then run with Bash: `node <plugin folder>/bin/open-dashboard.mjs "${CLAUDE_SESSION_ID}" "$PWD"`. It prints what it did (opened, already open, or no terminal found). Never run the dashboard yourself.
3. Run this with Bash: `mkdir -p "${PITWALL_HOME:-$HOME/.claude/pitwall}/team" && touch "${PITWALL_HOME:-$HOME/.claude/pitwall}/team/${CLAUDE_SESSION_ID}"` (do this after steps 1 and 2: once the team is on, main may not run look-only commands).
4. Load the `pitwall:workflow` skill with the Skill tool and follow it for the rest of this session.
5. Reply with one line only. If advisorModel is set: `pitwall team on: scouts, runner, advisor and reviewer are ready. /pitwall:off to stop.` If not: `pitwall team on: scouts, runner and reviewer are ready; advisor not set up (run /pitwall:setup, or start claude with --advisor opus). /pitwall:off to stop.`

If step 2 printed `no terminal found`, add: `Run /pitwall:watch for the dashboard command.`
