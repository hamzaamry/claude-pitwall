---
description: Print the command that starts the pitwall dashboard
allowed-tools: Bash
---

Print the command that starts the pitwall dashboard for this project, and nothing else except one short line of advice.

1. Work out the plugin folder. Use `${CLAUDE_PLUGIN_ROOT}` if it was replaced by a real path. If it still reads `${CLAUDE_PLUGIN_ROOT}`, find it with `ls -d ~/.claude/plugins/cache/*/pitwall/*/ | tail -1`.
2. Get the current directory with `pwd`.
3. Print this command in a code block, with both paths filled in:

```
node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js watch --cwd <current dir>
```

4. Say: run it in a second terminal pane or window beside this session; press `q` to quit. It only reads Claude Code's own transcript files and never changes anything.

Do not run the dashboard yourself: it needs its own terminal.
