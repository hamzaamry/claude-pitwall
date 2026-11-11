// Team hook: the same failure twice means main is stuck, so nudge it to consult the advisor.
//   same-error.mjs fail   (PostToolUseFailure, Bash): main's own failing command. Failures inside a subagent are
//                         ignored: it has no advisor and main would never see the note.
//   same-error.mjs ok     (PostToolUse, Bash):        a success clears that command's failures ("twice in a row").
//   same-error.mjs agent  (PostToolUse, Agent):       a runner has come back, and its command failed the same way in two
//                         runs. The runner's own failing commands are only counted (sub:); the nudge goes out when its
//                         reply reaches main, because only main can act on it. Reply wording is never parsed: Haiku paraphrases.
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

const isRunner = (type) => /(^|:)runner$/.test(String(type ?? ''));
const bashKey = (input) => `${commandKey(input.tool_input?.command)}:`;

const mode = process.argv[2];
runHook((input) => {
  const id = input.session_id;
  if (!id || !teamOn(input)) return;
  const inRunner = !!input.agent_id && isRunner(input.agent_type);
  if (input.agent_id && !inRunner) return; // other subagents have no advisor and main never sees their notes

  if (mode === 'fail' && input.tool_name === 'Bash') {
    const text = String(input.error ?? '').replace(/^\s*Exit code \d+\s*/, '').trim();
    if (!text) return; // "Exit code 1" and nothing else (grep with no match, test -f): not a failure worth counting
    const key = `${inRunner ? 'sub:' : ''}${bashKey(input)}${fingerprint(text)}`;
    const twice = seenTwice(id, key);
    return !inRunner && twice ? nudge(id, 'PostToolUseFailure') : undefined;
  }
  if (mode === 'ok' && input.tool_name === 'Bash') {
    clear(id, `${inRunner ? 'sub:' : ''}${bashKey(input)}`);
    return;
  }
  if (mode === 'agent' && input.tool_name === 'Agent' && !input.agent_id && isRunner(input.tool_response?.agentType)) {
    const state = readState(id);
    const errors = state.errors && typeof state.errors === 'object' ? state.errors : {};
    const pending = Object.keys(errors).filter((k) => k.startsWith('sub:') && errors[k] >= 2 && !(state.nudged ?? {})[k]);
    if (pending.length === 0) return;
    writeState(id, { ...state, nudged: { ...(state.nudged ?? {}), ...Object.fromEntries(pending.map((k) => [k, true])) } });
    return nudge(id, 'PostToolUse');
  }
});
