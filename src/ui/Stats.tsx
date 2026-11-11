import React from 'react';
import { Box, Text } from 'ink';
import { formatReset, type Limits } from '../limits.js';
import { advisorCallTokens, type Category, type SessionState } from '../model/state.js';
import { fmtClock, fmtTokens } from './format.js';
import { colorForRole, colors } from './theme.js';

export const STATS_WIDTH = 40;
const ACTIVE_SKILL_MS = 2 * 60 * 1000;
const CATEGORIES: Category[] = ['coding', 'reading', 'talking', 'planning', 'tests'];
const LABEL: Record<Category, string> = { coding: 'coding', reading: 'reading files', talking: 'talking', planning: 'planning', tests: 'test output' };

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

const TARGET_CALLS = 2; // advisor and reviewer calls per task worth aiming for; shown, never enforced

/** Word-wrap to `width` columns, at most `maxLines` lines (the last one ends with … when cut). */
function wrap(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    if (cur && (cur + ' ' + word).length > width) { lines.push(cur); cur = word.slice(0, width); }
    else cur = cur ? cur + ' ' + word : word.slice(0, width);
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const cut = lines.slice(0, maxLines);
  cut[maxLines - 1] = clip(cut[maxLines - 1] + '…', width);
  return cut;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const bar = (pct: number) => {
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
};

function Section({ title, right, titleColor = colors.dim, width, children }: {
  title: string; right?: string; titleColor?: string; width: number; children: React.ReactNode;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.frame} width={width} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={titleColor}>{title}</Text>
        {right ? <Text color={colors.dim}>{right}</Text> : null}
      </Box>
      {children}
    </Box>
  );
}

function LimitRow({ label, pct, note, color }: { label: string; pct: number; note?: string; color?: string }) {
  return (
    <Box flexDirection="column">
      <Text>
        <Text>{label.padEnd(8)}</Text>
        <Text color={color ?? colorFor(pct)}>{bar(pct)}</Text>
        <Text color={pct >= 80 ? colors.warning : colors.bright}> {Math.round(pct)}%</Text>
      </Text>
      {note ? <Text color={colors.dim}>{note}</Text> : null}
    </Box>
  );
}

export function Stats({ state, limits, now, width = STATS_WIDTH }: { state: SessionState; limits: Limits | null; now: number; width?: number }) {
  const inner = width - 4;
  const pct = percentages(state.categories);
  const calls = state.advisorCalls;
  const last = calls[calls.length - 1];
  const thisTask = calls.filter((c) => c.taskNo === state.taskNo).length;
  return (
    <Box flexDirection="column" width={width}>
      <Section width={width} title="LIMITS">
        {limits === null ? <Text color={colors.dim}>run /pitwall:setup to see limits</Text> : (
          <>
            {limits.contextPct !== undefined ? <LimitRow label="context" pct={limits.contextPct} color={limits.contextPct >= 80 ? colors.warning : colors.main} /> : null}
            {limits.fiveHour ? <LimitRow label="session" pct={limits.fiveHour.pct}
              note={`5h window · resets in ${formatReset(limits.fiveHour.resetsAt, now)}`} /> : null}
            {limits.weekly ? <LimitRow label="weekly" pct={limits.weekly.pct}
              note={`resets in ${formatReset(limits.weekly.resetsAt, now)}`} /> : null}
          </>
        )}
      </Section>
      <Section width={width} title="ADVISOR" titleColor={colors.advisor} right={`${state.advisorModel ?? 'opus'} · ${calls.length} call${calls.length === 1 ? '' : 's'}`}>
        {state.advisorModel || calls.length > 0 ? (
          <Text color={thisTask > TARGET_CALLS ? colors.warning : colors.dim}>this task {thisTask} · target ~{TARGET_CALLS}</Text>
        ) : null}
        {calls.length === 0 ? <Text color={colors.dim}>not called yet</Text> : (
          <>
            <Text color={colors.dim}>{fmtTokens(calls.reduce((n, c) => n + advisorCallTokens(state, c), 0))} tokens</Text>
            {calls.slice(-4).map((c, i) => (
              <Text key={i} wrap="truncate-end">
                <Text color={colors.dim}>{fmtClock(c.time)}  </Text>{c.why}
                {c.result ? <Text color={colors.advisor}>  [{c.result}]</Text> : null}
                <Text color={colors.dim}>  {fmtTokens(advisorCallTokens(state, c))}</Text>
              </Text>
            ))}
            <Text color={colors.dim}>latest advice</Text>
            {wrap(last.source === 'reviewer' && last.text ? last.text : '🔒 native advice (encrypted)', inner, 5).map((l, i) => (
              <Text key={i} color={colors.bright}>{l}</Text>
            ))}
          </>
        )}
      </Section>
      <Section width={width} title="WHERE TOKENS WENT · this task">
        {CATEGORIES.map((c) => (
          <Text key={c}>
            <Text>{(width < 38 ? LABEL[c].slice(0, 8).padEnd(9) : LABEL[c].padEnd(14))}</Text>
            <Text color={c === 'coding' ? colors.done : colors.muted}>{bar(pct[c])}</Text>
            <Text> {pct[c]}%</Text>
          </Text>
        ))}
      </Section>
      <Section width={width} title="SKILLS · this session" right="used by">
        {state.skills.length === 0 ? <Text color={colors.dim}>none yet</Text> : state.skills.map((k) => {
          const active = now - Date.parse(k.lastAt) < ACTIVE_SKILL_MS;
          return (
            <Box key={`${k.name}:${k.by}`} justifyContent="space-between">
              <Text wrap="truncate-end" color={active ? colors.bright : colors.dim}>{active ? '●' : '○'} {clip(k.name, inner - k.by.length - 3)}</Text>
              <Text color={active ? colorForRole(k.by) : colors.dim}>{k.by}</Text>
            </Box>
          );
        })}
      </Section>
    </Box>
  );
}
