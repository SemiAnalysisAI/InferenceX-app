import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

import type { DbClient } from '../connection';
import type { Sql } from '../etl/db-utils';
import type { OperatorXRawBundle } from '../operatorx/bundle';
import { getOperatorXBundle, listOperatorXRuns, saveOperatorXBundle } from './operatorx';

function bundle(): OperatorXRawBundle {
  const shape = {
    type: 'gemm',
    args: { m: 1, n: 64, k: 128, a: { dtype: 'bf16' }, b: { dtype: 'bf16' } },
    sources: ['openai/gpt-oss-120b/k_proj'],
  };
  return {
    run: {
      run_id: '123',
      run_attempt: 1,
      source_sha: 'a'.repeat(40),
      source_branch: 'main',
      generated_at: '2026-09-26T00:00:00Z',
      conclusion: 'success',
    },
    manifest: {
      include: [
        {
          id: 's1',
          runner: 'cluster:h200-dgxc',
          mode: 'timing',
          backends: ['vllm'],
          cases: [{ testlist: 'gemm', shape }],
        },
      ],
    },
    shards: [
      {
        id: 's1',
        attempt: 1,
        docs: [
          {
            run: { cluster: 'h200' },
            rows: [
              {
                testlist: 'gemm',
                op: { ...shape, backend: 'vllm' },
                status: 'ok',
                metrics: { latency_us: 10 },
              },
            ],
          },
        ],
      },
    ],
  };
}

function bind(value: unknown): string | number | boolean | null {
  if (Array.isArray(value))
    return `{${value.map((item) => JSON.stringify(String(item))).join(',')}}`;
  return value !== null && typeof value === 'object'
    ? JSON.stringify(value)
    : (value as string | number | boolean | null);
}

/** Let postgres.js-style tagged queries run against an isolated in-memory Postgres. */
function sqlFor(db: PGlite): Sql & DbClient {
  const makeTag = (client: Pick<PGlite, 'query'>): Sql => {
    const tag = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
      const result = await client.query<Record<string, unknown>>(query, values.map(bind));
      return result.rows;
    };
    return Object.assign(tag, {
      array: (items: unknown[]) => items,
      begin: <T>(fn: (tx: Sql) => Promise<T>) => db.transaction((tx) => fn(makeTag(tx))),
    }) as unknown as Sql & DbClient;
  };
  return makeTag(db) as Sql & DbClient;
}

it('persists raw OperatorX documents and replaces a re-ingested run atomically', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(
        new URL('../../migrations-operatorx/001_initial_schema.sql', import.meta.url),
        'utf8',
      ),
    );
    const sql = sqlFor(db);
    const first = bundle();

    expect(await saveOperatorXBundle(sql, first)).toEqual({ docs: 1, results: 1 });
    expect(await listOperatorXRuns(sql)).toMatchObject([
      {
        run_id: '123',
        plan: { runner: 'h200-dgxc', requested: 1 },
      },
    ]);
    const storedOriginal = await getOperatorXBundle(sql, '123');
    expect(storedOriginal).toMatchObject({
      run: { run_id: '123', conclusion: 'success' },
      shards: first.shards,
    });
    const originalRevision = storedOriginal!.run.revision;
    const originalRuns = await listOperatorXRuns(sql);
    expect(originalRuns[0].revision).toBe(originalRevision);

    const retry = structuredClone(first);
    retry.run.run_attempt = 2;
    retry.run.conclusion = 'failure';
    retry.shards = [];
    expect(await saveOperatorXBundle(sql, retry)).toEqual({ docs: 0, results: 1 });
    const storedReplacement = await getOperatorXBundle(sql, '123');
    expect(storedReplacement).toMatchObject({
      run: { run_attempt: 2, conclusion: 'failure' },
      shards: [],
    });
    const replacementRevision = storedReplacement!.run.revision;
    expect(replacementRevision).not.toBe(originalRevision);
    const replacementRuns = await listOperatorXRuns(sql);
    expect(replacementRuns[0].revision).toBe(replacementRevision);
    expect(await getOperatorXBundle(sql, '999')).toBeNull();
  } finally {
    await db.close();
  }
});
