import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { it, expect } from 'vitest';
import type { DbClient } from '../connection';
import { makeOperatorXBundle, makeOperatorXAttentionBundle } from '../operatorx/test-fixture';
import { getOperatorXBundle, listOperatorXRuns, saveOperatorXBundle } from './operatorx';

it('persists raw documents atomically and cannot replace a newer attempt with stale results', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(
        new URL('../../migrations-operatorx/001_initial_schema.sql', import.meta.url),
        'utf8',
      ),
    );
    const sql: DbClient = async (strings, ...values) => {
      const query = strings.reduce((s, part, index) => s + (index ? `$${index}` : '') + part, '');
      const result = await db.query<Record<string, unknown>>(query, values);
      return result.rows;
    };
    const old = makeOperatorXBundle();
    const newer = structuredClone(old);
    newer.run.run_attempt = 2;
    newer.run.conclusion = 'failure';
    await saveOperatorXBundle(sql, old);
    await saveOperatorXBundle(sql, newer);
    await saveOperatorXBundle(sql, old);
    const stored = await getOperatorXBundle(sql, '123');
    expect(stored?.run).toMatchObject({
      run_attempt: 2,
      conclusion: 'failure',
    });
    expect(await listOperatorXRuns(sql)).toMatchObject([
      { run_id: '123', run_attempt: 2, measured: 1 },
    ]);
    expect(await getOperatorXBundle(sql, '999')).toBeNull();
    const legacy = makeOperatorXAttentionBundle();
    await sql`UPDATE opx_runs SET bundle = ${legacy}::jsonb, run_attempt = 1,
      summary = ${legacy.run}::jsonb WHERE run_id = '123'`;
    expect(await listOperatorXRuns(sql)).toMatchObject([{ requested: 3, measured: 3 }]);
    const refreshed = await db.query<{ summary: Record<string, unknown> }>(
      'SELECT summary FROM opx_runs',
    );
    expect(refreshed.rows[0].summary).toMatchObject({ _reader_version: 2, measured: 3 });
    const summaries = await listOperatorXRuns(sql);
    expect(summaries[0]).not.toHaveProperty('_reader_version');
  } finally {
    await db.close();
  }
});
