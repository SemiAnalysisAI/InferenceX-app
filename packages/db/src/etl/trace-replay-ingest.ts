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

import { computeAggregateStats } from './compute-aggregate-stats.js';
import { computeChartSeries } from './compute-chart-series.js';
import { computeRequestTimeline } from './compute-request-timeline.js';
import type { ServerMetricsContext } from './server-metrics-adapters';

type Sql = ReturnType<typeof postgres>;

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
 * @param metricsContext      Canonical framework used to select the
 *                            orchestrator-specific metric-label adapter.
 */
export async function insertTraceReplay(
  sql: Sql,
  benchmarkResultIds: number[],
  profileExportJsonl: Buffer | null,
  serverMetricsCsv: Buffer | null,
  serverMetricsJson: Buffer | null = null,
  metricsContext: ServerMetricsContext = {},
): Promise<void> {
  if (benchmarkResultIds.length === 0) return;
  if (!profileExportJsonl && !serverMetricsCsv && !serverMetricsJson) return;

  // Only link rows that don't already point at a trace_replay row — keeps
  // re-ingest from inserting duplicate sibling blobs.
  const unlinked = await sql<{ id: number }[]>`
    select id from benchmark_results
    where id = any(${sql.array(benchmarkResultIds)}::bigint[])
      and trace_replay_id is null
  `;
  if (unlinked.length === 0) return;

  const profileGz = profileExportJsonl ? gzipSync(profileExportJsonl) : null;
  const profileSize = profileExportJsonl ? profileExportJsonl.length : null;
  const csvSize = serverMetricsCsv ? serverMetricsCsv.length : null;
  const metricsJsonGz = serverMetricsJson ? gzipSync(serverMetricsJson) : null;
  const metricsJsonSize = serverMetricsJson ? serverMetricsJson.length : null;

  // Pre-compute aggregate stats + chart-ready time-series + per-request
  // timeline so the detail page doesn't have to re-parse these blobs on
  // every request. Each helper tolerates a null blob and falls back to
  // a streaming parser for oversized server_metrics blobs.
  const [aggregateStats, chartSeries, requestTimeline] = await Promise.all([
    computeAggregateStats({ profileBlob: profileGz, serverBlob: metricsJsonGz }),
    computeChartSeries(metricsJsonGz, metricsContext),
    Promise.resolve(computeRequestTimeline(profileGz)),
  ]);

  const [{ id: traceReplayId }] = await sql<{ id: number }[]>`
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
      ${profileGz},
      ${profileSize},
      ${serverMetricsCsv},
      ${csvSize},
      ${metricsJsonGz},
      ${metricsJsonSize},
      ${sql.json(structuredClone(aggregateStats) as unknown as Parameters<typeof sql.json>[0])},
      ${chartSeries === null ? null : sql.json(structuredClone(chartSeries) as unknown as Parameters<typeof sql.json>[0])},
      ${requestTimeline === null ? null : sql.json(structuredClone(requestTimeline) as unknown as Parameters<typeof sql.json>[0])}
    )
    returning id
  `;

  await sql`
    update benchmark_results
    set trace_replay_id = ${traceReplayId}
    where id = any(${sql.array(unlinked.map((r) => r.id))}::bigint[])
  `;

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
  if (chartSeries && chartSeries.prefillTps.length > 0) {
    const sumPrompts = chartSeries.prefillTps.reduce((s, p) => s + p.value, 0);
    if (sumPrompts > 0) {
      const sumOf = (name: string): number =>
        (chartSeries.promptTokensBySource[name] ?? []).reduce((s, p) => s + p.value, 0);
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
          : chartSeries.prefixCacheHitsTps.reduce((s, p) => s + p.value, 0);
      const gpuRate = gpuHits / sumPrompts;
      const cpuRate = cpuHits > 0 ? cpuHits / sumPrompts : null;
      await sql`
        update benchmark_results
        set metrics = jsonb_set(
          case when ${cpuRate}::numeric is not null
            then jsonb_set(metrics, '{server_cpu_cache_hit_rate}', to_jsonb(${cpuRate}::numeric))
            else metrics
          end,
          '{server_gpu_cache_hit_rate}',
          to_jsonb(${gpuRate}::numeric)
        )
        where id = any(${sql.array(unlinked.map((r) => r.id))}::bigint[])
      `;
    }
  }
}
