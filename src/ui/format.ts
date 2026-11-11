export function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${+(n / 1000).toFixed(1)}k`;
  return `${+(n / 1_000_000).toFixed(2)}M`;
}

export function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toTimeString().slice(0, 8);
}

const EFFORT_LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 3, max: 3 };
export const effortLevel = (effort?: string): number => (effort ? EFFORT_LEVEL[effort] ?? 0 : 0);

/** Three bars, filled up to the effort level: low ▮▯▯, medium ▮▮▯, high ▮▮▮. */
export function effortText(effort?: string): string {
  const n = effortLevel(effort);
  return n === 0 ? '' : '▮'.repeat(n) + '▯'.repeat(3 - n);
}
