import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from './migration-runner';

interface Executed {
  text: string;
  params?: unknown[];
}

/**
 * Minimal stand-in for the postgres.js client surface runMigrations uses:
 * tagged-template select on schema_migrations + begin(tx.unsafe).
 */
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
