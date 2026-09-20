import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Sql } from '../etl/db-utils';
import { runMigrations } from './migration-runner';
import { verifyMeasurementSchema } from './measurement-schema';

let db: PGlite;
let sql: Sql;
let directory: string;

function queryClient(database: Pick<PGlite, 'query'>) {
  return Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
      const result = await database.query(query, values);
      return result.rows;
    },
    {
      unsafe: async (query: string, values: unknown[] = []) => {
        const result = await database.query(query, values);
        return result.rows;
      },
    },
  );
}

beforeEach(async () => {
  db = await PGlite.create();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-schema-'));
  fs.copyFileSync(
    new URL('../../migrations/016_measurement_snapshots.sql', import.meta.url),
    path.join(directory, '016_measurement_snapshots.sql'),
  );
  sql = Object.assign(queryClient(db), {
    begin: (fn: (tx: Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(queryClient(tx) as unknown as Sql)),
  }) as unknown as Sql;
});

afterEach(async () => {
  await db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

it('applies the receipt migration, preserves existing data and verifies replay in read-only mode', async () => {
  await db.exec(
    'create table existing_measurements (value integer); insert into existing_measurements values (42)',
  );
  expect(await runMigrations(sql, directory)).toBe(1);
  await db.query(
    `insert into measurement_snapshots
      (source_repo, source_run_id, source_attempt, receipt_id, bundle_digest, receipt, state)
      values ('org/repo', 100, 1, $1, $2, '{"retained":true}', 'complete')`,
    ['a'.repeat(64), 'b'.repeat(64)],
  );
  expect(await runMigrations(sql, directory)).toBe(0);
  const report = await db.transaction(async (tx) => {
    await tx.query('set transaction read only');
    return verifyMeasurementSchema(queryClient(tx) as unknown as Sql);
  });
  expect(report).toMatchObject({
    migration: '016_measurement_snapshots.sql',
    table: 'public.measurement_snapshots',
    columns: { source_run_id: 'bigint', receipt: 'jsonb', state: 'text' },
    primary_key: ['source_repo', 'source_run_id', 'source_attempt'],
  });
  const existing = await db.query('select value from existing_measurements');
  expect(existing.rows).toEqual([{ value: 42 }]);
  const snapshots = await db.query(
    'select source_run_id, receipt, state from measurement_snapshots',
  );
  expect(snapshots.rows).toEqual([
    { source_run_id: 100, receipt: { retained: true }, state: 'complete' },
  ]);
});

it('rejects a database with no receipt schema', async () => {
  await expect(verifyMeasurementSchema(sql)).rejects.toThrow('table is missing');
});

it.each([
  ['delete from schema_migrations', 'migration is not recorded'],
  [
    'alter table measurement_snapshots alter column source_run_id type text',
    'non-null bigint column',
  ],
  [
    'alter table measurement_snapshots alter column bundle_digest drop not null',
    'non-null text column',
  ],
  [
    'alter table measurement_snapshots drop constraint measurement_snapshots_pkey',
    'uniquely bind source repository, run and attempt',
  ],
])('rejects incompatible deployed schema after %s', async (change, error) => {
  await runMigrations(sql, directory);
  await db.exec(change);
  await expect(verifyMeasurementSchema(sql)).rejects.toThrow(error);
});
