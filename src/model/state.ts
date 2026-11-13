import type { Block } from '../transcript/types.js';

export type Category = 'coding' | 'reading' | 'talking' | 'planning' | 'tests';
export type AgentInfo = { key: string; role: string; model: string; effort?: string; title: string;
  tokens: number; status: 'working' | 'idle' | 'done' | 'failed'; startedAt?: string; finishedAt?: string;
  toolUseId?: string; lastActivity?: string };
export type AdvisorCall = { time: string; source: 'native' | 'reviewer'; why: string; result?: string; tokens: number; text?: string; taskNo: number; toolUseId?: string };
export type Triggers = {
  planCheck: 'todo' | 'done'; stuck: 'todo' | 'on' | 'done'; finalReview: 'todo' | 'next' | 'done'; askOpus: 'todo' | 'done';
};
export const freshTriggers = (): Triggers => ({ planCheck: 'todo', stuck: 'todo', finalReview: 'todo', askOpus: 'todo' });
export type LogEntry = { time: string; who: string; text: string };
export type Flow = { from: string; to: string; label: string; color: string; tries?: number; at?: string; back?: boolean };
export type SessionState = {
  sessionId: string; currentTask: string; startedAt?: string; lastActivity?: string;
  agents: Record<string, AgentInfo>;      // key 'main' + one per subagent id
  seenMessageIds: Set<string>;
  skills: { name: string; by: string; firstAt: string; lastAt: string }[];
  advisorCalls: AdvisorCall[];
  categories: Record<Category, number>;   // tokens per category
  log: LogEntry[];                        // capped at 200 entries
  pendingFlows: Flow[];                   // consumed by the graph animation
  hasEdited: boolean;                     // main has edited since the last user prompt
  teamOn?: boolean;                       // undefined until the pitwall hooks have written an events file
  nudges: Record<string, string>;         // hook nudges by kind -> time
  advisorModel?: string;                  // set on every assistant line once an advisor is configured
  triggers: Triggers;                     // advisor trigger states of the current task
  spawns: Map<string, { from: string; type: string; askOpus: boolean; planCheck?: boolean }>;  // Agent tool_use id -> who asked for what
  taskNo: number;                         // counts main user prompts
  // bookkeeping for messages written on several lines (one line per content block)
  msgInfo: Map<string, { tokens: number; blocks: Block[]; category: Category }>;
  seenToolIds: Set<string>;
  failedToolUseIds: Set<string>;
};

/** An agent that has been quiet for 30 s is shown as idle: its transcript says nothing newer. */
export const IDLE_AFTER_MS = 30_000;
export function statusAt(a: AgentInfo, nowMs: number): AgentInfo['status'] {
  if (a.status === 'working' && a.lastActivity && nowMs - Date.parse(a.lastActivity) > IDLE_AFTER_MS) return 'idle';
  return a.status;
}

export function emptyState(sessionId: string): SessionState {
  return {
    sessionId, currentTask: '', agents: {}, seenMessageIds: new Set(), skills: [], advisorCalls: [],
    categories: { coding: 0, reading: 0, talking: 0, planning: 0, tests: 0 },
    log: [], pendingFlows: [], hasEdited: false, taskNo: 0, nudges: {}, triggers: freshTriggers(), spawns: new Map(),
    msgInfo: new Map(), seenToolIds: new Set(), failedToolUseIds: new Set(),
  };
}

/** A reviewer call's tokens are its card's tokens, read now: the card may not have existed (or been complete) when the answer arrived. */
export function advisorCallTokens(s: SessionState, c: AdvisorCall): number {
  const card = c.toolUseId ? Object.values(s.agents).find((a) => a.toolUseId === c.toolUseId) : undefined;
  return card?.tokens ?? c.tokens;
}
