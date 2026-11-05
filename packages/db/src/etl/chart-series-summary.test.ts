import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DbClient } from '../connection.js';
import { backfillChartSeriesSummary } from '../lib/chart-series-summary-backfill';
import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { getTraceServerMetrics } from '../queries/trace-server-metrics';
import { CHART_SERIES_SUMMARY_VERSION, encodeChartSeriesSummary } from './chart-series-summary';
import {
  CHART_SERIES_VERSION,
  type ChartSeries,
  type MetricSourceSeries,
  type TimeSeriesPoint,
} from './compute-chart-series';

const points = (...values: number[]): TimeSeriesPoint[] =>
  values.map((value, t) => ({ t: t * 0.5, value }));

function workerSource(
  role: 'prefill' | 'decode',
  workerId: string,
  ranks: number[],
): MetricSourceSeries {
  return {
    source: {
      id: `dynamo|${role}|${workerId}`,
      adapter: 'dynamo',
      role,
      endpointUrl: 'http://10.0.0.1:7500/metrics',
      nativeRole: role,
      workerId,
      dpRank: null,
      engine: null,
    },
    kvCacheUsage: points(ranks[0] ?? 0),
    prefixCacheHitRate: [],
    queueDepth: [],
    promptTokensBySource: {},
    promptTps: points(1, 2),
    generationTps: [],
    prefixCacheHitsTps: [],
    hostKvCacheUsage: [],
    kvCacheUsageByEngine: ranks.map((value, i) => ({
      engineLabel: `${role} ${i}`,
      points: points(value, value / 3),
    })),
  };
}

function trickySeries(metricSources: MetricSourceSeries[]): ChartSeries {
  return {
    version: CHART_SERIES_VERSION,
    startNs: 1_761_000_000_123_456_800,
    endNs: 1_761_000_000_123_456_800 + 612.345e9,
    durationS: 612.345_678_901_234_5,
    timeslicesCount: 3,
    kvCacheUsage: points(0.1 + 0.2, 1e-7, 5e-324),
    prefixCacheHitRate: points(2 / 3),
    queueDepth: [{ t: 0, running: 3, waiting: 1, total: 4 }],
    promptTokensBySource: {
      miss: points(1e21),
      'cache hit (HBM)': points(0.000_123),
      '10': points(10),
      '2': points(2),
      é: points(-0),
      z: points(1.5),
    },
    prefillTps: points(100.25, 1 / 7),
    decodeTps: points(3e-10),
    prefixCacheHitsTps: [],
    hostKvCacheUsage: points(0.5),
    kvCacheUsageByEngine: [
      { engineLabel: 'decode 0', points: points(0.1) },
      { engineLabel: 'decode 1', points: points(0.9) },
    ],
    metricSources,
  };
}

let db: PGlite;
let pg: PgliteSql;

beforeAll(async () => {
  db = await migratedPglite();
  pg = pgliteSql(db);
  await db.exec(`
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date, html_url)
    VALUES (1, 34557177019, 1, 'Run Sweep', 'completed', 'success', '2026-10-01T04:19:00Z', '2026-10-01',
      'https://github.com/o/r/actions/runs/34557177019');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsv4', 'gb200', 'dynamo-vllm', 'fp4', 'none', true, true, 4, 8, 8, 16);
  `);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

async function insertPoint(id: number, series: ChartSeries): Promise<void> {
  await pg`
    insert into agentic_trace_replay (id, server_metrics_json_gz, chart_series)
    values (${id}, ${Buffer.from('metrics')}, ${JSON.stringify(series)}::jsonb)
  `;
  await pg`
    insert into benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, conc, metrics, trace_replay_id)
    values (${id}, 1, 1, 'agentic_traces', '2026-10-01', ${id}, '{"kv_cache_pool_tokens": 123456}', ${id})
  `;
}

async function routeJson(id: number): Promise<{ json: string; fromSummary: boolean }> {
  let fromSummary = false;
  const query: DbClient = pg;
  const spy: DbClient = (strings, ...values) =>
    query(strings, ...values).then((rows) => {
      if (rows[0]?.summary_gz) fromSummary = true;
      return rows;
    });
  const json = JSON.stringify(await getTraceServerMetrics(spy, id));
  return { json, fromSummary };
}

describe('chart_series_summary_gz', () => {
  const cases: [string, number, ChartSeries][] = [
    [
      'collapsed per-worker overlay',
      11,
      trickySeries([
        workerSource('prefill', 'wpre-aaaa', [0.1, 0.3]),
        workerSource('prefill', 'wpre-bbbb', [0.5, 0.7]),
        workerSource('decode', 'wdec-cccc', [0.3]),
      ]),
    ],
    ['stored per-rank overlay', 12, trickySeries([])],
  ];

  it.each(cases)(
    'serves the same bytes as deriving from chart_series (%s)',
    async (_, id, series) => {
      await insertPoint(id, series);
      const derived = await routeJson(id);
      expect(derived.fromSummary).toBe(false);

      await pg`
      update agentic_trace_replay
      set chart_series_summary_gz = ${encodeChartSeriesSummary(JSON.stringify(series))},
          chart_series_summary_version = ${CHART_SERIES_SUMMARY_VERSION}
      where id = ${id}
    `;
      const stored = await routeJson(id);
      expect(stored.fromSummary).toBe(true);
      expect(stored.json).toBe(derived.json);
    },
  );

  it('backfills the summary from the stored jsonb', async () => {
    const id = 13;
    await insertPoint(id, cases[0]![2]);
    const derived = await routeJson(id);

    await expect(backfillChartSeriesSummary(pg, id)).resolves.toBe(true);
    const stored = await routeJson(id);
    expect(stored.fromSummary).toBe(true);
    expect(stored.json).toBe(derived.json);
  });

  it('does not backfill from a stale chart series, and ignores a stale summary', async () => {
    const id = 14;
    const stale = { ...trickySeries([]), version: CHART_SERIES_VERSION - 1 };
    await insertPoint(id, stale);
    await expect(backfillChartSeriesSummary(pg, id)).resolves.toBe(false);

    await pg`
      update agentic_trace_replay
      set chart_series = ${JSON.stringify(trickySeries([]))}::jsonb,
          chart_series_summary_gz = ${encodeChartSeriesSummary(JSON.stringify(stale))},
          chart_series_summary_version = ${CHART_SERIES_SUMMARY_VERSION - 1}
      where id = ${id}
    `;
    const served = await routeJson(id);
    expect(served.fromSummary).toBe(false);
  });
});
