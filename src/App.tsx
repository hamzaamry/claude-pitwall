import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { readLimits } from './limits.js';
import { Graph } from './ui/Graph.js';
import { Header } from './ui/Header.js';
import { Log } from './ui/Log.js';
import { Stats } from './ui/Stats.js';
import { colors } from './ui/theme.js';
import { SessionWatcher } from './watcher.js';

const STATS_MIN_WIDTH = 160;
const STATS_WIDTH = 40;
const LOG_ROWS = 6;

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

  const showStats = size.width >= STATS_MIN_WIDTH;
  const graphWidth = showStats ? size.width - STATS_WIDTH - 1 : size.width;
  const graphHeight = Math.max(14, size.height - LOG_ROWS - 5);
  const limits = readLimits(state.sessionId, home);

  return (
    <Box flexDirection="column" width={size.width}>
      <Header state={state} teamOn={false} now={now} width={size.width} />
      <Box>
        <Graph state={state} width={graphWidth} height={graphHeight} tickMs={tickMs} />
        {showStats ? <Box marginLeft={1}><Stats state={state} limits={limits} now={now} /></Box> : null}
      </Box>
      <Log entries={state.log} rows={LOG_ROWS} />
    </Box>
  );
}
