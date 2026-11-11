import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain .mjs, no types
import { fingerprint } from '../../hooks/same-error.mjs';

const SCRIPT = new URL('../../hooks/same-error.mjs', import.meta.url).pathname;
let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'pitwall-se-')); });

const teamOn = (id = 's1') => { mkdirSync(join(home, 'team'), { recursive: true }); writeFileSync(join(home, 'team', id), ''); };
const fail = (error: string, session = 's1', raw?: string) =>
  spawnSync('node', [SCRIPT], { input: raw ?? JSON.stringify({ session_id: session, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'x' }, error }), encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home } });
const events = (s = 's1') => {
  const f = join(home, 'events', `${s}.jsonl`);
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
};

describe('fingerprint', () => {
  it('is equal for the same error with different noise', () => {
    const a = 'Exit code 1\nFAIL src/a.test.ts (3.21s)\n  at 2026-11-11T10:00:00.123Z in /tmp/vitest-abc123/out\nError: expected 5 to be 6 (id 8f3a9c2d1b)';
    const b = 'Exit code 1\nFAIL src/a.test.ts (12ms)\n  at 2026-11-12 09:30:59 in /tmp/vitest-zzz999/out\nError: expected 7 to be 8 (id 11aa22bb33)';
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
  it('differs for a different error message', () => {
    expect(fingerprint('Exit code 1\nError: cannot find module foo')).not.toBe(fingerprint('Exit code 1\nError: permission denied'));
  });
  it('only looks at the last 5 non-empty lines', () => {
    const tail = 'a\nb\nc\nd\ne';
    expect(fingerprint('noise 1\n\n' + tail)).toBe(fingerprint('totally different start\nmore\n' + tail));
  });
  it('handles empty input', () => {
    expect(typeof fingerprint('')).toBe('string');
  });
});

describe('same-error hook', () => {
  it('first failure: nothing; second identical: one nudge and one Nudge event; third: nothing', () => {
    teamOn();
    const err = "Exit code 2\nls: cannot access '/nope': No such file or directory";
    expect(fail(err).stdout).toBe('');
    const second = fail(err);
    const out = JSON.parse(second.stdout).hookSpecificOutput;
    expect(out.hookEventName).toBe('PostToolUseFailure');
    expect(out.additionalContext).toContain('pitwall plugin hook');
    expect(out.additionalContext).toContain('advisor');
    expect(events().filter((e) => e.event === 'Nudge')).toEqual([expect.objectContaining({ kind: 'same-error', session: 's1' })]);
    expect(fail(err).stdout).toBe('');
    expect(events().filter((e) => e.event === 'Nudge')).toHaveLength(1);
  });
  it('a different error does not count', () => {
    teamOn();
    fail('Exit code 1\nError: one');
    expect(fail('Exit code 1\nError: two').stdout).toBe('');
  });
  it('noise differences still count as the same error', () => {
    teamOn();
    fail('Exit code 1\nFAIL (3.2s) at 10:11:12\nError: boom 5');
    expect(fail('Exit code 1\nFAIL (9ms) at 10:11:59\nError: boom 7').stdout).not.toBe('');
  });
  it('team off: never nudges', () => {
    fail('Exit code 1\nError: boom');
    expect(fail('Exit code 1\nError: boom').stdout).toBe('');
  });
  it('two sessions do not share counts', () => {
    teamOn('s1'); teamOn('s2');
    fail('Exit code 1\nError: boom', 's1');
    expect(fail('Exit code 1\nError: boom', 's2').stdout).toBe('');
  });
  it('ignores other tools, other events, bad input; unwritable state dir: exit 0', () => {
    teamOn();
    const other = spawnSync('node', [SCRIPT], { input: JSON.stringify({ session_id: 's1', hook_event_name: 'PostToolUseFailure', tool_name: 'Read', error: 'x' }), encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home } });
    expect([other.status, other.stdout]).toEqual([0, '']);
    const bad = fail('', 's1', 'not json');
    expect([bad.status, bad.stdout]).toEqual([0, '']);
    mkdirSync(join(home, 'state'));
    chmodSync(join(home, 'state'), 0o500);
    const r = fail('Exit code 1\nError: boom');
    expect(r.status).toBe(0);
  });
});
