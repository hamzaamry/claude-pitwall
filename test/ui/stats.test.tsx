import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Stats, colorFor, percentages } from '../../src/ui/Stats.js';
import { emptyState } from '../../src/model/state.js';

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const limits = {
  contextPct: 42,
  fiveHour: { pct: 11, resetsAt: NOW / 1000 + 11280 },
  weekly: { pct: 85, resetsAt: NOW / 1000 + 262800 },
};
const frame = (s = emptyState('s'), l: typeof limits | null = limits, now = NOW) =>
  render(<Stats state={s} limits={l} now={now} />).lastFrame()!;

describe('Stats: LIMITS', () => {
  it('shows percentages and reset times', () => {
    const f = frame();
    expect(f).toContain('LIMITS');
    expect(f).toContain('42%');
    expect(f).toContain('11%');
    expect(f).toContain('85%');
    expect(f).toContain('resets in 3h 8m');
    expect(f).toContain('resets in 3d 1h');
  });
  it('uses the warning colour from 80%', () => {
    expect(colorFor(85)).toBe('#d29922');
    expect(colorFor(79)).not.toBe('#d29922');
  });
  it('asks for setup when there are no limits', () => {
    expect(frame(emptyState('s'), null)).toContain('run /pitwall:setup to see limits');
  });
  it('shows only context when there are no rate limits (API-key user)', () => {
    const f = frame(emptyState('s'), { contextPct: 42 } as any);
    expect(f).toContain('42%');
    expect(f).not.toContain('resets in');
  });
});

describe('Stats: ADVISOR', () => {
  it('says not called yet with no calls', () => {
    const f = frame();
    expect(f).toContain('ADVISOR · opus');
    expect(f).toContain('not called yet');
  });
  it('shows a lock for a native call', () => {
    const s = emptyState('s');
    s.advisorCalls.push({ time: '2026-11-11T11:59:00.000Z', source: 'native', why: 'native advice', tokens: 26000 });
    const f = frame(s);
    expect(f).toContain('1 call');
    expect(f).toContain('🔒');
  });
  it('shows the reviewer text as latest advice', () => {
    const s = emptyState('s');
    s.advisorCalls.push({ time: '2026-11-11T11:59:00.000Z', source: 'reviewer', why: 'final review', result: 'fix', tokens: 10, text: 'fix: two changes' });
    const f = frame(s);
    expect(f).toContain('fix: two changes');
    expect(f).toContain('[fix]');
  });
});

describe('Stats: WHERE TOKENS WENT', () => {
  it('percentages sum to 100', () => {
    const p = percentages({ coding: 333, reading: 333, talking: 334, planning: 0, tests: 0 });
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBe(100);
    expect(percentages({ coding: 1, reading: 1, talking: 1, planning: 0, tests: 0 }).coding).toBe(34);
  });
  it('all zero when no tokens', () => {
    expect(Object.values(percentages({ coding: 0, reading: 0, talking: 0, planning: 0, tests: 0 })).every((v) => v === 0)).toBe(true);
  });
  it('lists the five categories', () => {
    const s = emptyState('s');
    s.categories.coding = 50; s.categories.reading = 50;
    const f = frame(s);
    for (const w of ['coding', 'reading', 'talking', 'planning', 'tests']) expect(f).toContain(w);
    expect(f).toContain('WHERE TOKENS WENT');
  });
});

describe('Stats: SKILLS', () => {
  it('marks recent skills active and old ones used earlier', () => {
    const s = emptyState('s');
    s.skills.push({ name: 'recent-skill', by: 'main', firstAt: '2026-11-11T11:59:00.000Z', lastAt: new Date(NOW - 30_000).toISOString() });
    s.skills.push({ name: 'old-skill', by: 'Explore', firstAt: '2026-11-11T11:00:00.000Z', lastAt: new Date(NOW - 600_000).toISOString() });
    const f = frame(s);
    expect(f).toMatch(/● recent-skill/);
    expect(f).toMatch(/○ old-skill/);
    expect(f).toContain('SKILLS');
  });
});
