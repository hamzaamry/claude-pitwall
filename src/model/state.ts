import type { Block } from '../transcript/types.js';

export type Category = 'coding' | 'reading' | 'talking' | 'planning' | 'tests';
export type AgentInfo = { key: string; role: string; model: string; effort?: string; title: string;
  tokens: number; status: 'working' | 'idle' | 'done' | 'failed'; startedAt?: string; finishedAt?: string;
  toolUseId?: string; lastActivity?: string };
export type AdvisorCall = { time: string; source: 'native' | 'reviewer'; why: string; result?: string; tokens: number; text?: string };
export type LogEntry = { time: string; who: string; text: string };
export type Flow = { from: string; to: string; label: string; color: string; tries?: number; at?: string };
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
  taskNo: number;                         // counts main user prompts; categories belong to the current one
  // bookkeeping for messages written on several lines (one line per content block)
  msgInfo: Map<string, { tokens: number; blocks: Block[]; category: Category; task: number }>;
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
    log: [], pendingFlows: [], hasEdited: false, taskNo: 0,
    msgInfo: new Map(), seenToolIds: new Set(), failedToolUseIds: new Set(),
  };
}
