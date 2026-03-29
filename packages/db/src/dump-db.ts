/**
 * Dump each database table to a separate JSON file using the postgres driver.
 * Uses cursors for large tables to avoid OOM.
 *
 * Usage:
 *   pnpm admin:db:dump [output-dir]
 */

import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import postgres from 'postgres';

import { TABLE_NAMES } from '@semianalysisai/inferencex-constants';

if (!process.env.DATABASE_READONLY_URL) {
  console.error('DATABASE_READONLY_URL is required');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_READONLY_URL, {
  ssl: 'require',
  max: 1,
});

const CURSOR_BATCH = 100;

const TABLES = [
  TABLE_NAMES.configs,
  TABLE_NAMES.workflowRuns,
  TABLE_NAMES.serverLogs,
  TABLE_NAMES.benchmarkResults,
  TABLE_NAMES.runStats,
  TABLE_NAMES.evalResults,
  TABLE_NAMES.availability,
  TABLE_NAMES.changelogEntries,
];

/** Stream a table to a JSON file using a cursor, writing row-by-row. */
async function streamTable(table: string, outPath: string): Promise<number> {
  const out = createWriteStream(outPath);
  out.write('[\n');

  let count = 0;
  const cursor = sql`SELECT * FROM ${sql(table)}`.cursor(CURSOR_BATCH);

  for await (const batch of cursor) {
    for (const row of batch) {
      if (count > 0) out.write(',\n');
      out.write(JSON.stringify(row));
      count++;
    }
  }

  out.write('\n]\n');
  await new Promise<void>((res, rej) => out.end(() => res()).on('error', rej));
  return count;
}

async function dump(): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = resolve(process.argv[2] ?? `inferencex-dump-${timestamp}`);
  mkdirSync(outDir, { recursive: true });

  console.log('=== db:dump ===\n');
  console.log(`  Output: ${outDir}\n`);

  for (const table of TABLES) {
    process.stdout.write(`  ${table}...`);
    const outPath = resolve(outDir, `${table}.json`);
    const count = await streamTable(table, outPath);
    console.log(` ${count} rows`);
  }

  console.log('\n=== db:dump complete ===');
}

dump()
  .catch((err) => {
    console.error('db:dump failed:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
