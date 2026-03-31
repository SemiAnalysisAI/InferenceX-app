/**
 * Shared database utility functions used across admin scripts.
 */

import postgres, { type Options } from 'postgres';

export type Sql = ReturnType<typeof postgres>;

/**
 * Create a postgres client for admin scripts.
 * Reads DATABASE_WRITE_URL by default, or DATABASE_READONLY_URL with `readonly: true`.
 * Respects DATABASE_NO_SSL=1 or --no-ssl flag for local Postgres (no TLS).
 */
export function createAdminSql(
  opts: Omit<Options<Record<string, postgres.PostgresType>>, 'ssl'> & { readonly?: boolean } = {},
): Sql {
  const { readonly, ...pgOpts } = opts;
  const envVar = readonly ? 'DATABASE_READONLY_URL' : 'DATABASE_WRITE_URL';
  const url = process.env[envVar];
  if (!url) {
    console.error(`${envVar} is required`);
    process.exit(1);
  }
  const noSsl = !!process.env.DATABASE_NO_SSL || process.argv.includes('--no-ssl');
  return postgres(url, { ...pgOpts, ssl: noSsl ? false : 'require' });
}

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
