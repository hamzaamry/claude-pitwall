import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { readLimits } from './limits.js';
import { Graph } from './ui/Graph.js';
import { Header, headerHeight } from './ui/Header.js';
import { Log, logHeight } from './ui/Log.js';
import { STATS_WIDTH, Stats } from './ui/Stats.js';
import { colors } from './ui/theme.js';
import { SessionWatcher } from './watcher.js';

// Sidebar width by terminal width: full from 160 columns, narrower from 100, hidden below that.
const sidebarWidth = (w: number) => (w >= 160 ? STATS_WIDTH : w >= 100 ? 34 : 0);
const LOG_ROWS = 7;

function useTermSize(width?: number, height?: number): { width: number; height: number } {
  const { stdout } = useStdout();
  const read = () => ({ width: width ?? stdout?.columns ?? 120, height: height ?? stdout?.rows ?? 45 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    if (width !== undefined || !stdout) return;
    const onResize = () => setSize(read());
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout, width]);
  return width !== undefined ? read() : size;
}

export function App({ cwd, home, sessionId, width, height, pollMs = 500, tickMs = 120 }: {
  cwd: string; home?: string; sessionId?: string; width?: number; height?: number; pollMs?: number; tickMs?: number;
}) {
  const watcher = useMemo(() => new SessionWatcher({ cwd, home, sessionId }), [cwd, home, sessionId]);
  const { exit } = useApp();
  const size = useTermSize(width, height);
  const [, setTick] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [state, setState] = useState(() => safePoll(watcher));

  function safePoll(w: SessionWatcher) {
    try { return w.poll(); } catch { return null; }
  }

  useEffect(() => {
    if (pollMs <= 0) return;
    const id = setInterval(() => { setState(safePoll(watcher)); setNow(Date.now()); setTick((t) => t + 1); }, pollMs);
    return () => clearInterval(id);
  }, [watcher, pollMs]);

  useInput((input) => { if (input === 'q') exit(); }, { isActive: Boolean(process.stdin.isTTY) });

  if (!state) {
    return <Text color={colors.dim}>waiting for a Claude Code session in {watcher.dir}</Text>;
  }

  const side = sidebarWidth(size.width);
  const showStats = side > 0;
  const graphWidth = showStats ? size.width - side - 1 : size.width;
  const graphHeight = Math.max(16, size.height - headerHeight(state, size.width) - logHeight(LOG_ROWS) - 1);
  const limits = readLimits(state.sessionId, home);

  return (
    <Box flexDirection="column" width={size.width}>
      <Header state={state} teamOn={state.teamOn} now={now} width={size.width} />
      <Box>
        <Box flexDirection="column">
          <Graph state={state} width={graphWidth} height={graphHeight} tickMs={tickMs} />
          <Log entries={state.log} rows={LOG_ROWS} width={graphWidth} />
        </Box>
        {showStats ? <Box marginLeft={1}><Stats state={state} limits={limits} now={now} width={side} /></Box> : null}
      </Box>
      <Text backgroundColor={colors.pill} wrap="truncate-end">
        <Text color={colors.bright}> $ pitwall watch</Text>
        <Text color={colors.muted}>   q quit   watching {cwd.replace(process.env.HOME ?? '\0', '~')}</Text>
      </Text>
    </Box>
  );
}
