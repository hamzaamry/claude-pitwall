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
    s.agents.a1 = { key: 'a1', role: 'Explore', model: 'opus', title: 'find callers', tokens: 5, status: 'working' };
    const f = render(<Graph state={s} width={100} height={22} tickMs={0} />).lastFrame()!;
    expect(f).toContain('find callers');
    expect(f).toContain('Explore · opus');
    expect(f).toContain('main · sonnet');
    expect(f).toContain('fix the save bug');
  });

  it("advisor panel shows 'not configured' with no advisor calls", () => {
    const f = render(<Graph state={base()} width={100} height={22} tickMs={0} />).lastFrame()!;
    expect(f).toContain('advisor · opus');
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
  });

  it('draws status markers for done and failed cards', () => {
    const s = base();
    s.agents.a1 = { key: 'a1', role: 'Explore', model: 'haiku', title: 'one', tokens: 5, status: 'done' };
    s.agents.a2 = { key: 'a2', role: 'general-purpose', model: 'opus', title: 'two', tokens: 5, status: 'failed' };
    const f = render(<Graph state={s} width={140} height={22} tickMs={0} />).lastFrame()!;
    expect(f).toContain('✓ done');
    expect(f).toContain('✗ failed');
  });

  it('does not crash on a tiny terminal', () => {
    expect(() => render(<Graph state={base()} width={12} height={5} tickMs={0} />).lastFrame()).not.toThrow();
  });
});
