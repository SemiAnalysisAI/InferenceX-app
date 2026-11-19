import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';

import type { DbClient } from '../connection';
import type { Sql } from '../etl/db-utils';

export type PgliteSql = Sql & DbClient;

export async function migratedPglite(): Promise<PGlite> {
  const db = await PGlite.create();
  const dir = new URL('../../migrations/', import.meta.url);
  for (const name of fs.readdirSync(dir).toSorted()) {
    if (name.endsWith('.sql')) await db.exec(fs.readFileSync(new URL(name, dir), 'utf8'));
  }
  return db;
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
    { json: JSON.stringify, array: (value: unknown) => value },
  );
}

export function pgliteSql(db: PGlite): PgliteSql {
  return Object.assign(client(db), {
    begin: (fn: (tx: Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(client(tx) as unknown as Sql)),
  }) as unknown as PgliteSql;
}
