import type { Block, TranscriptEvent, Usage } from './types.js';

const ADVISOR_ITERATION = 'advisor_message';

type Raw = Record<string, any>;

function toUsage(u: Raw): Usage {
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}

function sum(list: Raw[]): Usage {
  return list.map(toUsage).reduce(
    (a, b) => ({ input: a.input + b.input, output: a.output + b.output,
      cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );
}

function toBlock(b: Raw): Block | null {
  switch (b?.type) {
    case 'text': return { type: 'text', chars: typeof b.text === 'string' ? b.text.length : 0 };
    case 'thinking': return { type: 'thinking' };
    case 'tool_use': return { type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} };
    case 'server_tool_use': return { type: 'server_tool_use', id: b.id, name: b.name };
    default: return null;
  }
}

// Slash commands and system notes are written as user lines but are not something the user asked for.
const NOT_A_PROMPT = /^(<(command-|local-command-|system-reminder|task-notification)|\[Request interrupted)/;
const isPrompt = (t: string) => !NOT_A_PROMPT.test(t.trimStart());

export function parseLine(raw: string): TranscriptEvent | null {
  let d: Raw;
  try { d = JSON.parse(raw); } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  const time: string = d.timestamp ?? '';
  const m: Raw | undefined = d.message;

  if (d.type === 'assistant' && m && m.usage) {
    const iterations: Raw[] | undefined = Array.isArray(m.usage.iterations) ? m.usage.iterations : undefined;
    const advisorIts = iterations?.filter((i) => i.type === ADVISOR_ITERATION) ?? [];
    const blocks = (Array.isArray(m.content) ? m.content : [])
      .map(toBlock).filter((b: Block | null): b is Block => b !== null);
    return {
      kind: 'assistant', time, messageId: m.id ?? '', model: m.model ?? '', effort: d.effort,
      usage: toUsage(m.usage),
      ...(advisorIts.length ? { advisorUsage: sum(advisorIts) } : {}),
      blocks,
    };
  }

  if (d.type === 'user' && m) {
    if (d.isMeta) return null;
    if (typeof m.content === 'string') return isPrompt(m.content) ? { kind: 'userPrompt', time, text: m.content } : null;
    if (Array.isArray(m.content)) {
      const r = m.content.find((c: Raw) => c?.type === 'tool_result');
      if (r) {
        const text = typeof r.content === 'string' ? r.content
          : Array.isArray(r.content)
            ? r.content.filter((c: Raw) => c?.type === 'text').map((c: Raw) => c.text).join('\n') : '';
        return { kind: 'toolResult', time, toolUseId: r.tool_use_id, isError: r.is_error === true, text };
      }
      // a prompt stored as blocks, for example text plus an image
      const text = m.content.filter((c: Raw) => c?.type === 'text' && typeof c.text === 'string').map((c: Raw) => c.text).join('\n');
      if (text && isPrompt(text)) return { kind: 'userPrompt', time, text };
    }
  }
  return null;
}
