import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { statusAt, type AgentInfo, type SessionState } from '../model/state.js';
import { fmtTokens } from './format.js';
import { stepFlows, type ActiveFlow } from './flowAnim.js';
import { layoutGraph, type GraphLayout } from './graphLayout.js';
import { colorForRole, colors } from './theme.js';

type Grid = { ch: string[][]; col: string[][] };

function newGrid(w: number, h: number): Grid {
  return {
    ch: Array.from({ length: h }, () => Array<string>(w).fill(' ')),
    col: Array.from({ length: h }, () => Array<string>(w).fill('')),
  };
}

function put(g: Grid, x: number, y: number, text: string, color = '', onlyBlank = false): void {
  if (y < 0 || y >= g.ch.length) return;
  [...text].forEach((c, i) => {
    const px = x + i;
    if (px < 0 || px >= g.ch[y].length) return;
    if (onlyBlank && g.ch[y][px] !== ' ') return;
    g.ch[y][px] = c;
    g.col[y][px] = color;
  });
}

function box(g: Grid, b: { x: number; y: number; w: number; h: number }, color: string): void {
  if (b.w < 2 || b.h < 2) return;
  put(g, b.x, b.y, '┌' + '─'.repeat(b.w - 2) + '┐', color);
  put(g, b.x, b.y + b.h - 1, '└' + '─'.repeat(b.w - 2) + '┘', color);
  for (let y = b.y + 1; y < b.y + b.h - 1; y++) {
    put(g, b.x, y, '│' + ' '.repeat(b.w - 2) + '│', color);
  }
}

const clip = (s: string, n: number) => (n <= 0 ? '' : s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s);

/** Progress is unknown, so the bar is honest: a moving sweep while working, full when finished. */
function bar(status: AgentInfo['status'], n: number, frame: number): { text: string; color: string } {
  if (n <= 0) return { text: '', color: '' };
  if (status === 'done') return { text: '█'.repeat(n), color: colors.done };
  if (status === 'failed') return { text: '█'.repeat(n), color: colors.failed };
  if (status === 'idle') return { text: '░'.repeat(n), color: colors.dim };
  const cells = Array<string>(n).fill('░');
  const head = frame % n;
  for (let i = 0; i < Math.min(4, n); i++) cells[(head + i) % n] = '█';
  return { text: cells.join(''), color: colors.warning };
}

const STATUS: Record<AgentInfo['status'], { mark: string; color: string }> = {
  working: { mark: '● working', color: colors.warning },
  idle: { mark: '○ idle', color: colors.dim },
  done: { mark: '✓ done', color: colors.done },
  failed: { mark: '✗ failed', color: colors.failed },
};

const GLYPH: Record<number, string> = {
  // bits: 1=up 2=down 4=left 8=right
  1: '│', 2: '│', 3: '│', 4: '─', 8: '─', 12: '─',
  5: '┘', 9: '└', 6: '┐', 10: '┌', 7: '┤', 11: '├', 13: '┴', 14: '┬', 15: '┼',
};

function drawWires(g: Grid, layout: GraphLayout, active: ActiveFlow[]): void {
  const bits = new Map<string, number>();
  const wireColor = new Map<string, string>();
  const add = (x: number, y: number, b: number) => bits.set(`${x},${y}`, (bits.get(`${x},${y}`) ?? 0) | b);
  layout.wires.forEach((w, wi) => {
    const c = w.cells;
    c.forEach(([x, y], i) => {
      const prev = c[i - 1];
      const nxt = c[i + 1];
      for (const n of [prev, nxt]) {
        if (!n) continue;
        if (n[0] === x - 1) add(x, y, 4); else if (n[0] === x + 1) add(x, y, 8);
        else if (n[1] === y - 1) add(x, y, 1); else if (n[1] === y + 1) add(x, y, 2);
      }
      if (!prev) add(x, y, w.to === 'advisor' ? 4 : 1);
      if (!nxt) add(x, y, w.to === 'advisor' ? 8 : 2);
    });
    for (const f of active) {
      if (f.wireIndex === wi) c.forEach(([x, y]) => wireColor.set(`${x},${y}`, f.color));
    }
  });
  for (const [k, b] of bits) {
    const [x, y] = k.split(',').map(Number);
    put(g, x, y, GLYPH[b] ?? '┼', wireColor.get(k) ?? colors.dim);
  }
}

function drawDots(g: Grid, layout: GraphLayout, active: ActiveFlow[]): void {
  for (const f of active) {
    const cell = layout.wires[f.wireIndex]?.cells[f.pos];
    if (!cell) continue;
    put(g, cell[0], cell[1], '●', f.color);
    const label = clip(f.label, 24);
    const right = cell[0] + 2 + label.length < g.ch[0].length;
    put(g, right ? cell[0] + 2 : cell[0] - 1 - label.length, cell[1], label, f.color, true);
  }
}

function drawAdvisor(g: Grid, b: { x: number; y: number; w: number; h: number }, state: SessionState): void {
  const configured = state.advisorCalls.length > 0;
  const color = configured ? colors.advisor : colors.dim;
  box(g, b, color);
  const inner = b.w - 4;
  const row = (n: number, text: string, c = color) => put(g, b.x + 2, b.y + n, clip(text, inner), c);
  row(1, 'advisor · opus', color);
  row(2, configured ? `${state.advisorCalls.length} call${state.advisorCalls.length === 1 ? '' : 's'}` : 'not configured', colors.dim);
  if (configured) row(3, `${fmtTokens(state.advisorCalls.reduce((n, c) => n + c.tokens, 0))} tokens`, colors.dim);
  ['plan check', 'stuck', 'final review', '/ask-opus'].forEach((t, i) => row(4 + i, `○ ${t}`));
  row(Math.max(10, b.h - 3), 'on call', colors.dim);
  row(Math.max(11, b.h - 2), 'never edits code', colors.dim);
}

function drawMain(g: Grid, b: { x: number; y: number; w: number; h: number }, state: SessionState, frame: number): void {
  const a0 = state.agents.main;
  const a = a0 && { ...a0, status: statusAt(a0, Date.now()) };
  box(g, b, colors.main);
  const inner = b.w - 4;
  const label = ['main', a?.model, a?.effort].filter(Boolean).join(' · ');
  put(g, b.x + 2, b.y + 1, clip(label, inner), colors.main);
  put(g, b.x + 2, b.y + 2, clip(state.currentTask, inner), colors.dim);
  const br = bar(a?.status ?? 'idle', inner, frame);
  put(g, b.x + 2, b.y + 3, br.text, br.color);
}

function drawCard(g: Grid, b: { x: number; y: number; w: number; h: number }, a0: AgentInfo, frame: number): void {
  const a = { ...a0, status: statusAt(a0, Date.now()) };
  const color = a.status === 'failed' ? colors.failed : a.status === 'done' ? colors.dim : colorForRole(a.role);
  box(g, b, color);
  const inner = b.w - 4;
  put(g, b.x + 2, b.y + 1, clip(a.title || a.role, inner), colorForRole(a.role));
  put(g, b.x + 2, b.y + 2, clip([a.role, a.model, a.effort].filter(Boolean).join(' · '), inner), colors.dim);
  put(g, b.x + 2, b.y + 3, clip(STATUS[a.status].mark, inner), STATUS[a.status].color);
  const br = bar(a.status, inner, frame);
  put(g, b.x + 2, b.y + b.h - 2, br.text, br.color);
}

export function Graph({ state, width, height, tickMs = 120 }: {
  state: SessionState; width: number; height: number; tickMs?: number;
}) {
  const agents = Object.values(state.agents);
  const layout = useMemo(
    () => layoutGraph(agents, width, height),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agents.map((a) => `${a.key}:${a.status}:${a.toolUseId ?? ''}`).join('|'), width, height],
  );
  const [frame, setFrame] = useState(0);
  const active = useRef<ActiveFlow[]>([]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (tickMs <= 0) return;
    const id = setInterval(() => {
      active.current = stepFlows(active.current, stateRef.current.pendingFlows, layoutRef.current);
      setFrame((f) => f + 1);
    }, tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  const g = newGrid(Math.max(0, width), Math.max(0, height));
  drawWires(g, layout, active.current);
  for (const b of layout.boxes) {
    if (b.key === 'advisor') drawAdvisor(g, b, state);
    else if (b.key === 'main') drawMain(g, b, state, frame);
    else if (state.agents[b.key]) drawCard(g, b, state.agents[b.key], frame);
  }
  drawDots(g, layout, active.current);

  return (
    <Box flexDirection="column" width={width} height={height}>
      {g.ch.map((row, y) => {
        const runs: { text: string; color: string }[] = [];
        row.forEach((c, x) => {
          const color = g.col[y][x];
          const last = runs[runs.length - 1];
          if (last && last.color === color) last.text += c; else runs.push({ text: c, color });
        });
        return (
          <Text key={y}>
            {runs.map((r, i) => (r.color ? <Text key={i} color={r.color}>{r.text}</Text> : <Text key={i}>{r.text}</Text>))}
          </Text>
        );
      })}
    </Box>
  );
}

