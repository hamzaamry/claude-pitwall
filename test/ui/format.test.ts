import { describe, it, expect } from 'vitest';
import { effortLevel, effortText } from '../../src/ui/format.js';

describe('effort bars', () => {
  it('maps effort names to 1-3 bars', () => {
    expect(effortLevel('low')).toBe(1);
    expect(effortLevel('medium')).toBe(2);
    expect(effortLevel('high')).toBe(3);
    expect(effortLevel('xhigh')).toBe(3);
    expect(effortLevel('max')).toBe(3);
    expect(effortLevel(undefined)).toBe(0);
    expect(effortLevel('something-new')).toBe(0);
  });
  it('draws filled and empty bars', () => {
    expect(effortText('low')).toBe('▮▯▯');
    expect(effortText('medium')).toBe('▮▮▯');
    expect(effortText('high')).toBe('▮▮▮');
    expect(effortText(undefined)).toBe('');
  });
});
