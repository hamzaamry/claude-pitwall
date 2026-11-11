# pitwall Phase 2 (the team) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut token use without lowering quality. A Sonnet main uses Haiku scouts and a Haiku test runner, the native Opus advisor, and an Opus reviewer. Zero-token hooks enforce the rules. The phase 1 dashboard shows the whole team live.

**Architecture:** Plugin files do the work: three agents, one `workflow` skill, commands, and plain-Node hook scripts registered in `hooks/hooks.json`. The team is off by default and switched per session by a flag file; team hooks do nothing while it is off. One always-on hook (`event-log`) appends one JSON line per event to `~/.claude/pitwall/events/<session>.jsonl`. The dashboard tails that file next to the transcripts it already reads, which makes agent start/stop exact and adds the reviewer, the nudges and the advisor budget.

**Tech Stack:** Same as phase 1 (Node ≥ 20, TypeScript 5.6, Ink 5, vitest 2). Hook scripts are plain `.mjs` with no dependencies, so they run straight from the plugin folder. Agents, skill and commands are Markdown.

**Spec:** `docs/superpowers/specs/2026-11-11-pitwall-design.md` (sections: Roles, Switching the team on, Advisor triggers, Reviewer output contract, Workflow rules, Hooks, Commands, Dashboard).
**Phase 1 plan and notes:** `docs/superpowers/plans/2026-11-11-pitwall-phase1-dashboard.md`, `docs/notes/verify-advisor.md`.

## Global Constraints

- Repo root `~/pitwall`. **Never push. Never add Co-Authored-By trailers.** One commit per task.
- Claude Code ≥ 2.1.322, Linux, claude.ai subscription (no API key, no API billing, no calls to outside services).
- Each agent file and the skill file is **≤ 2048 bytes** (loaded every time). A test enforces it.
- Plugin agents **ignore** the `hooks`, `mcpServers` and `permissionMode` frontmatter. Hooks live only in `hooks/hooks.json`.
- Hook inputs carry **no token counts**; tokens come from transcripts as in phase 1.
- Roles, exactly (from the spec): main = sonnet · medium, the only one that edits code. advisor = native, opus. scout = haiku · low, tools Read, Grep, Glob, WebSearch, WebFetch, capped `maxTurns`, returns ≤ 15 lines of `file:line` plus a confidence level. runner = haiku · low, tools Bash, Read, returns only failures or "all passed" plus counts. reviewer = opus · high, tools Read, Grep, Glob, Bash (read-only use) and Agent, never edits.
- Reviewer output contract: first line `approved` / `needs info` / `fix`; then numbered steps with `file:line`, ≤ 100 words in total; unverified claims use "Assuming X (unverified), do Y"; "If it's good, say so briefly; don't invent problems." `/pitwall:ask-opus` answers drop the verdict line, keep the brevity, and are shown **word for word**.
- Team hooks (read-cap, same-error, review-gate) check the per-session flag and do nothing while the team is off. `event-log` and the status line wrapper always run.
- **Every hook fails open**: any error, bad input or missing file gives exit 0 and no output. A hook may never block or break the user's session.
- **No loops**: the review gate blocks at most once per change, and respects `stop_hook_active`.
- Settings changes (`advisorModel`, Explore override, status line) are shown exactly and applied only after a yes. Never touch the user's `~/.claude/settings.json` without that.
- Labels are `role · model`. Colours as in phase 1 (`src/ui/theme.ts`). No `$` costs, no receipt, no baseline or comparison feature, no waste alerts, no YOU node, no search-result cache, no prompt-based model routing, no Opus orchestrator, no browser UI.
- Thresholds (builder's choice, fixed here): read-cap `limit` = 400 lines; scout `maxTurns` = 12; runner `maxTurns` = 8; reviewer `maxTurns` = 20; a change is "big" when it touches more than 2 files or more than 30 changed lines.
- Events file: `${PITWALL_HOME:-~/.claude/pitwall}/events/<session_id>.jsonl`. Team flag: `${PITWALL_HOME}/team/<teamKey>` (a file that exists means on). Per-session hook state: `${PITWALL_HOME}/state/<session_id>.json`.

## Review Focus

1. **Hooks fail open.** Garbage or empty stdin, a missing or unwritable `PITWALL_HOME`, a crash inside the script: exit 0, no stdout, never a block. (Tasks 2, 3, 8, 9, 10)
2. **The review gate never loops.** It blocks once per change fingerprint, ignores `stop_hook_active`, stays quiet outside a git repo or on a small change, and the reviewer's own stop does not trigger it. (Task 10)
3. **Team off means silent, and the dashboard never depends on the plugin.** With the flag off the three team hooks print nothing. The dashboard still works with no events file, a half-written last line, or an events file from another session. (Tasks 3, 4)
4. **read-cap must not break Reads that should stay whole.** A Read that already has `limit` or `pages`, and non-text files (images, PDF, notebooks), are never touched. (Task 8)
5. **Same-error fingerprints survive noise, sessions don't mix.** Timestamps, durations, temp paths and numbers in an error must not make the same error look different; two sessions or a parallel subagent writing at once must not corrupt each other's files. (Tasks 3, 9)

---

### Task 1: Spikes. What does Claude Code really do with agents, hooks and commands?

These decide Tasks 5 to 10. They cost a few short `claude -p` runs. Run them from a scratch dir with `claude --plugin-dir ~/pitwall` (a throwaway test plugin folder under the scratchpad is fine), never in the user's repos. **Show the user the findings before starting Task 2.**

**Files:**
- Create: `docs/notes/verify-team.md`

- [ ] **Step 1: Agent frontmatter.** Create a test plugin with an agent that sets `model: haiku`, `effort: low`, `maxTurns: 2` and `tools: Read, Grep`. Run it through `claude -p`. Open the subagent transcript and its `.meta.json`. Record: which of those keys are honoured (model and effort seen in the transcript, `maxTurns` cut-off, tool restriction), the exact key names, and how the plugin agent is named in `agentType` (for example `pitwall:scout`).
- [ ] **Step 2: Explore override.** Add a plugin agent named `Explore` with `model: haiku`. Spawn an `Explore` agent and record which model ran. If the built-in one still runs, repeat with the same file in `~/.claude/agents/` of a scratch `CLAUDE_CONFIG_DIR`, and record that result.
- [ ] **Step 3: Hook inputs and outputs.** In the test plugin register hooks that dump their stdin to a file for `PreToolUse` (Read), `PostToolUse` (Bash, after a failing command), `Stop`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`. Record the exact input field names (session id, cwd, transcript path, `agent_id`, `agent_type`, `agent_transcript_path`, `stop_hook_active`, the failing Bash `tool_response` shape including any exit code), and whether a hook's `agent_id` equals the subagent file key phase 1 uses (the part of `agent-<id>.jsonl` after `agent-`). Then record whether each of these works: PreToolUse JSON `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{…}}}` changes a Read; PostToolUse `additionalContext` reaches the model; Stop with exit 2 and a stderr reason makes main continue; `${CLAUDE_PLUGIN_ROOT}` expands in `command`.
- [ ] **Step 4: Commands and session id.** Record whether a plugin command can learn the current session id (an environment variable, or a placeholder in the command text). If it cannot, record the best stable key the hooks and the command both see (the hooks' `cwd`).
- [ ] **Step 5:** Write `verify-team.md` with one section per step, the exact field names, and one redacted example per hook input. End with a **Decisions** list: `teamKey` source (session id or cwd), whether setup must install the Explore override, whether PostToolUse nudges and read-cap rewriting work. Expected: Tasks 2 to 10 can copy field names from this file.
- [ ] **Step 6:** Commit `docs: verify team plugin behaviour (spike)`.

### Task 2: Hook runtime library

**Files:**
- Create: `hooks/lib/hook.mjs`
- Test: `test/hooks/lib.test.ts`

**Interfaces:**
- Produces, in `hooks/lib/hook.mjs` (no dependencies):
  - `pitwallHome(): string` — `PITWALL_HOME` or `~/.claude/pitwall`.
  - `readInput(): Record<string, any>` — stdin as JSON, `{}` on anything bad.
  - `teamKey(input): string` — the key chosen in Task 1 (session id, or cwd slug).
  - `teamOn(input, home = pitwallHome()): boolean` — flag file exists.
  - `statePath(sessionId, home?): string`, `readState(sessionId, home?): object`, `writeState(sessionId, state, home?): void` (atomic temp + rename, swallow errors).
  - `appendEvent(sessionId, event: PitwallEvent, home?): void` — one `JSON.stringify` line plus `\n` via a single append (atomic enough for parallel writers), swallow errors.
  - `runHook(fn: (input) => string | void): never` — reads input, runs `fn` in try/catch, prints the returned string to stdout, always exits 0.
  - `type PitwallEvent = { t: string; event: string; session: string; agent?: string; agentType?: string; tool?: string; description?: string; detail?: string; kind?: string }`.

- [ ] **Step 1: Write failing tests** (spawn a tiny `.mjs` that imports the lib, as the tee tests do):
  - `runHook swallows a throwing hook`: exit 0, empty stdout.
  - `runHook prints what the hook returns`.
  - `readInput returns {} for empty and for invalid JSON`.
  - `teamOn is false without the flag file and true with it` (temp `PITWALL_HOME`).
  - `teamKey is stable for the same input and differs for two sessions`.
  - `appendEvent survives an unwritable dir`.
  - `appendEvent from 20 parallel processes gives 20 intact lines`.
  - `writeState then readState round-trips; readState of a missing or corrupt file gives {}`.
- [ ] **Step 2:** Run `npx vitest run test/hooks/lib.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the library.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit `feat: hook runtime library`.

### Task 3: event-log hook + `hooks/hooks.json`

**Files:**
- Create: `hooks/event-log.mjs`, `hooks/hooks.json`
- Test: `test/hooks/event-log.test.ts`

**Interfaces:**
- Consumes: `runHook`, `readInput`, `appendEvent`, `PitwallEvent` (Task 2).
- Produces: `hooks/hooks.json` registering `event-log.mjs` for `SubagentStart`, `SubagentStop`, `PreToolUse`, `PostToolUse`, `Stop`, `UserPromptSubmit`, each as `{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}/hooks/event-log.mjs\""}`. Later tasks add their own entries to this file.
  - One event line per call, in the shape of `PitwallEvent`. `description` comes from the Agent tool's `description`; `agentType` from the hook input's agent type; `detail` is the first 120 characters of a prompt (`UserPromptSubmit`), one line.
  - Always runs, whether the team is on or off.

- [ ] **Step 1: Write failing tests** (spawn the script with sample inputs copied from `verify-team.md`):
  - one test per event name: a line with `event`, `session`, and the right extra fields is appended to `events/<session>.jsonl`.
  - `runs with the team off` (no flag file): still logs.
  - `a prompt with newlines is stored on one line, max 120 chars`.
  - `invalid JSON input, no session id, unwritable home`: exit 0, no stdout, no crash.
  - `hooks.json parses and every command path exists in the repo`, and `lists event-log for all six events`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `event-log.mjs` and `hooks.json`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: event-log hook`.

### Task 4: The dashboard reads the events file and the team flag

**Files:**
- Create: `src/events.ts`, `src/team.ts`
- Modify: `src/watcher.ts`, `src/model/state.ts`, `src/model/reduce.ts`, `src/App.tsx`
- Test: `test/events.test.ts`, `test/team.test.ts`, `test/watcher.test.ts` (extend)

**Interfaces:**
- Consumes: `PitwallEvent` shape (Task 3), `FileTail` (phase 1), `registerSubagent`.
- Produces:
  - `src/team.ts`: `teamKey(input: { sessionId?: string; cwd?: string }): string`, `teamFlagPath(key, home?): string`, `isTeamOn(key, home?): boolean`. A contract test imports `hooks/lib/hook.mjs` and asserts both sides give the same key and path.
  - `src/events.ts`: `parseEvent(line: string): PitwallEvent | null`; `applyPitwallEvent(s: SessionState, e: PitwallEvent): void`:
    - `SubagentStart` makes (or finds) the agent card, status `working`, title from `description`, role from `agentType`.
    - `SubagentStop` sets `done` (not over `failed`) with a log line.
    - `Nudge` events set `s.nudges[kind] = time` (used in Task 13).
  - `SessionState` gains `teamOn?: boolean` and `nudges: Record<string, string>`. `Header` receives `teamOn={state.teamOn}`.
  - `SessionWatcher` tails the session's events file next to the transcripts, applies its events, and sets `state.teamOn` from the flag **only when an events file exists** (so a session without the plugin shows no team pill, as in phase 1).

- [ ] **Step 1: Write failing tests:**
  - `team: key and path agree with the hook library` (contract test).
  - `parseEvent` returns null for invalid JSON and unknown shapes.
  - `SubagentStart/Stop` give a working then done card; a stop after `failed` stays failed.
  - watcher: no events file gives `teamOn === undefined`; an events file plus no flag gives `false`; with the flag `true`.
  - watcher: a half-written last events line is buffered; events of another session id are ignored; the missing events dir never throws.
  - App at 170 columns shows `[team on]` with the flag, `[team off]` with events and no flag, and no pill with no events file.
- [ ] **Step 2:** Run `npx vitest run test/events.test.ts test/team.test.ts test/watcher.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full suite. Expected: all PASS.
- [ ] **Step 5:** Commit `feat: dashboard reads the events file and team flag`.

### Task 5: The three agents

**Files:**
- Create: `agents/scout.md`, `agents/runner.md`, `agents/reviewer.md`
- Test: `test/agents.test.ts`

**Interfaces:**
- Produces: three agent files with YAML frontmatter using the key names found in Task 1: `name`, `description`, `model`, `effort`, `tools`, `maxTurns`.
  - scout: `haiku`, effort `low`, tools `Read, Grep, Glob, WebSearch, WebFetch`, `maxTurns: 12`. Body: one question, answer is a `file:line` map with a one-line note each, ≤ 15 lines, ends with `confidence: high|medium|low`, no prose, no file contents.
  - runner: `haiku`, effort `low`, tools `Bash, Read`, `maxTurns: 8`. Body: run the given command; reply with the first line `all passed` plus counts, or `N failed`, then only the failing tests with their error lines (≤ 30 lines). No edits.
  - reviewer: `opus`, effort `high`, tools `Read, Grep, Glob, Bash, Agent`, `maxTurns: 20`. Body: the output contract from Global Constraints; Bash only for `git diff` / `git status` / `git log`; never edits; for `/pitwall:ask-opus` questions, no verdict line.

- [ ] **Step 1: Write failing tests:**
  - every agent file is ≤ 2048 bytes.
  - frontmatter parses; `model`, `tools`, `maxTurns` match the values above; `scout` has no `Bash`, `Edit` or `Write`; `reviewer` has no `Edit` or `Write`.
  - the reviewer body contains `approved`, `needs info`, `fix`, `file:line`, `100 words` and `unverified`.
  - the runner body says it returns only failures.
- [ ] **Step 2:** Run `npx vitest run test/agents.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the three files.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: scout, runner and reviewer agents`.

### Task 6: The `workflow` skill

**Files:**
- Create: `skills/workflow/SKILL.md`
- Test: `test/skill.test.ts`

**Interfaces:**
- Produces: a skill named `workflow` (≤ 2048 bytes) that tells main:
  - small task (one obvious change): work alone, no agents;
  - big task: scouts (several in parallel, one question each), then the advisor plan check before the first edit, then edits, then the runner for tests, then the reviewer;
  - short replies, no recaps, no narration; read slices that scouts found, not whole files; make work durable (files written, tests run) before the final review;
  - disagreement: if main's evidence contradicts the advisor or the reviewer, make **one** reconcile call ("I found X, you said Y, which wins?") and never silently ignore advice;
  - agent names to use: `pitwall:scout`, `pitwall:runner`, `pitwall:reviewer` (as found in Task 1).

- [ ] **Step 1: Write failing tests:** size ≤ 2048 bytes; frontmatter has `name: workflow` and a `description`; the body contains `scout`, `runner`, `reviewer`, `advisor`, `one reconcile call`, `small`, and `big`.
- [ ] **Step 2:** Run `npx vitest run test/skill.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the skill.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: workflow skill`.

### Task 7: Commands `on`, `off`, `ask-opus`, and setup

**Files:**
- Create: `commands/on.md`, `commands/off.md`, `commands/ask-opus.md`
- Modify: `commands/setup.md`, `.claude-plugin/plugin.json`
- Test: `test/manifest.test.ts` (extend)

**Interfaces:**
- Produces:
  - `/pitwall:on`: creates the flag file for the current `teamKey` (a `node -e` one-liner or `mkdir -p` + `touch`, using the key method from Task 1), then loads the `workflow` skill and says in one line that the team is on. `/pitwall:off` deletes the flag and says so. Both are idempotent.
  - `/pitwall:ask-opus <question>`: sends the question to the `pitwall:reviewer` agent (no verdict line) and prints the answer **word for word**, with no summary or comment from main. The prompt it sends to the reviewer starts with the fixed first line `ASK-OPUS:` (Task 11 reads it to tell an ask-opus call from a final review).
  - `setup.md` gains the phase 2 steps. Each is **shown exactly and applied only after a yes**: set `advisorModel` to `opus` in `~/.claude/settings.json`; suggest `/model sonnet` (never set it); install `~/.claude/agents/Explore.md` with `model: haiku` **only if Task 1 found a plugin `Explore` does not override the built-in one**; keep the existing status line step from phase 1. It also explains how to undo each change.
  - `plugin.json`: version `0.2.0`; `commands` lists all five command files.

- [ ] **Step 1: Write failing tests:** every command path in `plugin.json` exists; `on.md` mentions the flag path and `workflow`; `off.md` mentions removing the flag; `ask-opus.md` mentions `pitwall:reviewer`, `word for word` and the `ASK-OPUS:` first line; `setup.md` mentions `advisorModel`, `asks`/`yes`, and does not set the model by itself (`/model sonnet` appears only as a suggestion); version is semver.
- [ ] **Step 2:** Run `npx vitest run test/manifest.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the commands and update the manifest.
- [ ] **Step 4:** Run the full suite. Expected: all PASS.
- [ ] **Step 5:** Commit `feat: team commands and extended setup`.

### Task 8: read-cap hook

**Files:**
- Create: `hooks/read-cap.mjs`
- Modify: `hooks/hooks.json` (add `PreToolUse`, matcher `Read`)
- Test: `test/hooks/read-cap.test.ts`

**Interfaces:**
- Consumes: `runHook`, `teamOn` (Task 2). Output format from Task 1 (`hookSpecificOutput` with `permissionDecision: "allow"` and `updatedInput`).
- Produces: with the team on and a Read of a text file that has no `limit` and no `pages`, prints `updatedInput` equal to the original input plus `limit: 400`. Anything else prints nothing.

- [ ] **Step 1: Write failing tests:**
  - team on, `{file_path: 'a.ts'}` → `updatedInput` has `file_path: 'a.ts'` and `limit: 400`.
  - `offset` is kept: `{file_path, offset: 10}` → same `offset`, `limit: 400`.
  - already has `limit` → no output.
  - has `pages` or is `.pdf`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.ipynb` → no output.
  - team off → no output; bad JSON, no `file_path` → no output, exit 0.
- [ ] **Step 2:** Run `npx vitest run test/hooks/read-cap.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and register in `hooks.json`.
- [ ] **Step 4:** Run the tests and the `hooks.json` test from Task 3. Expected: PASS.
- [ ] **Step 5:** Commit `feat: read-cap hook`.

### Task 9: same-error hook

**Files:**
- Create: `hooks/same-error.mjs`
- Modify: `hooks/hooks.json` (add `PostToolUse`, matcher `Bash`)
- Test: `test/hooks/same-error.test.ts`

**Interfaces:**
- Consumes: `runHook`, `teamOn`, `readState`, `writeState`, `appendEvent` (Task 2); failing-Bash shape from Task 1.
- Produces:
  - `fingerprint(output: string): string` exported from `hooks/same-error.mjs`: the last 5 non-empty lines with digit runs, hex ids, ISO times, durations (`1.2s`, `35ms`), and temp paths (`/tmp/...`) replaced by placeholders, then a sha1.
  - On a failing Bash in a team-on session, the state keeps `errors: { [fingerprint]: count }`. The **second** time the same fingerprint appears, the hook prints `additionalContext`: `Same failure twice. Consult your advisor now before another attempt.`, appends a `Nudge` event with `kind: 'same-error'`, and never nudges that fingerprint again. A success or a different error prints nothing.

- [ ] **Step 1: Write failing tests:**
  - `fingerprint` is equal for the same error with different timestamps, durations, temp paths and numbers, and different for a different error message.
  - first failure: no output; second identical failure: one `additionalContext` output and one `Nudge` event line; third: no output.
  - a passing command, team off, bad input, unwritable state dir: no output, exit 0.
  - two sessions with the same error do not share counts.
- [ ] **Step 2:** Run `npx vitest run test/hooks/same-error.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and register.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: same-error hook`.

### Task 10: review-gate hook

**Files:**
- Create: `hooks/review-gate.mjs`
- Modify: `hooks/hooks.json` (add `Stop` and `SubagentStop`)
- Test: `test/hooks/review-gate.test.ts` (uses temp git repos)

**Interfaces:**
- Consumes: `runHook`, `teamOn`, `readState`, `writeState`, `appendEvent` (Task 2).
- Produces, in `hooks/review-gate.mjs`:
  - `changeFingerprint(cwd): { fingerprint: string; files: number; lines: number } | null`: from `git diff HEAD --numstat` plus untracked, non-ignored files; `null` outside a git repo or on any git error.
  - `isBig(c): boolean`: more than 2 files or more than 30 lines.
  - Mode `mark` (run on `SubagentStop`): when the stopping agent type is the reviewer, store the current fingerprint as `reviewed`.
  - Mode `gate` (run on `Stop`, team on only): exit 2 with stderr `Run the pitwall:reviewer agent on this change before finishing.` and a `Nudge` event `kind: 'review-gate'` **only when** `stop_hook_active` is false, the change is big, its fingerprint differs from `reviewed`, and it differs from the last blocked fingerprint (stored as `blocked`). Otherwise exit 0 with no output.
  - `hooks.json`: `Stop` runs `review-gate.mjs gate`; `SubagentStop` runs `review-gate.mjs mark`.

- [ ] **Step 1: Write failing tests** (init a temp repo with one commit):
  - small change (1 file, 5 lines): no block.
  - big change (3 files), team on: exit 2 with the reason; the second `Stop` with the same change: exit 0; after another edit: blocks once more.
  - `stop_hook_active: true`: exit 0 even for a big change.
  - after `mark` for the reviewer with the same change: no block; after `mark` for a non-reviewer agent: still blocks.
  - team off: no block; not a git repo, git missing, corrupt state, bad input: exit 0.
  - 31 changed lines in one file counts as big; 30 does not.
- [ ] **Step 2:** Run `npx vitest run test/hooks/review-gate.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and register.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: review-gate hook`.

### Task 11: Reviewer calls, result labels and the advisor budget (state)

**Files:**
- Modify: `src/model/reduce.ts`, `src/model/state.ts`
- Test: `test/reduce.test.ts` (extend)

**Interfaces:**
- Consumes: Agent spawn handling and `toolResult` events from phase 1; `AdvisorCall`.
- Produces:
  - `AdvisorCall` gains `taskNo: number`; `SessionState` gains `triggers: { planCheck: 'todo'|'done'; stuck: 'todo'|'on'|'done'; finalReview: 'todo'|'next'|'done'; askOpus: 'todo'|'done' }`.
  - When the `toolResult` of an Agent call returns, and that agent's role is `pitwall:reviewer` (or ends in `reviewer`): push `{source: 'reviewer', why: 'final review' | 'ask-opus', result: <verdict word of the first line>, text: <result text, one line>, tokens: <that agent's tokens>}`. `why` is `ask-opus` when the spawn prompt starts with the ask-opus marker used by `commands/ask-opus.md` (the command writes a fixed first line, `ASK-OPUS:`).
  - Every result also queues a **return flow** `{from: <agent key>, to: 'main', back: true, label: <first non-empty line of the result, max 24 chars>, color: <agent colour>}`; a native advisor call keeps `advice 🔒`.
  - `triggers`: `planCheck` is `done` once an advisor call happens before the first edit of the task; `stuck` is `on` after a `same-error` nudge and `done` after the next advisor call; `finalReview` is `next` after an edit and `done` after a reviewer call; `askOpus` is `done` after an ask-opus call. A new user prompt resets all four.

- [ ] **Step 1: Write failing tests:**
  - a reviewer result starting `fix` adds a reviewer call with `result: 'fix'` and `text` set; `approved` and `needs info` likewise.
  - a result for a non-reviewer agent adds no advisor call but does queue a return flow labelled with its first line.
  - an `ASK-OPUS:` prompt gives `why: 'ask-opus'` and sets `triggers.askOpus`.
  - `triggers` follow the sequence: advisor before an edit, nudge, advisor, edit, reviewer; and reset on a new prompt.
  - the label is cut to 24 characters and never contains a newline.
- [ ] **Step 2:** Run `npx vitest run test/reduce.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full suite. Expected: all PASS.
- [ ] **Step 5:** Commit `feat: reviewer calls, result labels, advisor triggers in state`.

### Task 12: Return flows and the advisor panel in the UI

**Files:**
- Modify: `src/ui/flowAnim.ts`, `src/ui/Graph.tsx`, `src/ui/Stats.tsx`, `src/model/state.ts` (`Flow.back?: boolean`)
- Test: `test/ui/flowAnim.test.ts`, `test/ui/graph.test.tsx`, `test/ui/stats.test.tsx` (extend)

**Interfaces:**
- Consumes: `state.triggers`, `AdvisorCall.taskNo`, `Flow.back` (Task 11).
- Produces:
  - `stepFlows` matches a `back` flow to the wire whose `to` (or `toolUseId`) equals the flow's `from`, and walks that wire's cells from the card to main.
  - The advisor panel shows each trigger with `✓` done, `●` on, `○` todo, and `next` in the warning colour for `finalReview: 'next'`. It shows `not configured`, `no calls yet`, or the call count as in phase 1.
  - The ADVISOR box shows `this task N · target ~2` using calls of the current `taskNo`; the colour turns warning when N > 2 (a nudge, never a block). Reviewer calls show the verdict badge and their full text as `latest advice`; native calls keep `🔒`.

- [ ] **Step 1: Write failing tests:**
  - a back flow travels from the card end of its wire to the main end, one cell per tick, and is removed at the end.
  - the panel draws `✓`, `●`, `○` and `next` for the matching trigger states.
  - `this task 3 · target ~2` appears with three calls in the current task and is not counted from an older task.
  - a reviewer call shows `[fix]` and its text under `latest advice`.
- [ ] **Step 2:** Run `npx vitest run test/ui`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full suite. Expected: all PASS.
- [ ] **Step 5:** Commit `feat: return flows, trigger states and advisor budget`.

### Task 13: Packaging, docs and the live check

**Files:**
- Modify: `README.md`, `package.json` and both manifests (version `0.2.0`), `dist/` (rebuild)
- Test: `test/manifest.test.ts` (extend)

- [ ] **Step 1: Write failing tests:** `plugin.json`, `marketplace.json` and `package.json` share the version `0.2.0`; `agents/`, `skills/workflow/SKILL.md` and `hooks/hooks.json` exist; every script named in `hooks.json` exists; the README names `/pitwall:on`, `/pitwall:off`, `/pitwall:ask-opus` and says the team is off by default.
- [ ] **Step 2:** Run `npx vitest run`. Expected: FAIL on the new tests.
- [ ] **Step 3:** Update the README (what the team is, how to turn it on, what each hook does in one line, how to undo setup, credits) and the versions; run `npm run build`.
- [ ] **Step 4:** Run `npx vitest run` and `claude plugin validate ~/pitwall`. Expected: all PASS, validation passes.
- [ ] **Step 5: Live check** (a short `claude -p --plugin-dir ~/pitwall` run in a scratch git repo, never the user's repos): turn the team on, run a task that needs two scout questions and one test run. Confirm in the events file and the dashboard: scout cards on `haiku`, the runner card, return-flow labels, the event lines, the read-cap rewriting a Read, and no hook error output. Then **show the user the dashboard (a rendered frame and the exact command) and the events file** before calling phase 2 done.
- [ ] **Step 6:** Commit `feat: pitwall 0.2.0 (the team)`, including `dist/`.

---

## After Phase 2

The owner judges success on real Hevier work: with the team on, the LIMITS box (5-hour and weekly %) should climb more slowly than with all-Opus work, with equal quality, no loops, and no agent overhead on small tasks. Publishing (GitHub repo and the community directory submission) is a separate step.
