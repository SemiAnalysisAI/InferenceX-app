import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';

/**
 * Tagged-template SQL callable — runtime-compatible between neon() and postgres().
 * Both drivers support `sql\`SELECT ...\`` and return Promise<Row[]>.
 */
export type DbClient = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

/** @deprecated Alias for DbClient — kept for backward compat with existing query files. */
export type NeonClient = DbClient;

/** True when running off a JSON dump directory instead of a live database (local dev only). */
export const JSON_MODE = !process.env.DATABASE_READONLY_URL && !!process.env.DUMP_DIR;

let cached: DbClient | null = null;

/**
 * DB_DRIVER=neon  → @neondatabase/serverless HTTP driver (default for *.neon.tech URLs)
 * DB_DRIVER=postgres → postgres.js TCP driver  (default for everything else)
 */
function shouldUseNeon(url: string): boolean {
  const driver = process.env.DB_DRIVER?.toLowerCase();
  if (driver === 'postgres') return false;
  if (driver === 'neon') return true;
  return url.includes('.neon.tech');
}

/**
 * Read-only SQL client for API routes.
 * Throws if DATABASE_READONLY_URL is not set — callers in JSON_MODE
 * should skip this and use the json-provider instead.
 */
export function getDb(): DbClient {
  if (cached) return cached;
  const url = process.env.DATABASE_READONLY_URL;
  if (!url) throw new Error('DATABASE_READONLY_URL is not set');

  cached = shouldUseNeon(url)
    ? (neon(url) as DbClient)
    : (postgres(url, { ssl: false, max: 5 }) as unknown as DbClient);

  return cached;
}
