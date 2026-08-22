/**
 * Shared database utility functions used across admin scripts.
 */

import postgres, { type Options } from 'postgres';
import { resolveDatabaseConnection } from '../connection.js';

export type Sql = ReturnType<typeof postgres>;

/**
 * Create a postgres.js client for admin scripts.
 * Reads DATABASE_WRITE_URL by default, or DATABASE_READONLY_URL with `readonly: true`.
 * Pass `envVar` or `url` to target a different database. `noSsl` explicitly
 * disables TLS, while the shared resolver handles environment and host defaults.
 */
export function createAdminSql(
  opts: Omit<Options<Record<string, postgres.PostgresType>>, 'ssl'> & {
    readonly?: boolean;
    noSsl?: boolean;
    envVar?: string;
    url?: string;
  } = {},
): Sql {
  const { readonly, noSsl, envVar: envVarOverride, url, ...pgOpts } = opts;
  const envVar = envVarOverride ?? (readonly ? 'DATABASE_READONLY_URL' : 'DATABASE_WRITE_URL');
  const connection = resolveDatabaseConnection({
    envVar,
    url,
    driver: 'postgres',
    ssl: noSsl ? false : process.env.DATABASE_SSL,
  });
  return postgres(connection.url, {
    ...pgOpts,
    ssl: connection.ssl,
  });
}

/** Refresh the `latest_benchmarks` materialized view, logging timing. */
export async function refreshLatestBenchmarks(sql: Sql, concurrently = true): Promise<void> {
  process.stdout.write('  Refreshing latest_benchmarks materialized view...');
  const t0 = Date.now();
  await (concurrently
    ? sql`REFRESH MATERIALIZED VIEW CONCURRENTLY latest_benchmarks`
    : sql`REFRESH MATERIALIZED VIEW latest_benchmarks`);
  console.log(` ${Math.round((Date.now() - t0) / 1000)}s`);
}
