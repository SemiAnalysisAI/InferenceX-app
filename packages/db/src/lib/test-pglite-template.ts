import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    pgliteTemplate: string;
  }
}

// Migrating once and loading the data dir per file is ~9x cheaper than migrating per file.
export default async function setup(project: TestProject): Promise<() => void> {
  const db = await PGlite.create();
  const dir = new URL('../../migrations/', import.meta.url);
  for (const name of fs.readdirSync(dir).toSorted()) {
    if (name.endsWith('.sql')) await db.exec(fs.readFileSync(new URL(name, dir), 'utf8'));
  }
  const dump = await db.dumpDataDir('none');
  await db.close();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pglite-template-'));
  const file = path.join(tmp, 'migrated.tar');
  fs.writeFileSync(file, Buffer.from(await dump.arrayBuffer()));
  project.provide('pgliteTemplate', file);
  return () => fs.rmSync(tmp, { recursive: true, force: true });
}
