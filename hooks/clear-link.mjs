// /clear ends a session and starts a new one. This links the two so the dashboard can follow:
// SessionEnd (reason clear) and SessionStart (source clear) each leave their half in clears/<cwd>.json,
// and whichever comes second writes next/<old id> = <new id>.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pitwallHome, runHook } from './lib/hook.mjs';

const PAIR_MS = 10_000;
const safe = (s) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '');

function sideOf(input) {
  if (input.hook_event_name === 'SessionEnd' && input.reason === 'clear') return 'old';
  if (input.hook_event_name === 'SessionStart' && input.source === 'clear') return 'new';
}

function readHalf(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}

export function link(input, home = pitwallHome(), now = Date.now()) {
  const id = safe(input.session_id);
  const side = sideOf(input);
  if (!id || !side) return;
  const pending = join(home, 'clears', `${String(input.cwd ?? '').replace(/[^a-zA-Z0-9]/g, '-')}.json`);
  const half = readHalf(pending);
  const other = side === 'old' ? half.new : half.old;
  if (other && now - half.t < PAIR_MS) {
    const [oldId, newId] = side === 'old' ? [id, other] : [other, id];
    mkdirSync(join(home, 'next'), { recursive: true });
    writeFileSync(join(home, 'next', oldId), newId);
    rmSync(pending, { force: true });
  } else {
    mkdirSync(join(home, 'clears'), { recursive: true });
    writeFileSync(pending, JSON.stringify({ [side]: id, t: now }));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) runHook(link);
