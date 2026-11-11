# pitwall: design

*2026-11-11. Working name; the folder is `~/pitwall`.*

## Intent

A Claude Code plugin that **cuts token usage** without lowering quality, and **shows what every agent is doing** in a live terminal dashboard.

**Why.** The owner runs everything on Opus today. They measured that only ~30% of their tokens go to actual coding. The other ~70% goes to Claude talking, to planning, and to re-reading files. Their own logs showed that every helper agent (Explore, general-purpose) ran on **Opus**, because helpers inherit the main model.

**The idea:**
- a cheaper main model (Sonnet) does the work;
- Haiku does the noisy, mechanical work (searching, running tests);
- Opus only gives judgement:
  - during work, through Claude Code's **native advisor**;
  - for the final review and for questions from the owner, through our own **reviewer** agent.

Hooks enforce the rules for free (zero tokens), and the dashboard makes the whole team visible.

**What makes it different.** Similar plugins exist (yukti, lz-advisor, advisor-opus), and so do browser dashboards (agents-observe, disler's observability). None of them draws a **live terminal graph of agents with per-agent tokens**. None combines Haiku scouts, a test runner that returns only failures, a same-error detector and a review gate enforced by hooks.

## Goals

1. **Phase 1, the dashboard.** It works on any normal Claude Code session, with no other part of the plugin installed, and shows where tokens go.
2. **Phase 2, the team.** Sonnet main, Haiku scouts and runner, the native Opus advisor, an Opus reviewer, hooks, and one workflow skill.
3. Published as a **public GitHub repo** that is also its own plugin marketplace (same layout as `jarrodwatts/claude-hud`). Later it gets submitted to Anthropic's community directory via `clau.de/plugin-directory-submission`.

## Non-goals (decided, do not build)

- A cache of search results.
- An end-of-task "receipt", or cost comparisons in `$`.
- "Waste alerts" boxes.
- A browser or web UI.
- Prompt-based model routing (a classifier that picks a model per prompt).
- Opus as orchestrator or coordinator.
- A "YOU" node in the graph.

## Anti-goals (it fails if…)

- It costs **more** tokens than plain Sonnet on small tasks, because agent overhead outweighs the work.
- Its prompts are bloated. lz-advisor ships 25–45 KB prompt files; each of our agent/skill files should stay small, roughly ≤2 KB, since they are loaded every time.
- Its enforcement traps the owner in loops, for example a Stop hook that blocks forever.
- It claims savings it has not measured.
- The dashboard shows stats the owner cannot act on, or uses jargon labels. The owner rejected "IS OPUS WORTH IT?", "OK/NEED/FIX" codes and raw legends.

## Constraints

- **Environment:** Claude Code ≥ 2.1.322, Linux, a claude.ai subscription (not API billing).
- **The native advisor** is experimental and needs Anthropic's feature flag (telemetry on). With a Sonnet 5.5 main, advisor output is **encrypted**: main reads it, but we cannot.
- **Plugin agents ignore** the `hooks`, `mcpServers` and `permissionMode` frontmatter. Hooks must live in the plugin's `hooks/hooks.json`.
- **Hook inputs carry no token counts.** Tokens come from transcript JSONL files: `transcript_path`, plus `agent_transcript_path` for subagents.
- **The status line is a single setting** and the owner already uses claude-hud there. Their existing status line must keep working.
- **Licence:** MIT. Borrowing from the MIT repos yukti, lz-advisor and advisor-opus is fine, with credit. Do not copy from repos with no licence (disler's).
- **Claude builds it** once the owner approves the implementation plan. The owner reviews and checks the results themselves.
- **Git:** commits never carry Co-Authored-By trailers.

## The design (decided)

### Roles

| Agent | Model · effort | Tools | Job |
|---|---|---|---|
| **main** | sonnet · medium (the owner's session model) | all | Talks to the owner. The **only one that edits code**. Coordinates the others; there is no separate coordinator. |
| **advisor (native)** | opus, via `/advisor opus` / `advisorModel` | none (server-side) | Guidance during work. It sees the full transcript. Triggers: plan check and stuck. Claude decides when to call it; we can only nudge. |
| **scout** | haiku · low | Read, Grep, Glob, WebSearch, WebFetch | One focused question per scout. Several can run **in parallel**, spawned on demand. Returns a short `file:line` map plus a confidence level, ≤15 lines, no prose. Capped tool calls (`maxTurns`). |
| **runner** | haiku · low | Bash, Read | Runs tests, build or lint. Returns **only the failures** (or "all passed" plus counts). |
| **reviewer** | opus · high | Read, Grep, Glob, Bash (read-only use: `git diff`/`git status`), Agent (to spawn scouts) | Final review of the diff against the task, and the `/ask-opus` answers. **Never edits.** Readable output. |

The built-in **Explore** agent also runs on Haiku, via an Explore override installed by the setup command (see Setup).

### Switching the team on (the owner decided)

The team is **off by default**. The owner starts it per session with **`/pitwall:on`**, which loads the `workflow` skill into the session. **`/pitwall:off`** stops it.

The team hooks (read-cap, same-error, review-gate) check a per-session "on" flag and do nothing while the team is off. The event-log hook and the status line wrapper always run, because they cost zero tokens, so the dashboard also works for sessions where the team is off. The header shows `team on` or `team off`.

### Advisor triggers

1. **Plan check.** The workflow skill tells main to consult the advisor after orientation and before the first edit, on big tasks.
2. **Stuck.** A hook detects the **same failing output twice** and injects a message telling main to consult the advisor now.
3. **Final review.** The Stop hook gate makes main run the **reviewer** before finishing a big task.
4. **`/ask-opus <question>`.** The command sends the question to the **reviewer**. The answer is shown to the owner **word for word**.

### Reviewer output contract

The contract is borrowed from lz-advisor and advisor-opus:
- First line: a verdict, `approved` / `needs info` / `fix`.
- Then numbered steps with `file:line`, **≤100 words** in total.
- Anything unverified uses the frame "Assuming X (unverified), do Y".
- "If it's good, say so briefly; don't invent problems."
- `/ask-opus` answers drop the verdict line but keep the brevity.

### Workflow rules (the one skill main uses: `workflow`)

**Size of the task:**
- **Small task** (one obvious change): main works alone, with no agents.
- **Big task:** scouts for orientation, then the advisor plan check, then edits, then the runner for tests, then the reviewer.

**How main behaves:**
- Short replies, no recaps, no narration.
- Read file slices found by scouts; avoid whole files.
- Before the final review, make the work durable: files written, tests run.
- **Disagreement:** if main's evidence contradicts the advisor or the reviewer, it makes **one** reconcile call ("I found X, you said Y, which wins?"). It never silently ignores advice.

### Hooks (all in `hooks/hooks.json`)

| Hook | Event | Does |
|---|---|---|
| event-log | SubagentStart, SubagentStop, PreToolUse, PostToolUse, Stop, UserPromptSubmit | Appends one JSON line per event to a per-session events file the dashboard tails. |
| read-cap | PreToolUse on `Read` with no `limit` | Rewrites the input via `updatedInput` to add a line limit (idea from yukti's cap-read). |
| same-error | PostToolUse on `Bash` | Fingerprints failing output. On the second identical failure it tells main to consult the advisor. |
| review-gate | Stop | If code changed since the last reviewer run **and** the change is "big", it blocks with exit 2 and the reason "run the reviewer first". It respects `stop_hook_active` and blocks **at most once per change**, so it can never loop. |
| advisor budget | PostToolUse / event-log | Counts advisor and reviewer calls per task and shows them on the dashboard. Target ~2 per task. Phase 2 only nudges; no hard block. |

### Commands

- **`/pitwall:ask-opus <question>`**: reviewer answer, shown word for word.
- **`/pitwall:setup`**: **shows the planned changes and asks before applying any of them**:
  - set `advisorModel: "opus"`;
  - suggest `/model sonnet`;
  - install the Explore→haiku override in `~/.claude/agents/`;
  - wrap the existing status line (see Dashboard data).
- **`/pitwall:watch`**: prints the exact command to start the dashboard in a split terminal pane.

### Dashboard (`pitwall watch`)

A separate terminal program, run in its own pane. The approved look is the mockup at https://claude.ai/artifact/2ZTHL3fU5j7Shj8jejyaqK, which uses demo data. The real version draws the same layout with terminal characters.

**Header:**
- `pitwall │ <current task> (team on | team off)`, then tokens and elapsed time.
- One **chip per agent**: `name · model · effort`, live status, tokens. A chip lights up while its agent is active.

**Graph:**
- The **advisor** is a tall left panel showing its triggers (plan check / stuck / final review / /ask-opus, each with a ✓●○ state), its effort, and "on call · never edits code".
- **main** sits centered with its current task.
- Below main: **scout cards titled by the question each scout is answering**, then the **runner** card.
- A dot travels the wires carrying a short message label ("plan · 4 steps", "2 failed", "fix · 2 changes"). The active wire lights up in the sender's colour.
- Progress bars show work: green when done, red when failed.
- Scouts appear when spawned and vanish when finished. The number of cards follows the number of running scouts.
- Every agent shows its effort level.

**Right column:**
- **LIMITS**: context %, 5-hour session % plus reset time, weekly % plus reset time.
- **ADVISOR**: a list of calls in plain words, each as `time · why · result badge`.
  - Native advisor calls show 🔒 instead of the advice text.
  - Reviewer calls show the full verdict as "latest advice".
- **WHERE TOKENS WENT** for the current task: coding / reading files / talking / planning / test output.
- **SKILLS** used this session: ● active, ○ used earlier, plus which agent used each.

**Bottom:** the session log, shown as `time · agent · plain sentence`.

**Labels everywhere are `role · model`**, for example `advisor · opus`.

**Dashboard data sources:**
- **Tokens per agent, models, skills, advisor calls:** the session transcript JSONL plus subagent transcripts. Advisor calls show up as `server_tool_use` blocks named `advisor`, and `usage.iterations` entries of type `advisor_message` (from the API docs). **This needs verifying first.**
- **Live agent starts and stops:** the event-log hook file. In phase 1, before the hooks exist, the dashboard falls back to transcripts only.
- **LIMITS:** the status line JSON (`context_window.used_percentage`, `rate_limits.five_hour` and `rate_limits.seven_day`, each with `used_percentage` and `resets_at`). Our status line wrapper saves each JSON it receives to a file and then **pipes it on to the owner's existing status line command** (claude-hud), so their HUD is unchanged.
- **"Where tokens went":** a heuristic classification of each assistant turn by the tools it used:
  - Edit/Write → coding
  - Read/Grep/Glob → reading
  - test commands → tests
  - text with no tools → talking
  - anything before the first edit with plan-like tools or text → planning

  It is labelled as an estimate in the code; the builder decides the exact rules.

## Calls made after the builder check (Claude's calls; the owner should check them)

- **Phase 1 contents.** Phase 1 = the dashboard, the status line wrapper, and a minimal `/pitwall:setup` that only installs the wrapper (asking first). The dashboard runs from the plugin folder with `node`. `/pitwall:watch` prints the exact command. Publishing to npm (`npx pitwall watch`) is a later step, not phase 1.
- **Measuring savings.** The dashboard has **no** comparison or baseline feature, because the owner explicitly rejected receipts and comparisons. Success is judged by the owner: on similar work, the LIMITS box (5h and weekly %) climbs more slowly than it used to with all-Opus. Raw tokens per agent stay visible for diagnosis.
- **Mockup specifics** (the builder can't open the link):
  - Dark theme. Colours: main `#f0883e`, advisor `#d2a8ff`, scouts `#79c0ff`, runner `#56d4dd`, done `#3fb950`, failed `#f85149`, warning `#d29922`, dim text `#6e7681`.
  - Layout: the graph on the left, a ~40-column stats column on the right, the session log at the bottom.
  - Target terminal ≥160×45. Below that, hide the right column first, then shorten the labels.
  - The written description is the spec. The mockup is a style reference, not something to match pixel for pixel.
- **Wire labels cost nothing.** They are parsed, never summarised by a model:
  - the Agent tool's `description` field (task → agent);
  - the runner's first output line;
  - the reviewer's verdict line;
  - a native advisor call shows "advice 🔒".
- **Phase 1 graph with non-team agents.** Any subagent is drawn as a card under main, titled by its `description` and labelled with its real type and model (e.g. `Explore · opus`), which shows the waste. The advisor panel appears dimmed as "not configured" until native advisor calls are seen.

## Left to the builder

- Language and TUI library. Default suggestion: TypeScript + Ink, because the owner knows React (Hevier) and claude-hud is TypeScript.
- File layout inside the repo, beyond the standard plugin layout (`.claude-plugin/plugin.json`, `marketplace.json`, `agents/`, `skills/`, `commands/`, `hooks/`).
- Exact thresholds:
  - read-cap line count
  - what counts as a "big" change for the review gate (default: >30 changed lines or >2 files)
  - scout `maxTurns`
  - the same-error fingerprint method
- Exact prompt wording. It must respect the output contracts above and the ~2 KB size budget.
- The format and location of the events file, e.g. `~/.claude/pitwall/<session_id>.jsonl`.

## Verify early (assumptions that could change the build)

1. A Sonnet-main transcript really records native advisor calls (`server_tool_use` name `advisor`, `advisor_message` usage). Without that, the advisor panel can only show the reviewer.
2. A **plugin** agent named `Explore` does *not* override the built-in one (the docs only mention project/user agents). If that's confirmed, setup must install the override into `~/.claude/agents/`.
3. PostToolUse hooks can inject a message to main (`additionalContext`) for the same-error nudge.
4. Whether the dashboard can tell which task is "current". Default: the last user prompt, shortened.

## Success

- **Phase 1:**
  - The dashboard runs beside a normal session and shows agents, models, effort, tokens per agent, limits, skills and the token breakdown, all with real numbers.
  - The owner's claude-hud keeps working.
- **Phase 2:**
  - On a few real Hevier tasks, the dashboard shows lower total tokens per task than the owner's current all-Opus way of working, with equal quality judged by the owner.
  - No loops.
  - Small tasks show no agent overhead.
