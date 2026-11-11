import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Header } from '../../src/ui/Header.js';
import { fmtTokens } from '../../src/ui/format.js';
import { emptyState } from '../../src/model/state.js';

const T0 = Date.parse('2026-11-11T10:00:00.000Z');

function sample() {
  const s = emptyState('s1');
  s.currentTask = 'fix the save bug';
  s.startedAt = '2026-11-11T10:00:00.000Z';
  s.agents.main = { key: 'main', role: 'main', model: 'sonnet', effort: 'medium', title: '', tokens: 60_000, status: 'working' };
  s.agents.a1 = { key: 'a1', role: 'Explore', model: 'opus', title: 'find callers', tokens: 8_700, status: 'done' };
  return s;
}

describe('Header', () => {
  it('shows task, team state, total tokens and elapsed time', () => {
    const f = render(<Header state={sample()} teamOn={false} now={T0 + 168_000} width={150} />).lastFrame()!;
    expect(f).toContain('pitwall');
    expect(f).toContain('fix the save bug');
    expect(f).toContain('team off');
    expect(f).toContain('tokens 68.7k');
    expect(f).toContain('elapsed 2:48');
  });

  it('shows a chip per agent with model and effort', () => {
    const f = render(<Header state={sample()} teamOn={true} now={T0} width={150} />).lastFrame()!;
    expect(f).toContain('team on');
    expect(f).toContain('main');
    expect(f).toContain('sonnet · medium');
    expect(f).toContain('Explore');
    expect(f).toContain('opus');
    expect(f).toContain('8.7k');
  });

  it('does not crash with no agents', () => {
    const f = render(<Header state={emptyState('s')} teamOn={false} now={T0} width={50} />).lastFrame()!;
    expect(f).toContain('pitwall');
  });
});

describe('fmtTokens', () => {
  it('formats', () => {
    expect(fmtTokens(950)).toBe('950');
    expect(fmtTokens(48_200)).toBe('48.2k');
    expect(fmtTokens(1_250_000)).toBe('1.25M');
  });
});
