// Team hook: the same failure twice means main is stuck, so nudge it to consult the advisor.
//   same-error.mjs fail   (PostToolUseFailure, Bash): main's own failing command. Failures inside a subagent are
//                         ignored: it has no advisor and main would never see the note.
//   same-error.mjs ok     (PostToolUse, Bash):        a success clears that command's failures ("twice in a row").
//   same-error.mjs agent  (PostToolUse, Agent):       the runner's reply failed the same way twice.
// A failing Bash command fires PostToolUseFailure, not PostToolUse: see docs/notes/verify-team.md.
import { appendEvent, readState, runHook, teamOn, writeState } from './lib/hook.mjs';
import { commandKey, fingerprint } from './lib/fingerprint.mjs';

const NUDGE = 'pitwall plugin hook (installed by the user): the same failure has now happened twice. Consult your advisor now (or run pitwall:reviewer if you have no advisor), before another attempt.';

/** Counts a failure under `key`; returns true on the second time only. */
function seenTwice(sessionId, key) {
  const state = readState(sessionId);
  const errors = state.errors && typeof state.errors === 'object' ? state.errors : {};
  errors[key] = (errors[key] ?? 0) + 1;
  writeState(sessionId, { ...state, errors });
  return errors[key] === 2;
}

function clear(sessionId, prefix) {
  const state = readState(sessionId);
  const errors = state.errors && typeof state.errors === 'object' ? state.errors : {};
  const kept = Object.fromEntries(Object.entries(errors).filter(([k]) => !k.startsWith(prefix)));
  if (Object.keys(kept).length !== Object.keys(errors).length) writeState(sessionId, { ...state, errors: kept });
}

function nudge(sessionId, hookEventName) {
  appendEvent(sessionId, { t: new Date().toISOString(), event: 'Nudge', session: sessionId, kind: 'same-error' });
  return JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: NUDGE } });
}

/** The text of a runner's reply: the text parts of the Agent tool response without the harness note. */
const replyText = (resp) => (Array.isArray(resp?.content) ? resp.content : [])
  .filter((c) => c?.type === 'text').map((c) => String(c.text).replace(/<tools-used-before-summary>[\s\S]*?<\/tools-used-before-summary>/g, '')).join('\n').trim();

const mode = process.argv[2];
runHook((input) => {
  const id = input.session_id;
  if (!id || input.agent_id || !teamOn(input)) return;

  if (mode === 'fail' && input.tool_name === 'Bash') {
    const text = String(input.error ?? '').replace(/^\s*Exit code \d+\s*/, '').trim();
    if (!text) return; // "Exit code 1" and nothing else (grep with no match, test -f): not a failure worth counting
    return seenTwice(id, `${commandKey(input.tool_input?.command)}:${fingerprint(text)}`) ? nudge(id, 'PostToolUseFailure') : undefined;
  }
  if (mode === 'ok' && input.tool_name === 'Bash') {
    clear(id, `${commandKey(input.tool_input?.command)}:`);
    return;
  }
  if (mode === 'agent' && input.tool_name === 'Agent' && /(^|:)runner$/.test(String(input.tool_response?.agentType ?? ''))) {
    const text = replyText(input.tool_response);
    if (!/^(\d+ failed|failed)\b/i.test(text)) { clear(id, 'runner:'); return; }
    return seenTwice(id, `runner:${fingerprint(text)}`) ? nudge(id, 'PostToolUse') : undefined;
  }
});
