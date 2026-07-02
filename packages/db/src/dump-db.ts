/**
 * Dump each database table to a separate JSON file using the postgres driver.
 * Uses cursors for large tables to avoid OOM.
 *
 * Usage:
 *   pnpm admin:db:dump [output-dir]
 */

import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { TABLE_INSERT_ORDER } from '@semianalysisai/inferencex-constants';

import { hasNoSslFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';

const sql = createAdminSql({ noSsl: hasNoSslFlag(), readonly: true, max: 1 });

const CURSOR_BATCH = 100;

/**
 * Stream a table to a JSON file using a cursor, writing row-by-row.
 *
 * BYTEA round-trip: postgres.js decodes a `bytea` column to a Node `Buffer`.
 * `JSON.stringify(buffer)` invokes Buffer.prototype.toJSON(), which emits
 * `{"type":"Buffer","data":[<byte>, …]}`. That's a lossless byte-array encoding
 * (verified: JSON.parse → Buffer.from(obj.data) reproduces the exact bytes), so
 * `agentic_trace_replay`'s blob columns (profile_export_jsonl_gz,
 * server_metrics_csv, server_metrics_json_gz) survive the dump verbatim.
 * load-dump.ts reconstructs the Buffer and casts it back to `::bytea`.
 *
 * Dump-size note: the byte-array encoding is ~4-6× the raw bytea size (each
 * byte becomes 1-4 ASCII digits + a comma). For the big compressed blobs
 * (server_metrics_json_gz can be ~17 MB compressed on high-conc TP+EP rows)
 * the resulting agentic_trace_replay.json is the largest file in the dump — the
 * same trade-off server_logs.json already makes. We keep all columns (no
 * dropping) so dump mode has full parity with the DB, and json-provider
 * lazy-loads this file only when a blob-backed route actually needs a fallback.
 */
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
  await new Promise<void>((res, rej) => {
    out
      .end(() => {
        res();
      })
      .on('error', rej);
  });
  return count;
}

async function dump(): Promise<void> {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/gu, '-').slice(0, 19);
  const outDir = resolve(process.argv[2] ?? `inferencex-dump-${timestamp}`);
  mkdirSync(outDir, { recursive: true });

  console.log('=== db:dump ===\n');
  console.log(`  Output: ${outDir}\n`);

  for (const table of TABLE_INSERT_ORDER) {
    process.stdout.write(`  ${table}...`);
    const outPath = resolve(outDir, `${table}.json`);
    const count = await streamTable(table, outPath);
    console.log(` ${count} rows`);
  }

  console.log('\n=== db:dump complete ===');
}

dump()
  .catch((error) => {
    console.error('db:dump failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
