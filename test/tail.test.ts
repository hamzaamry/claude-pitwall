import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTail } from '../src/transcript/tail.js';

let file: string;
beforeEach(() => { file = join(mkdtempSync(join(tmpdir(), 'pitwall-tail-')), 't.jsonl'); });

describe('FileTail', () => {
  it('readNew returns only complete lines', () => {
    writeFileSync(file, 'a\nb');
    const t = new FileTail(file);
    expect(t.readNew()).toEqual(['a']);
    appendFileSync(file, 'c\n');
    expect(t.readNew()).toEqual(['bc']);
    expect(t.readNew()).toEqual([]);
  });

  it('readNew handles truncation', () => {
    writeFileSync(file, 'one\ntwo\nthree\n');
    const t = new FileTail(file);
    expect(t.readNew()).toEqual(['one', 'two', 'three']);
    writeFileSync(file, 'x\n');
    expect(t.readNew()).toEqual(['x']);
  });

  it('readNew on a missing file returns nothing', () => {
    expect(new FileTail(file + '.missing').readNew()).toEqual([]);
  });

  it('readNew keeps a multi-byte character split across reads intact', () => {
    const bytes = Buffer.from('é\n');
    writeFileSync(file, bytes.subarray(0, 1));
    const t = new FileTail(file);
    expect(t.readNew()).toEqual([]);
    appendFileSync(file, bytes.subarray(1));
    expect(t.readNew()).toEqual(['é']);
  });
});
