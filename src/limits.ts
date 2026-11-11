import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Limits = { contextPct?: number;
  fiveHour?: { pct: number; resetsAt: number }; weekly?: { pct: number; resetsAt: number } };

function window(w: any): { pct: number; resetsAt: number } | undefined {
  if (w && typeof w.used_percentage === 'number') return { pct: w.used_percentage, resetsAt: w.resets_at };
  return undefined;
}

/** Reads the status line JSON saved by bin/statusline-tee.mjs. */
export function readLimits(sessionId: string, home: string = homedir()): Limits | null {
  let d: any;
  try {
    d = JSON.parse(readFileSync(join(home, '.claude', 'pitwall', 'statusline', `${sessionId}.json`), 'utf8'));
  } catch { return null; }
  const out: Limits = {};
  if (typeof d?.context_window?.used_percentage === 'number') out.contextPct = d.context_window.used_percentage;
  const five = window(d?.rate_limits?.five_hour);
  const week = window(d?.rate_limits?.seven_day);
  if (five) out.fiveHour = five;
  if (week) out.weekly = week;
  return out;
}

/** `resetsAt` is epoch seconds, `now` is epoch milliseconds (Date.now()). */
export function formatReset(resetsAt: number, now: number): string {
  const secs = Math.max(0, Math.floor(resetsAt - now / 1000));
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
