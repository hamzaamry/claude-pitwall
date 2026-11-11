import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../../hooks/read-cap.mjs', import.meta.url).pathname;
let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'pitwall-rc-')); });

const teamOn = (id = 's1') => { mkdirSync(join(home, 'team'), { recursive: true }); writeFileSync(join(home, 'team', id), ''); };
const fire = (tool_input: object, extra: object = {}, raw?: string) =>
  spawnSync('node', [SCRIPT], { input: raw ?? JSON.stringify({ session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Read', cwd: '/a', tool_input, ...extra }), encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home } });
const updated = (r: { stdout: string }) => JSON.parse(r.stdout).hookSpecificOutput;

describe('read-cap', () => {
  it('team on, no limit: allows the Read with limit 400 added', () => {
    teamOn();
    const out = updated(fire({ file_path: '/a/b.ts' }));
    expect(out).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'allow' });
    expect(out.updatedInput).toEqual({ file_path: '/a/b.ts', limit: 400 });
  });
  it('keeps an offset', () => {
    teamOn();
    expect(updated(fire({ file_path: '/a/b.ts', offset: 10 })).updatedInput).toEqual({ file_path: '/a/b.ts', offset: 10, limit: 400 });
  });
  it('does nothing when there is already a limit', () => {
    teamOn();
    expect(fire({ file_path: '/a/b.ts', limit: 20 }).stdout).toBe('');
  });
  it('does nothing for pages or for non-text files', () => {
    teamOn();
    expect(fire({ file_path: '/a/b.pdf', pages: '1-3' }).stdout).toBe('');
    for (const f of ['x.pdf', 'x.PNG', 'x.jpg', 'x.jpeg', 'x.gif', 'x.webp', 'x.ipynb']) {
      expect(fire({ file_path: `/a/${f}` }).stdout, f).toBe('');
    }
  });
  it('never rewrites a Read outside the session folder, so it cannot skip a permission question', () => {
    teamOn();
    for (const p of ['/etc/passwd', '/ab/c.ts', '/a/../etc/passwd', '../x.ts']) {
      expect(fire({ file_path: p }).stdout, p).toBe('');
    }
    expect(updated(fire({ file_path: 'src/x.ts' })).updatedInput.limit).toBe(400);
    expect(updated(fire({ file_path: '/a/./sub/../x.ts' })).updatedInput.limit).toBe(400);
    expect(fire({ file_path: '/a/b.ts' }, { cwd: undefined }).stdout).toBe('');
  });
  it('does nothing when the team is off', () => {
    expect(fire({ file_path: '/a/b.ts' }).stdout).toBe('');
  });
  it('does nothing for another tool, no file_path, bad JSON; always exit 0', () => {
    teamOn();
    expect(fire({ file_path: '/a/b.ts' }, { tool_name: 'Grep' }).stdout).toBe('');
    const noPath = fire({});
    expect(noPath.stdout).toBe('');
    const bad = fire({}, {}, 'not json');
    expect([noPath.status, bad.status, bad.stdout]).toEqual([0, 0, '']);
  });
  it('only the session with the flag is capped', () => {
    teamOn('other');
    expect(fire({ file_path: '/a/b.ts' }).stdout).toBe('');
  });
});
