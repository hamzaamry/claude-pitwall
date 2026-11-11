import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { isReviewer } from '../role.js';
import { advisorCallTokens, statusAt, type AgentInfo, type SessionState } from '../model/state.js';
import { oneLine } from '../oneLine.js';
import { dotCell, stepFlows, type ActiveFlow } from './flowAnim.js';
import { effortText, fmtTokens } from './format.js';
import { layoutGraph, type GraphLayout } from './graphLayout.js';
import { colorForRole, colors } from './theme.js';

type Rect = { x: number; y: number; w: number; h: number };
type Grid = { ch: string[][]; col: string[][]; bg: string[][] };

function newGrid(w: number, h: number): Grid {
  const make = (v: string) => Array.from({ length: h }, () => Array<string>(w).fill(v));
  return { ch: make(' '), col: make(''), bg: make('') };
}

function put(g: Grid, x: number, y: number, text: string, color = '', onlyBlank = false, bg = ''): void {
  if (y < 0 || y >= g.ch.length) return;
  // a newline or tab in a cell would tear the whole frame, so nothing but one-line text goes in
  [...text.replace(/[\r\n\t]/g, ' ')].forEach((c, i) => {
    const px = x + i;
    if (px < 0 || px >= g.ch[y].length) return;
    if (onlyBlank && g.ch[y][px] !== ' ') return;
    g.ch[y][px] = c;
    g.col[y][px] = color;
    g.bg[y][px] = bg;
  });
}

function box(g: Grid, b: Rect, color: string): void {
  if (b.w < 2 || b.h < 2) return;
  put(g, b.x, b.y, '╭' + '─'.repeat(b.w - 2) + '╮', color);
  put(g, b.x, b.y + b.h - 1, '╰' + '─'.repeat(b.w - 2) + '╯', color);
  for (let y = b.y + 1; y < b.y + b.h - 1; y++) put(g, b.x, y, '│' + ' '.repeat(b.w - 2) + '│', color);
}

const clip = (s: string, n: number) => (n <= 0 ? '' : s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s);

/** Text with the right part pushed to the right edge of the box's inside. */
function putSplit(g: Grid, b: Rect, row: number, left: string, lc: string, right: string, rc: string): void {
  const inner = b.w - 4;
  const r = clip(right, Math.max(0, inner - left.length - 1));
  put(g, b.x + 2, b.y + row, clip(left, inner), lc);
  put(g, b.x + b.w - 2 - r.length, b.y + row, r, rc);
}

/** ▮▮▯ with the filled bars in the agent's colour and the empty ones dim, then the effort name. */
function putEffort(g: Grid, x: number, y: number, effort: string | undefined, color: string, maxW: number): number {
  const bars = effortText(effort);
  if (!bars || maxW < bars.length) return 0;
  [...bars].forEach((c, i) => put(g, x + i, y, c, c === '▮' ? color : colors.border));
  const name = clip(` ${effort}`, maxW - bars.length);
  put(g, x + bars.length, y, name, colors.dim);
  return bars.length + name.length;
}

/** Progress is unknown, so the bar is honest: a moving sweep while working, full when finished. */
function bar(status: AgentInfo['status'], n: number, frame: number): { text: string; color: string } {
  if (n <= 0) return { text: '', color: '' };
  if (status === 'done') return { text: '━'.repeat(n), color: colors.done };
  if (status === 'failed') return { text: '━'.repeat(n), color: colors.failed };
  if (status === 'idle') return { text: '─'.repeat(n), color: colors.frame };
  const cells = Array<string>(n).fill('─');
  const head = frame % n;
  for (let i = 0; i < Math.min(4, n); i++) cells[(head + i) % n] = '━';
  return { text: cells.join(''), color: colors.warning };
}

const STATUS: Record<AgentInfo['status'], { mark: string; color: string }> = {
  working: { mark: '● working', color: colors.bright },
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
    put(g, x, y, GLYPH[b] ?? '┼', wireColor.get(k) ?? colors.border);
  }
}

/** The two fixed wire captions of the design: "advice" on the advisor wire, "delegate" on the trunk. */
function drawWireLabels(g: Grid, layout: GraphLayout): void {
  const adv = layout.wires.find((w) => w.to === 'advisor');
  if (adv && adv.cells.length >= 8) {
    const [x, y] = adv.cells[Math.floor(adv.cells.length / 2) - 3];
    put(g, x, y - 1, 'advice', colors.dim, true);
  }
  const trunk = layout.wires.find((w) => w.to !== 'advisor');
  if (trunk) put(g, trunk.cells[0][0] + 2, trunk.cells[0][1], 'delegate', colors.dim, true);
}

function drawDots(g: Grid, layout: GraphLayout, active: ActiveFlow[]): void {
  for (const f of active) {
    const cell = dotCell(f, layout);
    if (!cell) continue;
    put(g, cell[0], cell[1], '●', f.color);
    const label = ` ${clip(f.label, 22)} `;
    const right = cell[0] + 1 + label.length < g.ch[0].length;
    put(g, right ? cell[0] + 1 : cell[0] - label.length, cell[1], label, colors.bright, true, colors.pill);
  }
}

const TRIGGERS: [string, keyof SessionState['triggers']][] = [
  ['plan check', 'planCheck'], ['stuck', 'stuck'], ['final review', 'finalReview'], ['/ask-opus', 'askOpus'],
];
const MARK: Record<string, { text: string; color: string }> = {
  todo: { text: '○', color: colors.dim }, on: { text: '●', color: colors.advisor },
  done: { text: '✓', color: colors.done }, next: { text: 'next', color: colors.warning },
};

function drawAdvisor(g: Grid, b: Rect, state: SessionState): void {
  const calls = state.advisorCalls;
  const reviewing = Object.values(state.agents).some((a) => isReviewer(a.role) && statusAt(a, Date.now()) === 'working');
  const configured = calls.length > 0 || reviewing;
  const color = configured ? colors.advisor : colors.dim;
  box(g, b, configured ? colors.advisor : colors.border);
  putSplit(g, b, 1, 'ADVISOR', colors.advisor, `[${state.advisorModel ?? 'opus'}]`, colors.muted);
  put(g, b.x + 2, b.y + 2, clip(reviewing ? '● reviewing…' : configured ? `● ${calls.length} call${calls.length === 1 ? '' : 's'}` : state.advisorModel ? '○ no calls yet' : '○ not configured', b.w - 4),
    configured ? colors.bright : colors.dim);
  if (configured) put(g, b.x + 2, b.y + 3, clip(`${fmtTokens(calls.reduce((n, c) => n + advisorCallTokens(state, c), 0))} tokens`, b.w - 4), colors.dim);
  for (let x = b.x + 1; x < b.x + b.w - 1; x++) put(g, x, b.y + 4, '─', colors.frame);
  put(g, b.x + 2, b.y + 5, 'called when', colors.dim);
  TRIGGERS.forEach(([label, key], i) => {
    const m = MARK[state.triggers[key]];
    putSplit(g, b, 7 + i, label, color, m.text, m.color);
  });
  put(g, b.x + 2, b.y + Math.max(12, b.h - 3), 'on call', colors.dim);
  put(g, b.x + 2, b.y + Math.max(13, b.h - 2), clip('never edits code', b.w - 4), colors.dim);
}

function drawMain(g: Grid, b: Rect, state: SessionState, frame: number): void {
  const a0 = state.agents.main;
  const status = a0 ? statusAt(a0, Date.now()) : 'idle';
  box(g, b, status === 'working' ? colors.main : colors.border);
  putSplit(g, b, 1, 'MAIN', colors.main, a0?.model ? `[${a0.model}]` : '', colors.muted);
  const inner = b.w - 4;
  put(g, b.x + 2, b.y + 2, status === 'working' ? '●' : '○', status === 'working' ? colors.bright : colors.dim);
  put(g, b.x + 4, b.y + 2, clip(oneLine(state.currentTask), inner - 2), status === 'working' ? colors.bright : colors.dim);
  put(g, b.x + 2, b.y + 3, 'effort ', colors.dim);
  const used = putEffort(g, b.x + 9, b.y + 3, a0?.effort, colors.main, inner - 7);
  if (!used) put(g, b.x + 9, b.y + 3, clip('unknown', inner - 7), colors.dim);
  void frame;
}

function drawCard(g: Grid, b: Rect, a0: AgentInfo, frame: number, runs = 1): void {
  const a = { ...a0, status: statusAt(a0, Date.now()) };
  const color = colorForRole(a.role);
  const inner = b.w - 4;
  box(g, b, a.status === 'working' ? color : a.status === 'failed' ? colors.failed : colors.border);
  const times = runs > 1 ? ` ×${runs}` : '';
  put(g, b.x + 2, b.y + 1, clip(a.title || a.role, inner - times.length) + times, a.status === 'idle' || a.status === 'done' ? colors.muted : color);
  put(g, b.x + 2, b.y + 2, clip([a.role, a.model].filter(Boolean).join(' · '), inner), colors.dim);
  const st = STATUS[a.status];
  put(g, b.x + 2, b.y + 3, clip(st.mark, inner), st.color);
  putEffort(g, b.x + 2 + st.mark.length + 2, b.y + 3, a.effort, color, inner - st.mark.length - 2);
  const br = bar(a.status, inner, frame);
  put(g, b.x + 2, b.y + b.h - 2, br.text, br.color);
}

const LEGEND = '● working · ○ idle · ✓ done';

export function Graph({ state, width, height, tickMs = 120 }: {
  state: SessionState; width: number; height: number; tickMs?: number;
}) {
  const innerW = Math.max(0, width - 4);
  const innerH = Math.max(0, height - 3);
  const agents = Object.values(state.agents);
  const layout = useMemo(
    () => layoutGraph(agents, innerW, innerH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agents.map((a) => `${a.key}:${a.status}:${a.toolUseId ?? ''}`).join('|'), innerW, innerH],
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

  const g = newGrid(innerW, innerH);
  drawWires(g, layout, active.current);
  drawWireLabels(g, layout);
  for (const b of layout.boxes) {
    if (b.key === 'advisor') drawAdvisor(g, b, state);
    else if (b.key === 'main') drawMain(g, b, state, frame);
    else if (state.agents[b.key]) drawCard(g, b, state.agents[b.key], frame, b.runs);
  }
  drawDots(g, layout, active.current);

  const title = innerW >= 'live flow'.length + LEGEND.length + 2
    ? 'live flow' + ' '.repeat(innerW - 'live flow'.length - LEGEND.length) + LEGEND
    : clip('live flow', innerW);

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="round" borderColor={colors.frame} paddingX={1}>
      <Text color={colors.dim}>{title}</Text>
      {g.ch.map((row, y) => {
        const runs: { text: string; color: string; bg: string }[] = [];
        row.forEach((c, x) => {
          const color = g.col[y][x];
          const bg = g.bg[y][x];
          const last = runs[runs.length - 1];
          if (last && last.color === color && last.bg === bg) last.text += c; else runs.push({ text: c, color, bg });
        });
        return (
          <Text key={y}>
            {runs.map((r, i) => <Text key={i} color={r.color || undefined} backgroundColor={r.bg || undefined}>{r.text}</Text>)}
          </Text>
        );
      })}
    </Box>
  );
}
