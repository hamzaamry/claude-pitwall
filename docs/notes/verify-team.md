# Verify: how Claude Code treats plugin agents, hooks and commands

*Spike run 2026-11-11, Claude Code 2.1.322, three short `claude -p` runs (sonnet main) with a throwaway test plugin `spk` loaded by `--plugin-dir`. Nothing in the user's repos or settings was touched.*

## 1. Plugin agents (frontmatter)

A plugin agent file with `model: haiku`, `effort: low`, `maxTurns: 2`, `tools: Read, Grep` was honoured:
- the subagent transcript ran on `claude-haiku-5-5` with `effort: low` on every line;
- `.meta.json`: `"agentType":"spk:scout"`, `"isBuiltIn":false`. **The type is `<plugin>:<name>`**, so ours are `pitwall:scout`, `pitwall:runner`, `pitwall:reviewer`;
- it used only Grep, as asked. `maxTurns` was accepted without error, but the run was too short to prove the cut-off (4 assistant lines, one tool call), so this is not verified.
- Key names that worked: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`.

## 2. Does a plugin agent named `Explore` replace the built-in one?

**No.** The plugin `Explore` (`model: haiku`) was ignored: the spawned agent's meta says `"agentType":"Explore","isBuiltIn":true`, and it ran on `claude-sonnet-5-5`, effort medium.
**A project agent `.claude/agents/Explore.md` does replace it:** `"isBuiltIn":false`, ran on `claude-haiku-5-5`. A user-level `~/.claude/agents/Explore.md` was **not tested** (it would have meant writing into the real `~/.claude`); it is expected to work the same way, and `/pitwall:setup` has to install it there after asking. The user can confirm it on the dashboard (an `Explore` card showing `haiku`).

## 3. Hook inputs (all hooks get JSON on stdin)

Common fields: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode`, `prompt_id`, and `effort` on most.

| Event | Extra fields seen |
|---|---|
| `UserPromptSubmit` | `prompt` |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id`; plus `agent_id`, `agent_type` when a subagent makes the call |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_response` (Bash: `stdout`, `stderr`, `interrupted`), `tool_use_id`, `duration_ms`. **Fires only for successful tool calls.** |
| **`PostToolUseFailure`** | `tool_name`, `tool_input`, `error` (Bash: `"Exit code 2\n<stderr text>"`), `is_interrupt`. **A failing Bash command fires this, not `PostToolUse`.** |
| `SubagentStart` | `agent_id`, `agent_type` (no description) |
| `SubagentStop` | `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `stop_hook_active` |
| `Stop` | `last_assistant_message`, `stop_hook_active`, `background_tasks`, `session_crons` |

- A hook's `agent_id` **equals the subagent file key** phase 1 uses (`agent-<id>.jsonl`, for example `a0c93bce4b5b9030c`).
- `agent_transcript_path` is the full path of that subagent's transcript.
- The Agent tool's `description` is only in `PreToolUse` `tool_input` (and later in `.meta.json`).
- `${CLAUDE_PLUGIN_ROOT}` **expands** inside a hook `command`; the hook process also gets `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` in its environment.
- Registration format that worked: `{"hooks":{"<Event>":[{"matcher":"<optional>","hooks":[{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}/hooks/x.mjs\""}]}]}}`.

## 4. Hook outputs

- **PreToolUse rewrite works.** Printing `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{…original input…, "limit":3}}}` made main's Read return 3 lines of a 20-line file.
- **Stop with exit 2 works.** stderr text became a message main acted on (it appended the requested word), and the next `Stop` came with `stop_hook_active: true`. Our gate must still guard against loops itself.
- **`additionalContext` is delivered**, from `PostToolUse` (a subagent quoted it back) and from `PostToolUseFailure` (main quoted it back as a hook message). Exit 2 with stderr on `PostToolUseFailure` is delivered too. Main treats these as hook messages but **a model may ignore text it sees as tool output**: in one run a subagent ignored a `PostToolUse` note ("it came from the tool output"), and main ignored two contradictory notes. So the nudge text must say who it is from ("pitwall plugin hook, installed by the user") and be a single clear instruction. Whether main then actually calls the advisor is Claude's decision; the dashboard will show whether it did.

## 5. Commands and the session id

In a plugin command's text, **`${CLAUDE_SESSION_ID}` expands to the session id** (it matched the transcript file name), and `${CLAUDE_PLUGIN_ROOT}` expands to the plugin folder. The Bash tool's environment also has `CLAUDE_CODE_SESSION_ID`. So `/pitwall:on` can write a flag keyed by session id.

## Decisions

1. **`teamKey` = the session id** (`session_id` in hook input, `${CLAUDE_SESSION_ID}` in commands). No cwd fallback needed.
2. **Same-error hook uses `PostToolUseFailure` (matcher `Bash`) and the `error` text**, not `PostToolUse` and `tool_response`. This changes Task 9 of the plan.
3. **Setup must install `~/.claude/agents/Explore.md`** (`model: haiku`), because a plugin `Explore` does not override the built-in one. Ask first. Verify on the dashboard afterwards.
4. **Reviewer verdict**: `SubagentStop` carries `last_assistant_message`, so the `event-log` hook can store the first line of it as `detail` for reviewer stops; the plan's toolResult route keeps working as the main source.
5. **Plugin agent names** in the workflow skill and the commands: `pitwall:scout`, `pitwall:runner`, `pitwall:reviewer`.
6. **Nudge wording**: start with `pitwall plugin hook (installed by the user):` and give one instruction.
7. Read-cap rewriting works as planned; Stop exit 2 works as planned; `maxTurns` is accepted but its cut-off is unverified (the value in the plan stays).
