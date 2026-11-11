import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../../hooks/read-cap.mjs', import.meta.url).pathname;
let home: string;
let proj: string;
let outside: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'pitwall-rc-'));
  proj = mkdtempSync(join(tmpdir(), 'pitwall-proj-'));
  outside = mkdtempSync(join(tmpdir(), 'pitwall-outside-'));
  mkdirSync(join(proj, 'sub'));
  for (const f of ['b.ts', 'sub/x.ts', 'b.pdf', 'x.pdf', 'x.PNG', 'x.jpg', 'x.jpeg', 'x.gif', 'x.webp', 'x.ipynb']) writeFileSync(join(proj, f), 'x\n');
  writeFileSync(join(outside, 'o.txt'), 'secret\n');
});

const teamOn = (id = 's1') => { mkdirSync(join(home, 'team'), { recursive: true }); writeFileSync(join(home, 'team', id), ''); };
const fire = (tool_input: object, extra: object = {}, raw?: string) =>
  spawnSync('node', [SCRIPT], { input: raw ?? JSON.stringify({ session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Read', cwd: proj, tool_input, ...extra }), encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home } });
const updated = (r: { stdout: string }) => JSON.parse(r.stdout).hookSpecificOutput;

describe('read-cap', () => {
  it('team on, no limit: allows the Read with limit 400 added', () => {
    teamOn();
    const out = updated(fire({ file_path: join(proj, 'b.ts') }));
    expect(out).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'allow' });
    expect(out.updatedInput).toEqual({ file_path: join(proj, 'b.ts'), limit: 400 });
  });
  it('keeps an offset', () => {
    teamOn();
    expect(updated(fire({ file_path: join(proj, 'b.ts'), offset: 10 })).updatedInput).toEqual({ file_path: join(proj, 'b.ts'), offset: 10, limit: 400 });
  });
  it('does nothing when there is already a limit', () => {
    teamOn();
    expect(fire({ file_path: join(proj, 'b.ts'), limit: 20 }).stdout).toBe('');
  });
  it('does nothing for pages or for non-text files', () => {
    teamOn();
    expect(fire({ file_path: join(proj, 'b.pdf'), pages: '1-3' }).stdout).toBe('');
    for (const f of ['x.pdf', 'x.PNG', 'x.jpg', 'x.jpeg', 'x.gif', 'x.webp', 'x.ipynb']) {
      expect(fire({ file_path: join(proj, f) }).stdout, f).toBe('');
    }
  });
  it('never rewrites a Read outside the session folder, so it cannot skip a permission question', () => {
    teamOn();
    for (const p of ['/etc/passwd', join(proj, '..', 'outside-x', 'c.ts'), '../x.ts', join(outside, 'o.txt')]) {
      expect(fire({ file_path: p }).stdout, p).toBe('');
    }
    expect(updated(fire({ file_path: 'b.ts' })).updatedInput.limit).toBe(400);
    expect(updated(fire({ file_path: join(proj, 'sub', '..', 'b.ts') })).updatedInput.limit).toBe(400);
    expect(fire({ file_path: join(proj, 'b.ts') }, { cwd: undefined }).stdout).toBe('');
  });
  it('a symlink inside the project that points outside is left alone (Claude Code asks about it)', () => {
    teamOn();
    symlinkSync(join(outside, 'o.txt'), join(proj, 'link.txt'));
    symlinkSync(outside, join(proj, 'linkdir'));
    expect(fire({ file_path: join(proj, 'link.txt') }).stdout).toBe('');
    expect(fire({ file_path: join(proj, 'linkdir', 'o.txt') }).stdout).toBe('');
  });
  it('a symlink that stays inside the project is capped', () => {
    teamOn();
    symlinkSync(join(proj, 'b.ts'), join(proj, 'inner.ts'));
    expect(updated(fire({ file_path: join(proj, 'inner.ts') })).updatedInput.limit).toBe(400);
  });
  it('a file that does not exist is left alone (fail closed)', () => {
    teamOn();
    expect(fire({ file_path: join(proj, 'nope.ts') }).stdout).toBe('');
  });
  it('does nothing when the team is off', () => {
    expect(fire({ file_path: join(proj, 'b.ts') }).stdout).toBe('');
  });
  it('does nothing for another tool, no file_path, bad JSON; always exit 0', () => {
    teamOn();
    expect(fire({ file_path: join(proj, 'b.ts') }, { tool_name: 'Grep' }).stdout).toBe('');
    const noPath = fire({});
    expect(noPath.stdout).toBe('');
    const bad = fire({}, {}, 'not json');
    expect([noPath.status, bad.status, bad.stdout]).toEqual([0, 0, '']);
  });
  it('only the session with the flag is capped', () => {
    teamOn('other');
    expect(fire({ file_path: join(proj, 'b.ts') }).stdout).toBe('');
  });
});
