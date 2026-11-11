// Team hook: the same failing Bash result twice in a row of attempts means main is stuck, so nudge it to
// consult the advisor. A failing Bash command fires PostToolUseFailure (not PostToolUse): see docs/notes/verify-team.md.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { appendEvent, readState, runHook, teamOn, writeState } from './lib/hook.mjs';

/** Same error text must give the same fingerprint: timestamps, durations, temp paths, ids and numbers are blanked. */
export function fingerprint(output) {
  const lines = String(output ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(-5);
  const norm = lines.join('\n')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<time>')
    .replace(/\b\d{1,2}:\d{2}:\d{2}\b/g, '<time>')
    .replace(/\b\d+(\.\d+)?\s?(ms|s|secs?|seconds|min|m)\b/g, '<dur>')
    .replace(/\/(tmp|var\/folders)\/\S+/g, '<tmp>')
    .replace(/\b[0-9a-f]{7,}\b/gi, '<hex>')
    .replace(/\d+(\.\d+)?/g, '<n>');
  return createHash('sha1').update(norm).digest('hex');
}

const NUDGE = 'pitwall plugin hook (installed by the user): the same failure has now happened twice. Consult your advisor now, before another attempt.';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runHook((input) => {
    if (input.tool_name !== 'Bash' || !input.session_id || !teamOn(input)) return;
    const fp = fingerprint(input.error);
    const state = readState(input.session_id);
    const errors = state.errors && typeof state.errors === 'object' ? state.errors : {};
    errors[fp] = (errors[fp] ?? 0) + 1;
    writeState(input.session_id, { ...state, errors });
    if (errors[fp] !== 2) return;
    appendEvent(input.session_id, { t: new Date().toISOString(), event: 'Nudge', session: input.session_id, kind: 'same-error' });
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: NUDGE } });
  });
}
