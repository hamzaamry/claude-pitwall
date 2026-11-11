const ADVISOR_ITERATION = 'advisor_message';
function toUsage(u) {
    return {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
    };
}
function sum(list) {
    return list.map(toUsage).reduce((a, b) => ({ input: a.input + b.input, output: a.output + b.output,
        cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
}
function toBlock(b) {
    switch (b?.type) {
        case 'text': return { type: 'text', chars: typeof b.text === 'string' ? b.text.length : 0 };
        case 'thinking': return { type: 'thinking' };
        case 'tool_use': return { type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} };
        case 'server_tool_use': return { type: 'server_tool_use', id: b.id, name: b.name };
        default: return null;
    }
}
export function parseLine(raw) {
    let d;
    try {
        d = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (!d || typeof d !== 'object')
        return null;
    const time = d.timestamp ?? '';
    const m = d.message;
    if (d.type === 'assistant' && m && m.usage) {
        const iterations = Array.isArray(m.usage.iterations) ? m.usage.iterations : undefined;
        const advisorIts = iterations?.filter((i) => i.type === ADVISOR_ITERATION) ?? [];
        const blocks = (Array.isArray(m.content) ? m.content : [])
            .map(toBlock).filter((b) => b !== null);
        return {
            kind: 'assistant', time, messageId: m.id ?? '', model: m.model ?? '', effort: d.effort,
            usage: toUsage(m.usage),
            ...(advisorIts.length ? { advisorUsage: sum(advisorIts) } : {}),
            blocks,
        };
    }
    if (d.type === 'user' && m) {
        if (typeof m.content === 'string')
            return { kind: 'userPrompt', time, text: m.content };
        if (Array.isArray(m.content)) {
            const r = m.content.find((c) => c?.type === 'tool_result');
            if (r) {
                const text = typeof r.content === 'string' ? r.content
                    : Array.isArray(r.content)
                        ? r.content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n') : '';
                return { kind: 'toolResult', time, toolUseId: r.tool_use_id, isError: r.is_error === true, text };
            }
        }
    }
    return null;
}
