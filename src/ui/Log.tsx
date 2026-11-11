import React from 'react';
import { Box, Text } from 'ink';
import type { LogEntry } from '../model/state.js';
import { fmtClock } from './format.js';
import { colorForRole, colors } from './theme.js';

export function Log({ entries, rows }: { entries: LogEntry[]; rows: number }) {
  const shown = rows > 0 ? entries.slice(-rows) : [];
  return (
    <Box flexDirection="column">
      {shown.map((e, i) => (
        <Text key={i} wrap="truncate-end">
          <Text color={colors.dim}>{fmtClock(e.time)}  </Text>
          <Text color={colorForRole(e.who)}>{e.who}</Text>
          <Text>  {e.text}</Text>
        </Text>
      ))}
    </Box>
  );
}
