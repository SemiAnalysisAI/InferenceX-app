import { neon } from '@neondatabase/serverless';
import { Kysely, PostgresDialect } from 'kysely';
import { NeonDialect } from 'kysely-neon';
import { Pool } from 'pg';

import { resolveDatabaseConnection } from '../connection';
import type { Database } from './types';

/**
 * The Agentic Workload Explorer reads a frozen, anonymized ProxyTrace snapshot
 * from its own Neon read replica. It never writes, so only a read-only URL exists.
 */
export const PROXYTRACE_DB_ENV_VAR = 'DATABASE_PROXYTRACE_READONLY_URL';

function resolveProxyTraceConnection() {
  return resolveDatabaseConnection({
    envVar: PROXYTRACE_DB_ENV_VAR,
    driver: process.env.DATABASE_DRIVER,
    ssl: process.env.DATABASE_SSL,
  });
}

function createPoolDb(): Kysely<Database> {
  const { url, ssl } = resolveProxyTraceConnection();
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: url, ssl: ssl === 'require' ? true : undefined }),
    }),
  });
}

// Survive Next.js HMR, like the shared clients in ../connection.ts.
const g = globalThis as unknown as { __proxyTraceDb?: Kysely<Database> };

/** Shared query builder: the Neon HTTP driver for Neon hosts, a pg pool otherwise. */
export function getDb(): Kysely<Database> {
  if (!g.__proxyTraceDb) {
    const { url, driver } = resolveProxyTraceConnection();
    g.__proxyTraceDb =
      driver === 'neon'
        ? new Kysely<Database>({ dialect: new NeonDialect({ neon: neon(url) }) })
        : createPoolDb();
  }
  return g.__proxyTraceDb;
}

/**
 * Pool-backed connection for full-history analytics where the Neon HTTP driver
 * is a poor fit (many statements per request). Callers must `destroy()` it.
 */
export function createDirectDb(): Kysely<Database> {
  return createPoolDb();
}

export type Db = Kysely<Database>;
