import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEE = new URL('../bin/statusline-tee.mjs', import.meta.url).pathname;
let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'pitwall-tee-')); });

const run = (input: string, env: Record<string, string> = {}) =>
  spawnSync('node', [TEE], { input, encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home, ...env } });
const config = (cmd: string) => writeFileSync(join(home, 'config.json'), JSON.stringify({ wrappedStatusLine: cmd }));

describe('statusline-tee', () => {
  it('forwards stdin to wrapped command and saves the snapshot', () => {
    config('cat');
    const input = '{"session_id": "s1", "x": 1}';
    const r = run(input);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(input);
    expect(JSON.parse(readFileSync(join(home, 'statusline', 's1.json'), 'utf8'))).toEqual({ session_id: 's1', x: 1 });
  });

  it('survives invalid JSON', () => {
    config('cat');
    const r = run('not json');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('not json');
  });

  it('survives missing config', () => {
    const r = run('{"session_id": "s1"}');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('survives a wrapped command that does not exist', () => {
    config('definitely-not-a-command-xyz');
    const r = run('{"session_id": "s1"}');
    expect(r.status).toBe(0);
  });

  it('survives unwritable dir', () => {
    config('cat');
    mkdirSync(join(home, 'statusline'));
    chmodSync(join(home, 'statusline'), 0o500);
    const input = '{"session_id": "s1"}';
    const r = run(input);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(input);
    expect(existsSync(join(home, 'statusline', 's1.json'))).toBe(false);
  });
});
