import { describe, it, expect } from 'vitest';
import { emptyState, statusAt } from '../src/model/state.js';
import { applyEvent, registerSubagent } from '../src/model/reduce.js';
import { applyPitwallEvent } from '../src/events.js';
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

describe('reviewer calls, return flows and advisor triggers', () => {
  const spawn = (id: string, type: string, prompt = 'review the diff', description = 'review'): TranscriptEvent =>
    asst({ messageId: `m-${id}`, blocks: [{ type: 'tool_use', id, name: 'Agent', input: { description, subagent_type: type, prompt } }] });
  const result = (id: string, text: string, isError = false): TranscriptEvent => ({ kind: 'toolResult', time: '2026-11-11T10:01:00.000Z', toolUseId: id, isError, text });

  it.each(['approved', 'needs info', 'fix'])('a reviewer answer starting "%s" adds a reviewer call with that verdict', (verdict) => {
    const s = emptyState('s');
    applyEvent(s, 'main', spawn('r1', 'pitwall:reviewer'));
    applyEvent(s, 'main', result('r1', `${verdict}\n1. app/x.ts:3 do this`));
    expect(s.advisorCalls).toHaveLength(1);
    expect(s.advisorCalls[0]).toMatchObject({ source: 'reviewer', why: 'final review', result: verdict, taskNo: s.taskNo });
    expect(s.advisorCalls[0].text).toBe(`${verdict} 1. app/x.ts:3 do this`);
  });

  it('a result for another kind of agent adds no advisor call but queues a labelled return flow', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', spawn('t1', 'pitwall:runner', 'npm test', 'run tests'));
    s.pendingFlows.length = 0;
    applyEvent(s, 'main', result('t1', '2 failed\nFAIL a.test.ts'));
    expect(s.advisorCalls).toHaveLength(0);
    expect(s.pendingFlows).toEqual([expect.objectContaining({ from: 't1', to: 'main', back: true, label: '2 failed' })]);
  });

  it('the return flow comes from the agent card when it is known', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', spawn('t1', 'pitwall:scout', 'q', 'find x'));
    registerSubagent(s, 'a9', { agentType: 'pitwall:scout', description: 'find x', toolUseId: 't1' });
    s.pendingFlows.length = 0;
    applyEvent(s, 'main', result('t1', 'app/a.ts:3 thing\nconfidence: high'));
    expect(s.pendingFlows[0]).toMatchObject({ from: 'a9', to: 'main', back: true });
  });

  it('a result for a tool that is not an Agent call queues nothing', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', result('some-read', 'file contents'));
    expect(s.pendingFlows).toEqual([]);
    expect(s.advisorCalls).toEqual([]);
  });

  it('an ASK-OPUS: prompt makes an ask-opus call and sets that trigger', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', spawn('q1', 'pitwall:reviewer', 'ASK-OPUS:\nwhy is x slow?'));
    applyEvent(s, 'main', result('q1', 'Because of y.'));
    expect(s.advisorCalls[0]).toMatchObject({ source: 'reviewer', why: 'ask-opus' });
    expect(s.triggers.askOpus).toBe('done');
  });

  it('labels are cut to 24 characters and never contain a newline', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', spawn('t1', 'pitwall:scout'));
    s.pendingFlows.length = 0;
    applyEvent(s, 'main', result('t1', '\n\n' + 'x'.repeat(60) + '\nsecond line'));
    expect(s.pendingFlows[0].label).toHaveLength(24);
    expect(s.pendingFlows[0].label).not.toContain('\n');
  });

  it('a failed reviewer call is not counted as advice', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', spawn('r1', 'pitwall:reviewer'));
    applyEvent(s, 'main', result('r1', 'tool error', true));
    expect(s.advisorCalls).toEqual([]);
  });

  it('triggers follow the sequence and reset on a new prompt', () => {
    const s = emptyState('s');
    expect(s.triggers).toEqual({ planCheck: 'todo', stuck: 'todo', finalReview: 'todo', askOpus: 'todo' });
    applyEvent(s, 'main', asst({ messageId: 'adv1', advisorUsage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 } }));
    expect(s.triggers.planCheck).toBe('done');
    applyEvent(s, 'main', asst({ messageId: 'e1', blocks: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: '/a/b.ts' } }] }));
    expect(s.triggers.finalReview).toBe('next');
    applyPitwallEvent(s, { t: '2026-11-11T10:05:00.000Z', event: 'Nudge', session: 's', kind: 'same-error' });
    expect(s.triggers.stuck).toBe('on');
    applyEvent(s, 'main', asst({ messageId: 'adv2', advisorUsage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 } }));
    expect(s.triggers.stuck).toBe('done');
    applyEvent(s, 'main', spawn('r1', 'pitwall:reviewer'));
    applyEvent(s, 'main', result('r1', 'approved'));
    expect(s.triggers.finalReview).toBe('done');
    applyEvent(s, 'main', { kind: 'userPrompt', time: 't', text: 'next task' });
    expect(s.triggers).toEqual({ planCheck: 'todo', stuck: 'todo', finalReview: 'todo', askOpus: 'todo' });
  });

  it('an advisor call after an edit is not a plan check', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', asst({ messageId: 'e1', blocks: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: '/a/b.ts' } }] }));
    applyEvent(s, 'main', asst({ messageId: 'adv1', advisorUsage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 } }));
    expect(s.triggers.planCheck).toBe('todo');
  });

  it('a nudge that came before the latest advisor call is already answered', () => {
    const s = emptyState('s');
    applyEvent(s, 'main', asst({ messageId: 'adv1', time: '2026-11-11T10:10:00.000Z', advisorUsage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } }));
    applyPitwallEvent(s, { t: '2026-11-11T10:05:00.000Z', event: 'Nudge', session: 's', kind: 'same-error' });
    expect(s.triggers.stuck).toBe('done');
  });
});

describe('plugin agent names and log order', () => {
  it('a plugin agent shows without the plugin prefix', () => {
    const s = emptyState('s');
    registerSubagent(s, 'a1', { agentType: 'pitwall:scout', description: 'find x' });
    expect(s.agents.a1.role).toBe('scout');
    applyEvent(s, 'main', asst({ blocks: [{ type: 'tool_use', id: 'sp', name: 'Agent', input: { description: 'find x', subagent_type: 'pitwall:scout' } }] }));
    expect(s.log.map((l) => l.text)).toContain('main → scout: find x');
  });

  it('the log stays in time order even when events arrive out of order', () => {
    const s = emptyState('s');
    const t = (n: number) => `2026-11-11T10:00:0${n}.000Z`;
    applyEvent(s, 'main', { kind: 'userPrompt', time: t(5), text: 'later' });
    applyEvent(s, 'main', { kind: 'userPrompt', time: t(1), text: 'earlier' });
    applyEvent(s, 'main', { kind: 'userPrompt', time: t(3), text: 'middle' });
    expect(s.log.map((l) => l.text)).toEqual(['earlier', 'middle', 'later']);
  });
});
