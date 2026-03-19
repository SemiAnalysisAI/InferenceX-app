import { neon } from '@neondatabase/serverless';

export type NeonClient = ReturnType<typeof neon>;

let cached: NeonClient | null = null;

/**
 * Read-only Neon HTTP SQL client for API routes.
 */
export function getDb(): NeonClient {
  if (cached) return cached;
  const url = process.env.DATABASE_READONLY_URL;
  if (!url) throw new Error('DATABASE_READONLY_URL is not set');
  cached = neon(url);
  return cached;
}
