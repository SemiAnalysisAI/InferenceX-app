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
    return new URL(url).hostname.toLowerCase().replace(/^\[(?<host>.*)\]$/u, '$<host>');
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
const g = globalThis as unknown as { __dbClients?: Map<string, DbClient> };

function makeDbClient(url: string): DbClient {
  return shouldUseNeon(url)
    ? (neon(url) as DbClient)
    : wrapPostgres(postgres(url, postgresOptionsForUrl(url)));
}

/** One memoized client per connection env var; throws when the var is unset. */
function memoizedClient(envVar: string): DbClient {
  g.__dbClients ??= new Map();
  const cached = g.__dbClients.get(envVar);
  if (cached) return cached;
  const url = process.env[envVar];
  if (!url) throw new Error(`${envVar} is not set`);
  const client = makeDbClient(url);
  g.__dbClients.set(envVar, client);
  return client;
}

/** Read-only SQL client for API routes. Requires DATABASE_READONLY_URL. */
export function getDb(): DbClient {
  return memoizedClient('DATABASE_READONLY_URL');
}

/** Write-capable SQL client for API routes that need to insert (e.g. user feedback). */
export function getWriteDb(): DbClient {
  return memoizedClient('DATABASE_WRITE_URL');
}

/**
 * Read-only SQL client for the CollectiveX database — a separate Neon
 * instance from the main benchmark DB, holding raw sweep-run documents.
 * Must point at the same primary as the write URL (not a lagging replica):
 * the lazy-ingest routes read their own writes within a single request.
 */
export function getCollectiveXDb(): DbClient {
  return memoizedClient('DATABASE_COLLECTIVEX_READONLY_URL');
}

/** Write-capable SQL client for the CollectiveX database (lazy ingest + run deletion). */
export function getCollectiveXWriteDb(): DbClient {
  return memoizedClient('DATABASE_COLLECTIVEX_WRITE_URL');
}
