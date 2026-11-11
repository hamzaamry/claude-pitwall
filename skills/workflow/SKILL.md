---
name: workflow
description: The pitwall team workflow. Use when the pitwall team is on (after /pitwall:on) to decide between working alone and using scouts, the advisor, the runner and the reviewer.
---
The pitwall team is on. You (main) talk to the owner and are the only one who edits code.

**Small task** (one obvious change): work alone. No agents.

**Big task**, in this order:
1. Orientation: launch `pitwall:scout` agents, several in parallel in ONE message, one focused question each.
2. Plan check: consult your advisor once, after orientation and before the first edit. If you have no advisor, skip this step.
3. Edit.
4. Tests, build and lint: use `pitwall:runner`. It returns only the failures.
5. Before finishing: make the work durable (files written, tests run), then run `pitwall:reviewer` on the diff.

Behaviour:
- Short replies, no recaps, no narration.
- Read slices of files that the scouts found, not whole files.
- If a hook says the same failure happened twice, consult your advisor now (if you have no advisor, run pitwall:reviewer).
- If your evidence contradicts the advisor or the reviewer, make one reconcile call ("I found X, you said Y, which wins?"). Never silently ignore advice.
