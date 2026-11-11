import { closeSync, openSync, readSync, statSync } from 'node:fs';

export class FileTail {
  private offset = 0;
  private pending: Buffer = Buffer.alloc(0);

  constructor(private file: string) {}

  /** Complete new lines since the last call. A trailing partial line stays buffered. */
  readNew(): string[] {
    let size: number;
    try { size = statSync(this.file).size; } catch { return []; }
    if (size < this.offset) { this.offset = 0; this.pending = Buffer.alloc(0); }
    if (size === this.offset) return [];
    const chunk = Buffer.alloc(size - this.offset);
    const fd = openSync(this.file, 'r');
    try { readSync(fd, chunk, 0, chunk.length, this.offset); } finally { closeSync(fd); }
    this.offset = size;

    // Split on raw bytes so a multi-byte character cut by the read is not damaged.
    let data = Buffer.concat([this.pending, chunk]);
    const lines: string[] = [];
    let nl: number;
    while ((nl = data.indexOf(0x0a)) !== -1) {
      lines.push(data.subarray(0, nl).toString('utf8'));
      data = data.subarray(nl + 1);
    }
    this.pending = data;
    return lines;
  }
}
