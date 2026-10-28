import { describe, expect, it } from 'vitest';

import { makeRawMatrix, makeRawShard, makeRunMeta } from '../collectivex/test-fixture';
import type { DbClient } from '../connection.js';
import {
  collectiveXDatasetFromRow,
  deleteCollectiveXRun,
  getCollectiveXRun,
  getCollectiveXRunStates,
  getLatestCollectiveXRun,
  insertCollectiveXRun,
  listCollectiveXRuns,
  refreshCollectiveXRunAttempt,
  type CollectiveXRunInsert,
  type CollectiveXRunRow,
} from './collectivex';

interface Captured {
  text: string;
  values: unknown[];
}

function fakeSql(rowsQueue: Record<string, unknown>[][]) {
  const calls: Captured[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve(rowsQueue.shift() ?? []);
  }) as DbClient;
  return { sql, calls };
}

const runInsert: CollectiveXRunInsert = {
  run_id: '160',
  run_attempt: 2,
  version: 1,
  generated_at: '2026-07-08T12:20:00Z',
  source_sha: 'a'.repeat(40),
  source_branch: 'collectivex',
  conclusion: 'success',
  matrix: { version: 1, requested_cases: [], include: [] },
  summary: {
    run_id: '160',
    run_attempt: 2,
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

describe('getCollectiveXRunStates', () => {
  it('maps deleted flags to tombstone states with version and attempt', async () => {
    const { sql } = fakeSql([
      [
        { run_id: '160', version: 1, run_attempt: 2, deleted: false },
        { run_id: '161', version: 2, run_attempt: 1, deleted: true },
      ],
    ]);
    const states = await getCollectiveXRunStates(sql, ['160', '161']);
    expect(states).toEqual({
      '160': { state: 'live', version: 1, run_attempt: 2 },
      '161': { state: 'deleted', version: 2, run_attempt: 1 },
    });
  });

  it('skips the query entirely for an empty id list', async () => {
    const { sql, calls } = fakeSql([]);
    expect(await getCollectiveXRunStates(sql, [])).toEqual({});
    expect(calls).toHaveLength(0);
  });
});

describe('read queries', () => {
  it('excludes tombstoned and unsupported-vendor-only rows', async () => {
    const { sql, calls } = fakeSql([[], [], []]);
    await getLatestCollectiveXRun(sql, 1);
    await getCollectiveXRun(sql, 1, '160');
    await listCollectiveXRuns(sql, 1);
    for (const call of calls) {
      expect(call.text).toContain('deleted_at IS NULL');
      expect(call.text).toContain("summary->>'requested_cases'");
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

describe('insertCollectiveXRun', () => {
  it('binds raw objects (never pre-stringified JSON) and reports insertion', async () => {
    const { sql, calls } = fakeSql([[{ runs_inserted: 1 }]]);
    const docs = [{ record_type: 'case-attempt' }];

    await expect(insertCollectiveXRun(sql, runInsert, docs)).resolves.toBe(true);

    expect(calls[0].text).toContain('ON CONFLICT (run_id) DO NOTHING');
    expect(calls[0].values).toContainEqual(runInsert.matrix);
    expect(calls[0].values).toContainEqual({ docs });
    expect(
      calls[0].values.every((value) => typeof value !== 'string' || !value.startsWith('{')),
    ).toBe(true);
  });

  it('reports a conflict no-op as not inserted', async () => {
    const { sql } = fakeSql([[{ runs_inserted: 0 }]]);
    await expect(insertCollectiveXRun(sql, runInsert, [])).resolves.toBe(false);
  });
});

describe('refreshCollectiveXRunAttempt', () => {
  it('guards on a strictly newer attempt and reports replacement', async () => {
    const { sql, calls } = fakeSql([[{ runs_updated: 1 }]]);
    await expect(refreshCollectiveXRunAttempt(sql, runInsert, [])).resolves.toBe(true);
    expect(calls[0].text).toContain('run_attempt < ');
    expect(calls[0].text).toContain('deleted_at IS NULL');
    expect(calls[0].text).toContain('FOR UPDATE');
  });

  it('reports a guarded no-op (older or equal attempt, or tombstoned) as false', async () => {
    const { sql } = fakeSql([[{ runs_updated: 0 }]]);
    await expect(refreshCollectiveXRunAttempt(sql, runInsert, [])).resolves.toBe(false);
  });
});

describe('deleteCollectiveXRun', () => {
  it('tombstones the run and frees its documents in one atomic statement', async () => {
    const { sql, calls } = fakeSql([[{ runs_deleted: 1 }]]);
    await expect(deleteCollectiveXRun(sql, '160')).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('SET deleted_at = now()');
    expect(calls[0].text).toContain('deleted_at IS NULL');
    expect(calls[0].text).toContain('DELETE FROM cx_run_docs');
  });

  it('reports absent or already-tombstoned runs as false', async () => {
    const { sql } = fakeSql([[{ runs_deleted: 0 }]]);
    await expect(deleteCollectiveXRun(sql, '160')).resolves.toBe(false);
  });

  it('cannot reach anything but the one run it is given', async () => {
    const { sql, calls } = fakeSql([[{ runs_deleted: 1 }]]);
    await deleteCollectiveXRun(sql, '160');
    expect(calls[0].values).toEqual(['160']);
    expect(calls[0].text).toContain(
      'DELETE FROM cx_run_docs WHERE run_id IN (SELECT run_id FROM tombstoned)',
    );
    expect(new Set([...calls[0].text.matchAll(/\bcx_[a-z_]+/gu)].map((match) => match[0]))).toEqual(
      new Set(['cx_runs', 'cx_run_docs']),
    );
    expect(calls[0].text).not.toMatch(/\b(?:DROP|TRUNCATE|ALTER)\b/iu);
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
    source_branch: 'collectivex',
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
