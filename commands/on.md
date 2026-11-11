---
description: Turn the pitwall team on for this session (scouts, runner, advisor, reviewer)
allowed-tools: Bash(mkdir:*), Bash(touch:*), Skill
---

Turn the pitwall team on for this session.

1. Run this with Bash: `mkdir -p "${PITWALL_HOME:-$HOME/.claude/pitwall}/team" && touch "${PITWALL_HOME:-$HOME/.claude/pitwall}/team/${CLAUDE_SESSION_ID}"`
2. Load the `pitwall:workflow` skill with the Skill tool and follow it for the rest of this session.
3. Reply with one line only: `pitwall team on: scouts, runner, advisor and reviewer are ready. /pitwall:off to stop.`
