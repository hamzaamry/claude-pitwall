import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { formatReset } from '../limits.js';
import { fmtClock } from './format.js';
import { colors } from './theme.js';
const WIDTH = 40;
const ACTIVE_SKILL_MS = 2 * 60 * 1000;
const CATEGORIES = ['coding', 'reading', 'talking', 'planning', 'tests'];
export function colorFor(pct) {
    return pct >= 80 ? colors.warning : colors.done;
}
/** Whole-number percentages that always add up to 100 (largest remainder), or all 0 with no tokens. */
export function percentages(cats) {
    const total = CATEGORIES.reduce((n, c) => n + cats[c], 0);
    const out = { coding: 0, reading: 0, talking: 0, planning: 0, tests: 0 };
    if (total === 0)
        return out;
    const exact = CATEGORIES.map((c) => ({ c, v: (cats[c] / total) * 100 }));
    for (const e of exact)
        out[e.c] = Math.floor(e.v);
    let left = 100 - CATEGORIES.reduce((n, c) => n + out[c], 0);
    for (const e of [...exact].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))) {
        if (left-- <= 0)
            break;
        out[e.c] += 1;
    }
    return out;
}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const bar = (pct) => {
    const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
};
function Section({ title, children }) {
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: colors.dim, width: WIDTH, paddingX: 1, children: [_jsx(Text, { bold: true, color: colors.dim, children: title }), children] }));
}
function LimitRow({ label, pct, note }) {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [_jsx(Text, { children: label.padEnd(8) }), _jsx(Text, { color: colorFor(pct), children: bar(pct) }), _jsxs(Text, { children: [" ", Math.round(pct), "%"] })] }), note ? _jsx(Text, { color: colors.dim, children: note }) : null] }));
}
export function Stats({ state, limits, now }) {
    const inner = WIDTH - 4;
    const pct = percentages(state.categories);
    const calls = state.advisorCalls;
    const last = calls[calls.length - 1];
    return (_jsxs(Box, { flexDirection: "column", width: WIDTH, children: [_jsx(Section, { title: "LIMITS", children: limits === null ? _jsx(Text, { color: colors.dim, children: "run /pitwall:setup to see limits" }) : (_jsxs(_Fragment, { children: [limits.contextPct !== undefined ? _jsx(LimitRow, { label: "context", pct: limits.contextPct }) : null, limits.fiveHour ? _jsx(LimitRow, { label: "session", pct: limits.fiveHour.pct, note: `5h window · resets in ${formatReset(limits.fiveHour.resetsAt, now)}` }) : null, limits.weekly ? _jsx(LimitRow, { label: "weekly", pct: limits.weekly.pct, note: `resets in ${formatReset(limits.weekly.resetsAt, now)}` }) : null] })) }), _jsx(Section, { title: "ADVISOR \u00B7 opus", children: calls.length === 0 ? _jsx(Text, { color: colors.dim, children: "not called yet" }) : (_jsxs(_Fragment, { children: [_jsxs(Text, { color: colors.advisor, children: [calls.length, " call", calls.length === 1 ? '' : 's'] }), calls.slice(-4).map((c, i) => (_jsxs(Text, { wrap: "truncate-end", children: [fmtClock(c.time), "  ", c.why, c.result ? `  [${c.result}]` : ''] }, i))), _jsx(Text, { color: colors.dim, children: "latest advice" }), _jsx(Text, { color: colors.advisor, children: clip(last.source === 'reviewer' && last.text ? last.text : '🔒 native advice (encrypted)', inner) })] })) }), _jsx(Section, { title: "WHERE TOKENS WENT \u00B7 this task", children: CATEGORIES.map((c) => (_jsxs(Text, { children: [_jsx(Text, { children: c.padEnd(9) }), _jsx(Text, { color: colors.sub, children: bar(pct[c]) }), _jsxs(Text, { children: [" ", pct[c], "%"] })] }, c))) }), _jsx(Section, { title: "SKILLS \u00B7 this session", children: state.skills.length === 0 ? _jsx(Text, { color: colors.dim, children: "none yet" }) : state.skills.map((k) => {
                    const active = now - Date.parse(k.lastAt) < ACTIVE_SKILL_MS;
                    return (_jsxs(Text, { wrap: "truncate-end", color: active ? undefined : colors.dim, children: [active ? '●' : '○', " ", k.name, "  ", k.by] }, `${k.name}:${k.by}`));
                }) })] }));
}
