import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLine } from '../src/transcript/parse.js';

const fx = (n: string) => readFileSync(new URL(`./fixtures/lines/${n}.json`, import.meta.url), 'utf8').trim();

describe('parseLine', () => {
  it('parses assistant line', () => {
    const e = parseLine(fx('assistant-agent'));
    expect(e?.kind).toBe('assistant');
    if (e?.kind !== 'assistant') return;
    expect(e.messageId).toBe('msg_1');
    expect(e.model).toBe('claude-sonnet-5-5');
    expect(e.effort).toBe('medium');
    expect(e.usage).toEqual({ input: 2, output: 175, cacheRead: 31382, cacheWrite: 11931 });
    const b = e.blocks[0];
    expect(b.type).toBe('tool_use');
    if (b.type === 'tool_use') {
      expect(b.name).toBe('Agent');
      expect(b.input.description).toBe('find callers');
    }
  });
  it('parses user prompt', () => {
    expect(parseLine(fx('user-prompt'))).toMatchObject({ kind: 'userPrompt', text: 'fix the save bug' });
  });
  it('parses tool result', () => {
    expect(parseLine(fx('tool-result'))).toMatchObject({
      kind: 'toolResult', toolUseId: 'toolu_1', isError: true, text: 'boom\nbang',
    });
  });
  it('separates advisor usage', () => {
    const e = parseLine(fx('assistant-advisor'));
    if (e?.kind !== 'assistant') throw new Error('not assistant');
    expect(e.advisorUsage!.output).toBe(697);
    expect(e.advisorUsage!.input).toBe(25601);
    expect(e.usage.output).toBe(205);
    expect(e.blocks[0]).toMatchObject({ type: 'server_tool_use', name: 'advisor' });
  });
  it('ignores other line types', () => {
    for (const t of ['attachment', 'api-request', 'ai-title', 'future-type']) {
      expect(parseLine(fx(`other-${t}`))).toBeNull();
    }
  });
  it('returns null on invalid JSON', () => {
    expect(parseLine('{nope')).toBeNull();
  });

  const user = (content: unknown, extra: object = {}) =>
    JSON.stringify({ type: 'user', timestamp: 't', message: { role: 'user', content }, ...extra });
  it('skips meta and command wrapper lines (they are not the task)', () => {
    expect(parseLine(user('<command-name>/model</command-name>'))).toBeNull();
    expect(parseLine(user('<local-command-stdout>ok</local-command-stdout>'))).toBeNull();
    expect(parseLine(user('<local-command-caveat>x</local-command-caveat>'))).toBeNull();
    expect(parseLine(user('real text', { isMeta: true }))).toBeNull();
  });
  it('skips the interrupt notice Claude Code writes as a user line', () => {
    expect(parseLine(user('[Request interrupted by user for tool use]'))).toBeNull();
    expect(parseLine(user('[Request interrupted by user]'))).toBeNull();
  });
  it('takes the text of a prompt stored as an array (e.g. with an image)', () => {
    expect(parseLine(user([{ type: 'image', source: {} }, { type: 'text', text: 'fix this' }])))
      .toMatchObject({ kind: 'userPrompt', text: 'fix this' });
  });
  it('keeps a normal prompt that starts with a bracket', () => {
    expect(parseLine(user('<div> is broken'))).toMatchObject({ kind: 'userPrompt' });
  });
});
