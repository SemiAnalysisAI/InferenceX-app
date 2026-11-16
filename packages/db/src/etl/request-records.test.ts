import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateSlaAttempts,
  observeSlaPoint,
  reconcileSlaAccounting,
  SLA_ACCOUNTING_POLICY,
  SLA_NOT_RECORDED,
  SLA_TPOT_NOT_APPLICABLE,
  type SlaLatencyTargets,
} from '@semianalysisai/inferencex-constants';

import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import {
  GOLDEN_SYNTHETIC_POINT_DIR,
  readSyntheticManifest,
  readSyntheticRow,
} from '../lib/test-synthetic-point';
import { bulkIngestBenchmarkRows, type BenchmarkPersistenceInput } from './benchmark-ingest';
import { mapBenchmarkRow } from './benchmark-mapper';
import { ingestAndLogRequestRecords, ingestRequestRecords } from './request-records-ingest';
import { createSkipTracker } from './skip-tracker';
import {
  decodeSlaAttempts,
  encodeSlaAttempts,
  slaAttemptsFromRequestRecords,
  slaAttemptsSha256,
  type SlaAttemptsBlob,
} from './sla-attempts';

/**
 * SYNTHETIC test data, not a benchmark result: the committed output of the
 * benchmark repository's `synthetic_point.py`, where the real fixed-sequence
 * client measured a scripted local server (no model, no GPU). The point used
 * here has 100 attempts: 94 complete replies, one single-token reply among
 * them, one reply that ended without completion evidence, and five failures
 * (HTTP 503, HTTP 429, an error event after two tokens, an empty response, a
 * connection closed after two tokens).
 */
const MANIFEST = readSyntheticManifest(GOLDEN_SYNTHETIC_POINT_DIR);
const POINT = MANIFEST.points.find((entry) => entry.conc === 1)!;
const SAMPLE_ROW = readSyntheticRow(GOLDEN_SYNTHETIC_POINT_DIR, POINT.uploaded_as_bmk!) as Record<
  string,
  unknown
> & { request_records: Block };

interface Block {
  schema_version: number;
  counts: Record<string, unknown>;
  accounting?: { complete: boolean; reasons: string[] };
  window: Record<string, unknown>;
  load: Record<string, unknown>;
  outcomes: string[];
  completion_evidence_bits?: Record<string, number>;
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

/** Index of the first scripted attempt of a kind. */
function scripted(match: (attempt: (typeof POINT.expected.attempts)[number]) => boolean): number {
  const index = POINT.expected.attempts.findIndex(match);
  if (index === -1) throw new Error('the synthetic point has no such attempt');
  return index;
}

// Fast replies are scripted at 30 ms to the first token and 10 ms per token.
const TARGETS: SlaLatencyTargets = { maxTtftMs: 140, maxTpotMs: 30, maxE2eS: null };

describe('slaAttemptsFromRequestRecords', () => {
  it('reads outcomes from the outcome column and reconciles every dispatched attempt', () => {
    const blob = attempts(block());
    expect(blob.source).toMatchObject({ kind: 'request_records', harnessLog: 'not_applicable' });
    expect(blob.set.completed.ttftUs).toHaveLength(94);
    expect(blob.set.unconfirmed?.ttftUs).toHaveLength(1);
    expect(blob.set.other).toEqual([
      { outcome: 'failed', failureClass: 'connection', count: 1 },
      { outcome: 'failed', failureClass: 'empty_response', count: 1 },
      { outcome: 'failed', failureClass: 'http_429', count: 1 },
      { outcome: 'failed', failureClass: 'http_503', count: 1 },
      { outcome: 'failed', failureClass: 'stream_error', count: 1 },
    ]);

    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    expect(accounting).toMatchObject({
      issued: 100,
      dispatched: 100,
      attempted: 100,
      completed: 94,
      failed: 5,
      incomplete: 0,
      unknown: 0,
      skippedBeforeDispatch: 0,
      warmupExcluded: 2,
      unconfirmedCompletions: 1,
      retryAccounting: 'no_client_retries',
      completeness: 'complete',
      reason: 'reconciled',
    });
    // Missing completion evidence is its own count, not a recorded service failure.
    expect(accounting.failureClasses).toEqual({
      connection: 1,
      empty_response: 1,
      http_429: 1,
      http_503: 1,
      stream_error: 1,
    });
  });

  it('keeps what the block states about itself, as written', () => {
    expect(attempts(block()).source.requestRecords).toEqual({
      schemaVersion: 1,
      durationSource: 'client_perf_counter_first_dispatch_to_last_return',
      accounting: { stated: true, complete: true, reasons: [] },
      counts: {
        requested: 100,
        dispatched: 100,
        completed: 95,
        failed: 5,
        failedByClass: {
          http_status: 2,
          timeout: 0,
          connection: 1,
          stream_error: 1,
          empty_response: 1,
          other: 0,
        },
        httpStatus: { '429': 1, '503': 1 },
      },
      withoutCompletionEvidence: 1,
      finishedWithoutEndMarker: 0,
    });
  });

  it('keeps a stream that produced tokens and then failed as a failure', () => {
    const sample = block();
    for (const kind of ['stream_error', 'connection']) {
      const index = scripted((attempt) => attempt.outcome === kind);
      // The client recorded the first token it saw before the failure.
      expect(sample.columns!.ttft_ms[index]).toBeGreaterThan(0);
      expect(sample.outcomes[sample.columns!.outcome[index] as number]).toBe(kind);
    }
    const blob = attempts(sample);
    const counts = evaluateSlaAttempts(
      blob.set,
      reconcileSlaAccounting(blob.set, blob.accounting),
      { maxTtftMs: 3_600_000, maxTpotMs: 3_600_000, maxE2eS: null },
    );
    expect(counts).toMatchObject({ passing: 94, notPassing: 6, indeterminate: 0, withinTtft: 94 });
  });

  it('does not take a first token as proof that a response completed', () => {
    const index = scripted(
      (attempt) => attempt.outcome === 'completed' && attempt.completion_evidence === 0,
    );
    const sample = block();
    // The client calls it completed: it streamed three tokens and the stream just ended.
    expect(sample.outcomes[sample.columns!.outcome[index] as number]).toBe('completed');
    expect(sample.columns!.ttft_ms[index]).toBeGreaterThan(0);
    const blob = attempts(sample);
    expect(blob.set.unconfirmed?.ttftUs).toEqual([
      Math.round((sample.columns!.ttft_ms[index] as number) * 1000),
    ]);

    const required = reconcileSlaAccounting(blob.set, blob.accounting);
    expect(evaluateSlaAttempts(blob.set, required, TARGETS).passing).toBe(94);
    // The other policy takes the client's word, and says so in its key.
    const lenient = reconcileSlaAccounting(blob.set, blob.accounting, {
      ...SLA_ACCOUNTING_POLICY,
      completionEvidence: 'not_required',
    });
    expect(lenient).toMatchObject({ completed: 95, failed: 5, unconfirmedCompletions: 1 });
    expect(evaluateSlaAttempts(blob.set, lenient, TARGETS).passing).toBe(95);
  });

  it('holds back only an attempt with no completion evidence at all', () => {
    const index = scripted((attempt) => attempt.completion_evidence === 7);
    for (const [bits, confirmed, withoutMarker] of [
      [7, true, 0],
      [1, true, 0],
      // A finish reason without the end-of-stream marker: completed, and counted.
      [2, true, 1],
      [6, true, 1],
      [4, true, 0],
      [0, false, 0],
    ] as const) {
      const blob = attempts(
        block((draft) => {
          draft.columns!.completion_evidence[index] = bits;
        }),
      );
      expect(blob.set.completed.ttftUs.length, `evidence ${bits}`).toBe(confirmed ? 94 : 93);
      expect(blob.set.unconfirmed?.ttftUs.length, `evidence ${bits}`).toBe(confirmed ? 1 : 2);
      expect(blob.source.requestRecords?.finishedWithoutEndMarker, `evidence ${bits}`).toBe(
        withoutMarker,
      );
    }
  });

  it('evaluates joint attainment and goodput over the client window', () => {
    const blob = attempts(block());
    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    const duration = SAMPLE_ROW.request_records.window.duration as number;
    expect(accounting.window).toMatchObject({
      durationSource: 'client_reported',
      durationS: duration,
      configuredWindowS: null,
      cutoffReached: false,
    });
    const counts = evaluateSlaAttempts(blob.set, accounting, TARGETS);
    const observed = observeSlaPoint(accounting, counts);
    expect(counts.passing).toBe(94);
    expect(observed.attainment).toBe(0.94);
    expect(observed.goodputRps).toBeCloseTo(94 / duration, 9);
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
    expect(accounting.failed).toBe(5);
    expect(counts).toMatchObject({ passing: 93, missingTelemetry: 1 });
  });

  it('includes a latency exactly on the threshold and excludes one microsecond below it', () => {
    const blob = attempts(block());
    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    const slowestUs = blob.set.completed.ttftUs.at(-1)!;
    const within = (maxTtftMs: number) =>
      evaluateSlaAttempts(blob.set, accounting, { ...TARGETS, maxTtftMs }).withinTtft;
    expect(within(slowestUs / 1000)).toBe(94);
    expect(within((slowestUs - 1) / 1000)).toBeLessThan(94);
  });

  it('treats an outcome it does not know, or an index outside the list, as a failure', () => {
    const blob = attempts(
      block((draft) => {
        draft.outcomes.push('rate_limited');
        draft.columns!.outcome[0] = 7;
        draft.columns!.outcome[1] = 42;
        draft.counts.completed = 93;
        draft.counts.failed = 7;
      }),
    );
    expect(blob.set.completed.ttftUs).toHaveLength(92);
    // The block's per-class totals know neither name, so it no longer accounts for itself.
    expect(blob.source.requestRecords?.accounting).toMatchObject({
      complete: false,
      reasons: ['failure_class_count_mismatch'],
    });
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
      count: 2,
    });
    expect(blob.source.requestRecords?.accounting.reasons).toEqual(['http_status_count_mismatch']);
  });

  it('checks the completeness statement against the counts instead of trusting the flag', () => {
    const cases: [(draft: Block) => void, string][] = [
      [
        (draft) => {
          draft.counts.requested = 110;
        },
        'requested_not_dispatched',
      ],
      [
        (draft) => {
          (draft.counts.failed_by_class as Record<string, number>).connection = 2;
        },
        'failure_class_count_mismatch',
      ],
      [
        (draft) => {
          draft.accounting = { complete: false, reasons: [] };
        },
        'no_reason_stated',
      ],
    ];
    for (const [change, reason] of cases) {
      const sample = block(change);
      // Each of these blocks still claims, or is left claiming, to be complete or reasonless.
      const blob = attempts(sample);
      expect(blob.source.requestRecords?.accounting, reason).toMatchObject({
        complete: false,
        reasons: [reason],
      });
      expect(reconcileSlaAccounting(blob.set, blob.accounting).reason).toBe(
        'measurement_incomplete',
      );
    }
  });

  it('never calls a block complete that says it is not, though its counts add up', () => {
    const blob = attempts(
      block((draft) => {
        draft.accounting = { complete: false, reasons: ['requested_not_dispatched'] };
      }),
    );
    expect(blob.accounting.measurementIncomplete).toBe(true);
    expect(blob.source.abortReason).toBe('accounting incomplete: requested_not_dispatched');
    expect(reconcileSlaAccounting(blob.set, blob.accounting)).toMatchObject({
      attempted: 100,
      unknown: 0,
      completeness: 'partial',
      reason: 'measurement_incomplete',
      populationEstablished: false,
    });
  });

  it('treats a block that says nothing about its completeness as incomplete', () => {
    const blob = attempts(
      block((draft) => {
        delete draft.accounting;
      }),
    );
    expect(blob.source.requestRecords?.accounting).toEqual({
      stated: false,
      complete: false,
      reasons: ['accounting_not_stated'],
    });
    expect(reconcileSlaAccounting(blob.set, blob.accounting).reason).toBe('measurement_incomplete');
  });

  it('does not let reasons hide behind a complete flag', () => {
    const blob = attempts(
      block((draft) => {
        draft.accounting = { complete: true, reasons: ['outcome_count_mismatch'] };
      }),
    );
    expect(blob.accounting.measurementIncomplete).toBe(true);
  });

  it('tracks prompts that were requested and never dispatched apart from attempts', () => {
    const blob = attempts(
      block((draft) => {
        draft.counts.requested = 110;
      }),
    );
    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    // Counted apart, and the measurement is not complete: ten prompts never ran.
    expect(accounting).toMatchObject({
      issued: 110,
      skippedBeforeDispatch: 10,
      dispatched: 100,
      attempted: 100,
      reason: 'measurement_incomplete',
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
      concurrencyLimit: 1,
    });
  });

  it('survives encoding with its unconfirmed completions and its statement', () => {
    const blob = attempts(block());
    const encoded = encodeSlaAttempts(blob);
    expect(decodeSlaAttempts(encoded)).toEqual(blob);
    expect(encodeSlaAttempts(decodeSlaAttempts(encoded)).equals(encoded)).toBe(true);
  });

  it('returns an explicit reason when the columns were omitted for size', () => {
    const omitted = MANIFEST.points.find((entry) => entry.expected.columns_omitted)!;
    const row = readSyntheticRow(GOLDEN_SYNTHETIC_POINT_DIR, omitted.uploaded_as_bmk!);
    expect(slaAttemptsFromRequestRecords(row.request_records)).toEqual({
      kind: 'unavailable',
      reason: 'columns_omitted',
      detail: `attempts_exceed_aggregate_limit: ${omitted.num_prompts} attempts, limit ${omitted.aggregate_attempt_limit}`,
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
        draft.counts.completed = 96;
      },
    ],
    [
      'malformed_block',
      (draft) => {
        draft.counts.failed = 4;
      },
    ],
    [
      'malformed_block',
      (draft) => {
        draft.counts.dispatched = 99;
      },
    ],
    [
      'malformed_block',
      (draft) => {
        delete draft.columns!.completion_evidence;
      },
    ],
    [
      'malformed_block',
      (draft) => {
        delete draft.completion_evidence_bits;
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
  it('carries the block and keeps it and its repeated totals out of the metrics', () => {
    const tracker = createSkipTracker();
    const mapped = mapBenchmarkRow(SAMPLE_ROW, tracker);
    expect(mapped?.benchmarkType).toBe('single_turn');
    expect(mapped?.requestRecords).toEqual(SAMPLE_ROW.request_records);
    for (const key of ['request_records', 'duration', 'completed', 'request_throughput']) {
      expect(mapped?.metrics).not.toHaveProperty(key);
      expect(tracker.unexpectedMetrics.has(key)).toBe(false);
    }
    expect(mapped?.metrics.median_ttft).toBe(SAMPLE_ROW.median_ttft);
  });

  it('carries nothing for a row written before the block existed', () => {
    const { request_records: _block, ...legacy } = SAMPLE_ROW;
    expect(mapBenchmarkRow(legacy, createSkipTracker())).not.toHaveProperty('requestRecords');
  });

  it('skips a point the benchmark marked failed, as before', () => {
    const failed = MANIFEST.points.find((entry) => entry.expected.gate_status === 'failed')!;
    const tracker = createSkipTracker();
    expect(
      mapBenchmarkRow(readSyntheticRow(GOLDEN_SYNTHETIC_POINT_DIR, failed.aggregate), tracker),
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
      concurrency_limit: 1,
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
