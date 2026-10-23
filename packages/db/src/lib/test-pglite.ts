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

function client(database: Pick<PGlite, 'query'>) {
  return Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
      const result = await database.query<Record<string, unknown>>(query, values);
      return result.rows;
    },
    { json: JSON.stringify, array: (value: unknown) => value },
  );
}

export function pgliteSql(db: PGlite): PgliteSql {
  return Object.assign(client(db), {
    begin: (fn: (tx: Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(client(tx) as unknown as Sql)),
  }) as unknown as PgliteSql;
}
