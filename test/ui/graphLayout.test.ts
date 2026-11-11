import { describe, it, expect } from 'vitest';
import { layoutGraph } from '../../src/ui/graphLayout.js';
import type { AgentInfo } from '../../src/model/state.js';

const agent = (key: string, status: AgentInfo['status'] = 'working', toolUseId?: string): AgentInfo =>
  ({ key, role: 'Explore', model: 'opus', title: key, tokens: 0, status, toolUseId });
const main = (): AgentInfo => ({ key: 'main', role: 'main', model: 'sonnet', title: '', tokens: 0, status: 'working' });
type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layoutGraph', () => {
  it('with 0 subagents has an advisor box and a main box only', () => {
    const l = layoutGraph([main()], 160, 30);
    expect(l.boxes.map((b) => b.key).sort()).toEqual(['advisor', 'main']);
    expect(l.wires.filter((w) => w.to !== 'advisor')).toEqual([]);
  });

  it('still has main and advisor boxes with no agents at all', () => {
    expect(layoutGraph([], 160, 30).boxes.map((b) => b.key).sort()).toEqual(['advisor', 'main']);
  });

  it('with 3 subagents puts 3 cards in a row below main, no overlaps, wires join main bottom to card top', () => {
    const l = layoutGraph([main(), agent('a1'), agent('a2'), agent('a3')], 160, 30);
    const m = l.boxes.find((b) => b.key === 'main')!;
    const cards = l.boxes.filter((b) => ['a1', 'a2', 'a3'].includes(b.key));
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => c.y)).size).toBe(1);
    for (const c of cards) expect(c.y).toBeGreaterThan(m.y + m.h);
    for (let i = 0; i < l.boxes.length; i++)
      for (let j = i + 1; j < l.boxes.length; j++) expect(overlap(l.boxes[i], l.boxes[j])).toBe(false);
    for (const c of cards) {
      const w = l.wires.find((x) => x.from === 'main' && x.to === c.key)!;
      expect(w).toBeDefined();
      const [fx, fy] = w.cells[0];
      const [lx, ly] = w.cells[w.cells.length - 1];
      expect(fy).toBe(m.y + m.h);
      expect(fx).toBeGreaterThanOrEqual(m.x);
      expect(fx).toBeLessThan(m.x + m.w);
      expect(ly).toBe(c.y - 1);
      expect(lx).toBeGreaterThanOrEqual(c.x);
      expect(lx).toBeLessThan(c.x + c.w);
    }
  });

  it('keeps cards inside the width and drops the oldest finished first on overflow', () => {
    const subs = [agent('a0', 'working'), ...Array.from({ length: 11 }, (_, i) => agent(`a${i + 1}`, 'done'))];
    const l = layoutGraph([main(), ...subs], 100, 30);
    const cards = l.boxes.filter((b) => b.key.startsWith('a'));
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards.length).toBeLessThan(12);
    for (const c of cards) expect(c.x + c.w).toBeLessThanOrEqual(100);
    const keys = cards.map((c) => c.key);
    expect(keys).toContain('a0');
    expect(keys).toContain('a11');
    expect(keys).not.toContain('a1');
  });

  it('keeps cards in spawn order', () => {
    const l = layoutGraph([main(), agent('a1'), agent('a2')], 160, 30);
    const [c1, c2] = ['a1', 'a2'].map((k) => l.boxes.find((b) => b.key === k)!);
    expect(c1.x).toBeLessThan(c2.x);
  });

  it('wire carries the spawning tool_use id so flows can find their card', () => {
    const l = layoutGraph([main(), agent('a1', 'working', 'toolu_9')], 160, 30);
    expect(l.wires.find((w) => w.to === 'a1')?.toolUseId).toBe('toolu_9');
  });

  it('adds a wire between main and the advisor panel', () => {
    const l = layoutGraph([main()], 160, 30);
    expect(l.wires.find((w) => w.from === 'main' && w.to === 'advisor')?.cells.length).toBeGreaterThan(0);
  });

  it('does not crash on a tiny terminal', () => {
    expect(() => layoutGraph([main(), agent('a1')], 10, 4)).not.toThrow();
    expect(() => layoutGraph([main(), agent('a1')], 0, 0)).not.toThrow();
  });
});
