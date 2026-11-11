import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLimits, formatReset } from '../src/limits.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'pitwall-lim-')); mkdirSync(join(home, '.claude', 'pitwall', 'statusline'), { recursive: true }); });
const save = (id: string, data: unknown) =>
  writeFileSync(join(home, '.claude', 'pitwall', 'statusline', `${id}.json`), JSON.stringify(data));

describe('readLimits', () => {
  it('maps fields', () => {
    save('s1', { context_window: { used_percentage: 42 },
      rate_limits: { five_hour: { used_percentage: 11, resets_at: 1000 }, seven_day: { used_percentage: 85, resets_at: 2000 } } });
    expect(readLimits('s1', home)).toEqual({ contextPct: 42, fiveHour: { pct: 11, resetsAt: 1000 }, weekly: { pct: 85, resetsAt: 2000 } });
  });

  it('without rate_limits gives only contextPct', () => {
    save('s1', { context_window: { used_percentage: 42 } });
    expect(readLimits('s1', home)).toEqual({ contextPct: 42 });
  });

  it('returns null when there is no snapshot', () => {
    expect(readLimits('nope', home)).toBeNull();
  });

  it('returns null on a corrupt snapshot', () => {
    writeFileSync(join(home, '.claude', 'pitwall', 'statusline', 'bad.json'), '{oops');
    expect(readLimits('bad', home)).toBeNull();
  });
});

describe('formatReset', () => {
  const now = 1_700_000_000_000;
  it('hours and minutes', () => expect(formatReset(now / 1000 + 11280, now)).toBe('3h 8m'));
  it('days and hours', () => expect(formatReset(now / 1000 + 262800, now)).toBe('3d 1h'));
  it('past time shows 0m', () => expect(formatReset(now / 1000 - 5, now)).toBe('0m'));
});
