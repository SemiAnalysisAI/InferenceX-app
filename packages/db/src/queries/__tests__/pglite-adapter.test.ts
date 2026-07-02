/**
 * Unit tests for the postgres.js-compatible PGlite adapter's fragment composition —
 * the one non-trivial custom piece the parity harness depends on. Verifies that nested
 * `sql\`\`` fragments (like getLatestBenchmarks's dateFilter/runFilter and getEvalSamples's
 * passedFilter) are inlined with correctly renumbered $N placeholders, and that an empty
 * fragment inlines to nothing.
 */

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { makePgliteClient } from './pglite-adapter.js';
import type { DbClient } from '../../connection.js';

let pg: PGlite;
let sql: DbClient;

beforeAll(async () => {
  pg = await PGlite.create('memory://');
  await pg.exec(`
    create table t (id int, name text, n int);
    insert into t values (1,'a',10),(2,'b',20),(3,'a',30),(4,'c',40);
  `);
  sql = makePgliteClient(pg);
});

afterAll(async () => {
  await pg.close();
});

describe('pglite adapter', () => {
  it('runs a plain parameterized tagged query and returns rows (not {rows})', async () => {
    const rows = await sql`select id, name from t where name = ${'a'} order by id`;
    expect(rows).toEqual([
      { id: 1, name: 'a' },
      { id: 3, name: 'a' },
    ]);
  });

  it('inlines a nested fragment with correct $N renumbering', async () => {
    const nameFilter = sql`and name = ${'a'}`;
    const rows = await sql`select id from t where n >= ${5} ${nameFilter} order by id`;
    // Params flatten to [5, 'a'] → "n >= $1 and name = $2".
    expect(rows).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it('inlines an EMPTY fragment as nothing (filter turned off)', async () => {
    const off = sql``;
    const rows = await sql`select id from t where n >= ${25} ${off} order by id`;
    expect(rows).toEqual([{ id: 3 }, { id: 4 }]);
  });

  it('renumbers across multiple nested fragments and a trailing param', async () => {
    const f1 = sql`and n >= ${20}`;
    const f2 = sql`and n <= ${30}`;
    const rows =
      await sql`select id from t where id >= ${1} ${f1} ${f2} order by id desc limit ${5}`;
    // Flattened params: [1, 20, 30, 5] with placeholders $1..$4 in order.
    expect(rows).toEqual([{ id: 3 }, { id: 2 }]);
  });

  it('supports ANY($array) binding', async () => {
    const rows = await sql`select id from t where name = ANY(${['a', 'c']}) order by id`;
    expect(rows).toEqual([{ id: 1 }, { id: 3 }, { id: 4 }]);
  });
});
