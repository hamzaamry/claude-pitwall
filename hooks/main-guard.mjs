// Team hook: main is the executor. It plans, gets the plan approved, then only codes; helpers do the rest.
//   main-guard.mjs check   (PreToolUse):   for main only (no agent_id), deny
//                                          - searching (Grep, Glob, web, look-only Bash, whole-file Read) -> pitwall:scout
//                                          - test, build and lint commands                                -> pitwall:runner
//                                          - writing files through Bash                                   -> Edit / Write
//                                          - other agent types                                            -> pitwall:scout
//                                          - Edit / Write before the reviewer said "plan approved"
//                                          - a second final review in the same task
//   main-guard.mjs start   (SubagentStart): the session's first reviewer is remembered; later reviews continue it.
//   main-guard.mjs verdict (SubagentStop): "plan approved" from the reviewer opens editing; a final "approved" closes
//                                          it, so the next task needs its own plan.
import { readFileSync } from 'node:fs';
import { appendEvent, readState, runHook, teamOn, writeState } from './lib/hook.mjs';

const FROM = 'pitwall plugin hook (installed by the user): ';
const SCOUT = `${FROM}main does not search. Send a pitwall:scout with one focused question (several in parallel if needed), then Read only the slice it points to, with offset and limit.`;
const REVIEWER_SCOUT = `${FROM}the reviewer does not search. Send a pitwall:scout with one focused question (several in parallel if needed). Read and git stay allowed.`;
const RUNNER = `${FROM}main does not run tests, build or lint. Send the command to pitwall:runner.`;
const NO_BASH_WRITES = `${FROM}write code with the Edit or Write tool, not through Bash.`;
const ONE_REVIEW = `${FROM}the final review for this task is already done. Apply its points and finish; no second review.`;
const NEEDS_PLAN = `${FROM}no approved plan yet. Send your plan to pitwall:reviewer with the first line PLAN-CHECK: (task, files, steps). Code after it answers "plan approved".`;

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'WebSearch', 'WebFetch']);
const NOT_TEXT = /\.(pdf|png|jpe?g|gif|webp|ipynb)$/i;
const isReviewer = (type) => /(^|:)reviewer$/.test(String(type ?? ''));

const TEST = /\b(test|vitest|jest|pytest|tsc|lint|eslint|build|cargo check|go vet)\b/;
const LOOK = /^(ls|cat|head|tail|grep|egrep|rg|find|tree|wc|stat|file|less|awk|sed -n|bat)\b/;
const unquoted = (c) => c.replace(/'[^']*'|"(\\.|[^"\\])*"/g, "''");
const stripCd = (c) => c.trim().replace(/^cd\s+[^;&|]+(&&|;)\s*/, '');

export function bashKind(command) {
  const c = stripCd(String(command ?? ''));
  const bare = unquoted(c);
  if (/\b(python3?|node|ruby|perl)\s+-\s*<</.test(bare) || /\bsed\s+-i\b|\bperl\s+-[a-z]*i\b|\btee\b/.test(bare)) return 'write';
  if (/(^|[^0-9&>])>>?\s*(?!&|\/dev\/null)[^\s|&;]/.test(bare)) return 'write';
  if (TEST.test(bare)) return 'test';
  if (LOOK.test(c)) return 'look';
  return 'other';
}

const deny = (sessionId, reason, kind) => {
  appendEvent(sessionId, { t: new Date().toISOString(), event: 'Nudge', session: sessionId, kind });
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
};

const continueReviewer = (id) => `${FROM}the reviewer is one per session and keeps its memory. Continue it with SendMessage to "${id}" instead of starting a new one; tell it only what changed since its last look.`;

/** A final review (not a plan check or a question) is allowed once per task. */
function oneFinalReview(sid, prompt) {
  if (/^(PLAN-CHECK|ASK-OPUS):/.test(String(prompt ?? '').trimStart())) return;
  const state = readState(sid);
  if (state.finalReviewed) return deny(sid, ONE_REVIEW, 'guard-review');
  writeState(sid, { ...state, finalReviewed: true });
}

/** SubagentStart: the first reviewer of the session becomes THE reviewer. */
function started(input) {
  if (!input.session_id || !input.agent_id || !isReviewer(input.agent_type) || !teamOn(input)) return;
  const state = readState(input.session_id);
  if (!state.reviewerId) writeState(input.session_id, { ...state, reviewerId: input.agent_id });
}

function check(input) {
  if (!input.session_id || !teamOn(input)) return;
  const tool = input.tool_name;
  const ti = input.tool_input ?? {};
  const sid = input.session_id;
  // The Opus reviewer judges; its searching goes to Haiku scouts too. It may still Read and run git.
  if (input.agent_id) {
    if (!isReviewer(input.agent_type)) return;
    if (SEARCH_TOOLS.has(tool) || (tool === 'Bash' && bashKind(ti.command) === 'look')) return deny(sid, REVIEWER_SCOUT, 'guard-search');
    if (tool === 'Agent' && ti.subagent_type !== 'pitwall:scout') return deny(sid, REVIEWER_SCOUT, 'guard-search');
    return;
  }
  if (SEARCH_TOOLS.has(tool)) return deny(sid, SCOUT, 'guard-search');
  if (tool === 'Read' && ti.offset === undefined && ti.pages === undefined && !NOT_TEXT.test(String(ti.file_path ?? ''))) return deny(sid, SCOUT, 'guard-search');
  if (tool === 'Agent' && !String(ti.subagent_type ?? '').startsWith('pitwall:')) return deny(sid, SCOUT, 'guard-search');
  if (tool === 'Agent' && isReviewer(ti.subagent_type)) {
    const { reviewerId } = readState(sid);
    if (reviewerId) return deny(sid, continueReviewer(reviewerId), 'guard-reviewer');
    const no = oneFinalReview(sid, ti.prompt);
    if (no) return no;
  }
  if (tool === 'SendMessage' && ti.to && ti.to === readState(sid).reviewerId) {
    const no = oneFinalReview(sid, ti.message);
    if (no) return no;
  }
  if (tool === 'Bash') {
    const kind = bashKind(ti.command);
    if (kind === 'write') return deny(sid, NO_BASH_WRITES, 'guard-bash-write');
    if (kind === 'test') return deny(sid, RUNNER, 'guard-test');
    if (kind === 'look') return deny(sid, SCOUT, 'guard-search');
  }
  if (EDIT_TOOLS.has(tool) && !readState(sid).planOk) return deny(sid, NEEDS_PLAN, 'guard-plan');
}

// A background agent answers through a SubagentHandback tool call, so last_assistant_message is empty:
// fall back to the last handback message or text in the agent's own transcript.
export function finalAnswer(input) {
  const direct = String(input.last_assistant_message ?? '').trim();
  if (direct || typeof input.agent_transcript_path !== 'string') return direct;
  let answer = '';
  try {
    for (const line of readFileSync(input.agent_transcript_path, 'utf8').split('\n')) {
      if (!line.includes('"assistant"')) continue;
      let d; try { d = JSON.parse(line); } catch { continue; }
      for (const b of Array.isArray(d?.message?.content) ? d.message.content : []) {
        if (b.type === 'tool_use' && b.name === 'SubagentHandback' && typeof b.input?.message === 'string') answer = b.input.message;
        else if (b.type === 'text' && b.text.trim()) answer = b.text;
      }
    }
  } catch { /* unreadable transcript: no verdict */ }
  return answer.trim();
}

function verdict(input) {
  if (!input.session_id || !isReviewer(input.agent_type) || !teamOn(input)) return;
  const first = finalAnswer(input).split('\n')[0].trim().toLowerCase();
  const state = readState(input.session_id);
  if (first.startsWith('plan approved')) writeState(input.session_id, { ...state, planOk: true, finalReviewed: false });
  else if (first.startsWith('approved') && state.planOk) writeState(input.session_id, { ...state, planOk: false });
}

const MODES = { check, verdict, start: started };
if (MODES[process.argv[2]]) runHook(MODES[process.argv[2]]);
