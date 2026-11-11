import type { Block, TranscriptEvent } from '../transcript/types.js';
import { colorForRole, colors } from '../ui/theme.js';
import { categorize } from './categories.js';
import type { AgentInfo, Category, SessionState } from './state.js';

const LOG_CAP = 200;

export function modelAlias(model: string): string {
  const m = model.match(/claude-([a-z]+)/);
  return m ? m[1] : model;
}

function agentFor(s: SessionState, key: string): AgentInfo {
  let a = s.agents[key];
  if (!a) {
    a = { key, role: key === 'main' ? 'main' : 'agent', model: '', title: '', tokens: 0, status: 'idle' };
    s.agents[key] = a;
  }
  return a;
}

function log(s: SessionState, time: string, who: string, text: string): void {
  s.log.push({ time, who, text });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

export function registerSubagent(
  s: SessionState, key: string,
  meta: { agentType: string; description: string; pickedEffortModel?: string; finished?: boolean; toolUseId?: string },
): void {
  const a = agentFor(s, key);
  a.role = meta.agentType;
  a.title = meta.description;
  if (meta.pickedEffortModel) a.model = modelAlias(meta.pickedEffortModel);
  if (meta.toolUseId) a.toolUseId = meta.toolUseId;
  if (meta.toolUseId && s.failedToolUseIds.has(meta.toolUseId)) a.status = 'failed';
  else if (meta.finished && a.status !== 'failed') a.status = 'done';
}

function onToolUse(s: SessionState, key: string, time: string, b: Extract<Block, { type: 'tool_use' }>): void {
  const who = agentFor(s, key).role;
  if (b.name === 'Agent') {
    const description = String(b.input.description ?? '');
    const type = String(b.input.subagent_type ?? 'general-purpose');
    s.pendingFlows.push({ from: key, to: b.id, label: description, color: colorForRole(type), at: time });
    log(s, time, who, `${who} → ${type}: ${description}`);
  } else if (b.name === 'Skill') {
    const name = String(b.input.skill ?? '');
    if (!name) return;
    const known = s.skills.find((k) => k.name === name && k.by === who);
    if (known) known.lastAt = time;
    else s.skills.push({ name, by: who, firstAt: time, lastAt: time });
  }
}

const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

/** Keep only what categorize needs, so a Write with a whole file in its input is not held in memory. */
function slim(b: Block): Block {
  if (b.type !== 'tool_use') return b;
  return { ...b, input: b.name === 'Bash' ? { command: String(b.input.command ?? '') } : {} };
}

export function applyEvent(s: SessionState, agentKey: string, e: TranscriptEvent): SessionState {
  if (e.time) {
    s.startedAt ??= e.time;
    s.lastActivity = e.time;
  }
  const agent = agentFor(s, agentKey);
  if (e.time) agent.lastActivity = e.time;

  if (e.kind === 'userPrompt') {
    if (agentKey === 'main') {
      s.currentTask = e.text.length > 60 ? e.text.slice(0, 60) + '…' : e.text;
      s.hasEdited = false;
      s.taskNo += 1;
      s.categories = { coding: 0, reading: 0, talking: 0, planning: 0, tests: 0 };
    }
    return s;
  }

  if (e.kind === 'toolResult') {
    // A subagent has failed only when its Agent call came back as an error, not when it hit
    // an ordinary tool error on the way (a missing file or a grep with no match is normal).
    if (e.isError) {
      s.failedToolUseIds.add(e.toolUseId);
      const spawned = Object.values(s.agents).find((a) => a.toolUseId === e.toolUseId);
      if (spawned) spawned.status = 'failed';
    }
    return s;
  }

  // Claude Code writes one line per content block of a message, and every line repeats the
  // message's usage. Usage is counted on the first line only; the blocks of every line are read.
  let info = s.msgInfo.get(e.messageId);
  const first = !s.seenMessageIds.has(e.messageId);
  const total = e.usage.input + e.usage.output + e.usage.cacheRead + e.usage.cacheWrite;
  if (first) {
    s.seenMessageIds.add(e.messageId);
    info = { tokens: total, blocks: [], category: 'talking', task: s.taskNo };
    s.msgInfo.set(e.messageId, info);
    agent.tokens += total;
    if (e.model) agent.model = modelAlias(e.model);
    agent.startedAt ??= e.time;
    if (e.advisorUsage) {
      const u = e.advisorUsage;
      const tokens = u.input + u.output + u.cacheRead + u.cacheWrite;
      s.advisorCalls.push({ time: e.time, source: 'native', why: 'native advice', tokens });
      s.pendingFlows.push({ from: agentKey, to: 'advisor', label: 'advice 🔒', color: colors.advisor, at: e.time });
      log(s, e.time, 'advisor', 'advice 🔒');
    }
  }
  if (e.effort) agent.effort = e.effort;
  if (agent.status !== 'failed' && agent.status !== 'done') agent.status = 'working';

  for (const b of e.blocks) {
    if (b.type === 'tool_use' || b.type === 'server_tool_use') {
      if (s.seenToolIds.has(b.id)) continue;
      s.seenToolIds.add(b.id);
    }
    info!.blocks.push(slim(b));
    if (b.type === 'tool_use') {
      onToolUse(s, agentKey, e.time, b);
      if (agentKey === 'main' && EDIT_TOOLS.includes(b.name)) s.hasEdited = true;
    }
  }

  // The category follows all the blocks seen so far, so a later line can move the whole message.
  const category: Category = categorize(info!.blocks, agentKey === 'main' && s.hasEdited);
  if (info!.task === s.taskNo) {
    if (first) s.categories[category] += total;
    else if (category !== info!.category) {
      s.categories[info!.category] -= info!.tokens;
      s.categories[category] += info!.tokens;
    }
  }
  info!.category = category;
  return s;
}
