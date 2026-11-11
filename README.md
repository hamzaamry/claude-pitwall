# pitwall

A live terminal dashboard for Claude Code. It shows every agent in your session with its **model**, **effort** and **tokens**, a graph of who is talking to whom, your **limits**, advisor calls, skills used, and where the tokens went.

It only *reads* the transcript files Claude Code already writes. It never changes your session, and needs no API key.

<!-- screenshot: add a real screenshot here (demo data only, no private paths or prompts) -->

## Install

```
/plugin marketplace add <your-github-user>/pitwall
/plugin install pitwall@pitwall
```

## Use

1. Run `/pitwall:watch`. It prints one command. Run that command in a second terminal pane beside your session. Press `q` to quit.
2. Optional: run `/pitwall:setup` to fill the **LIMITS** box. It shows you the exact change to your status line and asks before touching anything. Your current status line (for example claude-hud) keeps working: pitwall's wrapper saves the data and then passes it straight on.

The dashboard follows the newest session in the folder you start it for. To pin one: `--session <id>`. To watch another folder: `--cwd <dir>`.

## What each panel means

- **Header**: the current task (your last prompt), total tokens, elapsed time, and one chip per agent (`name model · effort status tokens`).
- **Graph**: `main` in the middle, every helper agent as a card under it, titled by what it was asked to do and labelled `role · model` (so an `Explore · opus` card shows that a helper is running on the expensive model). A dot travels the wire when main sends a task. Bars are honest: a moving sweep while working, full green when done, full red when failed.
- **Advisor** (left): the native advisor, dimmed as "not configured" until a call is seen. Its advice is encrypted, so calls show 🔒.
- **LIMITS**: context, 5-hour session and weekly usage, with reset times. Needs `/pitwall:setup`.
- **ADVISOR · opus**: advisor calls in plain words.
- **WHERE TOKENS WENT**: an estimate that sorts each turn by the tools it used (coding, reading files, talking, planning, test output).
- **SKILLS**: skills used this session, `●` if used in the last 2 minutes.
- **Log**: what happened, in plain sentences.

Token counts include cached input, so they are bigger than the numbers in your plan's usage meter. They are for comparing agents with each other, not for billing.

The sidebar (limits, advisor, tokens, skills) is full width from 160 columns, narrower from 100, and hidden below 100 so the graph stays readable.

## Develop

```
npm install
npm test
npm run build   # bundles dist/cli.js (committed, so installs need no build step)
```

## Credits

Ideas for the team come from [yukti](https://github.com/) , lz-advisor and advisor-opus (all MIT). The status line wrapping approach is in the spirit of [claude-hud](https://github.com/jarrodwatts/claude-hud).

## The team (phase 2)

The team cuts token use: a cheaper main model does the work, small models do the noisy work, and Opus only gives judgement.

| Role | Model | Job |
|---|---|---|
| main | Sonnet | Talks to you; the only one that edits code. |
| `pitwall:scout` | Haiku | One focused search question each; several in parallel; returns a short `file:line` map. |
| `pitwall:runner` | Haiku | Runs tests, build or lint; returns only the failures. |
| advisor | Opus (Claude Code's native advisor) | Guidance during the work. Claude decides when to call it. |
| `pitwall:reviewer` | Opus | Final review of a big change, and your `/pitwall:ask-opus` questions. Never edits. |

The team is **off by default**. Switch it on per session:

- `/pitwall:on` — starts the team and loads the `workflow` skill.
- `/pitwall:off` — stops it.
- `/pitwall:ask-opus <question>` — asks the Opus reviewer, answer shown word for word.
- `/pitwall:setup` — one-time, asks before each change: LIMITS box, the advisor model, and a cheaper `Explore` agent (a plugin cannot replace the built-in one, so setup installs `~/.claude/agents/Explore.md`).

Hooks (they cost zero tokens, run from `hooks/hooks.json`, and never break your session: any error means they do nothing):

- `event-log` — always on; one line per event in `~/.claude/pitwall/events/<session>.jsonl`, which the dashboard tails.
- `read-cap` — team on only; a Read without a limit gets `limit: 400`, for files inside the project.
- `same-error` — team on only; the same failing Bash result twice nudges Claude to consult the advisor.
- `review-gate` — team on only; a big change (more than 2 files or 30 lines) makes Claude run the reviewer before finishing. It blocks at most once per change and never loops.

The dashboard shows the team live: agent cards with their real model, labelled dots travelling both ways, the advisor's trigger states (`✓ ● ○ next`), reviewer verdicts, and `this task N · target ~2` for advisor and reviewer calls.

How well it works is judged on real work: with the team on, your LIMITS box (5-hour and weekly %) should climb more slowly than with everything on Opus, with the same quality.

## Licence

MIT
