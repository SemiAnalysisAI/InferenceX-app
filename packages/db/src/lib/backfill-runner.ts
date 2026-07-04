/**
 * Shared scaffolding for the one-shot `backfill-*.ts` CLI scripts (invoked
 * via the `db:backfill-*` package scripts). Each script keeps only its
 * candidate query and per-row recompute; flag parsing, the `--yes`
 * confirmation gate, per-row progress logging, and the exit-code summary
 * live here so every backfill behaves identically on the command line.
 */

import { confirm, hasYesFlag } from '../cli-utils.js';
import type { Sql } from '../etl/db-utils.js';

export interface LimitForceFlags {
  limit: number | null;
  force: boolean;
}

/** Parse the standard `--limit N` / `--force` backfill flags from argv. */
export function parseLimitForceFlags(): LimitForceFlags {
  let limit: number | null = null;
  let force = false;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]!;
    if (arg === '--force') force = true;
    else if (arg === '--limit') {
      const next = process.argv[++i];
      if (!next || Number.isNaN(Number(next))) {
        console.error('--limit requires a numeric argument');
        process.exit(1);
      }
      limit = Number(next);
    }
  }
  return { limit, force };
}

/**
 * Print the candidate-count line, then gate on `--yes` or an interactive
 * y/N prompt. Returns false (after logging "Aborted.") when declined.
 */
export async function confirmProceed(candidatesLabel: string): Promise<boolean> {
  console.log(`\n  ${candidatesLabel}`);
  if (hasYesFlag()) return true;
  const ok = await confirm('\nProceed? (y/N) ');
  if (!ok) console.log('Aborted.');
  return ok;
}

/**
 * Iterate candidate row ids one at a time (the recomputed blobs can be
 * hundreds of MB decompressed — serial processing keeps memory bounded),
 * logging per-row progress and a final summary. `processRow` returns 'ok'
 * (counts toward the ✓ log) or 'skipped' (e.g. row vanished — the callback
 * logs its own warning); throwing marks the row failed. Sets
 * `process.exitCode = 1` when any row failed.
 */
export async function runPerIdBackfill(
  ids: readonly number[],
  processRow: (id: number) => Promise<'ok' | 'skipped'>,
): Promise<void> {
  let ok = 0;
  let failed = 0;
  const t0 = Date.now();
  for (const id of ids) {
    const start = Date.now();
    try {
      if ((await processRow(id)) === 'skipped') continue;
      ok++;
      const elapsed = Math.round((Date.now() - start) / 1000);
      const elapsedTotal = Math.round((Date.now() - t0) / 1000);
      console.log(`  ✓ id=${id} (${elapsed}s, ${ok}/${ids.length} done, ${elapsedTotal}s total)`);
    } catch (error) {
      failed++;
      console.error(`  ✗ id=${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const totalSec = Math.round((Date.now() - t0) / 1000);
  console.log(`\n=== backfill complete: ${ok} ok, ${failed} failed in ${totalSec}s ===`);
  if (failed > 0) process.exitCode = 1;
}

/**
 * jsonb parameter for a freshly computed value. `structuredClone` strips
 * class instances/prototypes so postgres.js serializes plain data only —
 * matches what the inline ingest path stores.
 */
export function jsonbParam(sql: Sql, value: unknown): ReturnType<Sql['json']> {
  return sql.json(structuredClone(value) as unknown as Parameters<typeof sql.json>[0]);
}

/** Standard `main().catch(…).finally(sql.end())` trailer for backfill CLIs. */
export function runBackfillMain(name: string, sql: Sql, main: () => Promise<void>): void {
  main()
    .catch((error) => {
      console.error(`${name} failed:`, error);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
