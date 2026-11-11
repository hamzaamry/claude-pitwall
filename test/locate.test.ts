import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectDirFor, latestSession, listSessions, subagentFiles } from '../src/transcript/locate.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pitwall-loc-')); });

describe('locate', () => {
  it('projectDirFor maps cwd to the project slug dir', () => {
    expect(projectDirFor('/home/teacup/Hevier', '/h')).toBe('/h/.claude/projects/-home-teacup-Hevier');
  });

  it('projectDirFor replaces every non-alphanumeric character like Claude Code does', () => {
    expect(projectDirFor('/home/a_b.c/my app', '/h')).toBe('/h/.claude/projects/-home-a-b-c-my-app');
  });

  it('projectDirFor finds a hashed long-name folder by its 200-char prefix', () => {
    const long = '/' + 'a'.repeat(250);
    const slug = long.replace(/[^a-zA-Z0-9]/g, '-');
    const projects = join(dir, '.claude', 'projects');
    mkdirSync(join(projects, slug.slice(0, 200) + '-abc123'), { recursive: true });
    expect(projectDirFor(long, dir)).toBe(join(projects, slug.slice(0, 200) + '-abc123'));
  });

  it('listSessions lists jsonl files newest first', () => {
    writeFileSync(join(dir, 'a.jsonl'), ''); writeFileSync(join(dir, 'b.jsonl'), '');
    utimesSync(join(dir, 'a.jsonl'), 2000, 2000); utimesSync(join(dir, 'b.jsonl'), 1000, 1000);
    expect(listSessions(dir).map((x) => x.id)).toEqual(['a', 'b']);
    expect(listSessions(join(dir, 'missing'))).toEqual([]);
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
