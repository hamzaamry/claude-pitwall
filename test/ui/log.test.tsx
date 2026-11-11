import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Log } from '../../src/ui/Log.js';

const entries = ['one', 'two', 'three', 'four'].map((t, i) => ({
  time: `2026-11-11T10:00:0${i}.000Z`, who: i % 2 ? 'Explore' : 'main', text: t,
}));

describe('Log', () => {
  it('shows the last 3 entries in order', () => {
    const f = render(<Log entries={entries} rows={3} />).lastFrame()!;
    expect(f).not.toContain('one');
    expect(f.indexOf('two')).toBeGreaterThan(-1);
    expect(f.indexOf('two')).toBeLessThan(f.indexOf('three'));
    expect(f.indexOf('three')).toBeLessThan(f.indexOf('four'));
  });
  it('shows who did it', () => {
    expect(render(<Log entries={entries} rows={4} />).lastFrame()!).toContain('Explore');
  });
  it('has a titled box with a live marker', () => {
    const f = render(<Log entries={entries} rows={3} />).lastFrame()!;
    expect(f).toContain('session log');
    expect(f).toContain('● live');
  });
  it('says so when there is nothing yet', () => {
    expect(render(<Log entries={[]} rows={3} />).lastFrame()!).toContain('nothing yet');
  });
  it('is fine with no entries', () => {
    expect(() => render(<Log entries={[]} rows={3} />).lastFrame()).not.toThrow();
  });
});
