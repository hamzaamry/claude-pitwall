import { describe, it, expect } from 'vitest';
import { stepFlows, type ActiveFlow } from '../../src/ui/flowAnim.js';
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

  it('drops a flow whose card is not on screen', () => {
    const pending = [flow('toolu_gone')];
    expect(stepFlows([], pending, layout)).toEqual([]);
    expect(pending).toHaveLength(0);
  });
});
