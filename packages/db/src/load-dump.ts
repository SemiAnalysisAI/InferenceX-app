/**
 * Load a JSON dump directory into a PostgreSQL database.
 *
 * Reads each table's JSON file, streams rows in batches via the postgres
 * driver, resets sequences, and refreshes materialized views.
 *
 * Requires DATABASE_WRITE_URL. For local Postgres (no TLS), set
 * DATABASE_NO_SSL=1.
 *
 * Usage:
 *   pnpm admin:db:load-dump <dump-dir>
 *   pnpm admin:db:load-dump <dump-dir> --yes     # skip confirmation
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { TABLE_INSERT_ORDER, TABLE_NAMES } from '@semianalysisai/inferencex-constants';

import { confirm, hasYesFlag } from './cli-utils';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils';

const sql = createAdminSql({ max: 1 });

// Tables with serial/bigserial PKs that need sequence resets
const SEQUENCES: Array<{ seq: string; table: string; col: string }> = [
  { seq: 'configs_id_seq', table: TABLE_NAMES.configs, col: 'id' },
  { seq: 'server_logs_id_seq', table: TABLE_NAMES.serverLogs, col: 'id' },
  { seq: 'workflow_runs_id_seq', table: TABLE_NAMES.workflowRuns, col: 'id' },
  { seq: 'benchmark_results_id_seq', table: TABLE_NAMES.benchmarkResults, col: 'id' },
  { seq: 'eval_results_id_seq', table: TABLE_NAMES.evalResults, col: 'id' },
  { seq: 'run_stats_id_seq', table: TABLE_NAMES.runStats, col: 'id' },
  { seq: 'changelog_entries_id_seq', table: TABLE_NAMES.changelogEntries, col: 'id' },
];

const BATCH_SIZE = 500;

/**
 * Stream-parse a JSON array file, yielding objects one at a time.
 * Avoids loading the entire file into memory.
 */
async function* streamJsonArray(filePath: string): AsyncGenerator<Record<string, unknown>> {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  let buffer = '';
  let depth = 0;
  let inString = false;
  let escape = false;
  let objectStart = -1;

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if (escape) {
        escape = false;
        buffer += ch;
        continue;
      }

      if (ch === '\\' && inString) {
        escape = true;
        buffer += ch;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        buffer += ch;
        continue;
      }

      if (inString) {
        buffer += ch;
        continue;
      }

      if (ch === '{') {
        if (depth === 0) objectStart = buffer.length;
        depth++;
        buffer += ch;
      } else if (ch === '}') {
        depth--;
        buffer += ch;
        if (depth === 0 && objectStart >= 0) {
          const jsonStr = buffer.slice(objectStart);
          yield JSON.parse(jsonStr);
          buffer = '';
          objectStart = -1;
        }
      } else {
        if (depth > 0) buffer += ch;
        // Outside objects, discard (commas, whitespace, brackets)
        else buffer = '';
      }
    }
  }
}

/** Build column list from first row and insert rows in batches. */
async function loadTable(dumpDir: string, table: string): Promise<number> {
  const filePath = resolve(dumpDir, `${table}.json`);
  try {
    await stat(filePath);
  } catch {
    console.log(`  skip  ${table} (file not found)`);
    return 0;
  }

  const fileStat = await stat(filePath);
  const sizeMB = (fileStat.size / (1024 * 1024)).toFixed(1);
  process.stdout.write(`  ${table} (${sizeMB} MB)...`);

  let columns: string[] | null = null;
  let batch: Record<string, unknown>[] = [];
  let total = 0;

  const flush = async () => {
    if (batch.length === 0 || !columns) return;

    const values: (string | number | boolean | null)[][] = batch.map((row) =>
      columns!.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return null;
        // Postgres text[] arrays: convert JSON ["a","b"] → Postgres {a,b} literal
        if (Array.isArray(val) && val.every((v) => typeof v === 'string'))
          return `{${(val as string[]).map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
        // JSONB columns: stringify objects
        if (typeof val === 'object') return JSON.stringify(val);
        return val as string | number | boolean;
      }),
    );

    const colsSql = columns.join(', ');
    const rows = values
      .map((_, i) => `(${columns!.map((_, j) => `$${i * columns!.length + j + 1}`).join(', ')})`)
      .join(', ');

    await sql.unsafe(`INSERT INTO ${table} (${colsSql}) VALUES ${rows}`, values.flat());

    total += batch.length;
    batch = [];
  };

  for await (const row of streamJsonArray(filePath)) {
    if (!columns) columns = Object.keys(row);
    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      await flush();
      process.stdout.write(`\r  ${table} (${sizeMB} MB)... ${total} rows`);
    }
  }

  await flush();
  console.log(`\r  ${table} (${sizeMB} MB)... ${total} rows`);
  return total;
}

async function resetSequences(): Promise<void> {
  process.stdout.write('  resetting sequences...');
  for (const { seq, table, col } of SEQUENCES) {
    await sql.unsafe(`SELECT setval('${seq}', COALESCE((SELECT MAX(${col}) FROM ${table}), 1))`);
  }
  console.log(' done');
}

async function load(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  // INIT_CWD is the original cwd before pnpm --filter changes to packages/db/
  const base = process.env.INIT_CWD ?? process.cwd();
  const dumpDir = resolve(base, args[0] ?? '');

  if (!args[0]) {
    console.error('Usage: pnpm admin:db:load-dump <dump-dir> [--yes]');
    process.exit(1);
  }

  try {
    await stat(dumpDir);
  } catch {
    console.error(`Dump directory not found: ${dumpDir}`);
    process.exit(1);
  }

  console.log('=== db:load-dump ===\n');
  console.log(`  Source: ${dumpDir}`);
  console.log(`  Target: ${process.env.DATABASE_WRITE_URL?.replace(/:[^@]+@/, ':***@')}`);
  console.log(`  SSL:    ${process.env.DATABASE_NO_SSL ? 'disabled' : 'required'}`);
  console.log();

  if (!hasYesFlag()) {
    const ok = await confirm('This will INSERT data into the target database. Continue? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }
  console.log();

  for (const table of TABLE_INSERT_ORDER) {
    await loadTable(dumpDir, table);
  }

  console.log();
  await resetSequences();
  await refreshLatestBenchmarks(sql, false);

  console.log('\n=== db:load-dump complete ===');
}

load()
  .catch((err) => {
    console.error('db:load-dump failed:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
