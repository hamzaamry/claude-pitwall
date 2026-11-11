import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Graph } from '../../src/ui/Graph.js';
import { emptyState } from '../../src/model/state.js';

function base() {
  const s = emptyState('s');
  s.agents.main = { key: 'main', role: 'main', model: 'sonnet', effort: 'medium', title: '', tokens: 1, status: 'working' };
  s.currentTask = 'fix the save bug';
  return s;
}

describe('Graph', () => {
  it("shows a card title and 'role · model'", () => {
    const s = base();
    s.agents.a1 = { key: 'a1', role: 'Explore', model: 'opus', effort: 'low', title: 'find callers', tokens: 5, status: 'working' };
    const f = render(<Graph state={s} width={100} height={22} tickMs={0} />).lastFrame()!;
    expect(f).toContain('find callers');
    expect(f).toContain('▮▯▯ low');
    expect(f).toContain('Explore · opus');
    expect(f).toContain('MAIN');
    expect(f).toContain('sonnet');
    expect(f).toContain('fix the save bug');
    expect(f).toContain('effort ▮▮▯ medium');
  });

  it("advisor panel shows 'not configured' with no advisor calls", () => {
    const f = render(<Graph state={base()} width={100} height={22} tickMs={0} />).lastFrame()!;
    expect(f).toContain('ADVISOR');
    expect(f).toContain('opus');
    expect(f).toContain('called when');
    expect(f).toContain('not configured');
    expect(f).toContain('plan check');
    expect(f).toContain('never edits code');
  });

  it('advisor panel is no longer "not configured" once a native call was seen', () => {
    const s = base();
    s.advisorCalls.push({ time: 't', source: 'native', why: 'native advice', tokens: 10 });
    const f = render(<Graph state={s} width={100} height={22} tickMs={0} />).lastFrame()!;
    expect(f).not.toContain('not configured');
    expect(f).toContain('1 call');
    expect(f).toContain('10 tokens');
  });

  it('draws status markers for done and failed cards', () => {
    const s = base();
    s.agents.a1 = { key: 'a1', role: 'Explore', model: 'haiku', title: 'one', tokens: 5, status: 'done' };
    s.agents.a2 = { key: 'a2', role: 'general-purpose', model: 'opus', title: 'two', tokens: 5, status: 'failed' };
    const f = render(<Graph state={s} width={140} height={22} tickMs={0} />).lastFrame()!;
    expect(f).toContain('✓ done');
    expect(f).toContain('✗ failed');
  });

  it('has a framed graph with a title and a legend', () => {
    const f = render(<Graph state={base()} width={110} height={22} tickMs={0} />).lastFrame()!;
    expect(f).toContain('live flow');
    expect(f).toContain('● working · ○ idle · ✓ done');
    expect(f).toContain('╭');
  });

  it('labels the wires like the mockup', () => {
    const s = base();
    s.agents.a1 = { key: 'a1', role: 'Explore', model: 'opus', title: 'find callers', tokens: 5, status: 'working' };
    const f = render(<Graph state={s} width={110} height={22} tickMs={0} />).lastFrame()!;
    expect(f).toContain('advice');
    expect(f).toContain('delegate');
  });

  it('a multi-line task does not tear the layout', () => {
    const s = base();
    s.currentTask = 'line one\nline two\r\nline three';
    s.agents.a1 = { key: 'a1', role: 'Explore', model: 'opus', title: 'find\ncallers', tokens: 5, status: 'working' };
    s.agents.a2 = { key: 'a2', role: 'Explore', model: 'opus', title: 'second', tokens: 5, status: 'working' };
    const f = render(<Graph state={s} width={110} height={22} tickMs={0} />).lastFrame()!;
    expect(f.split('\n')).toHaveLength(22);
    expect(f).toContain('┴');
    expect(f).toContain('find callers');
  });

  it('says "no calls yet" when the advisor is configured but never called', () => {
    const s = base();
    s.advisorModel = 'opus';
    const f = render(<Graph state={s} width={100} height={22} tickMs={0} />).lastFrame()!;
    expect(f).not.toContain('not configured');
    expect(f).toContain('no calls yet');
  });

  it('draws the trigger states: done, on, next and todo', () => {
    const s = base();
    s.advisorCalls.push({ time: 't', source: 'native', why: 'native advice', tokens: 10, taskNo: 0 });
    s.triggers = { planCheck: 'done', stuck: 'on', finalReview: 'next', askOpus: 'todo' };
    const f = render(<Graph state={s} width={110} height={26} tickMs={0} />).lastFrame()!;
    const line = (name: string) => f.split('\n').find((l) => l.includes(name))!;
    expect(line('plan check')).toContain('✓');
    expect(line('stuck')).toContain('●');
    expect(line('final review')).toContain('next');
    expect(line('/ask-opus')).toContain('○');
  });

  it('does not crash on a tiny terminal', () => {
    expect(() => render(<Graph state={base()} width={12} height={5} tickMs={0} />).lastFrame()).not.toThrow();
  });
});
