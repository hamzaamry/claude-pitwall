#!/usr/bin/env node
// Black-box grader for the Hevier issue #24 benchmark (CSV import fix).
// Runs the import CLI on small CSV files and checks exit codes and the written database,
// so any solution is graded the same way, whatever its internal function names.
// usage: node grade-import.mjs <hevier-worktree>
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = process.argv[2];
if (!repo || !existsSync(join(repo, 'scripts/import-csv.ts'))) {
  console.error('usage: node grade-import.mjs <hevier-worktree>');
  process.exit(2);
}
const initSqlJs = createRequire(join(repo, 'package.json'))('sql.js');
const TSX = 'tsx@4.19.2';
const dir = mkdtempSync(join(tmpdir(), 'grade-import-'));

const METRIC = '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"';
const IMPERIAL = METRIC.replace('weight_kg', 'weight_lbs').replace('distance_km', 'distance_miles');
const row = (start, weight, distance = '') =>
  `"LOWER A","${start}","Oct 1, 2026, 7:00 PM","","Squat (Machine)",,"",0,"normal",${weight},10,${distance},,`;
const run = (start, km) => `"RUN","${start}","Oct 2, 2026, 7:00 PM","","Running",,"",0,"normal",,,${km},1800,`;

function importCsv(name, csv, env = {}) {
  const csvPath = join(dir, `${name}.csv`);
  const out = join(dir, `${name}.db`);
  writeFileSync(csvPath, csv);
  const r = spawnSync('npx', ['--yes', TSX, 'scripts/import-csv.ts', csvPath, out], {
    cwd: repo, env: { ...process.env, TZ: 'Europe/Paris', ...env }, encoding: 'utf8', timeout: 120_000,
  });
  return { code: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}`, out, written: existsSync(out) };
}

async function query(dbPath, sql) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(dbPath));
  return db.exec(sql)[0]?.values ?? [];
}

const checks = [
  ['metric export still imports (regression)', async () => {
    const r = importCsv('metric', readFileSync(join(repo, 'scripts/fixtures/sample-workouts.csv'), 'utf8'));
    if (r.code !== 0 || !r.written) return `exit ${r.code}: ${r.output.trim().slice(0, 200)}`;
    const [[w]] = await query(r.out, 'SELECT COUNT(*) FROM workouts');
    return w === 6 || `${w} workouts, expected 6`;
  }],
  ['pounds export: lbs and miles converted to kg and km', async () => {
    const r = importCsv('imperial', [IMPERIAL, row('Oct 1, 2026, 6:00 PM', 100), run('Oct 2, 2026, 6:00 PM', 1)].join('\n'));
    if (r.code !== 0 || !r.written) return `exit ${r.code}: ${r.output.trim().slice(0, 200)}`;
    const [[kg]] = await query(r.out, 'SELECT weight_kg FROM sets WHERE weight_kg IS NOT NULL');
    const [[km]] = await query(r.out, 'SELECT distance_km FROM sets WHERE distance_km IS NOT NULL');
    if (Math.abs(kg - 45.359) > 0.01) return `100 lb stored as ${kg} kg`;
    return Math.abs(km - 1.609) < 0.01 || `1 mile stored as ${km} km`;
  }],
  ['one bad row is skipped and named, the rest imports', async () => {
    const good = Array.from({ length: 10 }, (_, i) => row(`Oct ${i + 1}, 2026, 6:00 PM`, 100));
    // data row 6 is bad (line 7 of the file, counting the header): either numbering is accepted
    const csv = [METRIC, ...good.slice(0, 5), row('not a date', 80), ...good.slice(5)].join('\n');
    const r = importCsv('badrow', csv);
    if (r.code !== 0 || !r.written) return `exit ${r.code}: ${r.output.trim().slice(0, 200)}`;
    const [[w]] = await query(r.out, 'SELECT COUNT(*) FROM workouts');
    if (w !== 10) return `${w} workouts, expected 10`;
    return /\b(row|line)\s*(6|7)\b/i.test(r.output) || 'output does not name the bad row (6 or 7)';
  }],
  ['empty file: exit 1, nothing written', async () => {
    const r = importCsv('empty', `${METRIC}\n`);
    return (r.code === 1 && !r.written) || `exit ${r.code}, file written: ${r.written}: ${r.output.trim().slice(0, 160)}`;
  }],
  ['mostly unreadable dates: exit 1, nothing written', async () => {
    const csv = [METRIC, row('??', 100), row('date inconnue', 90), row('', 80)].join('\n');
    const r = importCsv('unreadable', csv);
    return (r.code === 1 && !r.written) || `exit ${r.code}, file written: ${r.written}: ${r.output.trim().slice(0, 160)}`;
  }],
  ['HEVIER_TIMEZONE sets the zone (6 PM Paris = 16:00 UTC on a UTC machine)', async () => {
    const r = importCsv('zone', [METRIC, row('Oct 1, 2026, 6:00 PM', 100)].join('\n'), { TZ: 'UTC', HEVIER_TIMEZONE: 'Europe/Paris' });
    if (r.code !== 0 || !r.written) return `exit ${r.code}: ${r.output.trim().slice(0, 200)}`;
    const [[start]] = await query(r.out, 'SELECT start_time FROM workouts');
    const iso = new Date(start).toISOString();
    return iso === '2026-10-01T16:00:00.000Z' || `stored ${start} (${iso})`;
  }],
];

let passed = 0;
for (const [name, check] of checks) {
  let result;
  try { result = await check(); } catch (e) { result = `crashed: ${e.message}`; }
  if (result === true) passed++;
  console.log(`${result === true ? 'PASS' : 'FAIL'}  ${name}${result === true ? '' : `\n      ${result}`}`);
}
console.log(`\n${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
