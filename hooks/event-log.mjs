// Always-on, zero-token: one JSON line per event for the pitwall dashboard. Stores names and short text only,
// never tool inputs or outputs.
import { appendEvent, runHook } from './lib/hook.mjs';

const EVENTS = new Set(['SubagentStart', 'SubagentStop', 'PreToolUse', 'PostToolUse', 'Stop', 'UserPromptSubmit']);
const oneLine = (t, n = 120) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

runHook((input) => {
  const event = input.hook_event_name;
  const session = input.session_id;
  if (!session || !EVENTS.has(event)) return;
  const e = { t: new Date().toISOString(), event, session };
  if (input.agent_id) e.agent = input.agent_id;
  if (input.agent_type) e.agentType = input.agent_type;
  if (event === 'PreToolUse' || event === 'PostToolUse') {
    e.tool = input.tool_name;
    if (event === 'PreToolUse' && input.tool_name === 'Agent') e.description = oneLine(input.tool_input?.description);
  }
  if (event === 'SubagentStop') e.detail = oneLine(String(input.last_assistant_message ?? '').split('\n')[0]);
  if (event === 'UserPromptSubmit') e.detail = oneLine(input.prompt);
  appendEvent(session, e);
});
