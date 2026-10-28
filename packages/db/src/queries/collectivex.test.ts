import { describe, expect, it } from 'vitest';

import { makeRawMatrix, makeRawShard, makeRunMeta } from '../collectivex/test-fixture';
import type { DbClient } from '../connection.js';
import type { Sql } from '../etl/db-utils';
import {
  collectiveXDatasetFromRow,
  getCollectiveXRun,
  getLatestCollectiveXRun,
  listCollectiveXRuns,
  upsertCollectiveXRun,
  type CollectiveXRunInsert,
  type CollectiveXRunRow,
} from './collectivex';

interface Captured {
  text: string;
  values: unknown[];
}

function fakeSql(rowsQueue: Record<string, unknown>[][]) {
  const calls: Captured[] = [];
  const tag = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve(rowsQueue.shift() ?? []);
  }) as DbClient;
  const sql = Object.assign(tag, {
    begin: (fn: (tx: DbClient) => Promise<unknown>) => fn(tag),
  }) as unknown as Sql & DbClient;
  return { sql, calls };
}

const runInsert: CollectiveXRunInsert = {
  run_id: '1783513200',
  run_attempt: 1,
  version: 1,
  generated_at: '2026-07-08T12:20:00Z',
  source_sha: 'a'.repeat(40),
  source_branch: 'main',
  conclusion: 'success',
  matrix: { version: 1, requested_cases: [] },
  summary: {
    run_id: '1783513200',
    run_attempt: 1,
    generated_at: '2026-07-08T12:20:00Z',
    conclusion: 'success',
    covered_skus: [],
    requested_cases: 0,
    measured_cases: 0,
    requested_points: 0,
    terminal_points: 0,
    terminal_counts: { measured: 0, unsupported: 0, failed: 0 },
  },
};

describe('read queries', () => {
  it('excludes unsupported-vendor-only rows and orders newest commit first', async () => {
    const { sql, calls } = fakeSql([[], [], []]);
    await getLatestCollectiveXRun(sql, 1);
    await getCollectiveXRun(sql, 1, '160');
    await listCollectiveXRuns(sql, 1);
    for (const call of calls) {
      expect(call.text).not.toContain('deleted_at');
      expect(call.text).toContain("summary->>'requested_cases'");
      expect(call.text).toContain("summary->>'measured_cases')::int, 0) > 0");
    }
    expect(calls[0].text).toContain('ORDER BY r.run_id DESC');
    expect(calls[2].text).toContain('ORDER BY run_id DESC');
    expect(calls[2].text).not.toContain('LIMIT');
  });

  it('reads the recorded source repository with each run row', async () => {
    const { sql, calls } = fakeSql([[], []]);
    await getLatestCollectiveXRun(sql, 1);
    await getCollectiveXRun(sql, 1, '160');
    for (const call of calls) {
      expect(call.text).toContain("r.summary->>'source_repository' AS source_repository");
    }
  });
});

describe('upsertCollectiveXRun', () => {
  it('binds raw objects (never pre-stringified JSON) and reports a first insert', async () => {
    const { sql, calls } = fakeSql([[], [{ inserted: true }]]);
    const docs = [{ record_type: 'case-attempt' }];

    await expect(upsertCollectiveXRun(sql, runInsert, docs)).resolves.toBe('inserted');

    expect(calls).toHaveLength(2);
    expect(calls[1].values).toContainEqual(runInsert.matrix);
    expect(calls[1].values).toContainEqual(runInsert.summary);
    expect(calls[1].values).toContainEqual({ docs });
    expect(
      calls[1].values.every((value) => typeof value !== 'string' || !value.startsWith('{')),
    ).toBe(true);
  });

  it('takes the CollectiveX write lock in the transaction before writing', async () => {
    const { sql, calls } = fakeSql([[], [{ inserted: true }]]);
    await upsertCollectiveXRun(sql, runInsert, []);
    expect(calls[0].text).toBe('SELECT pg_advisory_xact_lock(7384110219)');
  });

  it('replaces the row and its documents when the same commit is ingested again', async () => {
    const { sql, calls } = fakeSql([[], [{ inserted: false }]]);
    await expect(upsertCollectiveXRun(sql, runInsert, [])).resolves.toBe('replaced');
    const { text } = calls[1];
    expect(text).toContain('ON CONFLICT (run_id) DO UPDATE');
    expect(text).toContain('WHERE cx_runs.source_sha = EXCLUDED.source_sha');
    expect(text).toContain('DELETE FROM cx_run_docs WHERE run_id IN (SELECT run_id FROM upserted)');
    expect(text).toContain('INSERT INTO cx_run_docs');
  });

  it('writes nothing when the run id already belongs to another commit', async () => {
    const { sql } = fakeSql([[], []]);
    await expect(upsertCollectiveXRun(sql, runInsert, [{}])).resolves.toBe('conflict');
  });

  it('touches only the CollectiveX tables and never drops data wholesale', async () => {
    const { sql, calls } = fakeSql([[], [{ inserted: true }]]);
    await upsertCollectiveXRun(sql, runInsert, []);
    expect(new Set([...calls[1].text.matchAll(/\bcx_[a-z_]+/gu)].map((match) => match[0]))).toEqual(
      new Set(['cx_runs', 'cx_run_docs']),
    );
    expect(calls[1].text).not.toMatch(/\b(?:DROP|TRUNCATE|ALTER)\b/iu);
  });
});

describe('collectiveXDatasetFromRow', () => {
  const shard = makeRawShard();
  // makeRawShard returns loose JSON whose identity shape the fixture fixes.
  const identity = shard.identity as {
    case_id: string;
    case_factors: { sku: string; case: Record<string, unknown> };
  };
  const meta = makeRunMeta();
  const row: CollectiveXRunRow = {
    run_id: meta.run_id,
    run_attempt: meta.run_attempt,
    version: 1,
    generated_at: meta.generated_at,
    source_sha: meta.source_sha,
    source_branch: 'main',
    source_repository: null,
    conclusion: meta.conclusion,
    matrix: makeRawMatrix([
      {
        caseId: identity.case_id,
        sku: identity.case_factors.sku,
        disposition: 'runnable',
        case: identity.case_factors.case,
      },
    ]),
    docs: [shard],
  };

  it('assembles a stored row through the shared reader', () => {
    const dataset = collectiveXDatasetFromRow(row);
    expect(dataset.run.run_id).toBe(meta.run_id);
    expect(dataset.series).toHaveLength(1);
    expect(dataset.run.measured_cases).toBe(1);
    expect(JSON.stringify(dataset.run)).not.toContain('source_repository');
  });

  it('exposes the recorded source repository on the dataset run', () => {
    const dataset = collectiveXDatasetFromRow({
      ...row,
      source_repository: 'ExampleOrg/ExampleBench',
    });
    expect(dataset.run.source_repository).toBe('ExampleOrg/ExampleBench');
  });
});
