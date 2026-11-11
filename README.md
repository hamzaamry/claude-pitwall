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

The stats column needs a terminal at least 160 columns wide; narrower terminals show the graph only.

## Develop

```
npm install
npm test
npm run build   # bundles dist/cli.js (committed, so installs need no build step)
```

## Credits

Ideas for the upcoming team phase come from [yukti](https://github.com/) , lz-advisor and advisor-opus (all MIT). The status line wrapping approach is in the spirit of [claude-hud](https://github.com/jarrodwatts/claude-hud).

## Roadmap

**Phase 2, the team**: Sonnet as main, Haiku scouts and a test runner, the native Opus advisor, an Opus reviewer, hooks that enforce the rules at zero token cost, and `/pitwall:on`/`off`.

## Licence

MIT
