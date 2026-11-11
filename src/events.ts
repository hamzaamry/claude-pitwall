import { registerSubagent, settle } from './model/reduce.js';
import type { SessionState } from './model/state.js';

/** One line of ~/.claude/pitwall/events/<session>.jsonl, written by hooks/event-log.mjs and the team hooks. */
export type PitwallEvent = {
  t: string; event: string; session: string;
  agent?: string; agentType?: string; tool?: string; description?: string; detail?: string; kind?: string;
};

export function parseEvent(line: string): PitwallEvent | null {
  try {
    const d = JSON.parse(line);
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    if (typeof d.event !== 'string' || typeof d.session !== 'string') return null;
    return d as PitwallEvent;
  } catch { return null; }
}

/** Exact start/stop times and hook nudges: the transcript alone only shows them after the fact. */
export function applyPitwallEvent(s: SessionState, e: PitwallEvent): void {
  if (e.session !== s.sessionId) return;
  if (e.event === 'SubagentStart' && e.agent) {
    if (!s.agents[e.agent]) registerSubagent(s, e.agent, { agentType: e.agentType ?? 'agent', description: '' });
    const a = s.agents[e.agent];
    if (a.status !== 'failed' && a.status !== 'done') a.status = 'working';
  } else if (e.event === 'SubagentStop' && e.agent) {
    const a = s.agents[e.agent];
    if (a) settle(s, a, 'done', e.t);
  } else if (e.event === 'Nudge' && e.kind) {
    s.nudges[e.kind] = e.t;
    if (e.kind === 'same-error') {
      const last = s.advisorCalls[s.advisorCalls.length - 1];
      // an advisor call that already came after the nudge has answered it
      s.triggers.stuck = last && Date.parse(last.time) >= Date.parse(e.t) ? 'done' : 'on';
    }
  }
}
