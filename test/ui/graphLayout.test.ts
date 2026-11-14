import { describe, it, expect } from 'vitest';
import { FOLD_AFTER_MS, layoutGraph } from '../../src/ui/graphLayout.js';
import type { AgentInfo } from '../../src/model/state.js';

const agent = (key: string, status: AgentInfo['status'] = 'working', toolUseId?: string): AgentInfo =>
  ({ key, role: 'Explore', model: 'opus', title: key, tokens: 0, status, toolUseId });
const main = (): AgentInfo => ({ key: 'main', role: 'main', model: 'sonnet', title: '', tokens: 0, status: 'working' });
const NOW = Date.parse('2026-11-14T10:00:10Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const run = (key: string, over: Partial<AgentInfo> = {}): AgentInfo =>
  ({ key, role: 'runner', model: 'haiku', title: 'npm test', tokens: 0, status: 'working', ...over });
const subCards = (l: ReturnType<typeof layoutGraph>) => l.boxes.filter((b) => b.key !== 'main' && b.key !== 'advisor');
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

  it('keeps the advisor panel wide enough to read in a medium graph', () => {
    const l = layoutGraph([main()], 62, 30);
    expect(l.boxes.find((b) => b.key === 'advisor')!.w).toBeGreaterThanOrEqual(20);
  });

  it('two live agents of the same role get two cards', () => {
    const cards = subCards(layoutGraph([main(), run('r1'), run('r2')], 160, 30, NOW));
    expect(cards.map((c) => c.key)).toEqual(['r1', 'r2']);
    for (const c of cards) expect(c.runs).toBeUndefined();
  });

  it('a finished agent keeps its card for 5 s', () => {
    const cards = subCards(layoutGraph([main(), run('r1', { status: 'done', finishedAt: ago(FOLD_AFTER_MS - 3000) })], 160, 30, NOW));
    expect(cards).toHaveLength(1);
    expect(cards[0].runs).toBeUndefined();
  });

  it('finished agents of one role fold into one card after 5 s', () => {
    const old = { status: 'done' as const, finishedAt: ago(FOLD_AFTER_MS + 1000) };
    const l = layoutGraph([main(), run('r1', { ...old, tokens: 10 }), run('r2', { ...old, tokens: 20, toolUseId: 'toolu_2' }),
      run('r3', { ...old, tokens: 30 })], 160, 30, NOW);
    const cards = subCards(l);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ key: 'r3', runs: 3, tokens: 60 });
    expect(l.wires.find((w) => w.to === 'r3')?.aliases).toEqual(expect.arrayContaining(['r1', 'r2', 'toolu_2']));
  });

  it('live runner next to the folded runners', () => {
    const old = { status: 'done' as const, finishedAt: ago(FOLD_AFTER_MS + 1000) };
    const cards = subCards(layoutGraph([main(), run('r1', old), run('r2', old), run('r3')], 160, 30, NOW));
    expect(cards.map((c) => [c.key, c.runs])).toEqual([['r2', 2], ['r3', undefined]]);
  });

  it('a role from an earlier task disappears', () => {
    const old = { role: 'scout', status: 'done' as const, finishedAt: ago(60_000), taskNo: 1 };
    const agents = [main(), run('s1', old), run('s2', old)];
    expect(subCards(layoutGraph(agents, 160, 30, NOW, 2))).toEqual([]);
    expect(subCards(layoutGraph(agents, 160, 30, NOW))).toHaveLength(1);
  });

  it('done with no finishedAt folds at once', () => {
    const cards = subCards(layoutGraph([main(), run('r1', { status: 'done' })], 160, 30, NOW));
    expect(cards[0]).toMatchObject({ key: 'r1', runs: 1 });
  });

  it('does not crash on a tiny terminal', () => {
    expect(() => layoutGraph([main(), agent('a1')], 10, 4)).not.toThrow();
    expect(() => layoutGraph([main(), agent('a1')], 0, 0)).not.toThrow();
  });
});
