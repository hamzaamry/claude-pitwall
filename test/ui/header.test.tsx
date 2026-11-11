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

  it('shows advisor tokens next to the total, since they are Opus tokens', () => {
    const s = sample();
    s.advisorCalls.push({ time: 't', source: 'native', why: 'native advice', tokens: 26_300 });
    const f = render(<Header state={s} teamOn={false} now={T0} width={150} />).lastFrame()!;
    expect(f).toContain('tokens 68.7k');
    expect(f).toContain('advisor 26.3k');
  });

  it('shows an agent quiet for 30 s as idle', () => {
    const s = sample();
    s.agents.main.lastActivity = '2026-11-11T10:00:00.000Z';
    const f = render(<Header state={s} teamOn={false} now={T0 + 60_000} width={150} />).lastFrame()!;
    expect(f).toContain('idle');
    expect(f).not.toContain('working');
  });

  it('always has an advisor chip, dim and "not configured" until a call is seen', () => {
    const f = render(<Header state={sample()} teamOn={false} now={T0} width={150} />).lastFrame()!;
    expect(f).toContain('advisor');
    expect(f).toContain('not configured');
  });

  it('shows the advisor chip with its calls once there is one', () => {
    const s = sample();
    s.advisorCalls.push({ time: 't', source: 'native', why: 'native advice', tokens: 26_300 });
    const f = render(<Header state={s} teamOn={false} now={T0} width={150} />).lastFrame()!;
    expect(f).not.toContain('not configured');
    expect(f).toContain('1 call');
  });

  it('groups helper agents of one role into one chip with a running count', () => {
    const s = sample();
    s.agents.a2 = { key: 'a2', role: 'Explore', model: 'opus', title: 'x', tokens: 1_000, status: 'working' };
    s.agents.a3 = { key: 'a3', role: 'Explore', model: 'opus', title: 'y', tokens: 2_000, status: 'done' };
    delete s.agents.a1;
    const f = render(<Header state={s} teamOn={false} now={T0} width={150} />).lastFrame()!;
    expect(f.match(/Explore/g)).toHaveLength(1);
    expect(f).toContain('1 running');
    expect(f).toContain('3k');
  });

  it('draws the chips in bordered boxes', () => {
    const f = render(<Header state={sample()} teamOn={false} now={T0} width={150} />).lastFrame()!;
    expect(f).toContain('╭');
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
