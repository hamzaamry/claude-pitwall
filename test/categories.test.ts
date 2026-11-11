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
  it('Bash with an unrelated command is not tests', () =>
    expect(categorize([tool('Bash', { command: 'echo hi' })], false)).toBe('talking'));
  it('Bash that only looks at files is reading', () => {
    for (const command of ['ls -la', 'cat app/x.ts', 'grep -rn foo src', 'rg foo', 'find . -name "*.ts"', 'head -20 a.ts',
      'cd /repo && git diff HEAD~1', 'sed -n 1,20p a.ts', 'wc -l a.ts', 'git log --oneline | head']) {
      expect(categorize([tool('Bash', { command })], false), command).toBe('reading');
    }
  });
  it('a test command after cd is still tests', () =>
    expect(categorize([tool('Bash', { command: 'cd /repo/apps/mobile && npx tsc --noEmit' })], false)).toBe('tests'));
  it('Bash that writes files is coding', () => {
    for (const command of ['cat a.ts > b.ts', "python3 - <<'EOF'\nopen('a').write('x')\nEOF", 'sed -i s/a/b/ f.ts']) {
      expect(categorize([tool('Bash', { command })], false), command).toBe('coding');
    }
    expect(categorize([tool('Bash', { command: 'npx vitest run 2>&1 | tail -5' })], false)).toBe('tests');
  });
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
