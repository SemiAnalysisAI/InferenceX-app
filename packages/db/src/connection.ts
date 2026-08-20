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

const LOOPBACK_HOSTS: Record<string, true> = {
  localhost: true,
  '127.0.0.1': true,
  '::1': true,
};

export type DatabaseDriver = 'neon' | 'postgres';
export type DatabaseSsl = false | 'require';

export interface DatabaseConnectionResolution {
  url: string;
  driver: DatabaseDriver;
  ssl: DatabaseSsl;
}

export interface DatabaseConnectionOptions {
  /** Environment variable used when no explicit URL is supplied. */
  envVar: string;
  /** Explicit connection URL, primarily for programmatic and test callers. */
  url?: string;
  /** Explicit driver, or an environment/default input used to select one. */
  driver?: string;
  /** Explicit TLS input. `false` always wins over hostname-based defaults. */
  ssl?: string | boolean;
}

function getDbHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^\[(?<host>.*)\]$/u, '$<host>');
  } catch {
    return null;
  }
}

function resolveDriver(url: string, hostname: string | null, input?: string): DatabaseDriver {
  const normalized = input?.toLowerCase();
  if (normalized === 'postgres') return 'postgres';
  if (normalized === 'neon') return 'neon';
  const useNeon = hostname?.endsWith('.neon.tech') ?? url.includes('.neon.tech');
  return useNeon ? 'neon' : 'postgres';
}

function resolveSsl(hostname: string | null, input?: string | boolean): DatabaseSsl {
  const normalized = typeof input === 'string' ? input.toLowerCase() : input;
  if (normalized === false || normalized === 'false') return false;
  if (normalized === true || normalized === 'true' || normalized === 'require') return 'require';
  return hostname && LOOPBACK_HOSTS[hostname] ? false : 'require';
}

/**
 * Resolve the URL, driver, and TLS policy shared by API, admin, and MCP clients.
 * Explicit inputs take precedence. Otherwise Neon hosts use the HTTP driver,
 * loopback postgres.js connections disable TLS, and remote connections require it.
 */
export function resolveDatabaseConnection({
  envVar,
  url: urlOverride,
  driver: driverInput,
  ssl: sslInput,
}: DatabaseConnectionOptions): DatabaseConnectionResolution {
  const url = urlOverride ?? process.env[envVar];
  if (!url) throw new Error(`${envVar} is not set`);

  const hostname = getDbHostname(url);
  const driver = resolveDriver(url, hostname, driverInput);
  const ssl = resolveSsl(hostname, sslInput);

  return { url, driver, ssl };
}

/** Wrap postgres.js Sql instance to match DbClient signature. */
function wrapPostgres(sql: postgres.Sql): DbClient {
  return ((strings: TemplateStringsArray, ...values: unknown[]) =>
    sql(strings, ...(values as postgres.ParameterOrFragment<never>[]))) as DbClient;
}

// Survive Next.js HMR — without globalThis the module re-evaluates on each
// hot reload, leaking the previous postgres.js TCP connection pool.
const g = globalThis as unknown as { __dbClients?: Map<string, DbClient> };

function makeDbClient(connection: DatabaseConnectionResolution): DbClient {
  return connection.driver === 'neon'
    ? (neon(connection.url) as DbClient)
    : wrapPostgres(postgres(connection.url, { max: 5, ssl: connection.ssl }));
}

export interface DatabaseClientOverrides {
  url?: string;
  driver?: DatabaseDriver;
  ssl?: DatabaseSsl;
}

/** One memoized client per effective connection identity. */
function memoizedClient(envVar: string, overrides: DatabaseClientOverrides = {}): DbClient {
  const connection = resolveDatabaseConnection({
    envVar,
    url: overrides.url,
    driver: overrides.driver ?? process.env.DATABASE_DRIVER,
    ssl: overrides.ssl ?? process.env.DATABASE_SSL,
  });
  const key =
    connection.driver === 'neon'
      ? `neon\0${connection.url}`
      : `postgres\0${connection.ssl}\0${connection.url}`;
  g.__dbClients ??= new Map();
  const cached = g.__dbClients.get(key);
  if (cached) return cached;
  const client = makeDbClient(connection);
  g.__dbClients.set(key, client);
  return client;
}

/** Read-only SQL client for API routes. Requires DATABASE_READONLY_URL. */
export function getDb(overrides?: DatabaseClientOverrides): DbClient {
  return memoizedClient('DATABASE_READONLY_URL', overrides);
}

/** Write-capable SQL client for API routes that need to insert (e.g. user feedback). */
export function getWriteDb(overrides?: DatabaseClientOverrides): DbClient {
  return memoizedClient('DATABASE_WRITE_URL', overrides);
}

/**
 * Ordinary read client for the separate CollectiveX database. Lazy-ingest
 * paths use the write client for state checks and post-write reads.
 */
export function getCollectiveXDb(overrides?: DatabaseClientOverrides): DbClient {
  return memoizedClient('DATABASE_COLLECTIVEX_READONLY_URL', overrides);
}

/** CollectiveX primary client for lazy ingest, consistent reads, and deletion. */
export function getCollectiveXWriteDb(overrides?: DatabaseClientOverrides): DbClient {
  return memoizedClient('DATABASE_COLLECTIVEX_WRITE_URL', overrides);
}
