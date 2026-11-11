// Shared by every pitwall hook script. No dependencies, so hooks run straight from the plugin folder.
// A hook may never break the user's session: every failure here is swallowed.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const pitwallHome = () => process.env.PITWALL_HOME || join(homedir(), '.claude', 'pitwall');

/** Hook input from stdin; {} on anything that is not a JSON object. */
export function readInput() {
  try {
    const v = JSON.parse(readFileSync(0, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

const safe = (s) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '');

/** The team on/off flag is per session: the key is the session id (verified in docs/notes/verify-team.md). */
export const teamKey = (input) => safe(input?.session_id);
export const teamFlagPath = (key, home = pitwallHome()) => join(home, 'team', key);
export function teamOn(input, home = pitwallHome()) {
  const key = teamKey(input);
  return key !== '' && existsSync(teamFlagPath(key, home));
}

export const statePath = (sessionId, home = pitwallHome()) => join(home, 'state', `${safe(sessionId)}.json`);

export function readState(sessionId, home = pitwallHome()) {
  try {
    const v = JSON.parse(readFileSync(statePath(sessionId, home), 'utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

export function writeState(sessionId, state, home = pitwallHome()) {
  try {
    const file = statePath(sessionId, home);
    mkdirSync(join(home, 'state'), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, file);
  } catch { /* a hook must not fail over its own bookkeeping */ }
}

/** One JSON line per event, in one append call so parallel writers do not interleave. */
export function appendEvent(sessionId, event, home = pitwallHome()) {
  try {
    const id = safe(sessionId);
    if (!id) return;
    mkdirSync(join(home, 'events'), { recursive: true });
    appendFileSync(join(home, 'events', `${id}.jsonl`), JSON.stringify(event) + '\n');
  } catch { /* see above */ }
}

/** Runs a hook: reads input, runs fn, prints its result, and always exits 0. */
export function runHook(fn) {
  let out = '';
  try {
    const result = fn(readInput());
    if (typeof result === 'string') out = result;
  } catch { out = ''; }
  if (out) process.stdout.write(out);
  process.exit(0);
}
