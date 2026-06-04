/**
 * Dump each database table to a separate JSON file using the postgres driver.
 * Uses cursors for large tables to avoid OOM.
 *
 * Usage:
 *   pnpm admin:db:dump [output-dir]
 */

import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { TABLE_INSERT_ORDER, TABLE_NAMES } from '@semianalysisai/inferencex-constants';

import { hasNoSslFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';

const sql = createAdminSql({ noSsl: hasNoSslFlag(), readonly: true, max: 1 });

const CURSOR_BATCH = 100;

/**
 * Tables excluded from the dump by default.
 *
 * The weekly public dump is published as a GitHub release asset, which is
 * hard-capped at 2 GiB (2_147_483_648 bytes). These two tables dominate the
 * archive — eval_samples (~1.7 GB compressed) + server_logs (~345 MB) are
 * ~99% of the zip — while the analytically useful tables are tiny
 * (benchmark_results is only ~20 MB). Including them pushed the archive past
 * the cap, so every dump since 2026-05-18 failed with
 * `size must be less than 2147483648`. Excluding them drops the zip from
 * ~2.07 GB to ~0.36 GB and unblocks the weekly release.
 *
 * Set DUMP_INCLUDE_ALL=1 for a complete backup (e.g. when writing somewhere
 * without the 2 GiB asset limit).
 */
const DEFAULT_SKIP = new Set<string>([TABLE_NAMES.evalSamples, TABLE_NAMES.serverLogs]);
const SKIP = process.env.DUMP_INCLUDE_ALL === '1' ? new Set<string>() : DEFAULT_SKIP;

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
    if (SKIP.has(table)) {
      console.log(`  ${table}... skipped (excluded from dump; set DUMP_INCLUDE_ALL=1 to include)`);
      continue;
    }
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
