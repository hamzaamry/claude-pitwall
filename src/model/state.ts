export type Category = 'coding' | 'reading' | 'talking' | 'planning' | 'tests';
export type AgentInfo = { key: string; role: string; model: string; effort?: string; title: string;
  tokens: number; status: 'working' | 'idle' | 'done' | 'failed'; startedAt?: string; finishedAt?: string;
  toolUseId?: string };
export type AdvisorCall = { time: string; source: 'native' | 'reviewer'; why: string; result?: string; tokens: number; text?: string };
export type LogEntry = { time: string; who: string; text: string };
export type Flow = { from: string; to: string; label: string; color: string };
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
};

export function emptyState(sessionId: string): SessionState {
  return {
    sessionId, currentTask: '', agents: {}, seenMessageIds: new Set(), skills: [], advisorCalls: [],
    categories: { coding: 0, reading: 0, talking: 0, planning: 0, tests: 0 },
    log: [], pendingFlows: [], hasEdited: false,
  };
}
