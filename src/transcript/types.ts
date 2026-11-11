export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type Block =
  | { type: 'text'; chars: number }
  | { type: 'thinking' }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'server_tool_use'; id: string; name: string };
export type TranscriptEvent =
  | { kind: 'assistant'; time: string; messageId: string; model: string; effort?: string;
      usage: Usage; advisorUsage?: Usage; blocks: Block[] }
  | { kind: 'userPrompt'; time: string; text: string }
  | { kind: 'toolResult'; time: string; toolUseId: string; isError: boolean; text: string };
