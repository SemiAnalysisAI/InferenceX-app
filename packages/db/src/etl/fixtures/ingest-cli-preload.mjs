import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { mock } from 'bun:test';

import { pgliteSql } from '../../lib/test-pglite';
import * as dbUtils from '../db-utils';

// The CLI runs outside vitest, so the spawning test passes the migrated template path.
const db = await PGlite.create({
  loadDataDir: new Blob([fs.readFileSync(process.env.PGLITE_TEMPLATE)]),
});
const sql = Object.assign(pgliteSql(db), {
  end: () => db.close(),
});
mock.module('../db-utils', () => ({ ...dbUtils, createAdminSql: () => sql }));
globalThis.fetch = () => Promise.resolve(new Response(null, { status: 404 }));
