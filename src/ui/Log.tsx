import React from 'react';
import { Box, Text } from 'ink';
import type { LogEntry } from '../model/state.js';
import { fmtClock } from './format.js';
import { colorForRole, colors } from './theme.js';

/** Rows the log box takes for `rows` entries: the entries, a title row and the border. */
export const logHeight = (rows: number) => rows + 3;

export function Log({ entries, rows, width }: { entries: LogEntry[]; rows: number; width?: number }) {
  const shown = rows > 0 ? entries.slice(-rows) : [];
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.frame} paddingX={1} width={width}>
      <Box justifyContent="space-between">
        <Text color={colors.dim}>session log</Text>
        <Text color={colors.done}>● live</Text>
      </Box>
      {shown.length === 0 ? <Text color={colors.dim}>nothing yet</Text> : null}
      {shown.map((e, i) => (
        <Text key={i} wrap="truncate-end">
          <Text color={colors.dim}>{fmtClock(e.time)}  </Text>
          <Text color={colorForRole(e.who)}>{e.who.slice(0, 12).padEnd(12)}</Text>
          <Text>{e.text}</Text>
        </Text>
      ))}
    </Box>
  );
}
