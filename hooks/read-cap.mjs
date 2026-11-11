// Team hook: a Read with no limit gets a line limit, so main does not pull whole files into its context.
import { resolve, sep } from 'node:path';
import { runHook, teamOn } from './lib/hook.mjs';

const LIMIT = 400;
// Reads that must stay whole: the Read tool turns these into images, pages or notebook cells.
const NOT_TEXT = /\.(pdf|png|jpe?g|gif|webp|ipynb)$/i;

runHook((input) => {
  if (input.tool_name !== 'Read' || !teamOn(input)) return;
  const ti = input.tool_input;
  if (!ti || typeof ti.file_path !== 'string') return;
  // Answering "allow" skips the permission question, so only touch files inside the session folder,
  // where Claude Code would not have asked anyway.
  if (typeof input.cwd !== 'string' || input.cwd === '') return;
  const abs = resolve(input.cwd, ti.file_path);
  if (abs !== input.cwd && !abs.startsWith(input.cwd + sep)) return;
  if (ti.limit !== undefined || ti.pages !== undefined || NOT_TEXT.test(ti.file_path)) return;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'allow',
      updatedInput: { ...ti, limit: LIMIT },
    },
  });
});
