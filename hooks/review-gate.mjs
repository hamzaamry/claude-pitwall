// Team hook: before main finishes a BIG change, make it run the reviewer first.
//   review-gate.mjs snapshot (UserPromptSubmit): remember the working tree at the first prompt of the team session.
//   review-gate.mjs mark     (SubagentStop):     when the reviewer stops, remember the tree it saw.
//   review-gate.mjs gate     (Stop):             block (exit 2) when main edited this turn and the tree changed by more
//                                                than 2 files or 30 lines since the last checkpoint.
// A block is also a checkpoint, so it can never loop; stop_hook_active is respected too. Any error means no block.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendEvent, pitwallHome, readInput, readState, teamOn, writeState } from './lib/hook.mjs';
import { delta, isBig, snapshot } from './lib/changes.mjs';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const REASON = 'pitwall plugin hook (installed by the user): this is a big change. Run the pitwall:reviewer agent on it before finishing.';
const isReviewer = (type) => /(^|:)reviewer$/.test(String(type ?? ''));

/** Did main (not a subagent) call an editing tool since the last prompt? Read from the event-log hook's file. */
function mainEditedThisTurn(sessionId) {
  const file = join(pitwallHome(), 'events', `${sessionId.replace(/[^A-Za-z0-9_-]/g, '')}.jsonl`);
  if (!existsSync(file)) return false;
  const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  let from = events.length - 1;
  while (from >= 0 && events[from].event !== 'UserPromptSubmit') from--;
  return events.slice(from + 1).some((e) => e.event === 'PostToolUse' && EDIT_TOOLS.has(e.tool) && !e.agent);
}

function checkpoint(input) {
  const cur = snapshot(input.cwd || process.cwd());
  if (cur) writeState(input.session_id, { ...readState(input.session_id), base: cur });
  return cur;
}

function gate(input) {
  if (!input.session_id || input.stop_hook_active === true || !teamOn(input) || !mainEditedThisTurn(input.session_id)) return;
  if (readState(input.session_id).finalReviewed) return; // one final review per task (main-guard tracks it)
  const cur = snapshot(input.cwd || process.cwd());
  if (!cur) return;
  const base = readState(input.session_id).base ?? {};
  if (!isBig(delta(base, cur))) return;
  checkpoint(input);
  appendEvent(input.session_id, { t: new Date().toISOString(), event: 'Nudge', session: input.session_id, kind: 'review-gate' });
  return REASON;
}

let reason;
try {
  const input = readInput();
  const mode = process.argv[2];
  if (mode === 'snapshot') { if (input.session_id && teamOn(input) && !readState(input.session_id).base) checkpoint(input); }
  else if (mode === 'mark') { if (input.session_id && isReviewer(input.agent_type)) checkpoint(input); }
  else reason = gate(input);
} catch { reason = undefined; }
if (reason) { process.stderr.write(reason); process.exit(2); }
process.exit(0);
