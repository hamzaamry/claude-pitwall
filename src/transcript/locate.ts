import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Claude Code names a project folder after the cwd with every non-alphanumeric character as "-",
 *  cut to 200 characters plus a hash when it is longer. */
export function projectDirFor(cwd: string, home: string = homedir()): string {
  const base = join(home, '.claude', 'projects');
  const slug = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (slug.length <= 200) return join(base, slug);
  const prefix = slug.slice(0, 200);
  try {
    const hit = readdirSync(base).find((n) => n.startsWith(prefix));
    if (hit) return join(base, hit);
  } catch { /* no projects folder yet */ }
  return join(base, prefix);
}

export type SessionFile = { id: string; file: string; mtime: number };

/** Session transcripts in a project folder, newest first. */
export function listSessions(projectDir: string): SessionFile[] {
  if (!existsSync(projectDir)) return [];
  const out: SessionFile[] = [];
  for (const name of readdirSync(projectDir)) {
    if (!name.endsWith('.jsonl')) continue;
    const file = join(projectDir, name);
    try { out.push({ id: name.slice(0, -'.jsonl'.length), file, mtime: statSync(file).mtimeMs }); } catch { /* deleted while scanning */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export function latestSession(projectDir: string): { id: string; file: string } | null {
  const best = listSessions(projectDir)[0];
  return best ? { id: best.id, file: best.file } : null;
}

export function subagentFiles(projectDir: string, sessionId: string): { key: string; file: string; metaFile: string }[] {
  const dir = join(projectDir, sessionId, 'subagents');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.startsWith('agent-') && n.endsWith('.jsonl'))
    .sort()
    .map((n) => ({
      key: n.slice('agent-'.length, -'.jsonl'.length),
      file: join(dir, n),
      metaFile: join(dir, n.replace(/\.jsonl$/, '.meta.json')),
    }));
}
