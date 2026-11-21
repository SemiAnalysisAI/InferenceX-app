import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);
const PGLITE_PACKAGE = new URL('../package.json', import.meta.resolve('@electric-sql/pglite'));

/**
 * Path of a migrated PGlite data-dir dump. Migrating once and loading the dump per test file is
 * ~9x cheaper than migrating per file. The dump is keyed by the migrations and the PGlite version,
 * so a cached one is never stale; scripts/test-unit.ts builds it before `bun test` starts workers.
 */
export async function pgliteTemplate(): Promise<string> {
  const names = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .toSorted();
  const migrations = names.map((name) => fs.readFileSync(new URL(name, MIGRATIONS_DIR), 'utf8'));
  const hash = createHash('sha256').update(fs.readFileSync(PGLITE_PACKAGE));
  for (const [i, name] of names.entries()) hash.update(`\0${name}\0`).update(migrations[i]!);

  const file = path.join(os.tmpdir(), 'inferencex-pglite-template', `${hash.digest('hex')}.tar`);
  if (fs.existsSync(file)) return file;

  const db = await PGlite.create();
  for (const sql of migrations) await db.exec(sql);
  const dump = await db.dumpDataDir('none');
  await db.close();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Rename into place so a concurrent reader never sees a partial dump.
  const partial = `${file}.${process.pid}.partial`;
  fs.writeFileSync(partial, Buffer.from(await dump.arrayBuffer()));
  fs.renameSync(partial, file);
  return file;
}
