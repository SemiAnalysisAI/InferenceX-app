import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'bun:test';

import { migratedPglite, pgliteDriverSql, type PgliteSql } from '../lib/test-pglite';
import { ingestEvalRow, type EvalPersistenceInput } from './eval-ingest';

let db: PGlite;
let sql: PgliteSql;

beforeAll(async () => {
  db = await migratedPglite();
  sql = await pgliteDriverSql(db);
}, 20_000);

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 1, 1, 'Run Sweep', 'completed', 'success', '2026-09-11', '2026-09-11');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'minimaxm3', 'gb200', 'dynamo-trt', 'fp4', 'mtp', false, 4, 4, 4, 4);`);
});

afterAll(async () => {
  await sql?.end();
  await db?.close();
});

const input: EvalPersistenceInput = {
  task: 'gsm8k',
  isl: null,
  osl: null,
  conc: 5,
  lmEvalVersion: null,
  metrics: { em_strict: 0.95 },
};

it('reuses the aggregate eval identity and preserves samples on nullable-key replay', async () => {
  const original = await ingestEvalRow(sql, 1, input, 1, '2026-09-11');
  await db.query('INSERT INTO eval_samples (eval_result_id, doc_id, metrics) VALUES ($1, 0, $2)', [
    original.id,
    '{}',
  ]);
  const replay = await ingestEvalRow(
    sql,
    1,
    { ...input, metrics: { em_strict: 0.96 } },
    1,
    '2026-09-11',
  );
  expect(replay).toEqual({ outcome: 'dup', id: original.id });
  const evalRows = await db.query('SELECT metrics FROM eval_results');
  expect(evalRows.rows).toEqual([{ metrics: { em_strict: 0.96 } }]);
  const sampleRows = await db.query('SELECT eval_result_id FROM eval_samples');
  expect(sampleRows.rows).toEqual([{ eval_result_id: original.id }]);
  const other = await ingestEvalRow(sql, 1, { ...input, conc: 10 }, 1, '2026-09-11');
  expect(other.id).not.toBe(original.id);
});

it('retains fixed-length upserts and rejects invalid negative lengths', async () => {
  const fixed = { ...input, isl: 1024, osl: 8192 };
  const original = await ingestEvalRow(sql, 1, fixed, 1, '2026-09-11');
  expect(await ingestEvalRow(sql, 1, fixed, 1, '2026-09-11')).toEqual({
    outcome: 'dup',
    id: original.id,
  });
  await expect(ingestEvalRow(sql, 1, { ...input, isl: -1 }, 1, '2026-09-11')).rejects.toThrow(
    'eval_results_isl_positive',
  );
});
