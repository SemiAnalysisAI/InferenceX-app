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

/** True when running off a JSON dump directory instead of a live database (local dev only). */
export const JSON_MODE = !process.env.DATABASE_READONLY_URL && Boolean(process.env.DUMP_DIR);

/**
 * Server-side fixtures mode for cypress e2e: every API route returns a
 * pre-captured fixture instead of querying. Set via E2E_FIXTURES=1 in the
 * tests-e2e.yml workflow. Avoids relying on cy.intercept (which has a brief
 * gap on test transitions when cypress resets routes) and works on fork PRs
 * where DB secrets aren't available.
 *
 * Not gated on CI=true because Vercel also sets CI=true during production
 * builds; using a dedicated var keeps prod safe.
 */
export const FIXTURES_MODE = process.env.E2E_FIXTURES === '1';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

interface PostgresConnectionOptions {
  max: number;
  ssl: false | 'require';
}

function getDbHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
  } catch {
    return null;
  }
}

/**
 * DATABASE_DRIVER=neon  → @neondatabase/serverless HTTP driver (default for *.neon.tech URLs)
 * DATABASE_DRIVER=postgres → postgres.js TCP driver  (default for everything else)
 */
export function shouldUseNeon(url: string, driver = process.env.DATABASE_DRIVER): boolean {
  const normalizedDriver = driver?.toLowerCase();
  const hostname = getDbHostname(url);

  if (normalizedDriver === 'postgres') return false;
  if (normalizedDriver === 'neon') return true;
  return hostname?.endsWith('.neon.tech') ?? url.includes('.neon.tech');
}

/**
 * DATABASE_SSL=false disables TLS unconditionally.
 * Otherwise: loopback → no TLS, remote → TLS required.
 */
export function postgresOptionsForUrl(
  url: string,
  sslEnv = process.env.DATABASE_SSL,
): PostgresConnectionOptions {
  const ssl = sslEnv?.toLowerCase();
  if (ssl === 'false') return { max: 5, ssl: false };
  if (ssl === 'true') return { max: 5, ssl: 'require' };
  const hostname = getDbHostname(url);
  return {
    max: 5,
    ssl: hostname && LOOPBACK_HOSTS.has(hostname) ? false : 'require',
  };
}

/** Wrap postgres.js Sql instance to match DbClient signature. */
function wrapPostgres(sql: postgres.Sql): DbClient {
  return ((strings: TemplateStringsArray, ...values: unknown[]) =>
    sql(strings, ...(values as postgres.ParameterOrFragment<never>[]))) as DbClient;
}

// Survive Next.js HMR — without globalThis the module re-evaluates on each
// hot reload, leaking the previous postgres.js TCP connection pool.
const g = globalThis as unknown as { __dbClient?: DbClient };

/**
 * Read-only SQL client for API routes.
 * Throws if DATABASE_READONLY_URL is not set — callers in JSON_MODE
 * should skip this and use the json-provider instead.
 */
export function getDb(): DbClient {
  if (g.__dbClient) return g.__dbClient;
  const url = process.env.DATABASE_READONLY_URL;
  if (!url) throw new Error('DATABASE_READONLY_URL is not set');

  g.__dbClient = shouldUseNeon(url)
    ? (neon(url) as DbClient)
    : wrapPostgres(postgres(url, postgresOptionsForUrl(url)));

  return g.__dbClient;
}
