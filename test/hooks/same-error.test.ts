import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain .mjs, no types
import { fingerprint, commandKey } from '../../hooks/lib/fingerprint.mjs';

const SCRIPT = new URL('../../hooks/same-error.mjs', import.meta.url).pathname;
let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'pitwall-se-')); });

const teamOn = (id = 's1') => { mkdirSync(join(home, 'team'), { recursive: true }); writeFileSync(join(home, 'team', id), ''); };
const call = (mode: 'fail' | 'ok' | 'agent', input: object, raw?: string) =>
  spawnSync('node', [SCRIPT, mode], { input: raw ?? JSON.stringify({ session_id: 's1', ...input }), encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home } });
const fail = (error: string, command = 'npm test', extra: object = {}) =>
  call('fail', { hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command }, error, ...extra });
const ok = (command = 'npm test', extra: object = {}) =>
  call('ok', { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, tool_response: { stdout: 'ok' }, ...extra });
const runnerReply = (text: string, extra: object = {}, agentType = 'pitwall:runner') =>
  call('agent', { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_response: { status: 'completed', agentType, content: [{ type: 'text', text: '<tools-used-before-summary>Bash</tools-used-before-summary>\n' }, { type: 'text', text }] }, ...extra });
const events = (s = 's1') => {
  const f = join(home, 'events', `${s}.jsonl`);
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
};
const nudges = () => events().filter((e) => e.event === 'Nudge');

describe('fingerprint', () => {
  it('is equal for the same error with different noise', () => {
    const a = 'FAIL src/a.test.ts (3.21s)\n  at 2026-11-11T10:00:00.123Z in /tmp/vitest-abc123/out\nError: expected 5 to be 6 (id 8f3a9c2d1b)';
    const b = 'FAIL src/a.test.ts (12ms)\n  at 2026-11-12 09:30:59 in /tmp/vitest-zzz999/out\nError: expected 7 to be 8 (id 11aa22bb33)';
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
  it('differs for a different error message', () => {
    expect(fingerprint('Error: cannot find module foo')).not.toBe(fingerprint('Error: permission denied'));
  });
  it('ignores summary and timing lines, so two different failing tests do not look alike', () => {
    const summary = '\n Test Files  1 failed (1)\n      Tests  1 failed | 2 passed (3)\n   Start at  10:00:00\n   Duration  1.2s';
    const one = 'FAIL test/a.test.ts > adds\nAssertionError: expected 1 to be 2' + summary;
    const two = 'FAIL test/b.test.ts > parses\nTypeError: x is not a function' + summary;
    expect(fingerprint(one)).not.toBe(fingerprint(two));
    expect(fingerprint(one)).toBe(fingerprint(one.replace('1.2s', '9.9s').replace('10:00:00', '11:11:11')));
  });
  it('only looks at the last 5 non-empty lines', () => {
    const tail = 'a\nb\nc\nd\ne';
    expect(fingerprint('noise 1\n\n' + tail)).toBe(fingerprint('totally different start\nmore\n' + tail));
  });
  it('handles empty input', () => expect(typeof fingerprint('')).toBe('string'));
  it('commandKey is stable and differs per command', () => {
    expect(commandKey('npm test')).toBe(commandKey('  npm   test ')); 
    expect(commandKey('npm test')).not.toBe(commandKey('npm run build'));
  });
});

describe('same-error: a failing Bash command (PostToolUseFailure)', () => {
  const err = "Exit code 2\nls: cannot access '/nope': No such file or directory";
  it('first: nothing; second identical: one nudge to main and one Nudge event; third: nothing', () => {
    teamOn();
    expect(fail(err).stdout).toBe('');
    const out = JSON.parse(fail(err).stdout).hookSpecificOutput;
    expect(out.hookEventName).toBe('PostToolUseFailure');
    expect(out.additionalContext).toContain('pitwall plugin hook');
    expect(out.additionalContext).toContain('advisor');
    expect(out.additionalContext).toContain('pitwall:reviewer');
    expect(nudges()).toEqual([expect.objectContaining({ kind: 'same-error', session: 's1' })]);
    expect(fail(err).stdout).toBe('');
    expect(nudges()).toHaveLength(1);
  });
  it('the same error text from two different commands is not "the same failure twice"', () => {
    teamOn();
    fail(err, 'ls /nope');
    expect(fail(err, 'cat /nope').stdout).toBe('');
  });
  it('a failure with nothing but "Exit code N" never counts (grep with no match, test -f)', () => {
    teamOn();
    for (let i = 0; i < 3; i++) expect(fail('Exit code 1', 'grep foo x').stdout).toBe('');
    expect(fail('Exit code 1\n', 'test -f x').stdout).toBe('');
  });
  it('a success of that command in between resets the count', () => {
    teamOn();
    fail(err, 'npm test');
    ok('npm test');
    expect(fail(err, 'npm test').stdout).toBe('');
    expect(fail(err, 'npm test').stdout).not.toBe('');
  });
  it('failures inside a subagent are not nudged (it has no advisor, main never sees the note)', () => {
    teamOn();
    fail(err, 'npm test', { agent_id: 'a1', agent_type: 'pitwall:runner' });
    expect(fail(err, 'npm test', { agent_id: 'a1', agent_type: 'pitwall:runner' }).stdout).toBe('');
  });
  it('noise differences still count as the same error', () => {
    teamOn();
    fail('Exit code 1\nFAIL (3.2s) at 10:11:12\nError: boom 5');
    expect(fail('Exit code 1\nFAIL (9ms) at 10:11:59\nError: boom 7').stdout).not.toBe('');
  });
  it('team off: never nudges; two sessions do not share counts', () => {
    fail('Exit code 1\nError: boom'); 
    expect(fail('Exit code 1\nError: boom').stdout).toBe('');
    teamOn('s1'); teamOn('s2');
    fail('Exit code 1\nError: boom');
    expect(call('fail', { session_id: 's2', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'npm test' }, error: 'Exit code 1\nError: boom' }).stdout).toBe('');
  });
  it('other tools, bad input, an unwritable state dir: exit 0', () => {
    teamOn();
    const other = call('fail', { hook_event_name: 'PostToolUseFailure', tool_name: 'Read', error: 'x' });
    expect([other.status, other.stdout]).toEqual([0, '']);
    const bad = fail('', 'x', {});
    expect(bad.status).toBe(0);
    const garbage = call('fail', {}, 'not json');
    expect([garbage.status, garbage.stdout]).toEqual([0, '']);
    mkdirSync(join(home, 'state'));
    chmodSync(join(home, 'state'), 0o500);
    expect(fail('Exit code 1\nError: boom').status).toBe(0);
  });
});

describe('same-error: the runner\'s command fails the same way in two runs (PostToolUse on the Agent tool)', () => {
  const sub = { agent_id: 'a1', agent_type: 'pitwall:runner' };
  const err = 'Exit code 1\nAssertionError: add(2,3) should be 5\n  actual -1';
  // the runner's own failing Bash command: counted, never nudged (main never sees it)
  const runnerFails = (error = err, command = 'npm test', extra: object = sub) => fail(error, command, extra);
  const anyReply = (text = 'whatever words Haiku chose today') => runnerReply(text);

  it('the second run that fails the same way nudges main when its reply arrives; wording of the reply does not matter', () => {
    teamOn();
    expect(runnerFails().stdout).toBe('');
    expect(anyReply('1 failed').stdout).toBe('');
    expect(runnerFails().stdout).toBe('');
    const out = JSON.parse(anyReply('The npm test run failed: 1 failing assertion.').stdout).hookSpecificOutput;
    expect(out.hookEventName).toBe('PostToolUse');
    expect(out.additionalContext).toContain('advisor');
    expect(nudges()).toEqual([expect.objectContaining({ kind: 'same-error' })]);
    expect(anyReply('again').stdout).toBe('');
    expect(nudges()).toHaveLength(1);
  });
  it('a different failure, or the same command failing differently, does not count', () => {
    teamOn();
    runnerFails();
    runnerFails('Exit code 1\nTypeError: x is not a function');
    expect(anyReply().stdout).toBe('');
  });
  it('a success inside the runner clears the count', () => {
    teamOn();
    runnerFails();
    ok('npm test', sub);
    runnerFails();
    expect(anyReply().stdout).toBe('');
  });
  it('failures of other subagents (a scout) and of main are not runner failures', () => {
    teamOn();
    fail(err, 'npm test', { agent_id: 'a2', agent_type: 'pitwall:scout' });
    fail(err, 'npm test', { agent_id: 'a2', agent_type: 'pitwall:scout' });
    expect(anyReply().stdout).toBe('');
  });
  it('a reply from another kind of agent never nudges', () => {
    teamOn();
    runnerFails(); runnerFails();
    expect(runnerReply('x', {}, 'pitwall:scout').stdout).toBe('');
  });
  it('team off, a call made inside a subagent, or a malformed response: nothing', () => {
    runnerFails(); runnerFails();
    expect(anyReply().stdout).toBe('');
    teamOn();
    runnerFails(); runnerFails();
    expect(runnerReply('x', { agent_id: 'a1' }).stdout).toBe('');
    const weird = call('agent', { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_response: 'just a string' });
    expect([weird.status, weird.stdout]).toEqual([0, '']);
  });
});
