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

type Rows = Record<string, unknown>[];

class PgliteQuery implements PromiseLike<Rows> {
  private result: Promise<Rows> | undefined;
  private readonly database: Pick<PGlite, 'query'>;
  private readonly strings: TemplateStringsArray;
  private readonly values: unknown[];

  constructor(database: Pick<PGlite, 'query'>, strings: TemplateStringsArray, values: unknown[]) {
    this.database = database;
    this.strings = strings;
    this.values = values;
  }

  render(params: unknown[]): string {
    let text = this.strings[0] ?? '';
    for (let i = 1; i < this.strings.length; i += 1) {
      const value = this.values[i - 1];
      text += value instanceof PgliteQuery ? value.render(params) : `$${params.push(value)}`;
      text += this.strings[i];
    }
    return text;
  }

  private run(): Promise<Rows> {
    const params: unknown[] = [];
    const text = this.render(params);
    this.result ??= this.database.query<Record<string, unknown>>(text, params).then((r) => r.rows);
    return this.result;
  }

  // oxlint-disable-next-line unicorn/no-thenable
  then<A = Rows, B = never>(
    onFulfilled?: ((rows: Rows) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.run().then(onFulfilled, onRejected);
  }

  catch<B = never>(onRejected: (reason: unknown) => B | PromiseLike<B>): Promise<Rows | B> {
    return this.run().catch(onRejected);
  }
}

function client(database: Pick<PGlite, 'query'>) {
  return Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) =>
      new PgliteQuery(database, strings, values),
    { json: JSON.stringify },
  );
}

export function pgliteSql(db: PGlite): PgliteSql {
  return Object.assign(client(db), {
    begin: (fn: (tx: Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(client(tx) as unknown as Sql)),
  }) as unknown as PgliteSql;
}

/**
 * The real postgres.js driver against `db`, over a PGlite socket server on a Unix socket. Unlike
 * `pgliteSql`, this exercises the driver's parameter typing, array and JSON serialization and
 * transaction handling, so a driver upgrade that changes them fails here. Call `close` before
 * `db.close()`.
 */
export async function pgliteDriverSql(
  db: PGlite,
): Promise<{ sql: Sql; close: () => Promise<void> }> {
  // postgres.js reads a host that starts with `/` as a socket directory, as libpq does.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-pglite-'));
  const server = new PGLiteSocketServer({ db, path: path.join(dir, '.s.PGSQL.5432') });
  await server.start();
  // PGlite is single-session, so the pool gets the server's one connection.
  const sql = postgres({ host: dir, port: 5432, max: 1, onnotice: () => {} });
  return {
    sql,
    close: async () => {
      await sql.end();
      await server.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
