import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain .mjs, no types
import { snapshot, delta, isBig } from '../../hooks/lib/changes.mjs';

const SCRIPT = new URL('../../hooks/review-gate.mjs', import.meta.url).pathname;
let home: string;
let repo: string;
const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe' });

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'pitwall-rg-'));
  repo = mkdtempSync(join(tmpdir(), 'pitwall-repo-'));
  git('init', '-q');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
  for (const f of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(repo, f), 'one\n');
  git('add', '-A'); git('commit', '-qm', 'init');
});

const teamOn = (id = 's1') => { mkdirSync(join(home, 'team'), { recursive: true }); writeFileSync(join(home, 'team', id), ''); };
const run = (mode: 'gate' | 'mark' | 'snapshot', extra: object = {}, raw?: string) =>
  spawnSync('node', [SCRIPT, mode], { input: raw ?? JSON.stringify({ session_id: 's1', cwd: repo, hook_event_name: mode === 'gate' ? 'Stop' : mode === 'mark' ? 'SubagentStop' : 'UserPromptSubmit', stop_hook_active: false, ...extra }), encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home } });
const ev = (o: object) => {
  mkdirSync(join(home, 'events'), { recursive: true });
  appendFileSync(join(home, 'events', 's1.jsonl'), JSON.stringify({ t: new Date().toISOString(), session: 's1', ...o }) + '\n');
};
/** A new turn in which main did (or did not) call an editing tool. */
const turn = (mainEdits: boolean, tool = 'Edit') => { ev({ event: 'UserPromptSubmit' }); if (mainEdits) ev({ event: 'PostToolUse', tool }); };
const edit = (f: string, lines: number) => writeFileSync(join(repo, f), Array.from({ length: lines }, (_, i) => `line ${i} ${Math.random()}`).join('\n') + '\n');
const bigChange = () => { edit('a.txt', 3); edit('b.txt', 3); edit('c.txt', 3); };

describe('snapshot, delta and isBig', () => {
  it('snapshot is null outside a git repo', () => {
    expect(snapshot(mkdtempSync(join(tmpdir(), 'pitwall-nogit-')))).toBeNull();
  });
  it('against nothing, the delta is the whole change; untracked files count', () => {
    edit('a.txt', 5);
    writeFileSync(join(repo, 'new.txt'), 'x\ny\n');
    const d = delta({}, snapshot(repo));
    expect(d.files).toBe(2);
    expect(d.lines).toBeGreaterThanOrEqual(7);
  });
  it('between two snapshots, only what changed in between counts', () => {
    bigChange();
    const before = snapshot(repo);
    expect(delta(before, snapshot(repo))).toEqual({ files: 0, lines: 0 });
    writeFileSync(join(repo, 'a.txt'), readFileSync(join(repo, 'a.txt'), 'utf8').replace('line 0', 'line zero'));
    const d = delta(before, snapshot(repo));
    expect(d.files).toBe(1);
    expect(d.lines).toBeLessThanOrEqual(2);
    expect(isBig(d)).toBe(false);
  });
  it('a file reverted since the snapshot counts as a change', () => {
    edit('a.txt', 3);
    const before = snapshot(repo);
    git('checkout', '--', 'a.txt');
    expect(delta(before, snapshot(repo)).files).toBe(1);
  });
  it('isBig: more than 2 files, or more than 30 lines', () => {
    expect(isBig({ files: 2, lines: 30 })).toBe(false);
    expect(isBig({ files: 3, lines: 1 })).toBe(true);
    expect(isBig({ files: 1, lines: 31 })).toBe(true);
  });
});

describe('review-gate (Stop)', () => {
  it('a small change does not block', () => {
    teamOn(); turn(true); writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n');
    const r = run('gate');
    expect([r.status, r.stderr]).toEqual([0, '']);
  });
  it('a big change by main blocks once; the next Stop passes; a new big change blocks again; a typo after does not', () => {
    teamOn(); turn(true); bigChange();
    const first = run('gate');
    expect(first.status).toBe(2);
    expect(first.stderr).toContain('pitwall:reviewer');
    expect(run('gate').status).toBe(0);
    turn(true); edit('a.txt', 9); edit('b.txt', 9); edit('c.txt', 9);
    expect(run('gate').status).toBe(2);
    turn(true); appendFileSync(join(repo, 'a.txt'), 'typo fix\n');
    expect(run('gate').status).toBe(0);
  });
  it('40 changed lines in one file is big; 20 is not', () => {
    teamOn(); turn(true); edit('a.txt', 20);
    expect(run('gate').status).toBe(0);
    turn(true); edit('a.txt', 40);
    expect(run('gate').status).toBe(2);
  });
  it('after the reviewer ran, a small follow-up change is not gated; a non-reviewer stop does not clear anything', () => {
    teamOn(); turn(true); bigChange();
    run('mark', { agent_type: 'pitwall:scout' });
    expect(run('gate').status).toBe(2);
    turn(true); edit('a.txt', 6); edit('b.txt', 6); edit('c.txt', 6);
    run('mark', { agent_type: 'pitwall:reviewer' });
    turn(true); appendFileSync(join(repo, 'a.txt'), 'one more line\n');
    expect(run('gate').status).toBe(0);
  });
  it('a turn in which main did not edit (the user edited, or only a question was asked) is never gated', () => {
    teamOn(); turn(false); bigChange();
    expect(run('gate').status).toBe(0);
    ev({ event: 'PostToolUse', tool: 'Edit', agent: 'a1', agentType: 'pitwall:scout' });
    expect(run('gate').status).toBe(0);
    ev({ event: 'PostToolUse', tool: 'Read' });
    expect(run('gate').status).toBe(0);
  });
  it('Write and NotebookEdit by main count as edits', () => {
    teamOn(); turn(true, 'Write'); bigChange();
    expect(run('gate').status).toBe(2);
  });
  it('a big diff that was already there when the first prompt arrived is not blamed on a tiny edit', () => {
    teamOn(); bigChange();
    run('snapshot');
    turn(true); appendFileSync(join(repo, 'a.txt'), 'main edit\n');
    expect(run('gate').status).toBe(0);
  });
  it('snapshot keeps an existing baseline and does nothing with the team off', () => {
    run('snapshot');
    expect(() => readFileSync(join(home, 'state', 's1.json'))).toThrow();
    teamOn(); run('snapshot'); const a = readFileSync(join(home, 'state', 's1.json'), 'utf8');
    bigChange(); run('snapshot');
    expect(readFileSync(join(home, 'state', 's1.json'), 'utf8')).toBe(a);
  });
  it('writes a review-gate Nudge event when it blocks', () => {
    teamOn(); turn(true); bigChange(); run('gate');
    expect(readFileSync(join(home, 'events', 's1.jsonl'), 'utf8')).toContain('"kind":"review-gate"');
  });
  it('stop_hook_active never blocks; the team off never blocks', () => {
    teamOn(); turn(true); bigChange();
    expect(run('gate', { stop_hook_active: true }).status).toBe(0);
    rmTeam();
    expect(run('gate').status).toBe(0);
  });
  it('not a git repo, corrupt state, bad input, unwritable state dir: exit 0 and quiet', () => {
    teamOn(); turn(true);
    expect(run('gate', { cwd: mkdtempSync(join(tmpdir(), 'pitwall-nogit-')) }).status).toBe(0);
    mkdirSync(join(home, 'state'), { recursive: true });
    writeFileSync(join(home, 'state', 's1.json'), '{oops');
    bigChange();
    expect([0, 2]).toContain(run('gate').status);
    const bad = run('gate', {}, 'not json');
    expect([bad.status, bad.stderr]).toEqual([0, '']);
    chmodSync(join(home, 'state'), 0o500);
    expect([0, 2]).toContain(run('gate').status);
  });
  it('the reviewer cannot be gated by its own stop (SubagentStop never blocks)', () => {
    teamOn(); bigChange();
    const r = run('mark', { agent_type: 'pitwall:reviewer' });
    expect([r.status, r.stderr]).toEqual([0, '']);
  });
  it('works when the plugin folder is reached through a symlink', () => {
    teamOn(); turn(true); bigChange();
    const dir = mkdtempSync(join(tmpdir(), 'pitwall-link-'));
    require('node:fs').symlinkSync(new URL('../..', import.meta.url).pathname, join(dir, 'p'));
    const r = spawnSync('node', [join(dir, 'p', 'hooks', 'review-gate.mjs'), 'gate'], { input: JSON.stringify({ session_id: 's1', cwd: repo, stop_hook_active: false }), encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home } });
    expect(r.status).toBe(2);
  });
});

function rmTeam() { require('node:fs').rmSync(join(home, 'team', 's1')); }
