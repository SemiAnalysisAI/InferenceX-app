import { gunzipSync } from 'node:zlib';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CHART_SERIES_SUMMARY_VERSION } from '../etl/chart-series-summary';
import {
  CHART_SERIES_VERSION,
  computeChartDataFromMetricPhases,
} from '../etl/compute-chart-series';
import { writeChartSeriesBackfill } from './backfill-chart-series-row';
import { pgliteSql, type PgliteSql } from './test-pglite';

let db: PGlite;
let sql: PgliteSql;
const series = computeChartDataFromMetricPhases({}, {}).series;

beforeAll(async () => {
  db = await PGlite.create();
  sql = pgliteSql(db);
  await db.exec(`
    create table agentic_trace_replay (
      id integer primary key,
      chart_series jsonb,
      chart_series_summary_gz bytea,
      chart_series_summary_version integer
    );
    create table benchmark_results (
      id bigint primary key,
      trace_replay_id integer,
      metrics jsonb not null
    );
  `);
});

beforeEach(async () => {
  await db.exec('truncate benchmark_results, agentic_trace_replay');
  await sql`
    insert into agentic_trace_replay (id, chart_series)
    values (1, ${JSON.stringify({ version: CHART_SERIES_VERSION - 1 })}::jsonb)
  `;
  await db.exec(`
    insert into benchmark_results (id, trace_replay_id, metrics)
    values (10, 1, '{"server_gpu_cache_hit_rate":0.48,"other":42}'),
           (11, 1, '{"server_gpu_cache_hit_rate":0.48}'),
           (12, 2, '{"server_gpu_cache_hit_rate":0.2}');
  `);
});

afterAll(async () => {
  await db.close();
});

describe('writeChartSeriesBackfill', () => {
  it('rolls back the chart version if updating rates fails, then repairs both on retry', async () => {
    await db.exec(`
      alter table benchmark_results add constraint reject_repair
      check ((metrics->>'server_gpu_cache_hit_rate')::numeric < 0.9)
    `);
    try {
      await expect(
        writeChartSeriesBackfill(sql, 1, series, { gpu: 0.97, cpu: null }),
      ).rejects.toThrow();
      const [row] =
        await sql`select chart_series, chart_series_summary_gz from agentic_trace_replay where id = 1`;
      expect(row.chart_series).toEqual({ version: CHART_SERIES_VERSION - 1 });
      expect(row.chart_series_summary_gz).toBeNull();
      const rows =
        await sql`select metrics->>'server_gpu_cache_hit_rate' as rate from benchmark_results order by id`;
      expect(rows.map((entry) => entry.rate)).toEqual(['0.48', '0.48', '0.2']);
    } finally {
      await db.exec('alter table benchmark_results drop constraint reject_repair');
    }

    expect(await writeChartSeriesBackfill(sql, 1, series, { gpu: 0.97, cpu: null })).toBe(true);
    const [row] =
      await sql`select chart_series, chart_series_summary_gz, chart_series_summary_version from agentic_trace_replay where id = 1`;
    expect(row.chart_series).toMatchObject({
      version: CHART_SERIES_VERSION,
      prefixCacheHitRate: [],
      metricSources: [],
    });
    expect(row.chart_series_summary_version).toBe(CHART_SERIES_SUMMARY_VERSION);
    expect(JSON.parse(gunzipSync(row.chart_series_summary_gz as Buffer).toString())).toMatchObject({
      prefixCacheHitRate: [],
    });
    const rows = await sql`select metrics from benchmark_results order by id`;
    expect(rows.map((entry) => entry.metrics)).toEqual([
      { server_gpu_cache_hit_rate: 0.97, other: 42 },
      { server_gpu_cache_hit_rate: 0.97 },
      { server_gpu_cache_hit_rate: 0.2 },
    ]);
  });

  it('leaves both chart and row rates untouched when a newer parser has written the trace', async () => {
    const newer = { version: CHART_SERIES_VERSION + 1, prefixCacheHitRate: [{ t: 0, value: 0.8 }] };
    await sql`update agentic_trace_replay set chart_series = ${JSON.stringify(newer)}::jsonb where id = 1`;
    expect(await writeChartSeriesBackfill(sql, 1, series, { gpu: 0.97, cpu: null })).toBe(false);
    const [row] = await sql`select chart_series from agentic_trace_replay where id = 1`;
    expect(row.chart_series).toEqual(newer);
    const rows =
      await sql`select metrics->>'server_gpu_cache_hit_rate' as rate from benchmark_results order by id`;
    expect(rows.map((entry) => entry.rate)).toEqual(['0.48', '0.48', '0.2']);
  });

  it('refreshes the chart without replacing row rates when counters cannot establish a rate', async () => {
    expect(await writeChartSeriesBackfill(sql, 1, series, null)).toBe(true);
    const [row] =
      await sql`select chart_series->>'version' as version from agentic_trace_replay where id = 1`;
    expect(Number(row.version)).toBe(CHART_SERIES_VERSION);
    const rows =
      await sql`select metrics->>'server_gpu_cache_hit_rate' as rate from benchmark_results order by id`;
    expect(rows.map((entry) => entry.rate)).toEqual(['0.48', '0.48', '0.2']);
  });
});
