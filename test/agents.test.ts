import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readMarkdown, toolList } from './helpers/frontmatter.js';

const root = new URL('..', import.meta.url).pathname;
const agent = (n: string) => readMarkdown(join(root, 'agents', `${n}.md`));

describe('agent files', () => {
  it.each(['scout', 'runner', 'reviewer'])('%s is at most 2048 bytes and has a name and description', (n) => {
    const a = agent(n);
    expect(a.bytes).toBeLessThanOrEqual(2048);
    expect(a.meta.name).toBe(n);
    expect(a.meta.description.length).toBeGreaterThan(20);
  });

  it('scout: haiku, low effort, read-only search tools, 12 turns', () => {
    const { meta } = agent('scout');
    expect(meta).toMatchObject({ model: 'haiku', effort: 'low', maxTurns: '12' });
    expect(toolList(meta)).toEqual(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch']);
  });

  it('scout body: one question, file:line map, at most 15 lines, confidence', () => {
    const { body } = agent('scout');
    for (const w of ['file', '15 lines', 'confidence', 'ONE question']) expect(body, w).toContain(w);
  });

  it('runner: haiku, low effort, Bash and Read only, 8 turns, returns only failures', () => {
    const { meta, body } = agent('runner');
    expect(meta).toMatchObject({ model: 'haiku', effort: 'low', maxTurns: '8' });
    expect(toolList(meta)).toEqual(['Bash', 'Read']);
    expect(body).toContain('all passed');
    expect(body).toMatch(/only the failing/i);
  });

  it('reviewer: opus, high effort, no Edit or Write, 20 turns', () => {
    const { meta } = agent('reviewer');
    expect(meta).toMatchObject({ model: 'opus', effort: 'high', maxTurns: '20' });
    const tools = toolList(meta);
    expect(tools).toEqual(['Read', 'Grep', 'Glob', 'Bash', 'Agent']);
    expect(tools).not.toContain('Edit');
    expect(tools).not.toContain('Write');
  });

  it('reviewer body carries the output contract', () => {
    const { body } = agent('reviewer');
    for (const w of ['approved', 'needs info', 'fix', 'file:line', '100 words', 'unverified', "don't invent problems", 'git diff', 'never edit', 'ASK-OPUS']) {
      expect(body.toLowerCase(), w).toContain(w.toLowerCase());
    }
  });
});
