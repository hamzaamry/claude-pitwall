import React from 'react';
import { Box, Text } from 'ink';
import { statusAt, type AgentInfo, type SessionState } from '../model/state.js';
import { effortText, fmtElapsed, fmtTokens } from './format.js';
import { colorForRole, colors } from './theme.js';

type Chip = { name: string; model: string; color: string; status: string; tokens: number; active: boolean };

const ADVISOR_RECENT_MS = 8_000;

/** One chip for main, one for the advisor, and one per role of helper agent. */
export function buildChips(state: SessionState, now: number): Chip[] {
  const main = state.agents.main;
  const mainStatus = main ? statusAt(main, now) : 'idle';
  const chips: Chip[] = [{
    name: 'main', color: colors.main, active: mainStatus === 'working', status: mainStatus,
    model: [main?.model, main?.effort].filter(Boolean).join(' · '),
    tokens: main?.tokens ?? 0,
  }];

  const calls = state.advisorCalls;
  const last = calls[calls.length - 1];
  chips.push({
    name: 'advisor', color: colors.advisor, model: state.advisorModel ?? 'opus',
    active: !!last && now - Date.parse(last.time) < ADVISOR_RECENT_MS,
    status: calls.length ? `${calls.length} call${calls.length === 1 ? '' : 's'}` : state.advisorModel ? 'no calls yet' : 'not configured',
    tokens: calls.reduce((n, c) => n + c.tokens, 0),
  });

  const byRole = new Map<string, AgentInfo[]>();
  for (const a of Object.values(state.agents)) {
    if (a.key === 'main') continue;
    byRole.set(a.role, [...(byRole.get(a.role) ?? []), a]);
  }
  for (const [role, list] of byRole) {
    const running = list.filter((a) => statusAt(a, now) === 'working').length;
    const status = running ? `${running} running`
      : list.some((a) => a.status === 'failed') ? 'failed'
      : list.every((a) => a.status === 'done') ? 'done' : 'idle';
    const models = [...new Set(list.map((a) => a.model).filter(Boolean))].join('/');
    const effort = list.find((a) => a.effort)?.effort;
    chips.push({
      name: role, color: colorForRole(role), active: running > 0, status,
      model: [models, effort].filter(Boolean).join(' · '),
      tokens: list.reduce((n, a) => n + a.tokens, 0),
    });
  }
  return chips;
}

const columnsFor = (width: number) => (width >= 100 ? 4 : 2);

/** Rows the header takes: the title line plus 3 rows (a bordered box) per row of chips. */
export function headerHeight(state: SessionState, width: number): number {
  const chips = 2 + new Set(Object.values(state.agents).filter((a) => a.key !== 'main').map((a) => a.role)).size;
  return 1 + 3 * Math.ceil(chips / columnsFor(width));
}

export function Header({ state, teamOn, now, width }: {
  state: SessionState; teamOn?: boolean; now: number; width: number;
}) {
  const agents = Object.values(state.agents);
  const total = agents.reduce((n, a) => n + a.tokens, 0);
  const advisorTokens = state.advisorCalls.reduce((n, c) => n + c.tokens, 0);
  const elapsed = state.startedAt ? fmtElapsed(now - Date.parse(state.startedAt)) : '0:00';
  const compact = width < 100;
  const columns = columnsFor(width);
  const chipW = Math.max(12, Math.floor(width / columns));
  return (
    <Box flexDirection="column" width={width}>
      <Text wrap="truncate-end">
        <Text bold color={colors.bright}>pitwall</Text><Text color={colors.border}> │ </Text>
        <Text color={colors.bright}>{state.currentTask || 'no task yet'}</Text>
        {teamOn === undefined ? null : <Text color={teamOn ? colors.done : colors.dim}>  [{teamOn ? 'team on' : 'team off'}]</Text>}
        <Text color={colors.muted}>   tokens </Text><Text color={colors.bright}>{fmtTokens(total)}</Text>
        {advisorTokens > 0 ? <Text color={colors.advisor}> + advisor {fmtTokens(advisorTokens)}</Text> : null}
        <Text color={colors.muted}>   elapsed </Text><Text color={colors.bright}>{elapsed}</Text>
      </Text>
      <Box flexWrap="wrap">
        {buildChips(state, now).map((c) => (
          <Box key={c.name} width={chipW} borderStyle="round" borderColor={c.active ? c.color : colors.frame} paddingX={1}>
            <Box width={chipW - 4}>
            <Text wrap="truncate-end">
              <Text color={c.color} dimColor={!c.active}>● </Text>
              <Text bold color={c.color}>{c.name}</Text>
              <Text color={colors.dim}> {c.model}</Text>
              {compact ? null : <Text color={c.active ? colors.bright : colors.dim}>  {c.status}</Text>}
              <Text color={colors.muted}> {fmtTokens(c.tokens)}</Text>
            </Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
