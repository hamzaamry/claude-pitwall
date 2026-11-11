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
  it('lists the steps in order: scouts, plan check, code, runner, final review', () => {
    const big = skill.body.toLowerCase();
    const order = ['pitwall:scout', 'plan-check:', 'edit and write', 'pitwall:runner', 'on the diff'].map((w) => big.indexOf(w));
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
  it('does not assume an advisor exists', () => {
    expect(skill.body.toLowerCase()).toContain('if you have no advisor');
  });
  it('has the behaviour rules and the reconcile rule', () => {
    const b = skill.body.toLowerCase();
    for (const w of ['parallel', 'one reconcile call', 'no recaps', 'slices', 'never silently ignore']) expect(b, w).toContain(w);
  });
});
