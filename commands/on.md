---
description: Turn the pitwall team on for this session (scouts, runner, advisor, reviewer)
allowed-tools: Bash(mkdir:*), Bash(touch:*), Bash(grep:*), Skill
---

Turn the pitwall team on for this session.

1. Run this with Bash: `mkdir -p "${PITWALL_HOME:-$HOME/.claude/pitwall}/team" && touch "${PITWALL_HOME:-$HOME/.claude/pitwall}/team/${CLAUDE_SESSION_ID}"`
2. Load the `pitwall:workflow` skill with the Skill tool and follow it for the rest of this session.
3. Check the advisor: run `grep -c advisorModel "$HOME/.claude/settings.json"` with Bash. A count of 1 or more means advisorModel is set.
4. Reply with one line only. If advisorModel is set: `pitwall team on: scouts, runner, advisor and reviewer are ready. /pitwall:off to stop.` If not: `pitwall team on: scouts, runner and reviewer are ready; advisor not set up (run /pitwall:setup, or start claude with --advisor opus). /pitwall:off to stop.`
