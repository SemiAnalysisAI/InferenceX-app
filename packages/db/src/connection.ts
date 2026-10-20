import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';

export type DbClient = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

export const FIXTURES_MODE = process.env.E2E_FIXTURES === '1';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export type DatabaseDriver = 'neon' | 'postgres';
export type DatabaseSsl = false | 'require';

export interface DatabaseConnectionResolution {
  url: string;
  driver: DatabaseDriver;
  ssl: DatabaseSsl;
}

export interface DatabaseConnectionOptions {
  envVar: string;
  url?: string;
  driver?: string;
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
  return hostname && LOOPBACK_HOSTS.has(hostname) ? false : 'require';
}

/**
 * Alternate names tried, in order, when a connection variable is unset. Each alternate names
 * the same database (Vercel-managed Neon variables), so lookups never cross database scopes.
 */
const DATABASE_URL_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  DATABASE_COLLECTIVEX_READONLY_URL: ['COLLECTIVEX_DATABASE_URL'],
  DATABASE_COLLECTIVEX_WRITE_URL: ['COLLECTIVEX_DATABASE_URL_UNPOOLED'],
};

export function resolveDatabaseConnection({
  envVar,
  url: urlOverride,
  driver: driverInput,
  ssl: sslInput,
}: DatabaseConnectionOptions): DatabaseConnectionResolution {
  const envVars = [envVar, ...(DATABASE_URL_FALLBACKS[envVar] ?? [])];
  const url = urlOverride ?? envVars.map((name) => process.env[name]).find(Boolean);
  if (!url) throw new Error(`${envVars.join(' or ')} is not set`);

  const hostname = getDbHostname(url);
  const driver = resolveDriver(url, hostname, driverInput);
  const ssl = resolveSsl(hostname, sslInput);

  return { url, driver, ssl };
}

function wrapPostgres(sql: postgres.Sql): DbClient {
  return ((strings: TemplateStringsArray, ...values: unknown[]) =>
    sql(strings, ...(values as postgres.ParameterOrFragment<never>[]))) as DbClient;
}

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

export function getDb(overrides?: DatabaseClientOverrides): DbClient {
  return memoizedClient('DATABASE_READONLY_URL', overrides);
}

export function getWriteDb(overrides?: DatabaseClientOverrides): DbClient {
  return memoizedClient('DATABASE_WRITE_URL', overrides);
}

export function getCollectiveXDb(overrides?: DatabaseClientOverrides): DbClient {
  return memoizedClient('DATABASE_COLLECTIVEX_READONLY_URL', overrides);
}

export function getCollectiveXWriteDb(overrides?: DatabaseClientOverrides): DbClient {
  return memoizedClient('DATABASE_COLLECTIVEX_WRITE_URL', overrides);
}

export function getOperatorXDb(overrides?: DatabaseClientOverrides): DbClient {
  return memoizedClient('DATABASE_OPERATORX_READONLY_URL', overrides);
}
