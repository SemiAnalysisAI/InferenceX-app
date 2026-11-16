import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { REQUEST_TIMELINE_VERSION } from '../etl/compute-request-timeline';
import { encodeRequestChartColumns } from '../etl/request-chart-columns';
import {
  SLA_ATTEMPTS_VERSION,
  encodeSlaAttempts,
  slaAttemptsFromExport,
  slaAttemptsSha256,
} from '../etl/sla-attempts';
import { REQUEST_CHART_DATA_VERSION } from './request-chart-data';
import {
  getRequestRecordsPresence,
  getSlaAttempts,
  getSlaAttemptsSources,
  getSlaRunProvenance,
} from './sla-targets';

let db: PGlite;
let sql: PgliteSql;
let storedSha: string;

function exportLine(sessionNum: number, ttftMs: number | null, error: unknown = null): string {
  return JSON.stringify({
    metadata: {
      session_num: sessionNum,
      benchmark_phase: 'profiling',
      request_start_ns: 1_000_000_000 * (sessionNum + 1),
      request_end_ns: 1_000_000_000 * (sessionNum + 3),
    },
    metrics:
      ttftMs === null
        ? {}
        : {
            time_to_first_token: { value: ttftMs, unit: 'ms' },
            inter_token_latency: { value: 20, unit: 'ms' },
            request_latency: { value: 2000, unit: 'ms' },
            output_sequence_length: { value: 90, unit: 'tokens' },
          },
    error,
  });
}

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
  await db.exec(`
    INSERT INTO workflow_runs
      (id, github_run_id, run_attempt, name, status, conclusion, head_sha, created_at, date)
    VALUES
      (1, 36463674051, 1, 'Run Sweep', 'completed', 'success', '1111111aaaa', '2026-09-29T04:19:00Z', '2026-09-29'),
      (2, 36463674051, 2, 'Run Sweep', 'completed', 'success', '2222222bbbb', '2026-09-29T09:00:00Z', '2026-09-29'),
      (3, 32168174681, 1, 'Run Sweep', 'completed', 'success', null, '2026-08-19T04:19:00Z', '2026-08-19');
    INSERT INTO run_datasets (workflow_run_id, dataset_slug)
    VALUES (2, 'cc-traces-weka-062126');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsv4', 'b300', 'sglang', 'fp4', 'mtp', false, false, 8, 8, 8, 8);
    INSERT INTO benchmark_results
      (id, workflow_run_id, config_id, benchmark_type, date, conc, metrics)
    VALUES
      (443435, 2, 1, 'agentic_traces', '2026-09-29', 16, '{}'),
      (443444, 2, 1, 'agentic_traces', '2026-09-29', 32, '{}'),
      (443441, 2, 1, 'agentic_traces', '2026-09-29', 48, '{}'),
      (443440, 2, 1, 'agentic_traces', '2026-09-29', 64, '{}');
  `);

  const attemptsGz = encodeSlaAttempts(
    await slaAttemptsFromExport([
      exportLine(0, 900),
      exportLine(1, 300),
      exportLine(2, null, { code: 503, type: 'Service Unavailable' }),
    ]),
  );
  storedSha = slaAttemptsSha256(attemptsGz);
  const chartGz = encodeRequestChartColumns({
    version: REQUEST_CHART_DATA_VERSION,
    timelineVersion: REQUEST_TIMELINE_VERSION,
    startNs: 0,
    endNs: 9_000_000_000,
    durationS: 9,
    cids: ['trace-a'],
    phases: ['warmup', 'profiling'],
    requests: [
      [0, 0, 0, 500_000, 40, 10, 100, 1, 0],
      [0, 1, 1_000_000, 3_000_000, 250, 20, 100, 90, 0],
      [0, 1, 2_000_000, 2_500_000, null, null, 100, null, 0],
    ],
  });
  await db.query(
    `INSERT INTO agentic_trace_replay
       (id, sla_attempts_gz, sla_attempts_version, sla_attempts_sha256)
     VALUES (1, $1, $2, decode($3, 'hex'))`,
    [attemptsGz, SLA_ATTEMPTS_VERSION, storedSha],
  );
  for (const [id, staleBlob] of [
    [2, null],
    [3, attemptsGz],
  ] as const) {
    await db.query(
      `INSERT INTO agentic_trace_replay
         (id, request_timeline_gz, request_timeline_version, request_chart_data_gz,
          request_chart_data_version, sla_attempts_gz, sla_attempts_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        Buffer.from('timeline'),
        REQUEST_TIMELINE_VERSION,
        chartGz,
        REQUEST_CHART_DATA_VERSION,
        staleBlob,
        staleBlob ? SLA_ATTEMPTS_VERSION - 1 : null,
      ],
    );
  }
  await db.exec(`
    UPDATE benchmark_results SET trace_replay_id = 1 WHERE id = 443435;
    UPDATE benchmark_results SET trace_replay_id = 2 WHERE id = 443444;
    UPDATE benchmark_results SET trace_replay_id = 3 WHERE id = 443441;
  `);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe('getSlaAttemptsSources and getSlaAttempts', () => {
  it('reads the stored attempt data with its content identity', async () => {
    const sources = await getSlaAttemptsSources(sql, [443435]);
    expect(sources[443435]).toEqual({ kind: 'attempts', identity: `attempts:${storedSha}` });
    const blob = await getSlaAttempts(sql, 443435, 'attempts');
    expect(blob?.source.kind).toBe('original_export');
    expect(blob?.set.completed.ttftUs).toEqual([300_000, 900_000]);
    expect(blob?.set.other).toEqual([{ outcome: 'failed', failureClass: 'http_503', count: 1 }]);
  });

  it('falls back to the derived timeline when no current blob is stored', async () => {
    const sources = await getSlaAttemptsSources(sql, [443444, 443441]);
    expect(sources[443444].kind).toBe('timeline');
    expect(sources[443444].identity).toMatch(/^timeline:[0-9a-f]{64}$/u);
    // A blob written by an older extraction version is not served.
    expect(sources[443441].kind).toBe('timeline');
    const blob = await getSlaAttempts(sql, 443444, 'timeline');
    expect(blob?.source.kind).toBe('derived_timeline');
    expect(blob?.accounting.outcomeSource).toBe('inferred');
    expect(blob?.set.completed.ttftUs).toEqual([250_000]);
    expect(blob?.set.other).toEqual([{ outcome: 'unknown', failureClass: null, count: 1 }]);
    expect(blob?.accounting.warmupExcluded).toBe(1);
  });

  it('reports a point without request-level data, and leaves unknown ids out', async () => {
    const sources = await getSlaAttemptsSources(sql, [443440, 999]);
    expect(sources).toEqual({ 443440: { kind: 'none', identity: 'none' } });
    await expect(getSlaAttempts(sql, 443440, 'none')).resolves.toBeNull();
  });

  it('does not query for an empty id list', async () => {
    await expect(getSlaAttemptsSources(sql, [])).resolves.toEqual({});
  });
});

describe('fixed-sequence request records', () => {
  // Three fixed-sequence points of one run: attempt data stored, stored with a
  // reason, and stored by another extraction version. A fourth has no row.
  const STORED = 900_001;
  const OMITTED = 900_002;
  const OTHER_VERSION = 900_003;
  const HISTORICAL = 900_004;
  let recordsSha: string;

  beforeAll(async () => {
    const gz = encodeSlaAttempts({
      version: SLA_ATTEMPTS_VERSION,
      source: {
        kind: 'request_records',
        harnessLog: 'not_applicable',
        abortReason: null,
        sequenceGaps: null,
        unparsedLines: 0,
      },
      set: {
        completed: {
          ttftUs: [30_000, 250_000],
          tpotUs: [10_000, 50_000],
          e2eUs: [60_000, 400_000],
        },
        other: [{ outcome: 'failed', failureClass: 'http_503', count: 1 }],
      },
      accounting: {
        issued: 3,
        issuedLowerBound: 3,
        skippedBeforeDispatch: 0,
        incompleteAtCutoff: 0,
        contextOverflowRejected: null,
        warmupExcluded: 2,
        retryAccounting: 'no_client_retries',
        outcomeSource: 'explicit',
        timings: {
          configuredWindowS: null,
          graceS: null,
          phaseElapsedS: null,
          clientDurationS: 1.5,
          attemptSpanS: 1.4,
          cutoffReached: false,
        },
      },
    });
    recordsSha = slaAttemptsSha256(gz);
    await db.exec(`
      INSERT INTO benchmark_results
        (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
      VALUES
        (${STORED}, 2, 1, 'single_turn', '2026-09-29', 8192, 1024, 8, '{}'),
        (${OMITTED}, 2, 1, 'single_turn', '2026-09-29', 8192, 1024, 16, '{}'),
        (${OTHER_VERSION}, 2, 1, 'single_turn', '2026-09-29', 8192, 1024, 32, '{}'),
        (${HISTORICAL}, 2, 1, 'single_turn', '2026-09-29', 8192, 1024, 64, '{"median_ttft": 0.1}');
    `);
    await db.query(
      `INSERT INTO benchmark_sla_attempts
         (benchmark_result_id, sla_attempts_gz, sla_attempts_version, sla_attempts_sha256,
          load_kind, concurrency_limit, unavailable_reason, unavailable_detail)
       VALUES
         (${STORED}, $1, $2, decode($3, 'hex'), 'request_concurrency', 8, null, null),
         (${OMITTED}, null, $2, null, null, null, 'columns_omitted',
          'attempts_exceed_aggregate_limit: 250000 attempts, limit 200000'),
         (${OTHER_VERSION}, $1, $4, decode($3, 'hex'), 'request_concurrency', 32, null, null)`,
      [gz, SLA_ATTEMPTS_VERSION, recordsSha, SLA_ATTEMPTS_VERSION + 1],
    );
  });

  it('reads stored attempt data with its content identity', async () => {
    const sources = await getSlaAttemptsSources(sql, [STORED]);
    expect(sources[STORED]).toEqual({ kind: 'request_records', identity: `records:${recordsSha}` });
    const blob = await getSlaAttempts(sql, STORED, 'request_records');
    expect(blob?.source.kind).toBe('request_records');
    expect(blob?.set.completed.ttftUs).toEqual([30_000, 250_000]);
    expect(blob?.accounting.timings.clientDurationS).toBe(1.5);
  });

  it('reports omitted columns with the recorded reason, and never decodes another version', async () => {
    const sources = await getSlaAttemptsSources(sql, [OMITTED, OTHER_VERSION]);
    expect(sources[OMITTED]).toEqual({
      kind: 'unavailable',
      identity: 'unavailable:columns_omitted',
      reason: 'request_columns_omitted',
      detail: 'attempts_exceed_aggregate_limit: 250000 attempts, limit 200000',
    });
    expect(sources[OTHER_VERSION]).toMatchObject({
      kind: 'unavailable',
      reason: 'request_records_unreadable',
    });
    await expect(getSlaAttempts(sql, OMITTED, 'unavailable')).resolves.toBeNull();
    await expect(getSlaAttempts(sql, OTHER_VERSION, 'request_records')).resolves.toBeNull();
  });

  it('has nothing for a historical row that carries aggregates only', async () => {
    const sources = await getSlaAttemptsSources(sql, [HISTORICAL]);
    expect(sources[HISTORICAL]).toEqual({ kind: 'none', identity: 'none' });
    await expect(getSlaAttempts(sql, HISTORICAL, 'none')).resolves.toBeNull();
  });

  it('lists which points carried a request-records block', async () => {
    await expect(
      getRequestRecordsPresence(sql, [HISTORICAL, STORED, OMITTED, OTHER_VERSION, 443435]),
    ).resolves.toEqual([STORED, OMITTED, OTHER_VERSION]);
    await expect(getRequestRecordsPresence(sql, [])).resolves.toEqual([]);
  });

  it('reads as no request-level data on a database without migration 031', async () => {
    const bare = await migratedPglite();
    try {
      await bare.exec(`
        DROP TABLE benchmark_sla_attempts;
        INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
        VALUES (1, 1, 1, 'Run Sweep', '2026-09-29T04:19:00Z', '2026-09-29');
        INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
          is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
        VALUES (1, 'dsv4', 'b300', 'sglang', 'fp4', 'mtp', false, false, 8, 8, 8, 8);
        INSERT INTO benchmark_results
          (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
        VALUES (7, 1, 1, 'single_turn', '2026-09-29', 8192, 1024, 8, '{}');
      `);
      const bareSql = pgliteSql(bare);
      await expect(getSlaAttemptsSources(bareSql, [7])).resolves.toEqual({
        7: { kind: 'none', identity: 'none' },
      });
      await expect(getRequestRecordsPresence(bareSql, [7])).resolves.toEqual([]);
    } finally {
      await bare.close();
    }
  });
});

describe('getSlaRunProvenance', () => {
  it('reads the commit and dataset of the latest attempt of each run', async () => {
    await expect(getSlaRunProvenance(sql, ['36463674051', '32168174681', '1'])).resolves.toEqual([
      { github_run_id: '32168174681', head_sha: null, dataset_slug: null },
      {
        github_run_id: '36463674051',
        head_sha: '2222222bbbb',
        dataset_slug: 'cc-traces-weka-062126',
      },
    ]);
  });

  it('does not query for an empty run list', async () => {
    await expect(getSlaRunProvenance(sql, [])).resolves.toEqual([]);
  });
});
