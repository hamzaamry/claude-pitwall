import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectDirFor, latestSession, subagentFiles } from '../src/transcript/locate.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pitwall-loc-')); });

describe('locate', () => {
  it('projectDirFor maps cwd to the project slug dir', () => {
    expect(projectDirFor('/home/teacup/Hevier', '/h')).toBe('/h/.claude/projects/-home-teacup-Hevier');
  });

  it('latestSession picks newest mtime', () => {
    writeFileSync(join(dir, 'old.jsonl'), '');
    writeFileSync(join(dir, 'new.jsonl'), '');
    writeFileSync(join(dir, 'notes.txt'), '');
    utimesSync(join(dir, 'old.jsonl'), 1000, 1000);
    utimesSync(join(dir, 'new.jsonl'), 2000, 2000);
    utimesSync(join(dir, 'notes.txt'), 3000, 3000);
    expect(latestSession(dir)).toEqual({ id: 'new', file: join(dir, 'new.jsonl') });
  });

  it('latestSession returns null for empty or missing dir', () => {
    expect(latestSession(dir)).toBeNull();
    expect(latestSession(join(dir, 'missing'))).toBeNull();
  });

  it('subagentFiles lists agent-*.jsonl with meta', () => {
    const sub = join(dir, 's1', 'subagents');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'agent-a1.jsonl'), '');
    writeFileSync(join(sub, 'agent-a1.meta.json'), '{}');
    writeFileSync(join(sub, 'other.txt'), '');
    expect(subagentFiles(dir, 's1')).toEqual([
      { key: 'a1', file: join(sub, 'agent-a1.jsonl'), metaFile: join(sub, 'agent-a1.meta.json') },
    ]);
    expect(subagentFiles(dir, 'nope')).toEqual([]);
  });
});
