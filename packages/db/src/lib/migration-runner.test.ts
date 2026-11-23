import fs from 'fs';
import os from 'os';
import path from 'path';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import {
  EARLIER_MIGRATION_NAMES,
  describePendingMigrations,
  pendingMigrations,
  runMigrations,
  unknownRecordedMigrations,
} from './migration-runner';
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

  it('skips a file recorded under its earlier name', async () => {
    fs.writeFileSync(path.join(dir, '008_agentic.sql'), 'create table agentic ();');
    const { sql, executed } = fakeSql(['007_agentic.sql']);

    expect(await runMigrations(sql, dir)).toBe(0);
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

  it('counts a file recorded under its earlier, identical name as applied', async () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .toSorted();
    await record(...files.map((file) => EARLIER_MIGRATION_NAMES[file] ?? file));
    expect(await pendingMigrations(sql, MIGRATIONS_DIR)).toEqual([]);
  });
});

describe('EARLIER_MIGRATION_NAMES', () => {
  it('maps current migration files to names no current file uses', () => {
    const files = new Set(fs.readdirSync(path.join(import.meta.dirname, '..', '..', 'migrations')));
    for (const [current, earlier] of Object.entries(EARLIER_MIGRATION_NAMES)) {
      expect(files.has(current)).toBe(true);
      expect(files.has(earlier)).toBe(false);
    }
  });
});

describe('unknownRecordedMigrations', () => {
  it('lists recorded names that match no directory file or earlier name', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-runner-other-'));
    try {
      fs.writeFileSync(path.join(dir, '001_main.sql'), '');
      fs.writeFileSync(path.join(other, '001_collectivex.sql'), '');
      expect(
        unknownRecordedMigrations(
          ['001_main.sql', '001_collectivex.sql', '007_agentic.sql', 'z_gone.sql', 'a_gone.sql'],
          [dir, other],
        ),
      ).toEqual(['a_gone.sql', 'z_gone.sql']);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});

describe('describePendingMigrations', () => {
  it('lists the files and says to record present schema before migrating', () => {
    const text = describePendingMigrations(['028_a.sql', '029_b.sql'], []);
    expect(text).toStartWith(
      '2 migration file(s) in packages/db/migrations are not recorded in schema_migrations.\n' +
        '  028_a.sql\n  029_b.sql\n',
    );
    expect(text).toContain('Do not run bun run admin:db:migrate yet');
    expect(text).toContain("insert into schema_migrations (filename) values ('<file>');");
    expect(text).toEndWith(
      'Once only missing files remain unrecorded, run bun run admin:db:migrate.',
    );
  });

  it('names recorded files the repository does not hold', () => {
    expect(describePendingMigrations(['029_b.sql'], ['016_old.sql'])).toEndWith(
      'name of a listed file. Compare it with git history before recording the new name.\n' +
        '  016_old.sql',
    );
  });
});
