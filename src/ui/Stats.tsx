import React from 'react';
import { Box, Text } from 'ink';
import { formatReset, type Limits } from '../limits.js';
import type { Category, SessionState } from '../model/state.js';
import { fmtClock, fmtTokens } from './format.js';
import { colors } from './theme.js';

const WIDTH = 40;
const ACTIVE_SKILL_MS = 2 * 60 * 1000;
const CATEGORIES: Category[] = ['coding', 'reading', 'talking', 'planning', 'tests'];

export function colorFor(pct: number): string {
  return pct >= 80 ? colors.warning : colors.done;
}

/** Whole-number percentages that always add up to 100 (largest remainder), or all 0 with no tokens. */
export function percentages(cats: Record<Category, number>): Record<Category, number> {
  const total = CATEGORIES.reduce((n, c) => n + cats[c], 0);
  const out = { coding: 0, reading: 0, talking: 0, planning: 0, tests: 0 } as Record<Category, number>;
  if (total === 0) return out;
  const exact = CATEGORIES.map((c) => ({ c, v: (cats[c] / total) * 100 }));
  for (const e of exact) out[e.c] = Math.floor(e.v);
  let left = 100 - CATEGORIES.reduce((n, c) => n + out[c], 0);
  for (const e of [...exact].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))) {
    if (left-- <= 0) break;
    out[e.c] += 1;
  }
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const bar = (pct: number) => {
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.dim} width={WIDTH} paddingX={1}>
      <Text bold color={colors.dim}>{title}</Text>
      {children}
    </Box>
  );
}

function LimitRow({ label, pct, note }: { label: string; pct: number; note?: string }) {
  return (
    <Box flexDirection="column">
      <Text>
        <Text>{label.padEnd(8)}</Text>
        <Text color={colorFor(pct)}>{bar(pct)}</Text>
        <Text> {Math.round(pct)}%</Text>
      </Text>
      {note ? <Text color={colors.dim}>{note}</Text> : null}
    </Box>
  );
}

export function Stats({ state, limits, now }: { state: SessionState; limits: Limits | null; now: number }) {
  const inner = WIDTH - 4;
  const pct = percentages(state.categories);
  const calls = state.advisorCalls;
  const last = calls[calls.length - 1];
  return (
    <Box flexDirection="column" width={WIDTH}>
      <Section title="LIMITS">
        {limits === null ? <Text color={colors.dim}>run /pitwall:setup to see limits</Text> : (
          <>
            {limits.contextPct !== undefined ? <LimitRow label="context" pct={limits.contextPct} /> : null}
            {limits.fiveHour ? <LimitRow label="session" pct={limits.fiveHour.pct}
              note={`5h window · resets in ${formatReset(limits.fiveHour.resetsAt, now)}`} /> : null}
            {limits.weekly ? <LimitRow label="weekly" pct={limits.weekly.pct}
              note={`resets in ${formatReset(limits.weekly.resetsAt, now)}`} /> : null}
          </>
        )}
      </Section>
      <Section title="ADVISOR · opus">
        {calls.length === 0 ? <Text color={colors.dim}>not called yet</Text> : (
          <>
            <Text color={colors.advisor}>{calls.length} call{calls.length === 1 ? '' : 's'} · {fmtTokens(calls.reduce((n, c) => n + c.tokens, 0))} tokens</Text>
            {calls.slice(-4).map((c, i) => (
              <Text key={i} wrap="truncate-end">
                {fmtClock(c.time)}  {c.why}{c.result ? `  [${c.result}]` : ''}  {fmtTokens(c.tokens)}
              </Text>
            ))}
            <Text color={colors.dim}>latest advice</Text>
            <Text color={colors.advisor}>
              {clip(last.source === 'reviewer' && last.text ? last.text : '🔒 native advice (encrypted)', inner)}
            </Text>
          </>
        )}
      </Section>
      <Section title="WHERE TOKENS WENT · this task">
        {CATEGORIES.map((c) => (
          <Text key={c}>
            <Text>{c.padEnd(9)}</Text>
            <Text color={colors.sub}>{bar(pct[c])}</Text>
            <Text> {pct[c]}%</Text>
          </Text>
        ))}
      </Section>
      <Section title="SKILLS · this session">
        {state.skills.length === 0 ? <Text color={colors.dim}>none yet</Text> : state.skills.map((k) => {
          const active = now - Date.parse(k.lastAt) < ACTIVE_SKILL_MS;
          return (
            <Text key={`${k.name}:${k.by}`} wrap="truncate-end" color={active ? undefined : colors.dim}>
              {active ? '●' : '○'} {k.name}  {k.by}
            </Text>
          );
        })}
      </Section>
    </Box>
  );
}
