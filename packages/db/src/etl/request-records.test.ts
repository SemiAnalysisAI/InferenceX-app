import fs from 'node:fs';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateSlaAttempts,
  observeSlaPoint,
  reconcileSlaAccounting,
  SLA_NOT_RECORDED,
  SLA_TPOT_NOT_APPLICABLE,
  type SlaLatencyTargets,
} from '@semianalysisai/inferencex-constants';

import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { bulkIngestBenchmarkRows, type BenchmarkPersistenceInput } from './benchmark-ingest';
import { mapBenchmarkRow } from './benchmark-mapper';
import { ingestAndLogRequestRecords, ingestRequestRecords } from './request-records-ingest';
import { createSkipTracker } from './skip-tracker';
import {
  decodeSlaAttempts,
  slaAttemptsFromRequestRecords,
  slaAttemptsSha256,
  type SlaAttemptsBlob,
} from './sla-attempts';

/**
 * SYNTHETIC test data, not a benchmark result: the fixed-sequence client and
 * its result processor run against a local fake server (no model, no GPU),
 * with one HTTP 503, one stream cut after two tokens, one in-stream error
 * event and one single-token response injected on purpose.
 */
const SAMPLE_ROW = JSON.parse(
  fs.readFileSync(
    new URL('fixtures/fixed-seq-request-records/agg_synthetic_point.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown> & { request_records: Block };

interface Block {
  schema_version: number;
  counts: Record<string, unknown>;
  window: Record<string, unknown>;
  load: Record<string, unknown>;
  outcomes: string[];
  columns?: Record<string, unknown[]>;
  columns_omitted?: Record<string, unknown>;
}

function block(change: (draft: Block) => void = () => {}): Block {
  const draft = structuredClone(SAMPLE_ROW.request_records);
  change(draft);
  return draft;
}

function attempts(input: unknown): SlaAttemptsBlob {
  const result = slaAttemptsFromRequestRecords(input);
  if (result.kind !== 'attempts') throw new Error(`unavailable: ${result.reason}`);
  return result.blob;
}

const TARGETS: SlaLatencyTargets = { maxTtftMs: 200, maxTpotMs: 30, maxE2eS: null };

describe('slaAttemptsFromRequestRecords', () => {
  it('reads outcomes from the outcome column and reconciles every dispatched attempt', () => {
    const blob = attempts(block());
    expect(blob.source).toMatchObject({ kind: 'request_records', harnessLog: 'not_applicable' });
    expect(blob.set.completed.ttftUs).toHaveLength(5);
    expect(blob.set.other).toEqual([
      { outcome: 'failed', failureClass: 'connection', count: 1 },
      { outcome: 'failed', failureClass: 'http_503', count: 1 },
      { outcome: 'failed', failureClass: 'stream_error', count: 1 },
    ]);

    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    expect(accounting).toMatchObject({
      issued: 8,
      dispatched: 8,
      attempted: 8,
      completed: 5,
      failed: 3,
      incomplete: 0,
      unknown: 0,
      skippedBeforeDispatch: 0,
      warmupExcluded: 4,
      retryAccounting: 'no_client_retries',
      completeness: 'complete',
      reason: 'reconciled',
    });
  });

  it('keeps a stream that produced tokens and then failed as a failure', () => {
    // Attempts 4 and 5 of the sample carry a TTFT of about 123 ms and a failed outcome.
    const sample = block();
    expect(sample.columns!.ttft_ms[4]).toBe(123.169);
    expect(sample.outcomes[sample.columns!.outcome[4] as number]).toBe('connection');
    const blob = attempts(sample);
    expect(blob.set.completed.ttftUs).not.toContain(123_169);
    const counts = evaluateSlaAttempts(
      blob.set,
      reconcileSlaAccounting(blob.set, blob.accounting),
      { maxTtftMs: 60_000, maxTpotMs: 60_000, maxE2eS: null },
    );
    expect(counts).toMatchObject({ passing: 5, notPassing: 3, indeterminate: 0 });
  });

  it('evaluates joint attainment and goodput over the client window', () => {
    const blob = attempts(block());
    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    expect(accounting.window).toMatchObject({
      durationSource: 'client_reported',
      durationS: 0.8801854829998774,
      configuredWindowS: null,
      cutoffReached: false,
    });
    const counts = evaluateSlaAttempts(blob.set, accounting, TARGETS);
    const observed = observeSlaPoint(accounting, counts);
    expect(counts.passing).toBe(5);
    expect(observed.attainment).toBe(5 / 8);
    expect(observed.goodputRps).toBeCloseTo(5 / 0.8801854829998774, 9);
  });

  it('treats a completed one-token attempt as having no TPOT rather than a missing one', () => {
    const blob = attempts(block());
    expect(blob.set.completed.tpotUs.filter((value) => value === SLA_TPOT_NOT_APPLICABLE)).toEqual([
      SLA_TPOT_NOT_APPLICABLE,
    ]);
    const counts = evaluateSlaAttempts(
      blob.set,
      reconcileSlaAccounting(blob.set, blob.accounting),
      TARGETS,
    );
    expect(counts.missingTelemetry).toBe(0);
  });

  it('counts a completed attempt without a TTFT as missing telemetry, not as a failure', () => {
    const blob = attempts(
      block((draft) => {
        draft.columns!.ttft_ms[0] = null;
      }),
    );
    expect(blob.set.completed.ttftUs).toContain(SLA_NOT_RECORDED);
    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    const counts = evaluateSlaAttempts(blob.set, accounting, TARGETS);
    expect(accounting.failed).toBe(3);
    expect(counts).toMatchObject({ passing: 4, missingTelemetry: 1 });
  });

  it('includes a latency exactly on the threshold and excludes one microsecond above it', () => {
    const blob = attempts(block());
    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    // The slowest completed TTFT of the sample is 125.423 ms.
    const at = evaluateSlaAttempts(blob.set, accounting, { ...TARGETS, maxTtftMs: 125.423 });
    const below = evaluateSlaAttempts(blob.set, accounting, { ...TARGETS, maxTtftMs: 125.422 });
    expect(at.withinTtft).toBe(5);
    expect(below.withinTtft).toBe(4);
  });

  it('treats an outcome it does not know, or an index outside the list, as a failure', () => {
    const blob = attempts(
      block((draft) => {
        draft.outcomes.push('rate_limited');
        draft.columns!.outcome[0] = 7;
        draft.columns!.outcome[1] = 42;
        draft.counts.completed = 3;
      }),
    );
    expect(blob.set.completed.ttftUs).toHaveLength(3);
    expect(blob.set.other).toContainEqual({
      outcome: 'failed',
      failureClass: 'rate_limited',
      count: 1,
    });
    expect(blob.set.other).toContainEqual({
      outcome: 'failed',
      failureClass: 'unclassified',
      count: 1,
    });
  });

  it('keeps one http_status class when the per-code totals do not cover the failures', () => {
    const blob = attempts(
      block((draft) => {
        draft.counts.http_status = {};
      }),
    );
    expect(blob.set.other).toContainEqual({
      outcome: 'failed',
      failureClass: 'http_status',
      count: 1,
    });
  });

  it('tracks prompts that were requested and never dispatched apart from attempts', () => {
    const blob = attempts(
      block((draft) => {
        draft.counts.requested = 10;
      }),
    );
    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    expect(accounting).toMatchObject({
      issued: 10,
      skippedBeforeDispatch: 2,
      dispatched: 8,
      attempted: 8,
      reason: 'reconciled',
    });
  });

  it('does not claim a retry policy the block does not state', () => {
    const blob = attempts(
      block((draft) => {
        draft.counts.retries = 2;
      }),
    );
    expect(blob.accounting.retryAccounting).toBe('unknown');
  });

  it('labels the load as a request-concurrency limit', () => {
    const result = slaAttemptsFromRequestRecords(block());
    expect(result).toMatchObject({
      kind: 'attempts',
      loadKind: 'request_concurrency',
      concurrencyLimit: 2,
    });
  });

  it('returns an explicit reason when the columns were omitted for size', () => {
    const result = slaAttemptsFromRequestRecords(
      block((draft) => {
        delete draft.columns;
        draft.columns_omitted = {
          reason: 'attempts_exceed_aggregate_limit',
          attempts: 250_000,
          limit: 200_000,
        };
        draft.counts.requested = 250_000;
        draft.counts.dispatched = 250_000;
      }),
    );
    expect(result).toEqual({
      kind: 'unavailable',
      reason: 'columns_omitted',
      detail: 'attempts_exceed_aggregate_limit: 250000 attempts, limit 200000',
    });
  });

  const UNTRUSTED: [string, (draft: Block) => void][] = [
    [
      'unsupported_schema_version',
      (draft) => {
        draft.schema_version = 2;
      },
    ],
    [
      'unsupported_load_kind',
      (draft) => {
        draft.load.max_concurrency_kind = 'users';
      },
    ],
    [
      'malformed_block',
      (draft) => {
        draft.columns!.tpot_ms.pop();
      },
    ],
    [
      'malformed_block',
      (draft) => {
        draft.counts.completed = 6;
      },
    ],
    [
      'malformed_block',
      (draft) => {
        draft.counts.dispatched = 9;
      },
    ],
    [
      'malformed_block',
      (draft) => {
        delete draft.columns;
      },
    ],
  ];

  it.each(UNTRUSTED)('refuses a block it cannot trust: %s', (reason, change) => {
    expect(slaAttemptsFromRequestRecords(block(change))).toMatchObject({
      kind: 'unavailable',
      reason,
    });
  });

  it('refuses a value that is not a block', () => {
    expect(slaAttemptsFromRequestRecords([])).toMatchObject({ reason: 'malformed_block' });
    expect(slaAttemptsFromRequestRecords(null)).toMatchObject({ reason: 'malformed_block' });
  });
});

describe('mapBenchmarkRow with request_records', () => {
  const row = {
    ...SAMPLE_ROW,
    hw: 'h100',
    model: 'deepseek-ai/DeepSeek-R1-0528',
    infmax_model_prefix: 'dsr1',
    benchmark_outcome: { ...(SAMPLE_ROW.benchmark_outcome as object), status: 'passed' },
  };

  it('carries the block and keeps it and its repeated totals out of the metrics', () => {
    const tracker = createSkipTracker();
    const mapped = mapBenchmarkRow(row, tracker);
    expect(mapped?.benchmarkType).toBe('single_turn');
    expect(mapped?.requestRecords).toEqual(SAMPLE_ROW.request_records);
    for (const key of ['request_records', 'duration', 'completed', 'request_throughput']) {
      expect(mapped?.metrics).not.toHaveProperty(key);
      expect(tracker.unexpectedMetrics.has(key)).toBe(false);
    }
    expect(mapped?.metrics.median_ttft).toBe(SAMPLE_ROW.median_ttft);
  });

  it('carries nothing for a row written before the block existed', () => {
    const { request_records: _block, ...legacy } = row;
    expect(mapBenchmarkRow(legacy, createSkipTracker())).not.toHaveProperty('requestRecords');
  });

  it('skips a point the benchmark marked failed, as before', () => {
    const tracker = createSkipTracker();
    expect(
      mapBenchmarkRow({ ...row, benchmark_outcome: SAMPLE_ROW.benchmark_outcome }, tracker),
    ).toBeNull();
    expect(tracker.skips.failedRun).toBe(1);
  });
});

function point(
  conc: number,
  requestRecords?: unknown,
): BenchmarkPersistenceInput & { requestRecords?: unknown } {
  return {
    configId: 1,
    benchmarkType: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc,
    offloadMode: 'off',
    image: 'img',
    recipeFingerprint: null,
    metrics: {},
    ...(requestRecords === undefined ? {} : { requestRecords }),
  };
}

describe('ingestRequestRecords', () => {
  let db: PGlite;
  let sql: PgliteSql;

  beforeAll(async () => {
    db = await migratedPglite();
    sql = pgliteSql(db);
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
      INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
      VALUES (1, 34557177019, 1, 'Run Sweep', '2026-09-11T04:00:00Z', '2026-09-11');
      INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
        is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
      VALUES (1, 'dsr1', 'h100', 'sglang', 'fp8', 'none', false, false, 8, 8, 8, 8);`);
  });

  interface Stored {
    conc: number;
    gz: Uint8Array | null;
    sha: string | null;
    load_kind: string | null;
    concurrency_limit: number | null;
    unavailable_reason: string | null;
  }

  async function stored(): Promise<Stored[]> {
    const result = await db.query<Stored>(
      `SELECT br.conc, a.sla_attempts_gz AS gz, encode(a.sla_attempts_sha256, 'hex') AS sha,
         a.load_kind, a.concurrency_limit, a.unavailable_reason
       FROM benchmark_sla_attempts a JOIN benchmark_results br ON br.id = a.benchmark_result_id
       ORDER BY br.conc`,
    );
    return result.rows;
  }

  it('stores the attempt data of the points that carry a block, and nothing for the rest', async () => {
    const omitted = block((draft) => {
      delete draft.columns;
      draft.columns_omitted = { reason: 'attempts_exceed_aggregate_limit', attempts: 8, limit: 4 };
    });
    const rows = [point(2, block()), point(4), point(8, omitted)];
    await bulkIngestBenchmarkRows(sql, rows, 1, '2026-09-11');
    const result = await ingestRequestRecords(sql, rows, 1);
    expect(result).toEqual({ stored: 1, unavailable: { columns_omitted: 1 }, tableAbsent: false });

    const [measured, unavailable, ...rest] = await stored();
    expect(rest).toEqual([]);
    expect(measured).toMatchObject({
      conc: 2,
      load_kind: 'request_concurrency',
      concurrency_limit: 2,
      unavailable_reason: null,
    });
    expect(measured.sha).toBe(slaAttemptsSha256(measured.gz!));
    expect(decodeSlaAttempts(measured.gz!)).toEqual(attempts(block()));
    expect(unavailable).toMatchObject({
      conc: 8,
      gz: null,
      sha: null,
      unavailable_reason: 'columns_omitted',
    });
  });

  it('replaces what a point stored when the same run is ingested again', async () => {
    const rows = [point(2, block())];
    await bulkIngestBenchmarkRows(sql, rows, 1, '2026-09-11');
    await ingestRequestRecords(sql, rows, 1);
    const [first] = await stored();

    const changed = [
      point(
        2,
        block((draft) => {
          draft.columns!.ttft_ms[0] = 999;
        }),
      ),
    ];
    await bulkIngestBenchmarkRows(sql, changed, 1, '2026-09-11');
    await ingestRequestRecords(sql, changed, 1);
    const after = await stored();
    expect(after).toHaveLength(1);
    expect(after[0].sha).not.toBe(first.sha);
  });

  it('reports a storage failure without failing the benchmark ingest', async () => {
    const failing = (() => {
      throw new Error('connection lost');
    }) as unknown as PgliteSql;
    const warnings: unknown[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation((line) => warnings.push(line));
    try {
      await expect(
        ingestAndLogRequestRecords(failing, [point(2, block())], 1, ''),
      ).resolves.toBeUndefined();
    } finally {
      warn.mockRestore();
    }
    expect(warnings).toEqual(['[WARN] request records not stored: connection lost']);
  });

  it('writes nothing and reports it when migration 031 is not applied', async () => {
    const rows = [point(2, block())];
    await bulkIngestBenchmarkRows(sql, rows, 1, '2026-09-11');
    await db.exec('ALTER TABLE benchmark_sla_attempts RENAME TO benchmark_sla_attempts_parked');
    try {
      expect(await ingestRequestRecords(sql, rows, 1)).toEqual({
        stored: 0,
        unavailable: {},
        tableAbsent: true,
      });
    } finally {
      await db.exec('ALTER TABLE benchmark_sla_attempts_parked RENAME TO benchmark_sla_attempts');
    }
  });
});
