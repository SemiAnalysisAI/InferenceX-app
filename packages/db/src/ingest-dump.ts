/**
 * Ingest a database dump (produced by dump-db.ts) into a fresh database.
 *
 * Expects the target database to have the schema already applied (run db:migrate first).
 * Reads each JSON file and inserts in batches, respecting foreign-key order.
 *
 * Usage:
 *   pnpm db:ingest:dump <dump-dir>
 *
 * The dump directory should contain JSON files named after table names
 * (e.g. configs.json, workflow_runs.json, etc.) as produced by db:dump.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import postgres from 'postgres';

import { TABLE_NAMES } from '@semianalysisai/inferencex-constants';

if (!process.env.DATABASE_WRITE_URL) {
  console.error('DATABASE_WRITE_URL is required');
  process.exit(1);
}

const dumpDir = process.argv[2];
if (!dumpDir) {
  console.error('Usage: pnpm db:ingest:dump <dump-dir>');
  process.exit(1);
}

const resolvedDir = resolve(dumpDir);
if (!existsSync(resolvedDir)) {
  console.error(`Dump directory not found: ${resolvedDir}`);
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_WRITE_URL, {
  ssl: 'require',
  max: 1,
});

const INSERT_BATCH = 500;

/** Insertion order respects foreign-key constraints. */
const TABLES_IN_ORDER = [
  TABLE_NAMES.configs,
  TABLE_NAMES.workflowRuns,
  TABLE_NAMES.serverLogs,
  TABLE_NAMES.availability,
  TABLE_NAMES.runStats,
  TABLE_NAMES.benchmarkResults,
  TABLE_NAMES.evalResults,
  TABLE_NAMES.changelogEntries,
];

/** Read a JSON array file and insert rows in batches. */
async function ingestTable(table: string, filePath: string): Promise<number> {
  const rows: Record<string, unknown>[] = JSON.parse(readFileSync(filePath, 'utf8'));

  if (rows.length === 0) return 0;

  const columns = Object.keys(rows[0]!);

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    await sql`
      INSERT INTO ${sql(table)} ${sql(batch, ...columns)}
      ON CONFLICT DO NOTHING
    `;

    if (i + INSERT_BATCH < rows.length) {
      process.stdout.write(`\r  ${table}... ${i + batch.length} rows`);
    }
  }

  return rows.length;
}

async function ingest(): Promise<void> {
  console.log('=== db:ingest:dump ===\n');
  console.log(`  Source: ${resolvedDir}\n`);

  for (const table of TABLES_IN_ORDER) {
    const filePath = resolve(resolvedDir, `${table}.json`);

    if (!existsSync(filePath)) {
      console.log(`  ${table}... skipped (file not found)`);
      continue;
    }

    process.stdout.write(`  ${table}...`);
    const count = await ingestTable(table, filePath);
    process.stdout.write(`\r  ${table}... ${count} rows\n`);
  }

  // Refresh materialized view so the app works immediately
  console.log('\n  Refreshing materialized view...');
  await sql`REFRESH MATERIALIZED VIEW latest_benchmarks`;

  // Reset sequences so future inserts get correct IDs
  console.log('  Resetting sequences...\n');
  for (const table of TABLES_IN_ORDER) {
    // availability has a composite PK with no serial column
    if (table === TABLE_NAMES.availability) continue;

    await sql`
      SELECT setval(
        pg_get_serial_sequence(${table}, 'id'),
        COALESCE((SELECT MAX(id) FROM ${sql(table)}), 0)
      )
    `;
  }

  console.log('=== db:ingest:dump complete ===');
}

ingest()
  .catch((err) => {
    console.error('db:ingest:dump failed:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
