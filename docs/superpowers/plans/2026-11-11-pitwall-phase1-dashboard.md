# pitwall Phase 1 (Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `pitwall watch` terminal dashboard that runs beside any Claude Code session. It shows each agent (model, effort, tokens), a live graph of agents with travelling message dots, your limits, advisor calls, skills, and where the tokens went. It is shipped as a Claude Code plugin repo.

**Architecture:** Claude Code already writes everything we need to JSONL transcripts:
- `~/.claude/projects/<cwd-slug>/<session>.jsonl`
- subagents in `<session>/subagents/agent-<id>.jsonl`, each with a `.meta.json` next to it

The dashboard does four things:
1. tails those files;
2. parses each line into a typed event;
3. reduces events into one `SessionState`;
4. renders that state with Ink.

The LIMITS box needs data that only exists in the status line input. A tiny status line wrapper saves that JSON to a file and passes it on to the user's existing status line (claude-hud).

No hooks and no agents in phase 1.

**Tech Stack:** Node ≥ 20, TypeScript 5.6, Ink 5 + React 18, vitest 2, ink-testing-library 4. `dist/` is committed, because plugins install from git without a build step.

**Spec:** `docs/superpowers/specs/2026-11-11-pitwall-design.md`

## Global Constraints

- Repo root: `~/pitwall` (own git repo). **Never push. Never add Co-Authored-By trailers to commits.**
- MIT licence. Credit yukti, lz-advisor and advisor-opus in the README for borrowed ideas.
- Labels are always `role · model` (e.g. `advisor · opus`). No jargon codes (`OK/NEED/FIX`), no stats the user can't act on, no `$` costs, no receipt, no waste alerts, no YOU node.
- Colours:
  - main `#f0883e`
  - advisor `#d2a8ff`
  - scouts/subagents `#79c0ff`
  - runner `#56d4dd`
  - done `#3fb950`
  - failed `#f85149`
  - warning `#d29922`
  - dim `#6e7681`
- Target terminal ≥160×45. Below 160 columns, hide the stats column. Below 100 columns, shorten labels. The dashboard never crashes on resize.
- The status line wrapper must **never** break the user's existing status line (claude-hud).
- `/pitwall:setup` shows every settings change and asks before applying it.
- Real transcript facts, checked 2026-11-11 on Claude Code 2.1.322:
  - **Assistant lines** carry `message.id`, `message.model`, `message.usage`, `effort` and `advisorModel`.
    - `message.usage` contains `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` and `iterations[]`, whose entries have a `type`.
    - **One API message is split across several lines that share the same `message.id` and repeat the same usage.**
  - **Agent spawns** are `tool_use` blocks with `name: "Agent"` and an `input` of `{description, subagent_type, prompt, model?}`.
  - **Subagent `.meta.json`** has `agentType`, `description`, `toolUseId`, `spawnDepth`, `pickedEffortModel` and `finished`.
  - **User prompts** are `type: "user"` lines whose `message.content` is a string. Tool results are arrays of `{type: "tool_result", tool_use_id, is_error, content}`.
  - Many other line types exist (`attachment`, `api-request`, `ai-title`, …) and must be ignored.

## Review Focus

1. **The same API message on several lines** (same `message.id`) must count its tokens once. Pinned in Task 3.
2. **A half-written last line** while Claude is still streaming must be buffered until its newline, without crashing or producing a bad event. Pinned in Task 4.
3. **No session yet, an empty project dir, or a new session starting while watching.** The dashboard shows "waiting for a Claude Code session in <dir>" and switches to the newest session file when one appears. Pinned in Task 4 and Task 9.
4. **A narrow or tiny terminal** must not crash. The stats column hides below 160 columns. Pinned in Task 9.
5. **The status line wrapper must survive bad input**: invalid JSON, a missing wrapped command, or an unwritable snapshot dir. In every case it still forwards stdin to the wrapped command and prints its output. Pinned in Task 5.

---

### Task 1: Spike — what does a native advisor call look like in a transcript?

This task decides how Task 2 detects advisor calls. It costs a little of the user's usage (one short `claude -p` run).

**Files:**
- Create: `~/pitwall/docs/notes/verify-advisor.md`

- [ ] **Step 1:** In a scratch dir, run `claude -p --model sonnet --advisor opus "Plan how to reverse a linked list in TypeScript, consult your advisor first, then answer in 5 lines."`
- [ ] **Step 2:** Open the newest `~/.claude/projects/<scratch-slug>/*.jsonl` and search it for `advisor`.
- [ ] **Step 3:** Write `verify-advisor.md` with:
  - the exact block shape: is there a `server_tool_use` with `name: "advisor"`, and an `advisor_tool_result` block?
  - the `usage.iterations[]` entry type and model for advisor tokens;
  - whether the advice is encrypted;
  - one redacted example line.

  If no advisor call appears, write that down. In that case Task 2 keeps advisor detection, but the advisor panel only shows "not configured / no calls".

  Expected: a file with concrete field names that Task 2 copies into its fixtures.

### Task 2: Repo scaffold + transcript line parser

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (node_modules only; `dist/` is committed), `LICENSE` (MIT)
- Create: `src/transcript/types.ts`, `src/transcript/parse.ts`
- Test: `test/parse.test.ts`, `test/fixtures/lines/*.json`. Fixture lines copy the real shapes, with their text replaced by placeholders.

**Interfaces:**
- Produces, in `src/transcript/types.ts`:
  ```ts
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
  ```
- Produces, in `src/transcript/parse.ts`: `parseLine(raw: string): TranscriptEvent | null`.
  - `advisorUsage` is the sum of the `usage.iterations[]` entries whose type is the advisor type found in Task 1.
  - `usage` sums only the executor iterations. When no `iterations` array is present, it uses the top-level usage fields.

- [ ] **Step 1:** `git init`, scaffold, `npm i ink@5 react@18 && npm i -D typescript@5.6 vitest@2 ink-testing-library@4 @types/react@18 @types/node@22`. Check `node --version` (must be ≥20).
- [ ] **Step 2: Write failing tests** in `test/parse.test.ts`:
  - `parses assistant line`: `kind === 'assistant'`, `messageId === 'msg_1'`, `model === 'claude-sonnet-5-5'`, `effort === 'medium'`, `usage` = `{input: 2, output: 175, cacheRead: 31382, cacheWrite: 11931}`, `blocks[0].type === 'tool_use'` with `name === 'Agent'` and `input.description === 'find callers'`.
  - `parses user prompt`: a string content line gives `{kind: 'userPrompt', text: 'fix the save bug'}`.
  - `parses tool result`: gives `{kind: 'toolResult', toolUseId: 'toolu_1', isError: true}`, and `text` is the joined text content.
  - `separates advisor usage` (fixture from Task 1): `advisorUsage.output > 0` and `usage` excludes it.
  - `ignores other line types`: `attachment`, `api-request`, `ai-title` and a made-up `future-type` all give `null`.
  - `returns null on invalid JSON`.
- [ ] **Step 3:** Run `npx vitest run test/parse.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 4:** Implement `parseLine` in `src/transcript/parse.ts`.
- [ ] **Step 5:** Run `npx vitest run test/parse.test.ts`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat: transcript line parser`.

### Task 3: Session state reducer + token categories

**Files:**
- Create: `src/model/state.ts`, `src/model/reduce.ts`, `src/model/categories.ts`
- Test: `test/reduce.test.ts`, `test/categories.test.ts`

**Interfaces:**
- Consumes: `TranscriptEvent`, `Block` from Task 2.
- Produces, in `src/model/state.ts`:
  ```ts
  export type Category = 'coding' | 'reading' | 'talking' | 'planning' | 'tests';
  export type AgentInfo = { key: string; role: string; model: string; effort?: string; title: string;
    tokens: number; status: 'working' | 'idle' | 'done' | 'failed'; startedAt?: string; finishedAt?: string };
  export type AdvisorCall = { time: string; source: 'native' | 'reviewer'; why: string; result?: string; tokens: number; text?: string };
  export type LogEntry = { time: string; who: string; text: string };
  export type SessionState = {
    sessionId: string; currentTask: string; startedAt?: string; lastActivity?: string;
    agents: Record<string, AgentInfo>;      // key 'main' + one per subagent id
    seenMessageIds: Set<string>;
    skills: { name: string; by: string; firstAt: string; lastAt: string }[];
    advisorCalls: AdvisorCall[];
    categories: Record<Category, number>;   // tokens per category
    log: LogEntry[];                        // capped at 200 entries
    pendingFlows: Flow[];                   // consumed by the graph animation
  };
  export type Flow = { from: string; to: string; label: string; color: string };
  export function emptyState(sessionId: string): SessionState;
  ```
- Produces, in `src/model/reduce.ts`:
  - `applyEvent(s: SessionState, agentKey: string, e: TranscriptEvent): SessionState`, which mutates and returns `s`;
  - `registerSubagent(s, key: string, meta: { agentType: string; description: string; pickedEffortModel?: string; finished?: boolean }): void`.
- Produces, in `src/model/categories.ts`: `categorize(blocks: Block[], hasEdited: boolean): Category`.
  - Edit, Write or NotebookEdit tool_use → `coding`.
  - Bash whose `input.command` matches `/\b(test|vitest|jest|pytest|tsc|lint|build|cargo check|go vet)\b/` → `tests`.
  - Read, Grep, Glob, WebFetch or WebSearch → `reading`.
  - Text only, with `!hasEdited` and either a TodoWrite or text over 1200 chars → `planning`.
  - Any other text-only turn → `talking`.
  - The first matching rule wins, in that order.

- [ ] **Step 1: Write failing tests:**
  - `counts duplicated message once`: two assistant events with the same `messageId` and usage `{input: 10, output: 5, cacheRead: 100, cacheWrite: 0}` give `agents.main.tokens === 115`, not 230.
  - `agent spawn creates card + flow`: an Agent tool_use with `description: 'find callers'` and `subagent_type: 'Explore'` adds a `pendingFlows` entry `{from: 'main', to: <tool_use id>, label: 'find callers'}`, and a log entry `main → Explore: find callers`.
  - `registerSubagent sets role/model/title`: meta `{agentType: 'Explore', description: 'find callers', pickedEffortModel: 'claude-opus-5-5', finished: true}` gives `role === 'Explore'`, `model === 'opus'` (short alias), `title === 'find callers'` and `status === 'done'`.
  - `failed tool result marks failed`: a `toolResult` with `isError: true` in a subagent sets that agent's status to `failed`.
  - `skill usage tracked`: a Skill tool_use with `input.skill: 'superpowers:brainstorming'` adds a skill with `by: 'main'`. A second use updates `lastAt` without adding a duplicate.
  - `native advisor call recorded`: an assistant event with `advisorUsage` pushes `{source: 'native', tokens: >0, text: undefined}` and a flow `main → advisor` labelled `advice 🔒`.
  - `current task = last user prompt, max 60 chars + …`.
  - `effort comes from assistant events`: an assistant event with `effort: 'low'` on subagent `a1` sets `agents.a1.effort === 'low'`.
  - Categories, one test per rule above, plus `first match wins` (Edit + Read gives `coding`).
- [ ] **Step 2:** Run `npx vitest run test/reduce.test.ts test/categories.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `emptyState`, `applyEvent`, `registerSubagent` and `categorize`.
  - Model alias: take the family word from the model id (`claude-opus-5-5` → `opus`).
  - Tokens for one message = input + output + cacheRead + cacheWrite, counted only the first time its `messageId` is seen. The message's category gets the same amount.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: session state reducer and token categories`.

### Task 4: Locate sessions + tail files

**Files:**
- Create: `src/transcript/locate.ts`, `src/transcript/tail.ts`
- Test: `test/locate.test.ts`, `test/tail.test.ts`, using temp dirs from `fs.mkdtempSync`.

**Interfaces:**
- Produces, in `src/transcript/locate.ts`:
  - `projectDirFor(cwd: string, home?: string): string`. This is `<home>/.claude/projects/` + cwd with every `/` replaced by `-`.
  - `latestSession(projectDir: string): { id: string; file: string } | null`. Picks the newest `*.jsonl` by mtime.
  - `subagentFiles(projectDir: string, sessionId: string): { key: string; file: string; metaFile: string }[]`.
- Produces, in `src/transcript/tail.ts`:
  - `class FileTail { constructor(file: string); readNew(): string[] }`. It returns complete new lines since the last call, keeps a trailing partial line buffered, and restarts from 0 if the file shrank.

- [ ] **Step 1: Write failing tests:**
  - `projectDirFor('/home/teacup/Hevier', '/h')` returns `'/h/.claude/projects/-home-teacup-Hevier'`.
  - `latestSession picks newest mtime`.
  - `latestSession returns null for empty or missing dir`.
  - `subagentFiles lists agent-*.jsonl with meta`.
  - `readNew returns only complete lines`: write `"a\nb"` → `['a']`; append `"c\n"` → `['bc']`.
  - `readNew handles truncation`: when the file is rewritten shorter, the next read starts from 0.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Use sync `fs` reads from a byte offset; that is enough for 500 ms polling.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: session discovery and file tailing`.

### Task 5: Status line wrapper + limits reader

**Files:**
- Create: `bin/statusline-tee.mjs`, a plain Node ESM script with no dependencies, so it can be copied anywhere
- Create: `src/limits.ts`
- Test: `test/statusline-tee.test.ts`, `test/limits.test.ts`

**Interfaces:**
- `statusline-tee.mjs`:
  1. Reads all of stdin.
  2. Tries to parse it as JSON. On success, it atomically writes it (tmp file + rename) to `${PITWALL_HOME:-~/.claude/pitwall}/statusline/<session_id>.json`.
  3. Runs the wrapped command from `${PITWALL_HOME}/config.json` → `{ "wrappedStatusLine": "<command>" }` with `sh -c`, passes the **original stdin** to it, and prints its stdout.
  4. Every failure in step 2 is swallowed. If there is no wrapped command, it prints nothing. Exit code is always 0.
- Produces, in `src/limits.ts`: `readLimits(sessionId: string, home?: string): Limits | null`, where
  ```ts
  export type Limits = { contextPct?: number;
    fiveHour?: { pct: number; resetsAt: number }; weekly?: { pct: number; resetsAt: number } };
  ```
  It maps `context_window.used_percentage`, `rate_limits.five_hour.{used_percentage,resets_at}` and `rate_limits.seven_day.{…}`. Missing fields stay undefined.
- Produces: `formatReset(resetsAtEpochSec: number, now: number): string`, which gives `"3h 8m"` or `"3d 1h"`.

- [ ] **Step 1: Write failing tests:**
  - `tee forwards stdin to wrapped command`: with config `{"wrappedStatusLine": "cat"}` and stdin `{"session_id": "s1", "x": 1}`, stdout equals the stdin text and `statusline/s1.json` exists.
  - `tee survives invalid JSON`: stdin `not json` still gives stdout `not json` and exit 0.
  - `tee survives missing config`: exit 0, empty stdout.
  - `tee survives unwritable dir`: `PITWALL_HOME` points to a read-only dir; stdout is still forwarded.
  - `readLimits maps fields`: `{contextPct: 42, fiveHour: {pct: 11, resetsAt: …}, weekly: {pct: 85, …}}`.
  - `readLimits without rate_limits` (API-key user) gives only `contextPct`.
  - `formatReset`: 11280 s → `"3h 8m"`, 262800 s → `"3d 1h"`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement both.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: status line wrapper and limits reader`.

### Task 6: Header + agent chips (Ink)

**Files:**
- Create: `src/ui/theme.ts` (the colours from Global Constraints), `src/ui/Header.tsx`
- Test: `test/ui/header.test.tsx` (ink-testing-library `render(...).lastFrame()`)

**Interfaces:**
- Consumes: `SessionState`, `AgentInfo`.
- Produces: `<Header state={SessionState} teamOn={boolean} now={number} width={number} />`.
  - Row 1: `pitwall │ <currentTask> (team on|team off)  tokens <total>  elapsed <m:ss>`.
  - Row 2: one chip per agent, `● <role> <model · effort> <status> <tokens>`.
  - Tokens are formatted like `48.2k`.

- [ ] **Step 1: Write failing tests:**
  - The frame contains `pitwall`, the current task, `team off`, `tokens 68.7k` (for 68_700 tokens) and `elapsed 2:48`.
  - A chip for a main agent with model `sonnet` and effort `medium` contains `main` and `sonnet · medium`.
  - `fmtTokens(950) === '950'`, `fmtTokens(48_200) === '48.2k'`, `fmtTokens(1_250_000) === '1.25M'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Put `fmtTokens` in `src/ui/format.ts`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: header and agent chips`.

### Task 7: Graph layout + rendering with travelling dots

**Files:**
- Create: `src/ui/graphLayout.ts` (pure layout math), `src/ui/Graph.tsx`, `src/ui/flowAnim.ts`
- Test: `test/ui/graphLayout.test.ts`, `test/ui/flowAnim.test.ts`, `test/ui/graph.test.tsx`

**Interfaces:**
- Produces, in `src/ui/graphLayout.ts`: `layoutGraph(agents: AgentInfo[], width: number, height: number): GraphLayout`.
  ```ts
  type GraphLayout = {
    boxes: { key: string; x: number; y: number; w: number; h: number }[];
    wires: { from: string; to: string; cells: [number, number][] }[];
  };
  ```
  The arrangement:
  - The advisor panel is a tall box on the left.
  - `main` is centred above a bus.
  - Every non-main agent is a card under the bus, in spawn order.
  - When more cards exist than fit, the oldest finished cards drop out first.
- Produces, in `src/ui/flowAnim.ts`: `export type ActiveFlow = Flow & { wireIndex: number; pos: number }` and `stepFlows(active: ActiveFlow[], pending: Flow[], layout: GraphLayout): ActiveFlow[]`. Each tick advances every dot one cell along its wire's `cells`. A finished flow is removed. At most 6 dots are on screen; the rest wait in the queue.
- Produces, in `src/ui/Graph.tsx`: `<Graph state={SessionState} width={number} height={number} />`.
  - It draws boxes and wires with box-drawing characters (`─│┌┐└┘┬┴┼`).
  - The dot is `●` in the sender's colour, with its label printed beside it.
  - Wires carrying an active dot are drawn in that colour.
  - Card content: title = `AgentInfo.title` (truncated), a status line `● working / ○ idle / ✓ done / ✗ failed`, `model · effort`, and a one-row bar.
  - The bar is honest: real progress is unknown, so it is an indeterminate sweep while working, a full green bar when done and a full red bar when failed.
  - The advisor panel lists the triggers `plan check · stuck · final review · /ask-opus`, each with ○, plus `on call · never edits code`. It is dimmed and shows `not configured` when no advisor calls exist.

- [ ] **Step 1: Write failing tests:**
  - `layout with 0 subagents`: an advisor box and a main box; no cards.
  - `layout with 3 subagents`: 3 cards in a row below main; no box overlaps another; every wire connects main's bottom to a card's top.
  - `layout overflow`: with 12 agents in a 100-column-wide graph, only the cards that fit are kept, newest and working ones first.
  - `stepFlows advances one cell per tick and removes finished flows`.
  - `stepFlows caps visible dots at 6`.
  - `Graph frame shows card title 'find callers' and 'Explore · opus'`.
  - `advisor panel shows 'not configured' with no advisor calls`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The layout is pure math. The component paints into a `string[][]` character grid with a parallel colour grid, then renders one `<Text>` per row, joining runs of the same colour.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: agent graph with travelling message dots`.

### Task 8: Stats column + session log

**Files:**
- Create: `src/ui/Stats.tsx`, `src/ui/Log.tsx`
- Test: `test/ui/stats.test.tsx`, `test/ui/log.test.tsx`

**Interfaces:**
- Consumes: `Limits`, `formatReset` (Task 5), `SessionState`.
- Produces:
  - `<Stats state={SessionState} limits={Limits | null} now={number} />`, about 40 columns wide, with these boxes in order:
    - **LIMITS**: `context`, `session`, `weekly`, each with a 10-cell bar, `%`, and reset text (`5h window · resets in 3h 8m`, `resets in 3d 1h`). A bar at ≥80% is drawn in the warning colour.
    - **ADVISOR · opus**: `<n> calls`, then one row per call: `hh:mm:ss  <why>  [result]`. Below that, `latest advice`, which is the reviewer text, or `🔒 native advice (encrypted)`. With no calls it says `not called yet`.
    - **WHERE TOKENS WENT · this task**: five rows with bars and `%`.
    - **SKILLS · this session**: `● name  by` for active skills (used within the last 2 minutes), `○` for older ones.
  - `<Log entries={LogEntry[]} rows={number} />`: the last N entries as `hh:mm:ss  <who>  <text>`, with `who` coloured by role.

- [ ] **Step 1: Write failing tests:**
  - LIMITS shows `42%`, `11%`, `85%` and `resets in 3d 1h`. The weekly bar uses the warning colour; check it via the rendered ANSI or a `colorFor(pct)` helper returning `#d29922` when pct ≥ 80.
  - With `limits === null`, LIMITS shows `run /pitwall:setup to see limits`.
  - ADVISOR with no calls shows `not called yet`. With one native call it shows `🔒`.
  - The token categories show percentages that sum to 100 (±1 for rounding).
  - A skill used 30 s ago shows `●`; one used 10 min ago shows `○`.
  - The log shows the last 3 entries in order.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: stats column and session log`.

### Task 9: CLI + App wiring (live)

**Files:**
- Create: `src/App.tsx`, `src/cli.ts`, `src/watcher.ts`
- Test: `test/watcher.test.ts`, `test/app.test.tsx`
- Modify: `package.json` (`"bin": {"pitwall": "dist/cli.js"}`, `"build": "tsc"`)

**Interfaces:**
- Consumes: everything above.
- Produces, in `src/watcher.ts`: `class SessionWatcher { constructor(opts: { cwd: string; home?: string; sessionId?: string }); poll(): SessionState | null }`.
  - Every `poll()` does five things:
    1. re-checks `latestSession` and switches when a newer session appears, unless a `sessionId` is pinned;
    2. reads new lines from the main transcript and from every subagent file;
    3. calls `registerSubagent` from each meta file, re-reading it until `finished`;
    4. applies the parsed events;
    5. returns the state.
  - It returns `null` when no session exists.
- Produces, in `src/cli.ts`: `pitwall watch [--cwd <dir>] [--session <id>]`. The default `--cwd` is `process.cwd()`.
  - It renders `<App>`, which polls every 500 ms and advances the animation every 120 ms.
  - It handles `q` to quit.
  - The layout follows the terminal width: ≥160 columns → graph + stats; otherwise graph only.

- [ ] **Step 1: Write failing tests:**
  - `watcher returns null when no session` → App frame shows `waiting for a Claude Code session in`.
  - `watcher reads fixture session`: copy `test/fixtures/session/` (one main jsonl + 2 subagents with meta) into a temp project dir. `poll()` gives a state with 3 agents and the correct deduplicated token totals.
  - `watcher picks up appended lines`: append one assistant line, `poll()` again, and the tokens increase.
  - `watcher switches to newer session`.
  - `App at 120 columns hides stats`: the frame doesn't contain `LIMITS`. At 170 columns it does.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Build with `npm run build`.
- [ ] **Step 4:** Run the full suite: `npx vitest run`. Expected: all PASS.
- [ ] **Step 5:** Manual check. Run `node dist/cli.js watch --cwd ~/Hevier` in one pane while running a short Claude session in `~/Hevier` in another. Expected: agents, tokens and the log update live, and the graph shows Explore/general-purpose cards with their real model.
- [ ] **Step 6:** Commit: `feat: live pitwall watch CLI`, including `dist/`.

### Task 10: Plugin packaging — manifests, setup, watch, README

**Files:**
- Create: `.claude-plugin/plugin.json`
  ```json
  {"name": "pitwall",
   "description": "Live terminal dashboard of your Claude Code agents, models, effort and token use",
   "version": "0.1.0",
   "license": "MIT",
   "commands": ["./commands/setup.md", "./commands/watch.md"]}
  ```
  Add `author` and `repository` once the GitHub repo exists.
- Create: `.claude-plugin/marketplace.json`: one plugin, `"source": "./"`, `category: "monitoring"`.
- Create: `commands/setup.md`. Its instructions to Claude:
  1. read `~/.claude/settings.json` → `statusLine`;
  2. copy `${CLAUDE_PLUGIN_ROOT}/bin/statusline-tee.mjs` to `~/.claude/pitwall/bin/`;
  3. **show the user** the exact before and after `statusLine.command`, plus the `config.json` it will write (`wrappedStatusLine` = the old command);
  4. **apply only after a yes**;
  5. explain how to undo it.
- Create: `commands/watch.md`. It prints the exact command `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js watch --cwd <current dir>` and suggests running it in a split pane.
- Create: `README.md`. Contents:
  - what it is;
  - a screenshot placeholder, filled with a real screenshot after Task 9's manual check (demo data only);
  - install (`/plugin marketplace add <user>/pitwall`, `/plugin install pitwall@pitwall`);
  - setup and watch;
  - what each panel means;
  - credits;
  - "phase 2: the team" roadmap.
- Test: `test/manifest.test.ts`

- [ ] **Step 1: Write failing tests:**
  - `plugin.json` parses, has `name === 'pitwall'` and a semver `version`, and every path in `commands` exists.
  - `marketplace.json` lists `pitwall` with `source: './'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Create the files.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all PASS.
- [ ] **Step 5:** Manual install test:
  1. `/plugin marketplace add ~/pitwall`, then `/plugin install pitwall@pitwall`;
  2. run `/pitwall:setup` and confirm it **asks before** changing settings, and that claude-hud still renders afterwards;
  3. run `/pitwall:watch` and confirm it prints a working command;
  4. confirm the LIMITS box fills after the next message.

  Show the user the result before moving on.
- [ ] **Step 6:** Commit: `feat: plugin manifests, setup and watch commands, README`.

---

## After Phase 1

The Phase 2 plan (team: scout/runner/reviewer agents, the `workflow` skill, `/pitwall:on|off`, `/pitwall:ask-opus`, and the read-cap, same-error, review-gate and event-log hooks) gets written next. It builds on what Task 1 found about advisor calls, and it starts with two more spikes from the spec:
- does a plugin `Explore` agent override the built-in one?
- can a PostToolUse hook inject `additionalContext`?
