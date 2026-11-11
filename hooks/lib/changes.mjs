// What changed in a git working tree, as a snapshot that two moments can be compared with.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BIG_FILES = 2;
const BIG_LINES = 30;
const MAX_FILE_BYTES = 1_000_000;
const MAX_UNTRACKED = 2000;

// --no-ext-diff / --no-textconv: never run a tool from the user's git config on every Stop.
const git = (cwd, args) => execFileSync('git', ['--no-pager', '-c', 'core.quotepath=off', '-C', cwd, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, timeout: 10_000 });

const sha = (s) => createHash('sha1').update(s).digest('hex');

/** { [path]: { h: content hash, n: changed lines } } of everything different from HEAD; null outside git or on any error. */
export function snapshot(cwd) {
  try {
    git(cwd, ['rev-parse', '--is-inside-work-tree']);
    const files = {};
    const diff = git(cwd, ['diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--no-color']);
    for (const section of diff.split(/^diff --git /m).filter(Boolean)) {
      const head = section.split('\n', 1)[0];
      const path = head.slice(head.lastIndexOf(' b/') + 3);
      const n = section.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)).length;
      files[path] = { h: sha(section), n };
    }
    for (const f of git(cwd, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean).slice(0, MAX_UNTRACKED)) {
      try {
        const p = join(cwd, f);
        const size = statSync(p).size;
        const text = size <= MAX_FILE_BYTES ? readFileSync(p, 'utf8') : '';
        files[f] = { h: sha(`${size}\n${text}`), n: text ? text.split('\n').length - 1 : 0 };
      } catch { /* a file that vanished while scanning */ }
    }
    return files;
  } catch { return null; }
}

/** How much changed between two snapshots: files whose content differs, and the change in changed-line counts. */
export function delta(base, cur) {
  let files = 0;
  let lines = 0;
  for (const p of new Set([...Object.keys(base ?? {}), ...Object.keys(cur ?? {})])) {
    const a = base?.[p];
    const b = cur?.[p];
    if (a && b && a.h === b.h) continue;
    files += 1;
    lines += Math.max(1, Math.abs((b?.n ?? 0) - (a?.n ?? 0)));
  }
  return { files, lines };
}

export const isBig = (d) => d.files > BIG_FILES || d.lines > BIG_LINES;
