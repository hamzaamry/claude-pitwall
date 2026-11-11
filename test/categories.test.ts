import { describe, it, expect } from 'vitest';
import { categorize } from '../src/model/categories.js';
import type { Block } from '../src/transcript/types.js';

const tool = (name: string, input: Record<string, unknown> = {}): Block => ({ type: 'tool_use', id: 't', name, input });
const text = (chars: number): Block => ({ type: 'text', chars });

describe('categorize', () => {
  it('Edit is coding', () => expect(categorize([tool('Edit')], false)).toBe('coding'));
  it('Write is coding', () => expect(categorize([tool('Write')], false)).toBe('coding'));
  it('NotebookEdit is coding', () => expect(categorize([tool('NotebookEdit')], false)).toBe('coding'));
  it('Bash with a test command is tests', () =>
    expect(categorize([tool('Bash', { command: 'npx vitest run' })], false)).toBe('tests'));
  it('Bash with another command is not tests', () =>
    expect(categorize([tool('Bash', { command: 'ls -la' })], false)).toBe('talking'));
  it('Read, Grep, Glob, WebFetch, WebSearch are reading', () => {
    for (const n of ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']) {
      expect(categorize([tool(n)], false)).toBe('reading');
    }
  });
  it('TodoWrite before any edit is planning', () =>
    expect(categorize([tool('TodoWrite'), text(10)], false)).toBe('planning'));
  it('long text before any edit is planning', () =>
    expect(categorize([text(1300)], false)).toBe('planning'));
  it('long text after an edit is talking', () =>
    expect(categorize([text(1300)], true)).toBe('talking'));
  it('short text-only is talking', () => expect(categorize([text(50)], false)).toBe('talking'));
  it('first match wins: Edit + Read is coding', () =>
    expect(categorize([tool('Read'), tool('Edit')], false)).toBe('coding'));
});
