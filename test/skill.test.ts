import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readMarkdown } from './helpers/frontmatter.js';

const skill = readMarkdown(join(new URL('..', import.meta.url).pathname, 'skills/workflow/SKILL.md'));

describe('workflow skill', () => {
  it('is at most 2048 bytes with a name and a description', () => {
    expect(skill.bytes).toBeLessThanOrEqual(2048);
    expect(skill.meta.name).toBe('workflow');
    expect(skill.meta.description.length).toBeGreaterThan(20);
  });
  it('separates small tasks (alone) from big ones (the team, in order)', () => {
    const b = skill.body;
    expect(b).toMatch(/small/i);
    expect(b).toMatch(/big/i);
    const big = b.slice(b.indexOf('**Big task**')).toLowerCase();
    const order = ['pitwall:scout', 'advisor', 'edit', 'pitwall:runner', 'pitwall:reviewer'].map((w) => big.indexOf(w));
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
  it('has the behaviour rules and the reconcile rule', () => {
    const b = skill.body.toLowerCase();
    for (const w of ['parallel', 'one reconcile call', 'no recaps', 'slices', 'never silently ignore']) expect(b, w).toContain(w);
  });
});
