import { readFileSync } from 'node:fs';

/** Minimal YAML frontmatter reader: flat `key: value` lines between the first two `---` lines. */
export function readMarkdown(path: string): { meta: Record<string, string>; body: string; bytes: number } {
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  if (m) for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m ? m[2] : raw, bytes: Buffer.byteLength(raw) };
}

export const toolList = (meta: Record<string, string>): string[] => (meta.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean);
