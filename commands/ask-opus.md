---
description: Ask the Opus reviewer a question and see its answer word for word
argument-hint: <question>
---

The question is: $ARGUMENTS

If the question is empty, ask the user what they want to ask, and stop.

Otherwise use the Agent tool with `subagent_type` set to `pitwall:reviewer`. The prompt you send is exactly two parts: a first line `ASK-OPUS:` and then the question above, with any context the question needs (file paths, not file contents).

When the reviewer answers, print its answer word for word. Nothing before it and nothing after it: no summary, no comment, no rewording.
