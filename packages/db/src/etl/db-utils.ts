/**
 * Shared database utility functions used across admin scripts.
 */

import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

/** Refresh the `latest_benchmarks` materialized view, logging timing. */
export async function refreshLatestBenchmarks(sql: Sql, concurrently = true): Promise<void> {
  process.stdout.write('  Refreshing latest_benchmarks materialized view...');
  const t0 = Date.now();
  if (concurrently) {
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY latest_benchmarks`;
  } else {
    await sql`REFRESH MATERIALIZED VIEW latest_benchmarks`;
  }
  console.log(` ${Math.round((Date.now() - t0) / 1000)}s`);
}
