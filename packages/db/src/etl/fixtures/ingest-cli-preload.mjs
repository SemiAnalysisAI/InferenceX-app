import { mock } from 'bun:test';
import { migratedPglite, pgliteSql } from '../../lib/test-pglite';
import * as dbUtils from '../db-utils';

const db = await migratedPglite();
const sql = Object.assign(pgliteSql(db), {
  end: () => db.close(),
});
mock.module('../db-utils', () => ({ ...dbUtils, createAdminSql: () => sql }));
globalThis.fetch = () => Promise.resolve(new Response(null, { status: 404 }));
