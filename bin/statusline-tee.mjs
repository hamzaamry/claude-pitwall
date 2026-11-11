#!/usr/bin/env node
// pitwall status line wrapper: saves the status line JSON for the dashboard,
// then hands the original input to the user's real status line command.
// It must never break that command, so every failure is swallowed.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const home = process.env.PITWALL_HOME || join(homedir(), '.claude', 'pitwall');

let input = '';
try { input = readFileSync(0, 'utf8'); } catch {}

try {
  const data = JSON.parse(input);
  const id = String(data.session_id ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  if (id) {
    const dir = join(home, 'statusline');
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, `.${id}.${process.pid}.tmp`);
    writeFileSync(tmp, input);
    renameSync(tmp, join(dir, `${id}.json`));
  }
} catch {}

try {
  const wrapped = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')).wrappedStatusLine;
  if (typeof wrapped === 'string' && wrapped.trim()) {
    const r = spawnSync('sh', ['-c', wrapped], { input, encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] });
    if (r.stdout) process.stdout.write(r.stdout);
  }
} catch {}

process.exit(0);
