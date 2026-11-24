import fs from 'fs';
import os from 'os';
import path from 'path';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { pendingMigrations, runMigrations } from './migration-runner';
import { migratedPglite, pgliteDriverSql, type PgliteSql } from './test-pglite';

interface Executed {
  text: string;
  params?: unknown[];
}

function fakeSql(applied: string[]) {
  const executed: Executed[] = [];
  const sql = (strings: TemplateStringsArray) => {
    const text = strings.join('');
    executed.push({ text });
    if (text.includes('select filename')) {
      return Promise.resolve(applied.map((filename) => ({ filename })));
    }
    return Promise.resolve([]);
  };
  sql.begin = async (
    fn: (tx: { unsafe: (text: string, params?: unknown[]) => Promise<void> }) => Promise<void>,
  ) => {
    await fn({
      unsafe: (text: string, params?: unknown[]) => {
        executed.push({ text, params });
        return Promise.resolve();
      },
    });
  };
  return { sql: sql as never, executed };
}

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-runner-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('runMigrations', () => {
  it('applies pending .sql files in filename order and records them', async () => {
    fs.writeFileSync(path.join(dir, '002_second.sql'), 'create table two ();');
    fs.writeFileSync(path.join(dir, '001_first.sql'), 'create table one ();');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a migration');
    const { sql, executed } = fakeSql([]);

    const ran = await runMigrations(sql, dir);

    expect(ran).toBe(2);
    const applied = executed.filter((e) => e.text.startsWith('create table'));
    expect(applied.map((e) => e.text)).toEqual(['create table one ();', 'create table two ();']);
    const recorded = executed.filter((e) => e.text.includes('insert into schema_migrations'));
    expect(recorded.map((e) => e.params)).toEqual([['001_first.sql'], ['002_second.sql']]);
  });

  it('skips migrations already recorded in schema_migrations', async () => {
    fs.writeFileSync(path.join(dir, '001_first.sql'), 'create table one ();');
    fs.writeFileSync(path.join(dir, '002_second.sql'), 'create table two ();');
    const { sql, executed } = fakeSql(['001_first.sql']);

    const ran = await runMigrations(sql, dir);

    expect(ran).toBe(1);
    const applied = executed.filter((e) => e.text.startsWith('create table'));
    expect(applied.map((e) => e.text)).toEqual(['create table two ();']);
  });

  it('returns 0 when everything is already applied', async () => {
    fs.writeFileSync(path.join(dir, '001_first.sql'), 'create table one ();');
    const { sql, executed } = fakeSql(['001_first.sql']);

    const ran = await runMigrations(sql, dir);

    expect(ran).toBe(0);
    expect(executed.some((e) => e.text.startsWith('create table'))).toBe(false);
  });
});

describe('pendingMigrations', () => {
  const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', '..', 'migrations');
  let db: PGlite;
  let sql: PgliteSql;

  beforeAll(async () => {
    db = await migratedPglite();
    sql = await pgliteDriverSql(db);
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
    await db?.close();
  });

  beforeEach(async () => {
    await db.exec('drop table if exists schema_migrations');
  });

  async function record(...filenames: string[]): Promise<void> {
    await db.exec(
      'create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())',
    );
    for (const filename of filenames) {
      await db.query('insert into schema_migrations (filename) values ($1)', [filename]);
    }
  }

  it('lists every .sql file in order when schema_migrations does not exist', async () => {
    fs.writeFileSync(path.join(dir, '002_second.sql'), '');
    fs.writeFileSync(path.join(dir, '001_first.sql'), '');
    fs.writeFileSync(path.join(dir, 'notes.txt'), '');
    expect(await pendingMigrations(sql, dir)).toEqual(['001_first.sql', '002_second.sql']);
  });

  it('lists only unrecorded files, including one older than a recorded file', async () => {
    for (const name of ['001_a.sql', '002_b.sql', '003_c.sql']) {
      fs.writeFileSync(path.join(dir, name), '');
    }
    await record('002_b.sql', '099_from_another_branch.sql');
    expect(await pendingMigrations(sql, dir)).toEqual(['001_a.sql', '003_c.sql']);
  });

  it('names the newest repository migration a database has not recorded', async () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .toSorted();
    await record(...files.slice(0, -1));
    expect(await pendingMigrations(sql, MIGRATIONS_DIR)).toEqual([files.at(-1)]);
    await record(files.at(-1)!);
    expect(await pendingMigrations(sql, MIGRATIONS_DIR)).toEqual([]);
  });
});
