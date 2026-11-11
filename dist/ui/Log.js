import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { fmtClock } from './format.js';
import { colorForRole, colors } from './theme.js';
export function Log({ entries, rows }) {
    const shown = rows > 0 ? entries.slice(-rows) : [];
    return (_jsx(Box, { flexDirection: "column", children: shown.map((e, i) => (_jsxs(Text, { wrap: "truncate-end", children: [_jsxs(Text, { color: colors.dim, children: [fmtClock(e.time), "  "] }), _jsx(Text, { color: colorForRole(e.who), children: e.who }), _jsxs(Text, { children: ["  ", e.text] })] }, i))) }));
}
