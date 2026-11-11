import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
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
function useTermSize(width, height) {
    const { stdout } = useStdout();
    const read = () => ({ width: width ?? stdout?.columns ?? 120, height: height ?? stdout?.rows ?? 45 });
    const [size, setSize] = useState(read);
    useEffect(() => {
        if (width !== undefined || !stdout)
            return;
        const onResize = () => setSize(read());
        stdout.on('resize', onResize);
        return () => { stdout.off('resize', onResize); };
    }, [stdout, width]);
    return width !== undefined ? read() : size;
}
export function App({ cwd, home, sessionId, width, height, pollMs = 500, tickMs = 120 }) {
    const watcher = useMemo(() => new SessionWatcher({ cwd, home, sessionId }), [cwd, home, sessionId]);
    const { exit } = useApp();
    const size = useTermSize(width, height);
    const [, setTick] = useState(0);
    const [now, setNow] = useState(Date.now());
    const [state, setState] = useState(() => safePoll(watcher));
    function safePoll(w) {
        try {
            return w.poll();
        }
        catch {
            return null;
        }
    }
    useEffect(() => {
        if (pollMs <= 0)
            return;
        const id = setInterval(() => { setState(safePoll(watcher)); setNow(Date.now()); setTick((t) => t + 1); }, pollMs);
        return () => clearInterval(id);
    }, [watcher, pollMs]);
    useInput((input) => { if (input === 'q')
        exit(); }, { isActive: Boolean(process.stdin.isTTY) });
    if (!state) {
        return _jsxs(Text, { color: colors.dim, children: ["waiting for a Claude Code session in ", watcher.dir] });
    }
    const showStats = size.width >= STATS_MIN_WIDTH;
    const graphWidth = showStats ? size.width - STATS_WIDTH - 1 : size.width;
    const graphHeight = Math.max(14, size.height - LOG_ROWS - 5);
    const limits = readLimits(state.sessionId, home);
    return (_jsxs(Box, { flexDirection: "column", width: size.width, children: [_jsx(Header, { state: state, teamOn: false, now: now, width: size.width }), _jsxs(Box, { children: [_jsx(Graph, { state: state, width: graphWidth, height: graphHeight, tickMs: tickMs }), showStats ? _jsx(Box, { marginLeft: 1, children: _jsx(Stats, { state: state, limits: limits, now: now }) }) : null] }), _jsx(Log, { entries: state.log, rows: LOG_ROWS })] }));
}
