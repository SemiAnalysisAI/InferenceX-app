/**
 * Insert per-point aiperf trace files (`profile_export.jsonl` +
 * `server_metrics_export.csv`) into `agentic_trace_replay` and link the new row
 * to each provided benchmark_results row via `trace_replay_id`.
 *
 * Mirrors the {@link insertServerLog} idempotency contract: rows that already
 * have a non-null `trace_replay_id` are left alone so a re-ingest doesn't
 * duplicate the sibling blob.
 */

import { gzipSync } from 'node:zlib';

import type postgres from 'postgres';

import { computeAggregateStats, type AggregateStats } from './compute-aggregate-stats';
import { computeChartSeries, type ChartSeries } from './compute-chart-series';
import { computeRequestTimeline, type RequestTimeline } from './compute-request-timeline';
import type { ServerMetricsContext } from './server-metrics-adapters';

type Sql = ReturnType<typeof postgres>;

export interface TraceReplayIngestOptions {
  metricsContext?: ServerMetricsContext;
  progressLabel?: string;
}

export interface PreparedTraceReplay {
  profileGz: Buffer | null;
  profileSize: number | null;
  serverMetricsCsv: Buffer | null;
  csvSize: number | null;
  metricsJsonGz: Buffer | null;
  metricsJsonSize: number | null;
  aggregateStats: AggregateStats;
  chartSeries: ChartSeries | null;
  requestTimeline: RequestTimeline | null;
  gzipMs: number;
  computeMs: number;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'none';
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(1)} GiB`;
}

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

export async function findUnlinkedTraceReplayBenchmarkIds(
  sql: Sql,
  benchmarkResultIds: number[],
): Promise<number[]> {
  if (benchmarkResultIds.length === 0) return [];
  const rows = await sql<{ id: number }[]>`
    select id from benchmark_results
    where id = any(${sql.array(benchmarkResultIds)}::bigint[])
      and trace_replay_id is null
  `;
  return rows.map((row) => row.id);
}

export async function prepareTraceReplay(
  profileExportJsonl: Buffer | null,
  serverMetricsCsv: Buffer | null,
  serverMetricsJson: Buffer | null,
  metricsContext: ServerMetricsContext = {},
): Promise<PreparedTraceReplay> {
  const gzipStart = Date.now();
  const profileGz = profileExportJsonl ? gzipSync(profileExportJsonl) : null;
  const metricsJsonGz = serverMetricsJson ? gzipSync(serverMetricsJson) : null;
  const gzipMs = Date.now() - gzipStart;

  const computeStart = Date.now();
  const [aggregateStats, chartSeries, requestTimeline] = await Promise.all([
    computeAggregateStats({ profileBlob: profileGz, serverBlob: metricsJsonGz }),
    computeChartSeries(metricsJsonGz, metricsContext),
    Promise.resolve(computeRequestTimeline(profileGz)),
  ]);

  return {
    profileGz,
    profileSize: profileExportJsonl?.length ?? null,
    serverMetricsCsv,
    csvSize: serverMetricsCsv?.length ?? null,
    metricsJsonGz,
    metricsJsonSize: serverMetricsJson?.length ?? null,
    aggregateStats,
    chartSeries,
    requestTimeline,
    gzipMs,
    computeMs: Date.now() - computeStart,
  };
}

/**
 * Persist the per-point trace files and link them to `benchmarkResultIds`.
 *
 * @param sql                 Active `postgres` connection.
 * @param benchmarkResultIds  DB ids of the benchmark_results rows produced by
 *                            the same `bmk_agentic_<suffix>` artifact whose
 *                            sibling `agentic_<suffix>` directory holds these
 *                            trace files.
 * @param profileExportJsonl  Raw bytes of `profile_export.jsonl`, or null.
 *                            Gzipped before storage.
 * @param serverMetricsCsv    Raw bytes of `server_metrics_export.csv`, or null.
 *                            Stored as-is.
 * @param serverMetricsJson   Raw bytes of `server_metrics_export.json` —
 *                            per-scrape time-series of every Prometheus metric.
 *                            Optional, gzipped before storage (~42x ratio).
 * @param options             Canonical framework/disagg context plus optional
 *                            progress label for CI logs.
 */
export async function insertTraceReplay(
  sql: Sql,
  benchmarkResultIds: number[],
  profileExportJsonl: Buffer | null,
  serverMetricsCsv: Buffer | null,
  serverMetricsJson: Buffer | null = null,
  options: TraceReplayIngestOptions = {},
): Promise<void> {
  const { metricsContext = {}, progressLabel } = options;
  const log = (message: string): void => {
    if (progressLabel) console.log(`    trace_replay ${progressLabel}: ${message}`);
  };

  if (benchmarkResultIds.length === 0) return;
  if (!profileExportJsonl && !serverMetricsCsv && !serverMetricsJson) return;

  const linkStart = Date.now();
  log(`checking ${benchmarkResultIds.length} benchmark row(s) for existing links`);
  const unlinkedIds = await findUnlinkedTraceReplayBenchmarkIds(sql, benchmarkResultIds);
  log(`found ${unlinkedIds.length} unlinked row(s) (${elapsed(linkStart)})`);
  if (unlinkedIds.length === 0) {
    log('skipping blob insert; all benchmark rows already linked');
    return;
  }

  log(
    `compressing profile=${formatBytes(profileExportJsonl?.length)}, ` +
      `server_csv=${formatBytes(serverMetricsCsv?.length)}, ` +
      `server_json=${formatBytes(serverMetricsJson?.length)}`,
  );
  const prepared = await prepareTraceReplay(
    profileExportJsonl,
    serverMetricsCsv,
    serverMetricsJson,
    metricsContext,
  );
  log(
    `compressed profile=${formatBytes(prepared.profileGz?.length)}, ` +
      `server_json=${formatBytes(prepared.metricsJsonGz?.length)} ` +
      `(${(prepared.gzipMs / 1000).toFixed(1)}s)`,
  );
  log(
    `computed derived JSON: chart_windows=${prepared.chartSeries?.timeslicesCount ?? 0}, ` +
      `timeline_requests=${prepared.requestTimeline?.requests.length ?? 0} ` +
      `(${(prepared.computeMs / 1000).toFixed(1)}s)`,
  );

  await insertPreparedTraceReplay(sql, benchmarkResultIds, prepared, options);
}

export async function insertPreparedTraceReplay(
  sql: Sql,
  benchmarkResultIds: number[],
  prepared: PreparedTraceReplay,
  options: TraceReplayIngestOptions = {},
): Promise<void> {
  const { progressLabel } = options;
  const log = (message: string): void => {
    if (progressLabel) console.log(`    trace_replay ${progressLabel}: ${message}`);
  };

  await sql.begin(async (tx) => {
    // Row locks make the check-and-link atomic when multiple config workers
    // converge on the same idempotency key.
    const unlinked = await tx<{ id: number }[]>`
      select id from benchmark_results
      where id = any(${tx.array(benchmarkResultIds)}::bigint[])
        and trace_replay_id is null
      for update
    `;
    if (unlinked.length === 0) {
      log('skipping blob insert; all benchmark rows already linked');
      return;
    }

    const insertStart = Date.now();
    log('inserting trace_replay blob row');
    const [{ id: traceReplayId }] = await tx<{ id: number }[]>`
      insert into agentic_trace_replay (
        profile_export_jsonl_gz,
        profile_export_uncompressed_size,
        server_metrics_csv,
        server_metrics_csv_size,
        server_metrics_json_gz,
        server_metrics_json_uncompressed_size,
        aggregate_stats,
        chart_series,
        request_timeline
      )
      values (
        ${prepared.profileGz},
        ${prepared.profileSize},
        ${prepared.serverMetricsCsv},
        ${prepared.csvSize},
        ${prepared.metricsJsonGz},
        ${prepared.metricsJsonSize},
        ${tx.json(structuredClone(prepared.aggregateStats) as unknown as Parameters<typeof tx.json>[0])},
        ${prepared.chartSeries === null ? null : tx.json(structuredClone(prepared.chartSeries) as unknown as Parameters<typeof tx.json>[0])},
        ${prepared.requestTimeline === null ? null : tx.json(structuredClone(prepared.requestTimeline) as unknown as Parameters<typeof tx.json>[0])}
      )
      returning id
    `;
    log(`inserted trace_replay_id=${traceReplayId} (${elapsed(insertStart)})`);

    const updateStart = Date.now();
    log(`linking trace_replay_id=${traceReplayId} to ${unlinked.length} benchmark row(s)`);
    await tx`
      update benchmark_results
      set trace_replay_id = ${traceReplayId}
      where id = any(${tx.array(unlinked.map((r) => r.id))}::bigint[])
    `;
    log(`linked benchmark rows (${elapsed(updateStart)})`);

    // Derive lifetime GPU + CPU cache hit rates from chart_series. SGLang
    // runs don't populate these in the harness JSON; vLLM runs do but only
    // for GPU. We always recompute to keep the derivation consistent with
    // what the detail-page charts plot — overwriting any pre-existing value.
    //
    // Source label naming differs by framework / cache topology:
    //   SGLang hicache: 'cache hit (HBM)' + 'cache hit (CPU offload)'
    //   SGLang older:   'cache hit'      (no tier breakdown)
    //   vLLM LMCache:   'local_cache_hit' + 'external_kv_transfer'  (+ 'local_compute' for miss)
    //   vLLM single:    falls back to prefixCacheHitsTps total (= local cache only)
    if (prepared.chartSeries && prepared.chartSeries.prefillTps.length > 0) {
      const sumPrompts = prepared.chartSeries.prefillTps.reduce((s, p) => s + p.value, 0);
      if (sumPrompts > 0) {
        const sumOf = (name: string): number =>
          (prepared.chartSeries?.promptTokensBySource[name] ?? []).reduce((s, p) => s + p.value, 0);
        // CPU-offload hits: SGLang hicache + vLLM LMCache external transfer.
        const cpuHits = sumOf('cache hit (CPU offload)') + sumOf('external_kv_transfer');
        // GPU/HBM hits from source breakdown, summed across known aliases.
        const hbmFromBreakdown =
          sumOf('cache hit (HBM)') + sumOf('cache hit') + sumOf('local_cache_hit');
        // If the source breakdown has any GPU entry, use it. Otherwise fall back
        // to total prefixCacheHitsTps sum (single-source vLLM path with no
        // by_source metric — equals the lone cache counter's lifetime).
        const gpuHits =
          hbmFromBreakdown > 0
            ? hbmFromBreakdown
            : prepared.chartSeries.prefixCacheHitsTps.reduce((s, p) => s + p.value, 0);
        const gpuRate = gpuHits / sumPrompts;
        const cpuRate = cpuHits > 0 ? cpuHits / sumPrompts : null;
        await tx`
          update benchmark_results
          set metrics = jsonb_set(
            case when ${cpuRate}::numeric is not null
              then jsonb_set(metrics, '{server_cpu_cache_hit_rate}', to_jsonb(${cpuRate}::numeric))
              else metrics
            end,
            '{server_gpu_cache_hit_rate}',
            to_jsonb(${gpuRate}::numeric)
          )
          where id = any(${tx.array(unlinked.map((r) => r.id))}::bigint[])
        `;
        log('updated cache-hit metrics from chart series');
      }
    }
  });
}
