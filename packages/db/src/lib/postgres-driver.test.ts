// The ETL writers through the real postgres.js driver (over a PGlite socket). These pin how the
// driver serializes arrays, JSON text, booleans, Buffers and Dates, which postgres.js v4 changed
// (the server now decides every parameter's type).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { updateAtomKvCachePoolTokens } from '../etl/atom-kv-capacity';
import {
  bulkIngestBenchmarkRows,
  bulkIngestRunStats,
  bulkUpsertAvailability,
  insertServerLog,
  type BenchmarkPersistenceInput,
} from '../etl/benchmark-ingest';
import { ingestChangelogEntries } from '../etl/changelog-ingest';
import type { Sql } from '../etl/db-utils';
import { bulkIngestEvalSamples } from '../etl/eval-samples-ingest';
import { ingestGpuMetricsArtifact } from '../etl/gpu-metrics-ingest';
import { applyAgentxAudits } from '../etl/power-audit-recovery';
import {
  findUnlinkedTraceReplayIds,
  persistPreparedTraceReplay,
  type PreparedTraceReplay,
} from '../etl/trace-replay-ingest';
import { migratedPglite, pgliteDriverSql } from './test-pglite';

let db: PGlite;
let sql: Sql;
const roots: string[] = [];

beforeAll(async () => {
  db = await migratedPglite();
  sql = await pgliteDriverSql(db);
}, 30_000);

afterAll(async () => {
  await sql?.end();
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs, server_logs, availability RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 34557177019, 1, 'Run Sweep', 'completed', 'success', '2026-09-11T04:00:00Z', '2026-09-11');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'atom', 'fp4', 'none', false, false, 8, 8, 8, 8);`);
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const AUDIT = {
  source: 'power_validation_a_conc48.json',
  window_start_unix: 1,
  window_end_unix: 2,
};

function point(overrides: Partial<BenchmarkPersistenceInput> = {}): BenchmarkPersistenceInput {
  return {
    configId: 1,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 48,
    offloadMode: 'off',
    image: 'img',
    recipeFingerprint: 'recipe-a',
    metrics: { power_valid: 1 },
    ...overrides,
  };
}

describe('benchmark ingest through postgres.js', () => {
  it('stores JSON text arrays as jsonb objects and absent JSON as SQL null', async () => {
    const result = await bulkIngestBenchmarkRows(
      sql,
      [
        point({ workers: [{ role: 'decode' }] as never, powerAudit: AUDIT as never }),
        point({ conc: 64 }),
      ],
      1,
      '2026-09-11',
    );
    expect(result.newCount).toBe(2);
    const stored = await db.query<Record<string, unknown>>(
      `SELECT conc, metrics, workers, power_audit, power_invalid_reasons, date::text AS date
       FROM benchmark_results ORDER BY conc`,
    );
    expect(stored.rows).toEqual([
      {
        conc: 48,
        metrics: { power_valid: 1 },
        workers: [{ role: 'decode' }],
        power_audit: AUDIT,
        power_invalid_reasons: null,
        date: '2026-09-11',
      },
      {
        conc: 64,
        metrics: { power_valid: 1 },
        workers: null,
        power_audit: null,
        power_invalid_reasons: null,
        date: '2026-09-11',
      },
    ]);
  });

  it('links a server log to the rows by bigint[] and writes run stats and availability', async () => {
    const { insertedIds } = await bulkIngestBenchmarkRows(sql, [point()], 1, '2026-09-11');
    await insertServerLog(sql, insertedIds, 'server log\n');
    const linked = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM benchmark_results WHERE server_log_id IS NOT NULL',
    );
    expect(linked.rows[0]!.n).toBe(1);

    expect(
      await bulkIngestRunStats(sql, [{ hardware: 'b200', nSuccess: 3, total: 4 }], 1, '2026-09-11'),
    ).toEqual({ newCount: 1, dupCount: 0 });
    await bulkUpsertAvailability(
      sql,
      [
        {
          model: 'dsr1',
          isl: null,
          osl: 1024,
          precision: 'fp4',
          hardware: 'b200',
          framework: 'atom',
          specMethod: 'none',
          disagg: true,
          benchmarkType: 'single_turn',
        },
      ],
      '2026-09-11',
    );
    const availability = await db.query<Record<string, unknown>>(
      'SELECT isl, osl, disagg, date::text AS date FROM availability',
    );
    expect(availability.rows).toEqual([{ isl: null, osl: 1024, disagg: true, date: '2026-09-11' }]);
  });

  it('stores changelog config keys as a text[] and its append-only flag as a boolean', async () => {
    await ingestChangelogEntries(sql, 1, '2026-09-11', 'main', 'sha', [
      {
        configKeys: ['dsr1-fp4-b200-atom', 'dsr1-fp8-b200-atom'],
        description: 'desc',
        prLink: null,
        evalsOnly: false,
        appendOnly: true,
      },
    ] as never);
    const rows = await db.query<Record<string, unknown>>(
      'SELECT config_keys, append_only, date::text AS date FROM changelog_entries',
    );
    expect(rows.rows).toEqual([
      {
        config_keys: ['dsr1-fp4-b200-atom', 'dsr1-fp8-b200-atom'],
        append_only: true,
        date: '2026-09-11',
      },
    ]);
  });
});

describe('agentic writers through postgres.js', () => {
  beforeEach(async () => {
    await db.exec(`INSERT INTO server_logs (id, server_log) VALUES (7, '')
      ON CONFLICT DO NOTHING;
      INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, conc,
        metrics, server_log_id)
      VALUES (10, 1, 1, 'agentic_traces', '2026-09-11', 32, '{}', 7),
             (11, 1, 1, 'agentic_traces', '2026-09-11', 64, '{}', 7);`);
  });

  it('writes AgentX audits as jsonb objects', async () => {
    expect(
      await applyAgentxAudits(sql, {
        workflowRunId: 1,
        writes: [{ benchmarkResultId: 11, powerAudit: AUDIT as never }],
      }),
    ).toEqual([11]);
    const audits = await db.query<{ id: number; audit: unknown }>(
      'SELECT id::int, power_audit AS audit FROM benchmark_results ORDER BY id',
    );
    expect(audits.rows).toEqual([
      { id: 10, audit: null },
      { id: 11, audit: AUDIT },
    ]);
  });

  it('finds, links and fills trace replay rows by bigint[]', async () => {
    const unlinked = await findUnlinkedTraceReplayIds(sql, [10, 11, 99]);
    expect(unlinked.map(Number)).toEqual([10, 11]);
    const prepared: PreparedTraceReplay = {
      profileGz: Buffer.from('profile'),
      profileSize: 7,
      serverMetricsCsv: Buffer.from('csv'),
      serverMetricsCsvSize: 3,
      serverMetricsJsonGz: null,
      serverMetricsJsonSize: null,
      aggregateStatsJson: Buffer.from('{"version":1}'),
      sequenceLengthSketches: Buffer.from('sketches'),
      chartSeriesJson: null,
      chartSeriesSummaryGz: null,
      requestTimelineGz: null,
      requestChartDataGz: null,
      chartWindows: 0,
      timelineRequests: 0,
      compressionMs: 0,
      computeMs: 0,
      cacheHitRates: { cpu: null, gpu: 0.5 },
      fullResponseMetrics: { median_full_response_itl: 0.005 },
      warnings: [],
    };
    expect(await persistPreparedTraceReplay(sql, [10, 11], prepared)).toBe(2);
    expect(await findUnlinkedTraceReplayIds(sql, [10, 11])).toEqual([]);
    const stored = await db.query<Record<string, unknown>>(
      `SELECT br.metrics, convert_from(atr.profile_export_jsonl_gz, 'UTF8') AS profile,
         convert_from(atr.sequence_length_sketches, 'UTF8') AS sketches, atr.aggregate_stats
       FROM benchmark_results br JOIN agentic_trace_replay atr ON atr.id = br.trace_replay_id
       ORDER BY br.id`,
    );
    expect(stored.rows).toEqual(
      [10, 11].map(() => ({
        metrics: { server_gpu_cache_hit_rate: 0.5, median_full_response_itl: 0.005 },
        profile: 'profile',
        sketches: 'sketches',
        aggregate_stats: { version: 1 },
      })),
    );
  });

  it('reads ATOM capacity lines for rows selected by bigint[]', async () => {
    await db.exec(
      `UPDATE configs SET framework = 'atom'; UPDATE server_logs SET server_log = 'no capacity'`,
    );
    expect(await updateAtomKvCachePoolTokens(sql, [10, 11], 100)).toBe(0);
  });
});

describe('eval samples through postgres.js', () => {
  it('stores booleans, numerics and jsonb objects from unnested arrays', async () => {
    await db.exec(`INSERT INTO eval_results (id, workflow_run_id, config_id, task, date, metrics)
      VALUES (1, 1, 1, 'gsm8k', '2026-09-11', '{}')`);
    expect(
      await bulkIngestEvalSamples(sql, 1, [
        {
          docId: 0,
          prompt: 'p',
          target: 't',
          response: 'r',
          passed: true,
          score: 0.5,
          metrics: { exact_match: 1 },
          data: { doc: { question: 'q' } },
        },
        {
          docId: 1,
          prompt: null,
          target: null,
          response: null,
          passed: null,
          score: null,
          metrics: {},
          data: {},
        },
      ]),
    ).toEqual({ newCount: 2 });
    const rows = await db.query<Record<string, unknown>>(
      'SELECT doc_id, passed, score::float8 AS score, metrics, data FROM eval_samples ORDER BY doc_id',
    );
    expect(rows.rows).toEqual([
      {
        doc_id: 0,
        passed: true,
        score: 0.5,
        metrics: { exact_match: 1 },
        data: { doc: { question: 'q' } },
      },
      { doc_id: 1, passed: null, score: null, metrics: {}, data: {} },
    ]);
  });
});

describe('gpu metrics through postgres.js', () => {
  it('unnests samples, links points by bigint[] and replaces a retried point', async () => {
    await db.exec(`INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type,
      date, conc, metrics) VALUES (10, 1, 1, 'single_turn', '2026-09-11', 32, '{}')`);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-driver-gpu-'));
    roots.push(root);
    const artifactName = 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0';
    const artifactDir = path.join(root, artifactName);
    fs.mkdirSync(artifactDir);
    fs.writeFileSync(
      path.join(artifactDir, 'gpu_metrics.csv'),
      [
        'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]',
        '2026/09/11 04:19:41.982, 0, 187.80 W, 33, 120 MHz, 3996 MHz, 0 %, 0 %',
        '2026/09/11 04:19:42.990, 0, 912.10 W, 61, 1965 MHz, 3996 MHz, 98 %, 74 %',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(artifactDir, 'gpu_metrics_context.json'),
      JSON.stringify({ timestamp_timezone: 'UTC' }),
    );
    const artifact = { artifactName, artifactDir };
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(first.samplesInserted).toBe(2);
    const again = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
      replace: true,
      replacePointLinks: true,
    });
    expect(again.seriesIds).toEqual(first.seriesIds);
    const samples = await db.query<Record<string, unknown>>(
      `SELECT gpu_index, power_w, to_char(sampled_at AT TIME ZONE 'UTC', 'HH24:MI:SS.MS') AS at
       FROM gpu_metric_samples ORDER BY sampled_at`,
    );
    expect(samples.rows).toEqual([
      { gpu_index: 0, power_w: 187.8, at: '04:19:41.982' },
      { gpu_index: 0, power_w: 912.1, at: '04:19:42.990' },
    ]);
    const links = await db.query<{ benchmark_result_id: number }>(
      'SELECT benchmark_result_id::int FROM benchmark_result_gpu_metrics',
    );
    expect(links.rows).toEqual([{ benchmark_result_id: 10 }]);
  });
});

describe('postgres.js v4 parameter typing', () => {
  it('needs a cast for a Date, boolean or bigint the query does not type', async () => {
    const at = new Date('2026-09-11T04:19:41.982Z');
    await expect(sql`select date_trunc('day', ${at}) as day`).rejects.toMatchObject({
      code: '42725',
    });
    const [row] = await sql`
      select date_trunc('day', ${at}::timestamptz) as day, ${true}::bool as flag,
        ${BigInt(2 ** 40)}::int8 + 1 as big, ${['a', 'b']}::text[] as list
    `;
    expect(row).toEqual({
      day: new Date('2026-09-11T00:00:00Z'),
      flag: true,
      big: '1099511627777',
      list: ['a', 'b'],
    });
  });

  it('stores a JSON text array cast to jsonb[] as JSON strings, so writers cast text[] per element', async () => {
    const [row] = await sql`
      select
        (select array_agg(jsonb_typeof(x)) from unnest(${['{"a":1}']}::jsonb[]) x) as as_jsonb,
        (select array_agg(jsonb_typeof(x::jsonb)) from unnest(${['{"a":1}']}::text[]) x) as as_text
    `;
    expect(row).toEqual({ as_jsonb: ['string'], as_text: ['object'] });
  });
});
