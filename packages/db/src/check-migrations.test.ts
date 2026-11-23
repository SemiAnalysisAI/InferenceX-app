// Runs the real check-migrations script against PGlite: createAdminSql is the only seam.
// --parallel test workers isolate each file, so the module mock stays inside this one.
import fs from 'node:fs';
import path from 'node:path';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it, mock, spyOn } from 'bun:test';

import { stubEnv, unstubAllEnvs } from './lib/test-helpers';
import { migratedPglite, pgliteSql } from './lib/test-pglite';

const files = fs
  .readdirSync(path.join(import.meta.dirname, '..', 'migrations'))
  .filter((file) => file.endsWith('.sql'))
  .toSorted();
const [newest] = files.slice(-1);

let db: PGlite;
let exitCode: typeof process.exitCode;
let stdout: string[];
let stderr: string[];
let recordedAfter: unknown[];

beforeAll(async () => {
  db = await migratedPglite();
  await db.exec(
    'create table schema_migrations (filename text primary key, applied_at timestamptz not null default now())',
  );
  for (const file of files.slice(0, -1)) {
    await db.query('insert into schema_migrations (filename) values ($1)', [file]);
  }

  const sql = pgliteSql(db);
  const { promise: ended, resolve: end } = Promise.withResolvers<void>();
  mock.module('./etl/db-utils', () => ({
    createAdminSql: () => Object.assign(sql, { end: () => Promise.resolve(end()) }),
  }));
  const log = spyOn(console, 'log').mockImplementation(() => {});
  const error = spyOn(console, 'error').mockImplementation(() => {});
  stubEnv('GITHUB_ACTIONS', 'true');

  // A static import would run the script before the mock above exists.
  await import('./check-migrations');
  await ended;
  exitCode = process.exitCode;
  process.exitCode = undefined;
  stdout = log.mock.calls.map((call) => String(call[0]));
  stderr = error.mock.calls.map((call) => String(call[0]));
  log.mockRestore();
  error.mockRestore();
  unstubAllEnvs();
  const result = await db.query<{ filename: string }>(
    'select filename from schema_migrations order by filename',
  );
  recordedAfter = result.rows.map((row) => row.filename);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

it('fails the step when the newest migration is unrecorded', () => {
  expect(exitCode).toBe(1);
});

it('prints the guidance and one GitHub error annotation naming the file', () => {
  expect(stderr).toEqual([
    [
      '1 migration file(s) in packages/db/migrations are not recorded in schema_migrations.',
      `  ${newest}`,
      "If a file's schema is already in the database, record it with",
      "  insert into schema_migrations (filename) values ('<file>');",
      'Then run bun run admin:db:migrate to apply the rest.',
    ].join('\n'),
  ]);
  expect(stdout).toEqual([
    `::error title=Pending database migrations::${stderr[0]!.replaceAll('\n', '%0A')}`,
  ]);
});

it('writes nothing', () => {
  expect(recordedAfter).toEqual(files.slice(0, -1));
});
