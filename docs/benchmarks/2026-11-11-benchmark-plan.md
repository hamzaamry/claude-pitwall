# pitwall benchmark: same real task, single model vs the team

Written 2026-11-11, to run after the weekly usage reset (~2026-11-14). Start a new Claude Code session in `~/pitwall` and say: "run the benchmark plan in docs/benchmarks/2026-11-11-benchmark-plan.md".

## Goal

Does pitwall finish a real task **as well** as working alone with Opus, for **less** usage? If yes, the results table and the dashboard screenshots go in the README as proof. If no, we publish what we found anyway and fix pitwall. Either result is useful, and we don't run things again until we get the answer we want.

## What we already know (2026-11-11, from transcripts, no runs)

- Scouts work: ~$0.003 per search on Haiku, against ~$0.02–0.03 for one main turn.
- The native advisor was called **once ever** (a test spike), never in real work.
- The reviewer ran on an empty diff: $0.07, 14% of that session.
- Main starts every turn with ~50k tokens of fixed context; a scout starts with 7k.

## The task

**Hevier issue #24, the CSV import fix.** It is real work we already did, so a merged answer exists (`e1fb0ca`). It is a Node script, testable in the terminal with no phone. It is medium-sized: the merged fix touched 12 files, +784 −110 lines.

The original build is **not** a usable baseline: it was spread over 3 long Opus sessions mixed with PR reviews (~$54 together). Both runs are therefore done fresh with the same prompt.

## Runs

| Run | Start command | Then |
|---|---|---|
| **A1** single model (how the user works today) | `claude --model opus` | paste the prompt |
| **B1** pitwall team (plugin as it is, v0.2.x) | `claude --model sonnet --advisor opus` | `/pitwall:on`, then paste the prompt |
| A2, B2 (if usage allows) | same | same |
| C1 (optional) Sonnet alone | `claude --model sonnet` | paste the prompt |

- Each run gets its own folder: `bench/setup-import.sh A1`, then `cd ~/pitwall-bench/A1` and start Claude there. Each folder is a fresh git repo with one commit (the code before the fix), so the real fix can't be found in its history.
- C1 separates the two effects: "cheaper model" (C vs A) and "the team" (B vs C).
- One run per arm is an anecdote. The README claim must say how many runs there were. Prefer 2 per arm.
- Run them one after another, never in parallel, and use effort settings as normal (don't tune them for the test).
- The run talks to nobody. If it asks a question, answer `your call, keep going`, the same for every run, and note it.

## The prompt (identical for every run, paste as is)

```
Fix the Hevy CSV importer (scripts/import-csv.ts and scripts/import/). Run it with: npx tsx scripts/import-csv.ts <workouts.csv> <out.db>

Problems:
1. Pounds exports: for imperial accounts Hevy writes weight_lbs and distance_miles instead of weight_kg and distance_km. The importer crashes on them. Convert them to kg and km.
2. One bad row (for example a date that cannot be read) kills the whole import. Skip bad rows instead, import the rest, and print each skipped row's number and the reason.
3. An empty CSV, or one where most rows cannot be read, writes an empty database with exit code 0, which load-device.sh then pushes over the phone's real data. In that case exit with code 1 and write nothing.
4. Dates have no time zone and are read with new Date(value), which depends on the machine. Read them in a named time zone: the HEVIER_TIMEZONE environment variable if it is set, otherwise the machine's zone.

Add tests for each case. Before finishing, run npx vitest run scripts. Ignore the full-project typecheck (npx tsc): it has unrelated errors from this folder's dependency setup. Do not commit.
```

## Measuring each run

1. **Score**: `node ~/pitwall/bench/grade-import.mjs ~/pitwall-bench/<run>`. Six black-box checks taken from the issue: metric import still works, lbs/miles converted, one bad row skipped and named, empty file exits 1 with nothing written, unreadable file the same, `HEVIER_TIMEZONE` honoured. Checked: merged fix 6/6, code before the fix 2/6.
2. **Own tests**: `cd ~/pitwall-bench/<run> && npx vitest run scripts`. Pass/fail and the number of tests.
3. **Cost**: `python3 ~/pitwall/bench/cost.py ~/.claude/projects/-home-teacup-pitwall-bench-<run>/`. Prints a per-agent table (model, turns, tokens, $, share), elapsed minutes, main turns and native advisor calls.
4. **Diff**: `git -C ~/pitwall-bench/<run> diff --stat` (plus untracked files from `git status --short`). Compare its size with the merged fix.
5. **Usage**: write down the 5h and weekly % from the status line before and after each run.
6. **Behaviour notes for the team runs**: did scouts replace main's own searching? Did the runner and reviewer run, and when? Did the plan check happen?

## Screenshots (the proof)

Taken by the user, saved to `~/Pictures/Screenshots`, then copied to `docs/benchmarks/img/`:

- For B runs, `pitwall watch --cwd ~/pitwall-bench/<run>` is open in a second terminal next to the Claude terminal. A runs get no dashboard.
- B runs: one screenshot mid-run (scouts working) and one at the end (all agents done, log, where tokens went).
- The grader output for each run.
- A final side-by-side table (below) rendered in the README.

Licensed or personal data stays out: the bench folders only hold the fixture CSVs and code.

## Results table (fill in)

| Run | Score /6 | Own tests | Cost | Main turns | Minutes | Weekly % used | Notes |
|---|---|---|---|---|---|---|---|
| A1 opus alone | 6/6 (grader fixed) | 58 pass | $1.33 | 18 | 5.7 | ran in parallel | *prints "line 7", grader wants "row 7" |
| B1 pitwall | 6/6 | 57 pass | $0.98 (reviewer $0.28) | 22 | 4.8 | ran in parallel | 0 scouts, 0 runner, 0 advisor calls; main searched itself |
| A2 | | | | | | | |
| B2 pitwall v0.3 | 6/6 | 49 pass | $1.58 (main $1.01, reviewer x3 $0.56, haiku $0.01) | 34 | 5.1 | alone | main-guard on; 24 small Edits; review-gate fired 3x |
| B3 pitwall v0.3 + fixes | 6/6 | 57 pass | $1.07 (main $0.82, reviewer x1 $0.24, haiku $0.014) | 22 | 4.8 | alone | foreground helpers: 0 waiting turns (B2: 12); one reviewer continued via SendMessage |
| C1 sonnet alone | | | | | | | |

**Verdict rule, decided before running:** pitwall "wins" only if its score is at least the A score on every run pair **and** its cost is lower. A lower cost with a lower score is a loss, not a trade-off we advertise.

## Usage safety

- After the reset, check the weekly % first. Stop starting new runs if the weekly usage is over 60% or the 5h window is over 70%.
- Expected cost: A ~$2–5, B ~$1–2 per run (API-equivalent).
- Never run two at once.

## After the runs

1. Fill in the table, show the user both diffs (`xdg-open` or IntelliJ) and the screenshots before any conclusion.
2. If pitwall wins: add the table and screenshots to the README under "Benchmark", with the task, the number of runs, and the caveats (one task, a small number of runs).
3. Either way, use what the runs show to choose among the planned changes: plan check by hook (using the reviewer), skipping the reviewer on small or empty diffs, scouts doing all searching, runner only for long output, the dashboard showing cost share instead of raw tokens, and a context diet in `/pitwall:setup`. Then rerun B as **B'** with the improved plugin, same prompt, same grader.
4. Clean up: `rm -rf ~/pitwall-bench` once the numbers and screenshots are saved.

## Files

- `bench/setup-import.sh <run>`: creates the clean run folder (fresh git repo at `e1fb0ca^`, `node_modules` linked from `~/Hevier/apps/mobile`).
- `bench/grade-import.mjs <folder>`: the black-box grader (pins `tsx@4.19.2` through npx).
- `bench/cost.py <session.jsonl | project folder>`: the per-agent cost table.
