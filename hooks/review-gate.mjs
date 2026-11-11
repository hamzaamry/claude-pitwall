// Team hook: before main finishes a BIG change, make it run the reviewer first.
//   review-gate.mjs mark  (SubagentStop): when the reviewer stops, remember the change it saw.
//   review-gate.mjs gate  (Stop):         block (exit 2) once per change that was not reviewed.
// It can never loop: it ignores stop_hook_active and blocks each change fingerprint at most once.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendEvent, readInput, readState, teamOn, writeState } from './lib/hook.mjs';

const BIG_FILES = 2;
const BIG_LINES = 30;
const MAX_HASH_BYTES = 1_000_000;

const git = (cwd, args) => execFileSync('git', ['--no-pager', '-c', 'core.quotepath=off', '-C', cwd, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, timeout: 10_000 });

/** What changed since HEAD: tracked diff plus untracked, non-ignored files. null outside git or on any git error. */
export function changeFingerprint(cwd) {
  try {
    git(cwd, ['rev-parse', '--is-inside-work-tree']);
    const numstat = git(cwd, ['diff', 'HEAD', '--numstat']).split('\n').filter(Boolean);
    const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
    let lines = 0;
    for (const l of numstat) { const [a, d] = l.split('\t'); lines += (Number(a) || 0) + (Number(d) || 0); }
    const hash = createHash('sha1').update(git(cwd, ['diff', 'HEAD']));
    for (const f of untracked) {
      try {
        const p = join(cwd, f);
        const size = statSync(p).size;
        const text = size <= MAX_HASH_BYTES ? readFileSync(p, 'utf8') : '';
        lines += text ? text.split('\n').length - 1 : 0;
        hash.update(f).update(String(size)).update(text);
      } catch { /* a file that vanished is not a change we can judge */ }
    }
    return { fingerprint: hash.digest('hex'), files: numstat.length + untracked.length, lines };
  } catch { return null; }
}

export const isBig = (c) => c.files > BIG_FILES || c.lines > BIG_LINES;

const isReviewer = (type) => /(^|:)reviewer$/.test(String(type ?? ''));
const REASON = 'pitwall plugin hook (installed by the user): this is a big change. Run the pitwall:reviewer agent on it before finishing.';

function mark(input) {
  if (!isReviewer(input.agent_type) || !input.session_id) return;
  const c = changeFingerprint(input.cwd || process.cwd());
  if (c) writeState(input.session_id, { ...readState(input.session_id), reviewed: c.fingerprint });
}

/** Returns the reason to block with, or undefined. */
function gate(input) {
  if (!input.session_id || input.stop_hook_active === true || !teamOn(input)) return;
  const c = changeFingerprint(input.cwd || process.cwd());
  if (!c || !isBig(c)) return;
  const state = readState(input.session_id);
  if (c.fingerprint === state.reviewed || c.fingerprint === state.blocked) return;
  writeState(input.session_id, { ...state, blocked: c.fingerprint });
  appendEvent(input.session_id, { t: new Date().toISOString(), event: 'Nudge', session: input.session_id, kind: 'review-gate' });
  return REASON;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let reason;
  try {
    const input = readInput();
    if (process.argv[2] === 'mark') mark(input); else reason = gate(input);
  } catch { reason = undefined; }
  if (reason) { process.stderr.write(reason); process.exit(2); }
  process.exit(0);
}
