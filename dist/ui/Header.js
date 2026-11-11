import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { fmtElapsed, fmtTokens } from './format.js';
import { colorForRole, colors } from './theme.js';
const STATUS_COLOR = {
    working: colors.warning, idle: colors.dim, done: colors.done, failed: colors.failed,
};
export function Header({ state, teamOn, now, width }) {
    const agents = Object.values(state.agents);
    const total = agents.reduce((n, a) => n + a.tokens, 0);
    const elapsed = state.startedAt ? fmtElapsed(now - Date.parse(state.startedAt)) : '0:00';
    const compact = width < 100;
    return (_jsxs(Box, { flexDirection: "column", width: width, children: [_jsxs(Text, { wrap: "truncate-end", children: [_jsx(Text, { bold: true, children: "pitwall" }), _jsx(Text, { color: colors.dim, children: " \u2502 " }), _jsx(Text, { children: state.currentTask || 'no task yet' }), _jsxs(Text, { color: colors.dim, children: [" (", teamOn ? 'team on' : 'team off', ")  "] }), _jsxs(Text, { children: ["tokens ", fmtTokens(total)] }), _jsx(Text, { color: colors.dim, children: "  " }), _jsxs(Text, { children: ["elapsed ", elapsed] })] }), _jsx(Box, { flexWrap: "wrap", columnGap: 2, children: agents.map((a) => (_jsxs(Text, { wrap: "truncate-end", children: [_jsx(Text, { color: a.status === 'working' ? colorForRole(a.role) : colors.dim, children: "\u25CF " }), _jsx(Text, { color: colorForRole(a.role), children: a.role }), _jsxs(Text, { color: colors.dim, children: [" ", [a.model, a.effort].filter(Boolean).join(' · ')] }), compact ? null : _jsxs(Text, { color: STATUS_COLOR[a.status], children: [" ", a.status] }), _jsxs(Text, { children: [" ", fmtTokens(a.tokens)] })] }, a.key))) })] }));
}
