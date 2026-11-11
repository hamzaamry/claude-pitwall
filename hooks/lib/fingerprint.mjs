import { createHash } from 'node:crypto';

// Lines a test runner prints after its failures: they are the same for different failures, so they say nothing.
const SUMMARY = /^\s*(Test Files|Tests|Test Suites|Snapshots|Duration|Start at|Time|Ran all test suites|Ran \d+ tests?)\b/i;

/** Same error text must give the same fingerprint: summary lines, timestamps, durations, temp paths, ids and numbers are blanked. */
export function fingerprint(output) {
  const lines = String(output ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !SUMMARY.test(l)).slice(-5);
  const norm = lines.join('\n')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<time>')
    .replace(/\b\d{1,2}:\d{2}:\d{2}\b/g, '<time>')
    .replace(/\b\d+(\.\d+)?\s?(ms|s|secs?|seconds|min|m)\b/g, '<dur>')
    .replace(/\/(tmp|var\/folders)\/\S+/g, '<tmp>')
    .replace(/\b[0-9a-f]{7,}\b/gi, '<hex>')
    .replace(/\d+(\.\d+)?/g, '<n>');
  return createHash('sha1').update(norm).digest('hex');
}

/** One key per command, so the same error from two different commands is not "the same failure twice". */
export const commandKey = (command) => createHash('sha1').update(String(command ?? '').trim().replace(/\s+/g, ' ')).digest('hex').slice(0, 12);
