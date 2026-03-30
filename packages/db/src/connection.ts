import { neon } from '@neondatabase/serverless';

export type NeonClient = ReturnType<typeof neon>;

/** True when running off a JSON dump directory instead of a live database. */
export const JSON_MODE = !process.env.DATABASE_READONLY_URL && !!process.env.DUMP_DIR;

let cached: NeonClient | null = null;

/**
 * Read-only Neon HTTP SQL client for API routes.
 * Throws if DATABASE_READONLY_URL is not set — callers in JSON_MODE
 * should skip this and use the json-provider instead.
 */
export function getDb(): NeonClient {
  if (cached) return cached;
  const url = process.env.DATABASE_READONLY_URL;
  if (!url) throw new Error('DATABASE_READONLY_URL is not set');
  cached = neon(url);
  return cached;
}
