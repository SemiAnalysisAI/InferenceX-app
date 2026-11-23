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
  // PGlite is single-session, so the pool gets the server's one connection.
  const sql = postgres({ host: dir, port: 5432, max: 1, onnotice: () => {} });
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
