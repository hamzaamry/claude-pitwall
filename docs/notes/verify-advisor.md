# Verify: native advisor calls in a transcript

*Spike run 2026-11-11, Claude Code 2.1.322.*
Command: `claude -p --model sonnet --advisor opus "Plan how to reverse a linked list in TypeScript, consult your advisor first, then answer in 5 lines."` in a scratch dir (`--advisor` works, although `claude --help` does not list it).

**Result: the advisor was called, and the transcript records it.** Assumption 1 of the spec holds.

## Block shapes

One API message (`message.id`) was written as **3 assistant lines**, one per content block, in this order:

1. `content[0]` = `{"type":"server_tool_use","id":"srvtoolu_…","name":"advisor","input":{}}`. The input is empty: the advisor sees the whole transcript, not a question.
2. `content[0]` = `{"type":"advisor_tool_result","tool_use_id":"srvtoolu_…","content":{"type":"advisor_redacted_result","encrypted_content":"<~1.5 KB base64>"}}`
3. `content[0]` = `{"type":"text","text":"…"}`, the main model's final answer.

**The advice is encrypted** (`advisor_redacted_result`). Only its size is visible. This matches the spec: the dashboard shows 🔒, never the advice text.

## Usage

Every one of the 3 lines repeats the **same** `message.usage`, including the advisor iteration. Counting the advisor per line would triple it, so dedupe by `message.id` for advisor tokens as well.

`message.usage.iterations[]` had three entries:

| # | `type` | `model` field | input | output |
|---|---|---|---|---|
| 1 | `"message"` | absent | 2 | 26 |
| 2 | **`"advisor_message"`** | **`"claude-opus-5-5"`** | 25601 | 697 |
| 3 | `"message"` | absent | 2 | 179 |

- The advisor type to use in Task 2 is **`advisor_message`**. Its model is on the iteration itself.
- The **top-level** usage fields cover the executor only: `output_tokens` 205 = 26 + 179 and `input_tokens` 4 = 2 + 2. Advisor tokens are not in them. So `usage` = the top-level fields (or the sum of the `message` iterations, which gives the same numbers), and `advisorUsage` = the sum of the `advisor_message` iterations.
- The advisor's cache fields are all 0 in this run. Its input (25.6k) is the whole transcript.

## Other fields on these lines

- Assistant lines carry `advisorModel: "claude-opus-5-5"` and `effort: "medium"` (plus `perTurnEffort`). `advisorModel` is set on every assistant line of the session, so it says "configured", not "called".
- Detect a call from the `server_tool_use` block with `name: "advisor"`, or from an `advisor_message` iteration. The iteration is the better source, since it carries the tokens.
- An `attachment` line with `{"type":"tool_addition","tool":{"type":"tool_reference","name":"advisor"}}` appears at session start. It also means "configured", not "called".

## Redacted example (the line holding the result)

```json
{
 "parentUuid": "<parentUuid>",
 "isSidechain": false,
 "message": {
  "model": "claude-sonnet-5-5",
  "id": "msg_1",
  "type": "message",
  "role": "assistant",
  "content": [
   {
    "type": "advisor_tool_result",
    "tool_use_id": "srvtoolu_013xWNuo8amctVA7ZJxXMbDD",
    "content": {
     "type": "advisor_redacted_result",
     "encrypted_content": "<ENCRYPTED ~1.5KB>"
    }
   }
  ],
  "container": null,
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "stop_details": null,
  "usage": {
   "input_tokens": 4,
   "cache_creation_input_tokens": 12533,
   "cache_read_input_tokens": 35891,
   "output_tokens": 205,
   "output_tokens_details": {
    "thinking_tokens": 0
   },
   "server_tool_use": {
    "web_search_requests": 0,
    "web_fetch_requests": 0
   },
   "service_tier": "standard",
   "cache_creation": {
    "ephemeral_1h_input_tokens": 12145,
    "ephemeral_5m_input_tokens": 0
   },
   "inference_geo": "global",
   "iterations": [
    {
     "input_tokens": 2,
     "output_tokens": 26,
     "cache_read_input_tokens": 11873,
     "cache_creation_input_tokens": 12145,
     "cache_creation": {
      "ephemeral_5m_input_tokens": 0,
      "ephemeral_1h_input_tokens": 12145
     },
     "type": "message"
    },
    {
     "input_tokens": 25601,
     "output_tokens": 697,
     "cache_read_input_tokens": 0,
     "cache_creation_input_tokens": 0,
     "cache_creation": {
      "ephemeral_5m_input_tokens": 0,
      "ephemeral_1h_input_tokens": 0
     },
     "type": "advisor_message",
     "model": "claude-opus-5-5"
    },
    {
     "input_tokens": 2,
     "output_tokens": 179,
     "cache_read_input_tokens": 24018,
     "cache_creation_input_tokens": 388,
     "cache_creation": {
      "ephemeral_5m_input_tokens": 388,
      "ephemeral_1h_input_tokens": 0
     },
     "type": "message"
    }
   ],
   "speed": "standard",
   "fallback_credit": null
  },
  "input_transformations": [],
  "diagnostics": null,
  "context_management": null
 },
 "apiBlockIndex": 1,
 "requestId": "<requestId>",
 "requestRef": "848e7cb6-8bdd-4e33-ac8f-9af9a1dcd1b5",
 "requestedModel": "claude-sonnet-5-5",
 "promptCacheRequested": "1h",
 "type": "assistant",
 "uuid": "<uuid>",
 "timestamp": "<timestamp>",
 "advisorModel": "claude-opus-5-5",
 "effort": "medium",
 "perTurnEffort": "medium",
 "userType": "<userType>",
 "entrypoint": "<entrypoint>",
 "cwd": "<cwd>",
 "sessionId": "<sessionId>",
 "version": "<version>",
 "gitBranch": "<gitBranch>"
}
```

## Consequences for the plan

- Task 2: `advisorUsage` = sum of iterations with `type === 'advisor_message'`; `usage` = top-level fields. Parse `server_tool_use` blocks into `Block` as the plan says; `advisor_tool_result` lines can map to `blocks: []`.
- Task 3: the advisor call must be recorded once per `messageId` (the reducer's `seenMessageIds` covers it), and the advisor's tokens are counted once.
