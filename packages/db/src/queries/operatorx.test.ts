import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

import type { DbClient } from '../connection';
import type { Sql } from '../etl/db-utils';
import type { OperatorXRawBundle } from '../operatorx/bundle';
import { buildComparison } from '../operatorx/compare';
import { normalizeBundle } from '../operatorx/normalize';
import {
  backfillOperatorXRunComparisons,
  getOperatorXBundle,
  getOperatorXRunComparison,
  listOperatorXRuns,
  saveOperatorXBundle,
} from './operatorx';

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

async function migrate(db: PGlite, compact = true): Promise<void> {
  for (const name of ['001_initial_schema.sql', ...(compact ? ['002_comparison_cache.sql'] : [])]) {
    await db.exec(
      await readFile(new URL(`../../migrations-operatorx/${name}`, import.meta.url), 'utf8'),
    );
  }
}

function expectedComparison(raw: OperatorXRawBundle) {
  const dataset = normalizeBundle(raw);
  return buildComparison('gemm', [{ runner: dataset.run.plan!.runner, dataset }]);
}

it('persists raw OperatorX documents and replaces a re-ingested run atomically', async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const sql = sqlFor(db);
    const first = bundle();
    first.run.generated_at = '2026-09-26T08:00:00.123+08:00';

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
    const compactOriginal = await getOperatorXRunComparison(sql, '123', 'gemm');
    expect(compactOriginal).toEqual(expectedComparison(storedOriginal!));
    expect(compactOriginal!.rows[0]).toMatchObject({
      latencyUs: 10,
      status: 'ok',
      runId: '123',
      resultIndex: 0,
      revision: originalRevision,
    });
    expect(await getOperatorXRunComparison(sql, '123', 'moe')).toEqual({
      op: 'moe',
      hardware: [],
      workloads: [],
      rows: [],
    });

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
    const compactReplacement = await getOperatorXRunComparison(sql, '123', 'gemm');
    expect(compactReplacement).toEqual(expectedComparison(storedReplacement!));
    expect(compactReplacement!.rows[0]).toMatchObject({
      status: 'missing',
      latencyUs: null,
      revision: replacementRevision,
    });
    const persisted = await db.query<{ run_id: number }>('SELECT run_id FROM opx_run_comparisons');
    expect(persisted.rows).toHaveLength(2);
    expect(persisted.rows.every((row) => String(row.run_id) === replacementRevision)).toBe(true);
    expect(await getOperatorXRunComparison(sql, '999', 'gemm')).toBeNull();
    expect(await getOperatorXBundle(sql, '999')).toBeNull();
  } finally {
    await db.close();
  }
});

it('keeps raw documents and compact comparisons intact when a re-ingest fails', async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const sql = sqlFor(db);
    await saveOperatorXBundle(sql, bundle());
    const before = await getOperatorXBundle(sql, '123');
    const comparison = await getOperatorXRunComparison(sql, '123', 'gemm');
    // A raw-document write failure must preserve the previous revision.
    await db.exec(`ALTER TABLE opx_run_docs ADD CONSTRAINT reject_retry CHECK (run_attempt = 1)`);
    const retry = bundle();
    retry.run.run_attempt = 2;
    retry.shards[0].attempt = 2;
    await expect(saveOperatorXBundle(sql, retry)).rejects.toThrow();
    expect(await getOperatorXBundle(sql, '123')).toEqual(before);
    expect(await getOperatorXRunComparison(sql, '123', 'gemm')).toEqual(comparison);
    // A projection failure after all raw writes must roll those writes back too.
    await db.exec('ALTER TABLE opx_run_docs DROP CONSTRAINT reject_retry');
    await db.exec(
      `ALTER TABLE opx_run_comparisons ADD CONSTRAINT reject_gemm CHECK (op <> 'gemm') NOT VALID`,
    );
    await expect(saveOperatorXBundle(sql, retry)).rejects.toThrow();
    expect(await getOperatorXBundle(sql, '123')).toEqual(before);
    expect(await getOperatorXRunComparison(sql, '123', 'gemm')).toEqual(comparison);
  } finally {
    await db.close();
  }
});

const row = (m: number, latency: number) => ({
  testlist: 'gemm',
  op: {
    type: 'gemm',
    backend: 'vllm',
    args: { m, n: 64, k: 128, a: { dtype: 'bf16' }, b: { dtype: 'bf16' } },
    sources: ['openai/gpt-oss-120b/k_proj'],
  },
  status: 'ok',
  metrics: { latency_us: latency, profile: { kernels: [{ name: `kernel_${latency}` }] } },
});

it('projects persisted shard order so duplicate selection and timeline indices match raw reads', async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const sql = sqlFor(db);
    const input = bundle();
    input.shards[0].id = 'z';
    input.shards.push({
      id: 'a',
      attempt: 1,
      docs: [{ run: { cluster: 'h200' }, rows: [row(2, 30), row(1, 20)] }],
    });
    await saveOperatorXBundle(sql, input);
    const stored = (await getOperatorXBundle(sql, '123'))!;
    expect(stored.shards.map((s) => s.id)).toEqual(['a', 'z']);
    const comparison = (await getOperatorXRunComparison(sql, '123', 'gemm'))!;
    expect(comparison).toEqual(expectedComparison(stored));
    const selected = comparison.rows.find((r) => r.dims.m === 1)!;
    expect(selected).toMatchObject({ latencyUs: 20, resultIndex: 1, kernel: 'kernel_20' });
    const normalized = normalizeBundle(stored);
    expect(normalized.results[selected.resultIndex].latencyUs).toBe(selected.latencyUs);
    expect(normalized.metrics[selected.resultIndex]).toMatchObject({
      profile: { kernels: [{ name: 'kernel_20' }] },
    });
  } finally {
    await db.close();
  }
});

it('backfills idempotently and refuses a revision replaced after the raw read', async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const sql = sqlFor(db);
    await saveOperatorXBundle(sql, bundle());
    const captured = (await getOperatorXBundle(sql, '123'))!;
    await db.exec('DELETE FROM opx_run_comparisons');
    expect(await getOperatorXRunComparison(sql, '123', 'gemm')).toBeNull();
    expect(await backfillOperatorXRunComparisons(sql, captured)).toBe(true);
    expect(await backfillOperatorXRunComparisons(sql, captured)).toBe(true);
    expect(await getOperatorXBundle(sql, '123')).toEqual(captured);
    expect(await getOperatorXRunComparison(sql, '123', 'gemm')).toEqual(
      expectedComparison(captured),
    );
    const persisted = await db.query('SELECT * FROM opx_run_comparisons');
    expect(persisted.rows).toHaveLength(2);

    await db.exec('UPDATE opx_run_comparisons SET format_version = 999');
    expect(await getOperatorXRunComparison(sql, '123', 'gemm')).toBeNull();
    expect(await backfillOperatorXRunComparisons(sql, captured)).toBe(true);
    expect(await getOperatorXRunComparison(sql, '123', 'gemm')).toEqual(
      expectedComparison(captured),
    );

    const retry = bundle();
    retry.shards = [];
    await saveOperatorXBundle(sql, retry);
    const replacement = await getOperatorXRunComparison(sql, '123', 'gemm');
    expect(await backfillOperatorXRunComparisons(sql, captured)).toBe(false);
    expect(await getOperatorXRunComparison(sql, '123', 'gemm')).toEqual(replacement);
    await expect(backfillOperatorXRunComparisons(sql, bundle())).rejects.toThrow('stored revision');
  } finally {
    await db.close();
  }
});

it('falls back before the projection migration is applied', async () => {
  const db = new PGlite();
  try {
    await migrate(db, false);
    expect(await getOperatorXRunComparison(sqlFor(db), '123', 'gemm')).toBeNull();
  } finally {
    await db.close();
  }
});

it.each(['42501', '08006', '57014'])(
  'propagates database errors with SQLSTATE %s',
  async (code) => {
    const failure = Object.assign(new Error('database failure'), { code });
    const sql = (() => Promise.reject(failure)) as unknown as DbClient;
    await expect(getOperatorXRunComparison(sql, '123', 'gemm')).rejects.toBe(failure);
  },
);
