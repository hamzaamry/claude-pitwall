import type { Flow } from '../model/state.js';
import type { GraphLayout } from './graphLayout.js';

export type ActiveFlow = Flow & { wireIndex: number; pos: number };

const MAX_DOTS = 6;
// A flow is queued when the agent spawns, but its card only appears once the subagent's
// transcript exists, so wait up to ~2.5 s (20 ticks) for the card before giving up.
const MAX_TRIES = 20;

/**
 * One animation tick: every dot moves one cell, finished dots leave, then queued flows
 * start (up to 6 on screen). Flows taken from `pending` are removed from it; the rest wait.
 */
export function stepFlows(active: ActiveFlow[], pending: Flow[], layout: GraphLayout): ActiveFlow[] {
  const next = active
    .map((f) => ({ ...f, pos: f.pos + 1 }))
    .filter((f) => f.pos < (layout.wires[f.wireIndex]?.cells.length ?? 0));
  const retry: Flow[] = [];
  let looked = pending.length;
  while (next.length < MAX_DOTS && looked-- > 0) {
    const flow = pending.shift()!;
    const wireIndex = layout.wires.findIndex(
      (w) => w.from === flow.from && (w.to === flow.to || w.toolUseId === flow.to),
    );
    if (wireIndex !== -1) next.push({ ...flow, wireIndex, pos: 0 });
    else if ((flow.tries ?? 0) + 1 < MAX_TRIES) retry.push({ ...flow, tries: (flow.tries ?? 0) + 1 });
  }
  pending.unshift(...retry);
  return next;
}
