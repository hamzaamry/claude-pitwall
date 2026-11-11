import { describe, it, expect } from 'vitest';
import { emptyState } from '../src/model/state.js';
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

  it('failed tool result marks failed', () => {
    const s = emptyState('s');
    registerSubagent(s, 'a1', { agentType: 'Explore', description: 'x' });
    applyEvent(s, 'a1', { kind: 'toolResult', time: 't', toolUseId: 'u', isError: true, text: 'bad' });
    expect(s.agents.a1.status).toBe('failed');
  });

  it('skill usage tracked', () => {
    const s = emptyState('s');
    const skill = (t: string): TranscriptEvent => asst({ messageId: t, time: t,
      blocks: [{ type: 'tool_use', id: 'x', name: 'Skill', input: { skill: 'superpowers:brainstorming' } }] });
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
