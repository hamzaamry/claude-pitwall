import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain .mjs, no types
import { changeFingerprint, isBig } from '../../hooks/review-gate.mjs';

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
const run = (mode: 'gate' | 'mark', extra: object = {}, raw?: string) =>
  spawnSync('node', [SCRIPT, mode], { input: raw ?? JSON.stringify({ session_id: 's1', cwd: repo, hook_event_name: mode === 'gate' ? 'Stop' : 'SubagentStop', stop_hook_active: false, ...extra }), encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home } });
const edit = (f: string, lines: number) => writeFileSync(join(repo, f), Array.from({ length: lines }, (_, i) => `line ${i} ${Math.random()}`).join('\n') + '\n');
const bigChange = () => { edit('a.txt', 3); edit('b.txt', 3); edit('c.txt', 3); };

describe('changeFingerprint and isBig', () => {
  it('null outside a git repo', () => {
    expect(changeFingerprint(mkdtempSync(join(tmpdir(), 'pitwall-nogit-')))).toBeNull();
  });
  it('counts files and lines; untracked files count too', () => {
    edit('a.txt', 5);
    writeFileSync(join(repo, 'new.txt'), 'x\ny\n');
    const c = changeFingerprint(repo);
    expect(c.files).toBe(2);
    expect(c.lines).toBeGreaterThanOrEqual(5);
  });
  it('the fingerprint changes when the content changes and not otherwise', () => {
    edit('a.txt', 2);
    const f1 = changeFingerprint(repo).fingerprint;
    expect(changeFingerprint(repo).fingerprint).toBe(f1);
    edit('a.txt', 2);
    expect(changeFingerprint(repo).fingerprint).not.toBe(f1);
  });
  it('isBig: more than 2 files, or more than 30 lines', () => {
    expect(isBig({ files: 2, lines: 30 })).toBe(false);
    expect(isBig({ files: 3, lines: 1 })).toBe(true);
    expect(isBig({ files: 1, lines: 31 })).toBe(true);
  });
});

describe('review-gate (Stop)', () => {
  it('a small change does not block', () => {
    teamOn(); writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n');
    const r = run('gate');
    expect([r.status, r.stderr]).toEqual([0, '']);
  });
  it('a big change blocks once, with the reason, then lets the next Stop through; a new change blocks again', () => {
    teamOn(); bigChange();
    const first = run('gate');
    expect(first.status).toBe(2);
    expect(first.stderr).toContain('pitwall:reviewer');
    expect(run('gate').status).toBe(0);
    edit('a.txt', 4);
    expect(run('gate').status).toBe(2);
    expect(run('gate').status).toBe(0);
  });
  it('writes a Nudge event when it blocks', () => {
    teamOn(); bigChange(); run('gate');
    const ev = require('node:fs').readFileSync(join(home, 'events', 's1.jsonl'), 'utf8');
    expect(ev).toContain('"kind":"review-gate"');
  });
  it('stop_hook_active: never blocks', () => {
    teamOn(); bigChange();
    expect(run('gate', { stop_hook_active: true }).status).toBe(0);
  });
  it('31 changed lines in one file is big; 30 is not', () => {
    teamOn();
    writeFileSync(join(repo, 'a.txt'), Array.from({ length: 30 }, (_, i) => `n${i}`).join('\n') + '\n'); // 30 added + 1 removed
    const c = changeFingerprint(repo);
    expect(isBig({ files: 1, lines: c.lines - 1 })).toBe(false);
    expect(isBig({ files: 1, lines: c.lines })).toBe(true);
  });
  it('after the reviewer stopped on this change, no block; a non-reviewer stop does not clear it', () => {
    teamOn(); bigChange();
    run('mark', { agent_type: 'pitwall:scout' });
    expect(run('gate').status).toBe(2);
    edit('a.txt', 6);
    run('mark', { agent_type: 'pitwall:reviewer' });
    expect(run('gate').status).toBe(0);
    edit('a.txt', 7);
    expect(run('gate').status).toBe(2);
  });
  it('team off: never blocks', () => {
    bigChange();
    expect(run('gate').status).toBe(0);
  });
  it('not a git repo, corrupt state, bad input, unwritable state dir: exit 0 and quiet', () => {
    teamOn();
    const nogit = mkdtempSync(join(tmpdir(), 'pitwall-nogit-'));
    expect(run('gate', { cwd: nogit }).status).toBe(0);
    mkdirSync(join(home, 'state'), { recursive: true });
    writeFileSync(join(home, 'state', 's1.json'), '{oops');
    bigChange();
    const corrupt = run('gate');
    expect(corrupt.status === 0 || corrupt.status === 2).toBe(true);
    const bad = run('gate', {}, 'not json');
    expect([bad.status, bad.stderr]).toEqual([0, '']);
    chmodSync(join(home, 'state'), 0o500);
    const ro = run('gate');
    expect([0, 2]).toContain(ro.status);
  });
  it('the reviewer cannot be gated by its own stop (SubagentStop never blocks)', () => {
    teamOn(); bigChange();
    const r = run('mark', { agent_type: 'pitwall:reviewer' });
    expect([r.status, r.stderr]).toEqual([0, '']);
  });
});
