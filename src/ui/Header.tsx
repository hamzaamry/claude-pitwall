import React from 'react';
import { Box, Text } from 'ink';
import { statusAt, type AgentInfo, type SessionState } from '../model/state.js';
import { fmtElapsed, fmtTokens } from './format.js';
import { colorForRole, colors } from './theme.js';

const STATUS_COLOR: Record<AgentInfo['status'], string> = {
  working: colors.warning, idle: colors.dim, done: colors.done, failed: colors.failed,
};

export function Header({ state, teamOn, now, width }: {
  state: SessionState; teamOn: boolean; now: number; width: number;
}) {
  const agents = Object.values(state.agents);
  const total = agents.reduce((n, a) => n + a.tokens, 0);
  const advisorTokens = state.advisorCalls.reduce((n, c) => n + c.tokens, 0);
  const elapsed = state.startedAt ? fmtElapsed(now - Date.parse(state.startedAt)) : '0:00';
  const compact = width < 100;
  return (
    <Box flexDirection="column" width={width}>
      <Text wrap="truncate-end">
        <Text bold>pitwall</Text><Text color={colors.dim}> │ </Text>
        <Text>{state.currentTask || 'no task yet'}</Text>
        <Text color={colors.dim}> ({teamOn ? 'team on' : 'team off'})  </Text>
        <Text>tokens {fmtTokens(total)}</Text>
        {advisorTokens > 0 ? <Text color={colors.advisor}> + advisor {fmtTokens(advisorTokens)}</Text> : null}
        <Text color={colors.dim}>  </Text>
        <Text>elapsed {elapsed}</Text>
      </Text>
      <Box flexWrap="wrap" columnGap={2}>
        {agents.map((a0) => {
          const a = { ...a0, status: statusAt(a0, now) };
          return (
          <Text key={a.key} wrap="truncate-end">
            <Text color={a.status === 'working' ? colorForRole(a.role) : colors.dim}>● </Text>
            <Text color={colorForRole(a.role)}>{a.role}</Text>
            <Text color={colors.dim}> {[a.model, a.effort].filter(Boolean).join(' · ')}</Text>
            {compact ? null : <Text color={STATUS_COLOR[a.status]}> {a.status}</Text>}
            <Text> {fmtTokens(a.tokens)}</Text>
          </Text>
          );
        })}
      </Box>
    </Box>
  );
}
