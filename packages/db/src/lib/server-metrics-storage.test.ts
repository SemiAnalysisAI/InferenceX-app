import { randomBytes } from 'node:crypto';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readServerMetricsGz } from './server-metrics-storage';
import { migratedPglite, pgliteSql, type PgliteSql } from './test-pglite';

let db: PGlite;
let sql: PgliteSql;
beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
});
afterAll(async () => {
  await db.close();
});

async function traceWith(blob: Buffer | null): Promise<number> {
  const [row] = await sql`
    insert into agentic_trace_replay (server_metrics_json_gz) values (${blob}) returning id
  `;
  return Number(row.id);
}

describe('readServerMetricsGz', () => {
  it.each([
    ['a partial last slice', 2 * 64 + 13],
    ['an exact slice multiple', 3 * 64],
    ['fewer bytes than one slice', 5],
  ])('reassembles %s byte-for-byte', async (_, size) => {
    const blob = randomBytes(size);
    const id = await traceWith(blob);
    const restored = await readServerMetricsGz(sql, id, 64);
    expect(restored?.equals(blob)).toBe(true);
  });

  it('returns null when the trace has no server metrics', async () => {
    expect(await readServerMetricsGz(sql, await traceWith(null), 64)).toBeNull();
  });
});
