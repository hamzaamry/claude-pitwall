// Opens the pitwall dashboard in a new terminal window. Used by /pitwall:on.
// Usage: node open-dashboard.mjs <session-id> [cwd]   (prints one line saying what happened)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [session = '', cwd = process.cwd()] = process.argv.slice(2);
const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
const watch = ['node', cli, 'watch', '--cwd', cwd, ...(session ? ['--session', session] : [])];

const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;

// One dashboard per session: a second /pitwall:on must not open a second window.
// The terminal may hand the window to another process, so look for the dashboard itself.
const marker = session ? `--session ${session}` : `--cwd ${cwd}`;
const running = spawnSync('pgrep', ['-f', `cli.js watch .*${marker}`], { encoding: 'utf8' });
if (running.status === 0) { console.log('dashboard already open'); process.exit(0); }

if (!existsSync(cli)) { console.log(`dashboard not built: ${cli} is missing`); process.exit(0); }

const quoted = watch.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
const candidates = [
  ['tmux', () => process.env.TMUX && ['tmux', 'split-window', '-d', '-h', quoted]],
  ['ptyxis', () => ['ptyxis', '--new-window', '-x', quoted]],
  ['gnome-terminal', () => ['gnome-terminal', '--', ...watch]],
  ['kitty', () => ['kitty', ...watch]],
  ['alacritty', () => ['alacritty', '-e', ...watch]],
  ['konsole', () => ['konsole', '-e', ...watch]],
  ['wezterm', () => ['wezterm', 'start', '--', ...watch]],
  ['xterm', () => ['xterm', '-e', ...watch]],
];

for (const [bin, build] of candidates) {
  if (!has(bin)) continue;
  const argv = build();
  if (!argv) continue;
  const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
  console.log(`dashboard opened in ${bin}`);
  process.exit(0);
}
console.log('no terminal found; run /pitwall:watch to get the command');
