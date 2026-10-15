import fs from 'node:fs';
import path from 'node:path';
import { mock } from 'bun:test';
import { migratedPglite, pgliteSql } from '../../lib/test-pglite';
import * as dbUtils from '../db-utils';

const db = await migratedPglite();
const sql = Object.assign(pgliteSql(db), {
  end: async () => {
    await db.close();
    fs.writeFileSync(path.join(process.cwd(), 'closed'), 'closed');
  },
});
mock.module('../db-utils', () => ({ ...dbUtils, createAdminSql: () => sql }));
globalThis.fetch = () => Promise.resolve(new Response(null, { status: 404 }));
