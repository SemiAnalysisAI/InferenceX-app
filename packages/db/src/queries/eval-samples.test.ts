import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DbClient } from '../connection.js';
import { migratedPglite } from '../lib/test-pglite';

import { getEvalSamples } from './eval-samples';

interface Query {
  strings: readonly string[];
  values: unknown[];
}

function isQuery(value: unknown): value is Query {
  return typeof value === 'object' && value !== null && 'strings' in value && 'values' in value;
}

function fragmentSql(db: PGlite): DbClient {
  const render = (query: Query, params: unknown[]): string =>
    query.strings.reduce((text, part, i) => {
      if (i === 0) return part;
      const value = query.values[i - 1];
      if (isQuery(value)) return text + render(value, params) + part;
      params.push(value);
      return `${text}$${params.length}${part}`;
    }, '');
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query: Query = { strings, values };
    return Object.assign(query, {
      // oxlint-disable-next-line unicorn/no-thenable
      then<T>(resolve: (rows: unknown[]) => T, reject: (error: unknown) => T) {
        const params: unknown[] = [];
        const text = render(query, params);
        return db.query(text, params).then((result) => resolve(result.rows), reject);
      },
    });
  };
  return tag as unknown as DbClient;
}

let db: PGlite;
let sql: DbClient;

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
  sql = fragmentSql(db);
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
  await db.close();
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
