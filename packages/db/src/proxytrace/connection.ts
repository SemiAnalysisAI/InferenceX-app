import { neon } from '@neondatabase/serverless';
import { Kysely, PostgresDialect } from 'kysely';
import { NeonDialect } from 'kysely-neon';
import { Pool } from 'pg';

import { resolveDatabaseConnection } from '../connection';
import type { Database } from './types';

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

const g = globalThis as unknown as { __proxyTraceDb?: Kysely<Database> };

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

export function createDirectDb(): Kysely<Database> {
  return createPoolDb();
}

export type Db = Kysely<Database>;
