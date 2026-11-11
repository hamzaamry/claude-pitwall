import { describe, it, expect } from 'vitest';
import { dotCell, stepFlows, type ActiveFlow } from '../../src/ui/flowAnim.js';
import type { GraphLayout } from '../../src/ui/graphLayout.js';
import type { Flow } from '../../src/model/state.js';

const layout: GraphLayout = {
  boxes: [],
  wires: [
    { from: 'main', to: 'a1', toolUseId: 'toolu_1', cells: [[0, 0], [0, 1], [0, 2]] },
    { from: 'main', to: 'advisor', cells: [[5, 0], [6, 0]] },
  ],
};
const flow = (to: string, label = 'x'): Flow => ({ from: 'main', to, label, color: '#fff' });

describe('stepFlows', () => {
  it('admits a pending flow at the start of its wire, matching by tool_use id', () => {
    const pending = [flow('toolu_1')];
    const a = stepFlows([], pending, layout);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ wireIndex: 0, pos: 0, label: 'x' });
    expect(pending).toHaveLength(0);
  });

  it('advances one cell per tick and removes finished flows', () => {
    let a: ActiveFlow[] = stepFlows([], [flow('a1')], layout);
    a = stepFlows(a, [], layout);
    expect(a[0].pos).toBe(1);
    a = stepFlows(a, [], layout);
    expect(a[0].pos).toBe(2);
    a = stepFlows(a, [], layout);
    expect(a).toEqual([]);
  });

  it('caps visible dots at 6 and leaves the rest queued', () => {
    const pending = Array.from({ length: 10 }, () => flow('a1'));
    const a = stepFlows([], pending, layout);
    expect(a).toHaveLength(6);
    expect(pending).toHaveLength(4);
  });
});

describe('stepFlows: a card that has not appeared yet', () => {
  it('keeps the flow queued for a while, then gives up', () => {
    const pending = [flow('toolu_late')];
    stepFlows([], pending, layout);
    expect(pending).toHaveLength(1);
    for (let i = 0; i < 30; i++) stepFlows([], pending, layout);
    expect(pending).toHaveLength(0);
  });

  it('starts the flow as soon as its card exists', () => {
    const pending = [flow('toolu_late')];
    stepFlows([], pending, layout);
    const later: GraphLayout = { ...layout, wires: [...layout.wires, { from: 'main', to: 'a9', toolUseId: 'toolu_late', cells: [[1, 1], [1, 2]] }] };
    const a = stepFlows([], pending, later);
    expect(a).toHaveLength(1);
    expect(a[0].wireIndex).toBe(2);
    expect(pending).toHaveLength(0);
  });
});

describe('return flows (back: true)', () => {
  const back = (from: string): Flow => ({ from, to: 'main', label: 'done', color: '#fff', back: true });

  it('matches the wire by the card key or by the tool_use id', () => {
    expect(stepFlows([], [back('a1')], layout)[0].wireIndex).toBe(0);
    expect(stepFlows([], [back('toolu_1')], layout)[0].wireIndex).toBe(0);
  });
  it('starts at the card end of the wire and walks to main, one cell per tick, then leaves', () => {
    let a: ActiveFlow[] = stepFlows([], [back('a1')], layout);
    expect(dotCell(a[0], layout)).toEqual([0, 2]);
    a = stepFlows(a, [], layout);
    expect(dotCell(a[0], layout)).toEqual([0, 1]);
    a = stepFlows(a, [], layout);
    expect(dotCell(a[0], layout)).toEqual([0, 0]);
    expect(stepFlows(a, [], layout)).toEqual([]);
  });
  it('a forward flow still starts at the main end', () => {
    const a = stepFlows([], [flow('a1')], layout);
    expect(dotCell(a[0], layout)).toEqual([0, 0]);
  });
  it('a return flow of a card that is not on screen waits, then is dropped', () => {
    const pending = [back('ghost')];
    stepFlows([], pending, layout);
    expect(pending).toHaveLength(1);
    for (let i = 0; i < 30; i++) stepFlows([], pending, layout);
    expect(pending).toHaveLength(0);
  });
});
