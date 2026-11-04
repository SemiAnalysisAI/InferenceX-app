import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';

import { getEvalSampleOffset, getEvalSamples } from './eval-samples';

let db: PGlite;
let sql: PgliteSql;

const passedOf = (docId: number): boolean | null => (docId === 7 ? null : docId % 3 !== 0);

const promptOf = (docId: number): string =>
  JSON.stringify([
    { role: 'user', content: `q${docId}` },
    { role: 'assistant', content: `a${docId}` },
    { role: 'user', content: `final ${docId}` },
  ]);

function dataOf(docId: number): unknown {
  const prompt = promptOf(docId);
  const argument = docId % 2 === 0 ? prompt : [prompt, { max_tokens: 8 }];
  return {
    doc: { id: docId },
    resps: [[`raw ${docId}`]],
    arguments: docId === 5 ? {} : { gen_args_0: { arg_0: argument } },
  };
}

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
  await db.exec(`
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 1, 1, 'Run Sweep', 'completed', 'success', '2026-10-01T04:19:00Z', '2026-10-01');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsv4', 'b200', 'vllm', 'fp4', 'none', false, false, 8, 8, 8, 8);
    INSERT INTO eval_results (id, workflow_run_id, config_id, task, date, metrics)
    VALUES (1, 1, 1, 'gsm8k', '2026-10-01', '{}'), (2, 1, 1, 'mmlu', '2026-10-01', '{}');
  `);
  for (const docId of [9, 3, 0, 6, 1, 8, 4, 7, 2, 5]) {
    await sql`
      insert into eval_samples (eval_result_id, doc_id, prompt, target, response, passed, score, metrics, data)
      values (1, ${docId}, ${`prompt ${docId}`}, ${`target ${docId}`}, ${`resp ${docId}`},
        ${passedOf(docId)}, ${docId / 10}, ${JSON.stringify({ exact_match: docId % 3 === 0 ? 0 : 1 })},
        ${JSON.stringify(dataOf(docId))})
    `;
  }
  await sql`
    insert into eval_samples (eval_result_id, doc_id, passed, data)
    values (2, 0, true, ${JSON.stringify(dataOf(0))})
  `;
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe('eval sample pages on PostgreSQL', () => {
  it('returns one ordered page with extracted responses, demonstrations source, and counts', async () => {
    const page = await getEvalSamples(sql, 1, 'all', 4, 3);
    expect(page).toMatchObject({ total: 10, passedTotal: 5, failedTotal: 4 });
    expect(page.samples).toMatchObject(
      [4, 5, 6].map((docId) => ({
        doc_id: docId,
        prompt: `prompt ${docId}`,
        target: `target ${docId}`,
        response: `resp ${docId}`,
        raw_response: `raw ${docId}`,
        fewshot_source: docId === 5 ? null : promptOf(docId),
        passed: passedOf(docId),
        score: String(docId / 10),
        metrics: { exact_match: docId % 3 === 0 ? 0 : 1 },
      })),
    );
  });

  it('reads the first string of an array prompt argument', async () => {
    const { samples } = await getEvalSamples(sql, 1, 'all', 1, 1);
    expect(samples[0]?.fewshot_source).toBe(promptOf(1));
  });

  it('pages within the passed and failed filters', async () => {
    const passed = await getEvalSamples(sql, 1, 'passed', 2, 3);
    expect(passed.samples.map((sample) => sample.doc_id)).toEqual([4, 5, 8]);
    expect(passed.total).toBe(5);
    const failed = await getEvalSamples(sql, 1, 'failed', 0, 10);
    expect(failed.samples.map((sample) => sample.doc_id)).toEqual([0, 3, 6, 9]);
    expect(failed.total).toBe(4);
  });

  it('keeps the counts on a page past the end', async () => {
    expect(await getEvalSamples(sql, 1, 'all', 40, 10)).toEqual({
      samples: [],
      total: 10,
      passedTotal: 5,
      failedTotal: 4,
    });
  });

  it('locates a sample by document id', async () => {
    expect(await getEvalSampleOffset(sql, 1, 6)).toBe(6);
    expect(await getEvalSampleOffset(sql, 1, 60)).toBeNull();
  });
});
