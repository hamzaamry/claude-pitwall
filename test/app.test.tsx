import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { cpSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '../src/App.js';

const FIXTURE = new URL('./fixtures/session', import.meta.url).pathname;
let home: string;
let projectDir: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'pitwall-app-'));
  projectDir = join(home, '.claude', 'projects', '-proj');
});

const show = (width: number) =>
  render(<App cwd="/proj" home={home} width={width} height={45} pollMs={0} tickMs={0} />).lastFrame()!;

describe('App', () => {
  it('waits when there is no session', () => {
    expect(show(120)).toContain('waiting for a Claude Code session in');
  });

  it('waits when the project dir is empty', () => {
    mkdirSync(projectDir, { recursive: true });
    expect(show(120)).toContain('waiting for a Claude Code session in');
  });

  it('at 120 columns still shows the sidebar, narrower', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const f = show(120);
    expect(f).toContain('LIMITS');
    expect(f).toContain('WHERE TOKENS WENT');
    expect(f).toContain('find callers');
    for (const line of f.split('\n')) expect([...line].length).toBeLessThanOrEqual(120);
  });

  it('at 100 columns still shows the sidebar', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const f = show(100);
    expect(f).toContain('LIMITS');
    for (const line of f.split('\n')) expect([...line].length).toBeLessThanOrEqual(100);
  });

  it('below 100 columns hides the sidebar so the graph stays readable', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const f = show(90);
    expect(f).not.toContain('LIMITS');
    expect(f).toContain('find callers');
  });

  it('at 170 columns shows the stats column', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const f = show(170);
    expect(f).toContain('LIMITS');
    expect(f).toContain('find callers');
  });

  it('shows no team pill in phase 1', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    expect(show(170)).not.toContain('team');
  });

  it('has a footer with the quit key', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const f = show(170);
    expect(f).toContain('$ pitwall watch');
    expect(f).toContain('q quit');
  });

  it('fits in the terminal height', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    for (const h of [45, 30]) {
      const f = render(<App cwd="/proj" home={home} width={170} height={h} pollMs={0} tickMs={0} />).lastFrame()!;
      expect(f.split('\n').length).toBeLessThanOrEqual(Math.max(h, 40));
    }
  });

  it('survives a tiny terminal', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    expect(() => show(20)).not.toThrow();
  });
});
