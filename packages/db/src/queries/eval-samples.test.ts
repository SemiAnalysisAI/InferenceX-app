import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { migratedPglite, pgliteDriverSql, type PgliteSql } from '../lib/test-pglite';

import { getEvalSamples } from './eval-samples';

let db: PGlite;
let sql: PgliteSql;

const sample = (
  docId: number,
  passed: boolean | null,
  data: unknown,
  evalResultId = 1,
): Promise<unknown> =>
  db.query(
    `insert into eval_samples (eval_result_id, doc_id, prompt, target, response, passed, score, metrics, data)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      evalResultId,
      docId,
      `prompt ${docId}`,
      `target ${docId}`,
      `response ${docId}`,
      passed,
      passed ? 1 : 0,
      { exact_match: passed ? 1 : 0 },
      data,
    ],
  );

beforeAll(async () => {
  db = await migratedPglite();
  sql = await pgliteDriverSql(db);
  await db.exec('set session_replication_role = replica');
  await sample(3, true, {
    resps: [['raw 3']],
    arguments: { gen_args_0: { arg_0: 'chat prompt 3' } },
  });
  await sample(1, false, {
    resps: [['raw 1']],
    arguments: { gen_args_0: { arg_0: ['chat prompt 1', { until: ['\n'] }] } },
  });
  await sample(2, null, { arguments: { gen_args_0: { arg_0: [{ role: 'user' }] } } });
  await sample(4, true, null);
  await sample(1, true, { resps: [['other result']] }, 2);
});

afterAll(async () => {
  await sql?.end();
  await db?.close();
});

const docIds = (result: { samples: { doc_id: number }[] }) => result.samples.map((s) => s.doc_id);

describe('getEvalSamples', () => {
  it('returns a page in doc order with the response and the chat prompt source', async () => {
    const result = await getEvalSamples(sql, 1, 'all', 0, 10);

    expect(docIds(result)).toEqual([1, 2, 3, 4]);
    expect(result).toMatchObject({ total: 4, passedTotal: 2, failedTotal: 1 });
    expect(
      result.samples.map(({ raw_response, fewshot_source }) => [raw_response, fewshot_source]),
    ).toEqual([
      ['raw 1', 'chat prompt 1'],
      [null, null],
      ['raw 3', 'chat prompt 3'],
      [null, null],
    ]);
    expect(result.samples[0]).toMatchObject({
      prompt: 'prompt 1',
      target: 'target 1',
      response: 'response 1',
      passed: false,
      metrics: { exact_match: 0 },
    });
  });

  it.each([
    ['passed', [3, 4], 2],
    ['failed', [1], 1],
  ] as const)('filters %s samples and totals them', async (filter, ids, total) => {
    const result = await getEvalSamples(sql, 1, filter, 0, 10);

    expect(docIds(result)).toEqual(ids);
    expect(result).toMatchObject({ total, passedTotal: 2, failedTotal: 1 });
  });

  it('pages by offset and limit', async () => {
    expect(docIds(await getEvalSamples(sql, 1, 'all', 1, 2))).toEqual([2, 3]);
  });

  it('keeps the totals on a page past the end', async () => {
    const result = await getEvalSamples(sql, 1, 'passed', 5, 10);

    expect(result).toEqual({ samples: [], total: 2, passedTotal: 2, failedTotal: 1 });
  });

  it('returns zero totals for a result without samples', async () => {
    expect(await getEvalSamples(sql, 9, 'all', 0, 10)).toEqual({
      samples: [],
      total: 0,
      passedTotal: 0,
      failedTotal: 0,
    });
  });
});
