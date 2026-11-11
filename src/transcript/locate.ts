import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function projectDirFor(cwd: string, home: string = homedir()): string {
  return join(home, '.claude', 'projects', cwd.replace(/\//g, '-'));
}

export function latestSession(projectDir: string): { id: string; file: string } | null {
  if (!existsSync(projectDir)) return null;
  let best: { id: string; file: string; mtime: number } | null = null;
  for (const name of readdirSync(projectDir)) {
    if (!name.endsWith('.jsonl')) continue;
    const file = join(projectDir, name);
    const mtime = statSync(file).mtimeMs;
    if (!best || mtime > best.mtime) best = { id: name.slice(0, -'.jsonl'.length), file, mtime };
  }
  return best && { id: best.id, file: best.file };
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
