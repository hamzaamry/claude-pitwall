import { describe, it, expect } from 'vitest';
import { parseEvent, applyPitwallEvent } from '../src/events.js';
import { emptyState } from '../src/model/state.js';
import { registerSubagent } from '../src/model/reduce.js';

const ev = (o: object) => JSON.stringify({ t: '2026-11-11T10:00:00.000Z', session: 's', ...o });

describe('parseEvent', () => {
  it('parses a good line', () => {
    expect(parseEvent(ev({ event: 'Stop' }))).toMatchObject({ event: 'Stop', session: 's' });
  });
  it('returns null for invalid JSON, non-objects and lines without event or session', () => {
    for (const l of ['{nope', '[1]', '"x"', 'null', JSON.stringify({ event: 'Stop' }), JSON.stringify({ session: 's' })]) {
      expect(parseEvent(l), l).toBeNull();
    }
  });
});

describe('applyPitwallEvent', () => {
  it('SubagentStart makes a working card with the agent type as role', () => {
    const s = emptyState('s');
    applyPitwallEvent(s, parseEvent(ev({ event: 'SubagentStart', agent: 'a1', agentType: 'pitwall:scout' }))!);
    expect(s.agents.a1).toMatchObject({ role: 'pitwall:scout', status: 'working' });
  });
  it('SubagentStart does not wipe the title of a card the transcript already made', () => {
    const s = emptyState('s');
    registerSubagent(s, 'a1', { agentType: 'pitwall:scout', description: 'find callers' });
    applyPitwallEvent(s, parseEvent(ev({ event: 'SubagentStart', agent: 'a1', agentType: 'pitwall:scout' }))!);
    expect(s.agents.a1.title).toBe('find callers');
  });
  it('SubagentStop makes it done, but never undoes failed', () => {
    const s = emptyState('s');
    applyPitwallEvent(s, parseEvent(ev({ event: 'SubagentStart', agent: 'a1', agentType: 'pitwall:scout' }))!);
    applyPitwallEvent(s, parseEvent(ev({ event: 'SubagentStop', agent: 'a1', agentType: 'pitwall:scout' }))!);
    expect(s.agents.a1.status).toBe('done');
    s.agents.a2 = { key: 'a2', role: 'x', model: '', title: '', tokens: 0, status: 'failed' };
    applyPitwallEvent(s, parseEvent(ev({ event: 'SubagentStop', agent: 'a2' }))!);
    expect(s.agents.a2.status).toBe('failed');
  });
  it('SubagentStop for an unknown agent does not invent a card', () => {
    const s = emptyState('s');
    applyPitwallEvent(s, parseEvent(ev({ event: 'SubagentStop', agent: 'ghost' }))!);
    expect(Object.keys(s.agents)).toEqual([]);
  });
  it('Nudge events are remembered by kind', () => {
    const s = emptyState('s');
    applyPitwallEvent(s, parseEvent(ev({ event: 'Nudge', kind: 'same-error', t: '2026-11-11T10:05:00.000Z' }))!);
    expect(s.nudges['same-error']).toBe('2026-11-11T10:05:00.000Z');
  });
  it('ignores events of another session and unknown events', () => {
    const s = emptyState('s');
    applyPitwallEvent(s, { ...parseEvent(ev({ event: 'SubagentStart', agent: 'a1' }))!, session: 'other' });
    applyPitwallEvent(s, parseEvent(ev({ event: 'Whatever' }))!);
    expect(Object.keys(s.agents)).toEqual([]);
  });
});
