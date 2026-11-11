import { describe, it, expect } from 'vitest';
import { emptyState, statusAt } from '../src/model/state.js';
import { applyEvent, registerSubagent } from '../src/model/reduce.js';
import type { TranscriptEvent } from '../src/transcript/types.js';

const usage = { input: 10, output: 5, cacheRead: 100, cacheWrite: 0 };
const asst = (over: Partial<Extract<TranscriptEvent, { kind: 'assistant' }>> = {}): TranscriptEvent => ({
  kind: 'assistant', time: '2026-11-11T10:00:00.000Z', messageId: 'm1', model: 'claude-sonnet-5-5',
  usage, blocks: [], ...over,
});

describe('applyEvent', () => {
  it('counts duplicated message once', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', asst());
    applyEvent(s, 'main', asst());
    expect(s.agents.main.tokens).toBe(115);
  });

  it('agent spawn creates card + flow', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', asst({ blocks: [{ type: 'tool_use', id: 'toolu_1', name: 'Agent',
      input: { description: 'find callers', subagent_type: 'Explore' } }] }));
    expect(s.pendingFlows).toContainEqual(expect.objectContaining({ from: 'main', to: 'toolu_1', label: 'find callers' }));
    expect(s.log.map((l) => l.text)).toContain('main → Explore: find callers');
  });

  it('a subagent is failed only when main gets an error result for its Agent call', () => {
    const s = emptyState('s');
    registerSubagent(s, 'a1', { agentType: 'Explore', description: 'x', toolUseId: 'toolu_1' });
    applyEvent(s, 'a1', { kind: 'toolResult', time: 't', toolUseId: 'inner', isError: true, text: 'grep found nothing' });
    expect(s.agents.a1.status).not.toBe('failed');
    applyEvent(s, 'main', { kind: 'toolResult', time: 't', toolUseId: 'toolu_1', isError: true, text: 'agent failed' });
    expect(s.agents.a1.status).toBe('failed');
  });

  it('failure is remembered when the subagent registers after main saw the error', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', { kind: 'toolResult', time: 't', toolUseId: 'toolu_1', isError: true, text: 'agent failed' });
    registerSubagent(s, 'a1', { agentType: 'Explore', description: 'x', toolUseId: 'toolu_1', finished: true });
    expect(s.agents.a1.status).toBe('failed');
  });

  it('skill usage tracked', () => {
    const s = emptyState('s');
    const skill = (t: string): TranscriptEvent => asst({ messageId: t, time: t,
      blocks: [{ type: 'tool_use', id: `skill-${t}`, name: 'Skill', input: { skill: 'superpowers:brainstorming' } }] });
    applyEvent(s, 'main', skill('2026-11-11T10:00:00.000Z'));
    applyEvent(s, 'main', skill('2026-11-11T10:05:00.000Z'));
    expect(s.skills).toHaveLength(1);
    expect(s.skills[0]).toMatchObject({ name: 'superpowers:brainstorming', by: 'main',
      firstAt: '2026-11-11T10:00:00.000Z', lastAt: '2026-11-11T10:05:00.000Z' });
  });

  it('native advisor call recorded', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', asst({ advisorUsage: { input: 25601, output: 697, cacheRead: 0, cacheWrite: 0 } }));
    expect(s.advisorCalls).toHaveLength(1);
    expect(s.advisorCalls[0].source).toBe('native');
    expect(s.advisorCalls[0].tokens).toBeGreaterThan(0);
    expect(s.advisorCalls[0].text).toBeUndefined();
    expect(s.pendingFlows).toContainEqual(expect.objectContaining({ from: 'main', to: 'advisor', label: 'advice 🔒' }));
  });

  it('native advisor call on a repeated message line is recorded once', () => {
    const s = emptyState('s');
    const e = asst({ advisorUsage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 } });
    applyEvent(s, 'main', e);
    applyEvent(s, 'main', e);
    expect(s.advisorCalls).toHaveLength(1);
  });

  it('current task = last user prompt, max 60 chars + …', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', { kind: 'userPrompt', time: 't', text: 'fix the save bug' });
    expect(s.currentTask).toBe('fix the save bug');
    applyEvent(s, 'main', { kind: 'userPrompt', time: 't', text: 'x'.repeat(100) });
    expect(s.currentTask).toBe('x'.repeat(60) + '…');
  });

  it('effort comes from assistant events', () => {
    const s = emptyState('s');
    registerSubagent(s, 'a1', { agentType: 'Explore', description: 'x' });
    applyEvent(s, 'a1', asst({ effort: 'low' }));
    expect(s.agents.a1.effort).toBe('low');
  });

  it('assistant turn feeds the token category of its blocks', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', asst({ blocks: [{ type: 'tool_use', id: 'x', name: 'Edit', input: {} }] }));
    expect(s.categories.coding).toBe(115);
  });
});

describe('registerSubagent', () => {
  it('sets role/model/title', () => {
    const s = emptyState('s');
    registerSubagent(s, 'a1', { agentType: 'Explore', description: 'find callers',
      pickedEffortModel: 'claude-opus-5-5', finished: true });
    expect(s.agents.a1).toMatchObject({ role: 'Explore', model: 'opus', title: 'find callers', status: 'done' });
  });
});

describe('a message written on several lines (one line per content block)', () => {
  const line = (blocks: any[], over: object = {}): TranscriptEvent => asst({ messageId: 'multi', blocks, ...over });

  it('processes the tool_use blocks of every line, counting tokens once', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', line([{ type: 'thinking' }]));
    applyEvent(s, 'main', line([{ type: 'text', chars: 10 }]));
    applyEvent(s, 'main', line([{ type: 'tool_use', id: 'toolu_a', name: 'Agent', input: { description: 'find callers', subagent_type: 'Explore' } }]));
    applyEvent(s, 'main', line([{ type: 'tool_use', id: 'toolu_s', name: 'Skill', input: { skill: 'brainstorming' } }]));
    expect(s.agents.main.tokens).toBe(115);
    expect(s.pendingFlows).toHaveLength(1);
    expect(s.skills.map((k) => k.name)).toEqual(['brainstorming']);
  });

  it('moves the message tokens to coding when a later line has an Edit', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', line([{ type: 'text', chars: 10 }]));
    expect(s.categories.talking).toBe(115);
    applyEvent(s, 'main', line([{ type: 'tool_use', id: 'toolu_e', name: 'Edit', input: {} }]));
    expect(s.categories.coding).toBe(115);
    expect(s.categories.talking).toBe(0);
    expect(Object.values(s.categories).reduce((a, b) => a + b, 0)).toBe(115);
    expect(s.hasEdited).toBe(true);
  });

  it('the same tool_use line read twice makes one flow', () => {
    const s = emptyState('s');
    const l = line([{ type: 'tool_use', id: 'toolu_a', name: 'Agent', input: { description: 'd', subagent_type: 'Explore' } }]);
    applyEvent(s, 'main', l);
    applyEvent(s, 'main', l);
    expect(s.pendingFlows).toHaveLength(1);
  });

  it('flows carry the time of the event that made them', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', line([{ type: 'tool_use', id: 'toolu_a', name: 'Agent', input: { description: 'd', subagent_type: 'Explore' } }]));
    expect(s.pendingFlows[0].at).toBe('2026-11-11T10:00:00.000Z');
  });
});

describe('this-task token categories', () => {
  it('reset when a new user prompt arrives', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', asst({ blocks: [{ type: 'text', chars: 5 }] }));
    expect(s.categories.talking).toBe(115);
    applyEvent(s, 'main', { kind: 'userPrompt', time: 't', text: 'next task' });
    expect(Object.values(s.categories).every((v) => v === 0)).toBe(true);
  });

  it('a late line of an old task does not push the new task negative', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', asst({ messageId: 'old', blocks: [{ type: 'text', chars: 5 }] }));
    applyEvent(s, 'main', { kind: 'userPrompt', time: 't', text: 'next task' });
    applyEvent(s, 'main', asst({ messageId: 'old', blocks: [{ type: 'tool_use', id: 'e', name: 'Edit', input: {} }] }));
    expect(Object.values(s.categories).every((v) => v >= 0)).toBe(true);
  });
});

describe('statusAt', () => {
  const a = (over: object = {}) => ({ key: 'x', role: 'main', model: '', title: '', tokens: 0, status: 'working' as const,
    lastActivity: '2026-11-11T10:00:00.000Z', ...over });
  const T = Date.parse('2026-11-11T10:00:00.000Z');
  it('working stays working while recently active', () => expect(statusAt(a(), T + 10_000)).toBe('working'));
  it('working becomes idle after 30 s of silence', () => expect(statusAt(a(), T + 31_000)).toBe('idle'));
  it('done and failed never change', () => {
    expect(statusAt(a({ status: 'done' }), T + 999_999)).toBe('done');
    expect(statusAt(a({ status: 'failed' }), T + 999_999)).toBe('failed');
  });
  it('no activity time means no claim of idleness', () => expect(statusAt(a({ lastActivity: undefined }), T + 999_999)).toBe('working'));
});

describe('session log', () => {
  const texts = (s: ReturnType<typeof emptyState>) => s.log.map((l) => `${l.who}: ${l.text}`);
  const tool = (id: string, name: string, input: Record<string, unknown>, mid = id): TranscriptEvent =>
    asst({ messageId: mid, blocks: [{ type: 'tool_use', id, name, input }] });

  it('logs what the user asked', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', { kind: 'userPrompt', time: '2026-11-11T10:00:00.000Z', text: 'fix the save bug' });
    expect(texts(s)).toEqual(['you: fix the save bug']);
  });

  it('logs an edit with the file name', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', tool('e1', 'Edit', { file_path: '/repo/app/GymPicker.tsx' }));
    applyEvent(s, 'main', tool('w1', 'Write', { file_path: '/repo/notes.md' }));
    expect(texts(s)).toEqual(['main: edited GymPicker.tsx', 'main: wrote notes.md']);
  });

  it('logs a test run', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', tool('b1', 'Bash', { command: 'npx vitest run' }));
    applyEvent(s, 'main', tool('b2', 'Bash', { command: 'ls -la' }));
    expect(texts(s)).toEqual(['main: ran npx vitest run']);
  });

  it('logs the first use of a skill only', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', tool('k1', 'Skill', { skill: 'brainstorming' }));
    applyEvent(s, 'main', tool('k2', 'Skill', { skill: 'brainstorming' }));
    expect(texts(s)).toEqual(['main: used skill brainstorming']);
  });

  it('logs when a helper finishes and when it fails, once', () => {
    const s = emptyState('s');
    registerSubagent(s, 'a1', { agentType: 'Explore', description: 'find callers', toolUseId: 'toolu_1' });
    registerSubagent(s, 'a1', { agentType: 'Explore', description: 'find callers', toolUseId: 'toolu_1', finished: true });
    registerSubagent(s, 'a1', { agentType: 'Explore', description: 'find callers', toolUseId: 'toolu_1', finished: true });
    registerSubagent(s, 'a2', { agentType: 'general-purpose', description: 'check tests', toolUseId: 'toolu_2' });
    applyEvent(s, 'main', { kind: 'toolResult', time: 't', toolUseId: 'toolu_2', isError: true, text: 'x' });
    expect(texts(s)).toEqual(['Explore: finished find callers', 'general-purpose: failed check tests']);
  });

  it('a helper log line carries the helper role', () => {
    const s = emptyState('s');
    registerSubagent(s, 'a1', { agentType: 'Explore', description: 'x' });
    applyEvent(s, 'a1', tool('e9', 'Edit', { file_path: '/a/b.ts' }));
    expect(texts(s)).toEqual(['Explore: edited b.ts']);
  });
});

describe('configured advisor', () => {
  it('records the advisor model from the assistant lines, even with no call yet', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', asst({ advisorModel: 'claude-opus-5-5' }));
    expect(s.advisorModel).toBe('opus');
    expect(s.advisorCalls).toHaveLength(0);
  });
});
