---
description: Turn the pitwall team off for this session
allowed-tools: Bash(rm:*)
---

Turn the pitwall team off for this session.

1. Run this with Bash: `rm -f "${PITWALL_HOME:-$HOME/.claude/pitwall}/team/${CLAUDE_SESSION_ID}"`
2. From now on, work alone again: stop launching the pitwall agents and stop following the `pitwall:workflow` skill.
3. Reply with one line only: `pitwall team off.`
