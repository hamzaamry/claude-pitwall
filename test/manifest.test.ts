import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

describe('plugin manifests', () => {
  it('plugin.json is valid and every command file exists', () => {
    const p = json('.claude-plugin/plugin.json');
    expect(p.name).toBe('pitwall');
    expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(p.commands.length).toBeGreaterThan(0);
    for (const c of p.commands) expect(existsSync(join(root, c)), c).toBe(true);
  });

  it('marketplace.json lists pitwall from the repo root', () => {
    const m = json('.claude-plugin/marketplace.json');
    const entry = m.plugins.find((x: { name: string }) => x.name === 'pitwall');
    expect(typeof m.owner?.name).toBe('string'); // Claude Code rejects a marketplace without an owner object
    expect(m.owner.name.length).toBeGreaterThan(0);
    expect(entry.source).toBe('./');
    expect(entry.category).toBe('monitoring');
  });

  it('commands point at files that ship in the repo', () => {
    const setup = readFileSync(join(root, 'commands/setup.md'), 'utf8');
    const watch = readFileSync(join(root, 'commands/watch.md'), 'utf8');
    expect(setup).toContain('${CLAUDE_PLUGIN_ROOT}/bin/statusline-tee.mjs');
    expect(watch).toContain('${CLAUDE_PLUGIN_ROOT}/dist/cli.js');
    expect(existsSync(join(root, 'bin/statusline-tee.mjs'))).toBe(true);
  });
});

describe('team commands', () => {
  const cmd = (n: string) => readFileSync(join(root, 'commands', `${n}.md`), 'utf8');
  it('plugin.json lists all five commands', () => {
    const p = json('.claude-plugin/plugin.json');
    for (const n of ['setup', 'watch', 'on', 'off', 'ask-opus']) expect(p.commands, n).toContain(`./commands/${n}.md`);
    expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('on: writes the per-session flag and loads the workflow skill', () => {
    const t = cmd('on');
    expect(t).toContain('${CLAUDE_SESSION_ID}');
    expect(t).toContain('team');
    expect(t).toContain('pitwall:workflow');
  });
  it('off: removes the flag', () => {
    const t = cmd('off');
    expect(t).toContain('${CLAUDE_SESSION_ID}');
    expect(t).toMatch(/rm -f/);
  });
  it('ask-opus: sends the question to the reviewer with the ASK-OPUS marker and prints the answer word for word', () => {
    const t = cmd('ask-opus');
    expect(t).toContain('pitwall:reviewer');
    expect(t).toContain('ASK-OPUS:');
    expect(t).toContain('word for word');
    expect(t).toContain('$ARGUMENTS');
  });
  it('setup: shows each change and asks before applying; the model is only suggested', () => {
    const t = cmd('setup');
    expect(t).toContain('advisorModel');
    expect(t).toContain('Explore.md');
    expect(t).toContain('statusline-tee.mjs');
    expect(t).toMatch(/AskUserQuestion/);
    expect(t).toMatch(/only after a yes/i);
    expect(t).toMatch(/\/model sonnet/);
    expect(t).toMatch(/never change the model/i);
  });
});

describe('release 0.2.0', () => {
  it('plugin.json, marketplace.json and package.json share one version', () => {
    const v = json('package.json').version;
    expect(json('.claude-plugin/plugin.json').version).toBe(v);
    expect(json('.claude-plugin/marketplace.json').metadata.version).toBe(v);
    expect(json('.claude-plugin/marketplace.json').plugins[0].source).toBe('./');
    expect(v).toBe('0.2.0');
  });
  it('the team files exist', () => {
    for (const f of ['agents/scout.md', 'agents/runner.md', 'agents/reviewer.md', 'skills/workflow/SKILL.md', 'hooks/hooks.json',
      'hooks/lib/hook.mjs', 'hooks/event-log.mjs', 'hooks/read-cap.mjs', 'hooks/same-error.mjs', 'hooks/review-gate.mjs']) {
      expect(existsSync(join(root, f)), f).toBe(true);
    }
  });
  it('the README explains the team: on, off, ask-opus, off by default, the hooks', () => {
    const r = readFileSync(join(root, 'README.md'), 'utf8');
    for (const w of ['/pitwall:on', '/pitwall:off', '/pitwall:ask-opus', 'off by default', 'read-cap', 'same-error', 'review-gate', 'event-log']) {
      expect(r, w).toContain(w);
    }
  });
});

describe('committed build', () => {
  it('dist/cli.js runs on its own, with no node_modules next to it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pitwall-bundle-'));
    copyFileSync(join(root, 'dist/cli.js'), join(dir, 'cli.js'));
    const r = spawnSync('node', [join(dir, 'cli.js'), '--help'], { encoding: 'utf8', cwd: dir });
    expect(r.stderr).not.toContain('Cannot find');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('pitwall watch');
  });
});
