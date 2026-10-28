/** Import one external OperatorX bundle when the direct PostgreSQL port is unavailable. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { Client, neonConfig } from '@neondatabase/serverless';

import type { DbClient } from '../src/connection';
import type { Sql } from '../src/etl/db-utils';
import type { OperatorXRawBundle } from '../src/operatorx/bundle';
import { getOperatorXBundle, saveOperatorXBundle } from '../src/queries/operatorx';

const [bundlePath, oldRunKey, backupPath] = process.argv.slice(2);
if (!bundlePath || !oldRunKey || !backupPath)
  throw new Error(
    'Usage: replace-operatorx-over-websocket.ts <bundle.json> <old-run-key> <backup.json>',
  );
const connectionString = process.env.DATABASE_OPERATORX_WRITE_URL;
if (!connectionString) throw new Error('DATABASE_OPERATORX_WRITE_URL is required');

neonConfig.webSocketConstructor = WebSocket;
const client = new Client({ connectionString });
await client.connect();

const queryTag = async (parts: TemplateStringsArray, ...values: unknown[]) => {
  const query = parts.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, '');
  const result = await client.query(query, values);
  return result.rows;
};
const begin = async <T>(work: (tx: Sql) => Promise<T>): Promise<T> => {
  await client.query('BEGIN');
  try {
    const result = await work(sql);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};
const sql = Object.assign(queryTag, {
  array: (values: unknown[]) => values,
  begin,
}) as unknown as Sql & DbClient;

try {
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as OperatorXRawBundle;
  const old = await getOperatorXBundle(sql, oldRunKey);
  if (!old) throw new Error(`Replacement run not found: ${oldRunKey}`);
  if (existsSync(backupPath)) {
    const backedUp = JSON.parse(readFileSync(backupPath, 'utf8')) as OperatorXRawBundle;
    if (backedUp.run.run_id !== oldRunKey || backedUp.run.revision !== old.run.revision)
      throw new Error(`Backup at ${backupPath} does not match the current run revision`);
    console.log(`Using existing backup of ${oldRunKey}`);
  } else {
    writeFileSync(backupPath, `${JSON.stringify(old)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(`Backed up ${oldRunKey} before replacement`);
  }
  const stored = await saveOperatorXBundle(sql, bundle, oldRunKey);
  console.log(`Stored ${bundle.run.run_id}: ${stored.docs} documents, ${stored.results} results`);
} finally {
  await client.end();
}
