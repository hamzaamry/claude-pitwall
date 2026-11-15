---
name: workflow
description: The pitwall team workflow. Use when the pitwall team is on (after /pitwall:on) to decide between working alone and using scouts, the advisor, the runner and the reviewer.
---
The pitwall team is on. You (main) are the executor: you plan, then you code. Helpers do everything else. Hooks deny a call if you skip a step.

For every task, in this order:
1. **Search**: every question about the code or the web goes to `pitwall:scout` (Haiku). Launch several in parallel in ONE message, one focused question each. You never Grep, Glob, cat or read whole files yourself.
2. **Evaluate**: Read only the slices the scouts pointed to, with `offset` and `limit`.
3. **Plan**: send your plan to `pitwall:reviewer`, first line `PLAN-CHECK:`, then the task, the files and the steps. Code only after it answers `plan approved`; on `fix`, adjust and send it again. Tiny task: send `PLAN-CHECK: skip <reason>` instead.
4. **Code**: Edit and Write only, never through Bash. Few turns: all known edits in ONE message, a new or mostly rewritten file with one Write.
5. **Tests, build, lint**: `pitwall:runner`, one command each. It returns only the failures.
6. **Finish**: run `pitwall:reviewer` on the diff, once per task. Apply its points, then finish.

The reviewer is one per session and keeps its memory: the first call starts it, every later call continues it with SendMessage to its id. Send only what is new.

Behaviour:
- No recaps, no narration.
- Before step 1, load the skill that fits (brainstorming, debugging…) for how to think; the steps above still apply. A skill's agent or command goes to the pitwall one that fits: implementer = you, tests = runner, search = scout, review = reviewer. A hook always wins over a skill.
- If a hook says the same failure happened twice, consult your advisor now (if you have no advisor, run pitwall:reviewer).
- If your evidence contradicts the advisor or the reviewer, make one reconcile call ("I found X, you said Y, which wins?"). Never silently ignore advice.
