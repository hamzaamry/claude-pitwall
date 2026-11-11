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
