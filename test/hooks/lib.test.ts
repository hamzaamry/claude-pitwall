import { describe, it, expect, beforeEach } from 'vitest';
import { execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LIB = new URL('../../hooks/lib/hook.mjs', import.meta.url).pathname;
let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'pitwall-hook-')); });

/** Runs a one-off .mjs that imports the library, like a real hook script does. */
function run(body: string, input = '', env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pitwall-hookscript-'));
  const file = join(dir, 'h.mjs');
  writeFileSync(file, `import * as L from ${JSON.stringify(LIB)};\n${body}`);
  return spawnSync('node', [file], { input, encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home, ...env } });
}

describe('runHook', () => {
  it('swallows a throwing hook: exit 0, no output', () => {
    const r = run('L.runHook(() => { throw new Error("boom"); });');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
  it('prints what the hook returns', () => {
    const r = run('L.runHook(() => "hello");');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('hello');
  });
  it('passes the parsed input to the hook', () => {
    const r = run('L.runHook((i) => i.session_id);', '{"session_id":"s1"}');
    expect(r.stdout).toBe('s1');
  });
});

describe('readInput', () => {
  it('returns {} for empty, invalid and non-object input', () => {
    for (const input of ['', 'not json', '[1,2]', '"str"', 'null']) {
      const r = run('process.stdout.write(JSON.stringify(L.readInput()));', input);
      expect(r.stdout, input).toBe('{}');
    }
  });
});

describe('team flag', () => {
  it('is off without the flag file and on with it', () => {
    const input = '{"session_id":"s1"}';
    expect(run('process.stdout.write(String(L.teamOn(L.readInput())));', input).stdout).toBe('false');
    mkdirSync(join(home, 'team'), { recursive: true });
    writeFileSync(join(home, 'team', 's1'), '');
    expect(run('process.stdout.write(String(L.teamOn(L.readInput())));', input).stdout).toBe('true');
  });
  it('is off when there is no session id', () => {
    expect(run('process.stdout.write(String(L.teamOn({})));').stdout).toBe('false');
  });
  it('teamKey is stable for one session, differs for two, and cannot escape the folder', () => {
    const r = run('process.stdout.write([L.teamKey({session_id:"a"}), L.teamKey({session_id:"a"}), L.teamKey({session_id:"b"}), L.teamKey({session_id:"../../x"})].join("|"));');
    const [a1, a2, b, evil] = r.stdout.split('|');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(evil).not.toContain('/');
    expect(evil).not.toContain('.');
  });
});

describe('state', () => {
  it('round-trips, and a missing or corrupt file reads as {}', () => {
    const r = run(`
      L.writeState("s1", { a: 1 });
      const ok = L.readState("s1");
      const none = L.readState("nope");
      process.stdout.write(JSON.stringify([ok, none]));`);
    expect(JSON.parse(r.stdout)).toEqual([{ a: 1 }, {}]);
    mkdirSync(join(home, 'state'), { recursive: true });
    writeFileSync(join(home, 'state', 'bad.json'), '{oops');
    expect(run('process.stdout.write(JSON.stringify(L.readState("bad")));').stdout).toBe('{}');
  });
  it('writeState to an unwritable dir does not throw', () => {
    mkdirSync(join(home, 'state'));
    chmodSync(join(home, 'state'), 0o500);
    const r = run('L.writeState("s1", {a:1}); process.stdout.write("ok");');
    expect(r.stdout).toBe('ok');
  });
});

describe('appendEvent', () => {
  it('appends one JSON line per event under events/<session>.jsonl', () => {
    run('L.appendEvent("s1", { t: "x", event: "Stop", session: "s1" }); L.appendEvent("s1", { t: "y", event: "Stop", session: "s1" });');
    const lines = readFileSync(join(home, 'events', 's1.jsonl'), 'utf8').trim().split('\n');
    expect(lines.map((l) => JSON.parse(l).t)).toEqual(['x', 'y']);
  });
  it('survives an unwritable dir', () => {
    mkdirSync(join(home, 'events'));
    chmodSync(join(home, 'events'), 0o500);
    expect(run('L.appendEvent("s1", { t: "x", event: "e", session: "s1" }); process.stdout.write("ok");').stdout).toBe('ok');
  });
  it('20 parallel processes give 20 intact lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pitwall-par-'));
    const file = join(dir, 'p.mjs');
    writeFileSync(file, `import * as L from ${JSON.stringify(LIB)}; L.appendEvent("par", { t: process.argv[2], event: "x", session: "par", detail: "y".repeat(3000) });`);
    await Promise.all(Array.from({ length: 20 }, (_, i) => new Promise<void>((res) =>
      execFile('node', [file, String(i)], { env: { ...process.env, PITWALL_HOME: home } }, () => res()))));
    const lines = readFileSync(join(home, 'events', 'par.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(20);
    expect(new Set(lines.map((l) => JSON.parse(l).t)).size).toBe(20);
  });
});

describe('pitwallHome', () => {
  it('uses PITWALL_HOME, else ~/.claude/pitwall', () => {
    expect(run('process.stdout.write(L.pitwallHome());').stdout).toBe(home);
    const r = spawnSync('node', ['-e', `import(${JSON.stringify(LIB)}).then(L => process.stdout.write(L.pitwallHome()))`], { encoding: 'utf8', env: { ...process.env, PITWALL_HOME: '' } });
    expect(r.stdout.endsWith('/.claude/pitwall')).toBe(true);
  });
});
