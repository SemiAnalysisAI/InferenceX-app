import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Sql } from './db-utils';
import { stablePowerPointIdentity } from './power-publication';

import {
  readTelemetryReceipt,
  summarizeTelemetryReceipt,
  telemetryArtifactsForAttempt,
  verifyTelemetryApi,
  type TelemetryReceipt,
} from './telemetry-receipt';

describe('telemetry attachment receipts', () => {
  it('isolates the source attempt before selecting or downloading artifact pairs', () => {
    const old = {
      name: 'gpu_metrics_old',
      created_at: '2026-09-20T00:00:00Z',
      archive_download_url: 'old',
    };
    const current = {
      name: 'gpu_metrics_new',
      created_at: '2026-09-21T01:00:00Z',
      archive_download_url: 'new',
    };
    const source = { run_attempt: 2, run_started_at: '2026-09-21T00:00:00Z' };
    expect(telemetryArtifactsForAttempt([old, current], source, 2)).toEqual([current]);
    expect(() => telemetryArtifactsForAttempt([old, current], source, 1)).toThrow('mixed-attempt');
    expect(() => telemetryArtifactsForAttempt([current], { run_attempt: 2 }, 2)).toThrow(
      'start time',
    );
  });
});

const run = { runId: 123, runAttempt: 2 };
const artifactName = 'gpu_metrics_shared';

function receiptFixture(): TelemetryReceipt {
  const series = [{ id: 1, artifactName, fileName: 'gpu_metrics.csv', sampleCount: 2 }];
  return {
    version: 1,
    ...run,
    checkedAt: '2026-09-21T00:00:00Z',
    expectedSource: 'benchmark_artifacts',
    plannedPointCount: null,
    counts: {} as TelemetryReceipt['counts'],
    points: [10, 11].map((id) => ({
      key: String(id),
      identity: { conc: id },
      benchmarkResultId: id,
      artifactNames: [artifactName],
      produced: true,
      series,
      storage: { status: 'complete', expectedSeries: series },
      linkedSeriesIds: [1],
      api: { status: 'readable' },
      reasons: [],
      recovery: { ...run, artifactNames: [artifactName] },
    })),
  };
}

describe('telemetry completeness accounting', () => {
  it('counts shared storage once while retaining both independently linked points', () => {
    const { counts } = summarizeTelemetryReceipt(receiptFixture());
    expect(counts).toMatchObject({
      expectedPoints: 2,
      producedPoints: 2,
      producedArtifacts: 1,
      storedPoints: 2,
      linkedPoints: 2,
      storedSeries: 1,
      storedSamples: 2,
      apiCompletePoints: 2,
    });
  });

  it.each([
    { expectedSource: 'unknown' as const },
    {
      expectationErrors: [
        { benchmarkArtifact: 'bmk_missing', artifactNames: [], error: 'unreadable' },
      ],
    },
  ])('keeps an unknown expectation denominator with %j', (unknown) => {
    const result = summarizeTelemetryReceipt({ ...receiptFixture(), ...unknown });
    expect(result.counts).toMatchObject({
      expectedPoints: null,
      storedPoints: 2,
      storedSamples: 2,
    });
  });

  it.each([
    { databaseError: 'database unavailable' },
    { recoveryError: 'corrective ingest failed' },
  ])('does not promote readable old data to complete while %j', (failure) => {
    const result = summarizeTelemetryReceipt({ ...receiptFixture(), ...failure });
    expect(result.counts.apiReadablePoints).toBe(2);
    expect(result.counts.apiCompletePoints).toBe(0);
    expect(result.counts.storedSamples).toBe('databaseError' in failure ? null : 2);
  });

  it('does not count unlinked or failed corrected points as API-complete', () => {
    const receipt = receiptFixture();
    receipt.points[0]!.linkedSeriesIds = [];
    receipt.points[1]!.error = 'correction failed';
    expect(summarizeTelemetryReceipt(receipt).counts).toMatchObject({
      storedPoints: 2,
      linkedPoints: 1,
      apiReadablePoints: 2,
      apiCompletePoints: 0,
    });
  });
});

describe('telemetry API verification', () => {
  it.each([
    ['matching data', 200, 10, 2, 2, true],
    ['missing endpoint', 404, 10, 2, 2, false],
    ['unavailable endpoint', 503, 10, 2, 2, false],
    ['different point', 200, 11, 2, 2, false],
    ['different sample count', 200, 10, 3, 2, false],
    ['truncated data', 200, 10, 2, 1, false],
  ] as const)('%s', async (_name, status, id, sampleCount, dataCount, readable) => {
    const receipt = receiptFixture();
    receipt.points = [receipt.points[0]!];
    receipt.points[0]!.api = { status: 'unknown' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          benchmarkResultId: id,
          series: [
            { id: 1, sampleCount, data: Array.from({ length: dataCount }, () => ({ power: 100 })) },
          ],
        },
        { status },
      ),
    );
    const result = await verifyTelemetryApi(receipt, 'https://example.test', { fetch: fetcher });
    expect(String(fetcher.mock.calls[0]![0])).toBe(
      'https://example.test/api/v1/gpu-metrics-point?id=10',
    );
    expect(result.points[0]!.api.status).toBe(readable ? 'readable' : 'failed');
    expect(result.counts.apiCompletePoints).toBe(readable ? 1 : 0);
    if (!readable) expect(result.points[0]!.api.error).toBeTruthy();
  });

  it('requires the complete stored series set and skips points without database identities', async () => {
    const receipt = receiptFixture();
    receipt.points[1]!.benchmarkResultId = null;
    receipt.points[1]!.api = { status: 'unknown' };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ benchmarkResultId: 10, series: [] }));
    const result = await verifyTelemetryApi(receipt, 'https://example.test', { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.points[0]!.api.error).toContain('series set differs');
    expect(result.points[1]!.api.status).toBe('unknown');
    expect(result.counts.apiCompletePoints).toBe(0);
  });
});

describe('persisted telemetry receipts', () => {
  let db: PGlite;
  let sql: Sql;
  beforeAll(async () => {
    db = await PGlite.create();
    for (const name of ['001_initial_schema.sql', '016_gpu_metrics.sql']) {
      await db.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
    }
    await db.exec(
      "ALTER TABLE benchmark_results ADD COLUMN offload_mode text DEFAULT 'off'; ALTER TABLE benchmark_results ADD COLUMN recipe_fingerprint text",
    );
    sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
      const result = await db.query(query, values);
      return result.rows;
    }) as unknown as Sql;
  }, 20_000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
      INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
      VALUES (1, 123, 2, 'Sweep', '2026-09-21', '2026-09-21');
      INSERT INTO configs (id, model, hardware, framework, precision, spec_method, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
      VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', 1, 1, 1, 1);
      INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
      VALUES (10, 1, 1, 'single_turn', '2026-09-21', 8192, 1024, 1, '{}'),
        (11, 1, 1, 'single_turn', '2026-09-21', 8192, 1024, 2, '{}');
      INSERT INTO gpu_metric_series (id, workflow_run_id, artifact_name, config_key, file_name, vendor, csv_sha256, sample_count, gpu_count, started_at, ended_at)
      VALUES (1, 1, 'gpu_metrics_shared', 'shared', 'gpu_metrics.csv', 'nvidia', 'source', 2, 1, '2026-09-21T00:00:00Z', '2026-09-21T00:00:01Z');
      INSERT INTO gpu_metric_samples (series_id, gpu_index, sampled_at, power_w)
      VALUES (1, 0, '2026-09-21T00:00:00Z', 100), (1, 0, '2026-09-21T00:00:01Z', 200);
      INSERT INTO benchmark_result_gpu_metrics VALUES (10, 1), (11, 1);`);
  });

  async function inventory(value: unknown) {
    await db.query('UPDATE gpu_metric_series SET sidecars = $1::jsonb', [JSON.stringify(value)]);
  }
  const completeInventory = { seriesInventory: [{ fileName: 'gpu_metrics.csv', sampleCount: 2 }] };

  it('reads complete JSONB inventory and preserves unrelated targeted state', async () => {
    await inventory(completeInventory);
    const original = await readTelemetryReceipt(sql, run, []);
    expect(original.counts).toMatchObject({
      expectedPoints: 2,
      storedPoints: 2,
      linkedPoints: 2,
      storedSeries: 1,
      storedSamples: 2,
      apiCompletePoints: 0,
    });
    original.points[1]!.api = { status: 'readable' };
    const first = original.points[0]!;
    const repaired = await readTelemetryReceipt(
      sql,
      run,
      [{ identity: first.identity, artifactNames: [artifactName], produced: true }],
      { previous: original, targeted: true },
    );
    expect(
      repaired.points.find((point) => point.key === stablePowerPointIdentity(first.identity))!.api
        .status,
    ).toBe('unknown');
    expect(repaired.points[1]).toEqual(original.points[1]);
  });

  it('clears only successfully repaired scopes from an earlier recovery failure', async () => {
    await inventory(completeInventory);
    const previous = await readTelemetryReceipt(sql, run, []);
    previous.recoveryError = 'shared failed\nother failed';
    previous.recoveryArtifactNames = [artifactName, 'gpu_metrics_other'];
    const repaired = await readTelemetryReceipt(
      sql,
      run,
      [{ identity: previous.points[0]!.identity, artifactNames: [artifactName], produced: true }],
      { previous, targeted: true },
    );
    expect(repaired.recoveryError).toBe('shared failed\nother failed');
    expect(repaired.recoveryArtifactNames).toEqual(['gpu_metrics_other']);
  });

  it.each([false, true])(
    'clears an unscoped old failure only after successful full-run recovery (targeted=%s)',
    async (targeted) => {
      await inventory(completeInventory);
      const previous = await readTelemetryReceipt(sql, run, []);
      previous.recoveryError = 'earlier run failed';
      const observations = previous.points.map(({ identity, artifactNames }) => ({
        identity,
        artifactNames,
        produced: true,
      }));
      const repaired = await readTelemetryReceipt(sql, run, observations, { previous, targeted });
      expect(repaired.recoveryError).toBe(targeted ? 'earlier run failed' : undefined);
      expect(repaired).not.toHaveProperty('recoveryArtifactNames');
    },
  );

  it('merges current scoped failures in order and summarizes the resulting receipt', async () => {
    await inventory(completeInventory);
    const previous = await readTelemetryReceipt(sql, run, []);
    for (const point of previous.points) point.api = { status: 'readable' };
    previous.recoveryError = 'old\nshared';
    previous.recoveryArtifactNames = ['gpu_metrics_other', artifactName];
    const result = await readTelemetryReceipt(sql, run, [], {
      previous,
      targeted: true,
      recoveryError: 'shared\nnew\nold',
      recoveryArtifactName: 'gpu_metrics_new',
    });
    expect(result.recoveryError).toBe('old\nshared\nnew');
    expect(result.recoveryArtifactNames).toEqual([
      'gpu_metrics_other',
      artifactName,
      'gpu_metrics_new',
    ]);
    expect(result.counts.apiReadablePoints).toBe(2);
    expect(result.counts.apiCompletePoints).toBe(0);
  });

  it('does not count previously readable points as complete after a first recovery failure', async () => {
    await inventory(completeInventory);
    const previous = await readTelemetryReceipt(sql, run, []);
    for (const point of previous.points) point.api = { status: 'readable' };
    const result = await readTelemetryReceipt(sql, run, [], {
      previous,
      targeted: true,
      recoveryError: 'correction failed',
      recoveryArtifactName: artifactName,
    });
    expect(result.recoveryError).toBe('correction failed');
    expect(result.recoveryArtifactNames).toEqual([artifactName]);
    expect(result.counts.apiReadablePoints).toBe(2);
    expect(result.counts.apiCompletePoints).toBe(0);
  });

  it.each([
    ['new run-wide failure', ['gpu_metrics_other'], null],
    ['previous run-wide failure', undefined, artifactName],
  ] as const)('keeps recovery scope unbounded for a %s', async (_name, priorScope, scope) => {
    const previous = await readTelemetryReceipt(sql, run, []);
    previous.recoveryError = 'old';
    if (priorScope) previous.recoveryArtifactNames = [...priorScope];
    const result = await readTelemetryReceipt(sql, run, [], {
      previous,
      targeted: true,
      recoveryError: 'new',
      recoveryArtifactName: scope,
    });
    expect(result.recoveryError).toBe('old\nnew');
    expect(result).not.toHaveProperty('recoveryArtifactNames');
  });

  it('replaces expectation errors only for benchmark artifacts checked by this recovery', async () => {
    const previous = await readTelemetryReceipt(sql, run, []);
    const oldA = { benchmarkArtifact: 'bmk_a', artifactNames: ['gpu_metrics_a'], error: 'old a' };
    const oldB = { benchmarkArtifact: 'bmk_b', artifactNames: ['gpu_metrics_b'], error: 'old b' };
    const newA = { ...oldA, error: 'new a' };
    const newC = { benchmarkArtifact: 'bmk_c', artifactNames: ['gpu_metrics_c'], error: 'new c' };
    previous.expectationErrors = [oldA, oldB];
    const result = await readTelemetryReceipt(sql, run, [], {
      previous,
      targeted: true,
      expectationErrors: [newA, newC],
    });
    expect(result.expectationErrors).toEqual([oldB, newA, newC]);
    expect(result.counts.expectedPoints).toBeNull();
  });

  it.each([undefined, []])(
    'preserves the distinction between omitted and empty current expectation errors (%j)',
    async (expectationErrors) => {
      const result = await readTelemetryReceipt(sql, run, [], { expectationErrors });
      expect(Object.hasOwn(result, 'expectationErrors')).toBe(expectationErrors !== undefined);
      expect(result.expectationErrors).toEqual(expectationErrors);
      expect(result.counts.expectedPoints).toBe(2);
    },
  );

  it('keeps missing inventory unknown and missing host storage incomplete', async () => {
    await inventory('{invalid json');
    const unknown = await readTelemetryReceipt(sql, run, []);
    expect(unknown.databaseError).toBeUndefined();
    expect(unknown.counts).toMatchObject({
      storedPoints: 0,
      storageUnknownPoints: 2,
      storedSamples: 2,
    });
    await inventory({
      seriesInventory: [
        ...completeInventory.seriesInventory,
        { fileName: 'host-b/gpu_metrics.csv', sampleCount: 2 },
      ],
    });
    const incomplete = await readTelemetryReceipt(sql, run, []);
    expect(incomplete.points[0]!.storage.status).toBe('incomplete');
    expect(incomplete.points[0]!.reasons).toContain('series_coverage_incomplete');
    expect(incomplete.counts.storedPoints).toBe(0);
  });

  it('reports failed SQL as unknown storage rather than a successful empty receipt', async () => {
    await db.exec('ALTER TABLE gpu_metric_series RENAME TO unavailable_gpu_metric_series');
    try {
      const result = await readTelemetryReceipt(sql, run, []);
      expect(result.databaseError).toContain('gpu_metric_series');
      expect(result.counts).toMatchObject({
        expectedPoints: null,
        storedPoints: null,
        linkedPoints: null,
        storedSeries: null,
        storedSamples: null,
        apiCompletePoints: 0,
      });
    } finally {
      await db.exec('ALTER TABLE unavailable_gpu_metric_series RENAME TO gpu_metric_series');
    }
  });
});
