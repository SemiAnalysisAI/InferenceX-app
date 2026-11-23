import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';

import type { DbClient } from '../connection';
import type { Sql } from '../etl/db-utils';
import { pgliteTemplate } from './test-pglite-template';

export type PgliteSql = Sql & DbClient;

let template: Promise<string> | undefined;

export async function migratedPglite(): Promise<PGlite> {
  template ??= pgliteTemplate();
  return PGlite.create({ loadDataDir: new Blob([fs.readFileSync(await template)]) });
}

/**
 * The real postgres.js driver against `db`, over a PGlite socket server on a Unix socket. Tests
 * that run production SQL go through it, so they see the driver's parameter typing, array and JSON
 * serialization, result types and transaction handling exactly as production does. PGlite has one
 * session, which the driver and direct `db.query`/`db.exec` calls share, so direct calls see and
 * change the same state between driver queries. `sql.end()` also stops the socket server. Call it
 * before `db.close()`.
 */
export async function pgliteDriverSql(db: PGlite): Promise<PgliteSql> {
  // postgres.js reads a host that starts with `/` as a socket directory, as libpq does.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-pglite-'));
  const server = new PGLiteSocketServer({ db, path: path.join(dir, '.s.PGSQL.5432') });
  await server.start();
  // postgres.js falls back to PG* environment variables (PGSSLMODE, PGUSER, PGPREPARE and one per
  // option), so every option it reads from the environment is set here to keep tests hermetic.
  // PGlite is single-session, so the pool gets the server's one connection.
  const sql = postgres({
    host: dir,
    port: 5432,
    // A falsy user, password or database would fall through to the environment.
    user: 'postgres',
    pass: 'postgres',
    database: 'postgres',
    ssl: false,
    sslnegotiation: null,
    channel_binding: 'prefer',
    target_session_attrs: 'read-write',
    max: 1,
    min: 0,
    idle_timeout: 0,
    connect_timeout: 30,
    queue_timeout: 0,
    query_timeout: 0,
    cancel_timeout: 5,
    max_lifetime: null,
    max_pipeline: 100,
    scheduler: false,
    backoff: false,
    keep_alive: 60,
    prepare: true,
    debug: false,
    fetch_types: true,
    infer: false,
    publications: 'alltables',
    connection: { application_name: 'inferencex-db-tests' },
    onnotice: () => {},
  });
  // bun's `expect(promise).resolves/.rejects` waits for the promise in a loop that only reads the
  // socket when a timer fires, so with no timer each driver query there stalls for up to a second.
  // A 1 ms timer keeps the loop waking while the driver is open.
  const tick = setInterval(() => {}, 1).unref();
  const end = sql.end.bind(sql);
  return Object.assign(sql, {
    end: async (options?: Parameters<typeof end>[0]) => {
      clearInterval(tick);
      await end(options);
      await server.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  }) as PgliteSql;
}
