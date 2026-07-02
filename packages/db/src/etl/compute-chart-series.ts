/**
 * Pre-compute the time-series for the agentic detail page chart, so the
 * API doesn't have to gunzip + JSON-parse a multi-hundred-MB blob on every
 * request. The output lands in `agentic_trace_replay.chart_series` and is
 * read directly by `getTraceServerMetrics`.
 *
 * Versioned so the backfill script knows which rows are stale — bump
 * `CHART_SERIES_VERSION` whenever the extraction algorithm changes.
 */

import { gunzipSync } from 'node:zlib';

import { isStringTooLongError, streamCollectKeys } from './gzip-json-stream';
import {
  selectServerMetricsAdapter,
  type MetricSource,
  type ServerMetricsContext,
} from './server-metrics-adapters';

/**
 * Bump when the extraction algorithm changes — backfill recomputes anything
 * older.
 *
 * v2: aggregate vllm gauges/counters across all engine series (was reading
 * only series[0], which under-counted by Nx on multi-engine DP/PP
 * deployments — most visible as a request-queue-depth chart that maxed out
 * at ~3 when the timeline clearly showed 20+ in-flight).
 *
 * v3: extract `prefixCacheHitsTps` so the detail page can derive cumulative
 * unique input tokens as cumsum(prefillTps - prefixCacheHitsTps).
 *
 * v4: extract sglang:* metrics too (fallback chain in each picker), so
 * SGLang runs populate the chart_series the same way vllm runs do.
 *
 * v5: map sglang:realtime_tokens (mode={prefill_cache,prefill_compute,decode})
 * into promptTokensBySource so the cumulative prompt-token-source-breakdown
 * chart shows useful splits for SGLang runs (filtered to prefill_* modes).
 *
 * v6: for SGLang, swap the coarse "prefill_cache" bucket for per-cache_source
 * breakdown from sglang:cached_tokens — current runs always have one
 * cache_source ("device" / HBM) but hicache (CPU offload) runs would
 * split into "device" + "host" automatically once ingested.
 *
 * v7: extract sglang:hicache_host_{used,total}_tokens into a new
 * hostKvCacheUsage series so the KV cache utilization chart can plot
 * the CPU offload pool's usage alongside the on-GPU HBM line.
 *
 * v8: keep the per-engine dimension on kv_cache_usage_perc as
 * `kvCacheUsageByEngine` (one entry per DP rank). The cluster-average
 * line hides load skew on DEP configs; the detail page overlays the
 * per-rank lines so a hot rank is visible at a glance.
 *
 * v9: retain orchestrator-normalized per-source series. Dynamo labels are
 * mapped to canonical router/prefill/decode roles, allowing the frontend to
 * inspect individual workers without interpreting Dynamo-native labels.
 *
 * v10: only emit per-source series for disaggregated configs with a recognized
 * orchestrator adapter. Non-disaggregated and unsupported configs retain the
 * existing aggregate-only behavior.
 *
 * v12: also consume the `warmup_metrics` block from the server-metrics blob and
 * merge its scrapes into the same series as the profiling `metrics` block.
 * Warmup and profiling timeslices carry their own absolute `start_ns` and never
 * overlap in time, so the merged series is continuous (warmup at lower t,
 * profiling after). This lets the agentic detail page slice `chart_series` into
 * warmup vs profiling at the request-derived boundary; older blobs without a
 * warmup block are unaffected. (v11 was a short-lived, since-reverted attempt to
 * carry kvCachePoolTokens in chart_series; that value now lives in
 * benchmark_results.metrics, derived from the server log — unrelated to this.)
 */
export const CHART_SERIES_VERSION = 12;

export interface TimeSeriesPoint {
  /** Seconds from benchmark start. */
  t: number;
  value: number;
}

export interface QueueDepthPoint {
  t: number;
  running: number;
  waiting: number;
  total: number;
}

export interface ChartSeries {
  version: number;
  /** ns wall-clock of the first window's start; for debugging only. */
  startNs: number;
  /** ns wall-clock of the last window's end. */
  endNs: number;
  /** Total benchmark window in seconds. */
  durationS: number;
  /** Number of 1Hz windows captured. */
  timeslicesCount: number;
  kvCacheUsage: TimeSeriesPoint[];
  prefixCacheHitRate: TimeSeriesPoint[];
  queueDepth: QueueDepthPoint[];
  promptTokensBySource: Record<string, TimeSeriesPoint[]>;
  prefillTps: TimeSeriesPoint[];
  decodeTps: TimeSeriesPoint[];
  /**
   * Per-scrape rate (tokens/sec) of vllm:prefix_cache_hits, summed across
   * engines. Detail page derives "cumulative unique input tokens" as
   * cumsum(prefillTps - prefixCacheHitsTps) — what the cache actually
   * saved vs the raw queries that came in.
   */
  prefixCacheHitsTps: TimeSeriesPoint[];
  /**
   * Host (CPU offload) KV cache utilization, 0..1. Only populated for
   * SGLang hicache runs (derived as hicache_host_used / hicache_host_total).
   * Frontend overlays this on the KV cache util chart as a second line.
   */
  hostKvCacheUsage: TimeSeriesPoint[];
  /**
   * Per-DP-rank KV cache utilization (0..1 each). One entry per engine
   * series found in the raw metric, ordered by the `engine` label when
   * present and by series-array index otherwise. Empty for single-engine
   * deployments — the average `kvCacheUsage` line covers that case alone.
   * The detail page overlays these on the same chart so DEP load skew is
   * visible without changing the headline number.
   */
  kvCacheUsageByEngine: { engineLabel: string; points: TimeSeriesPoint[] }[];
  /**
   * The same metrics grouped by normalized server source. Existing aggregate
   * fields above remain the default and preserve compatibility with old rows.
   */
  metricSources: MetricSourceSeries[];
}

export interface MetricSourceSeries {
  source: MetricSource;
  kvCacheUsage: TimeSeriesPoint[];
  prefixCacheHitRate: TimeSeriesPoint[];
  queueDepth: QueueDepthPoint[];
  promptTokensBySource: Record<string, TimeSeriesPoint[]>;
  /** Raw prompt-token counter rate for this source. */
  promptTps: TimeSeriesPoint[];
  /** Raw generation-token counter rate for this source. */
  generationTps: TimeSeriesPoint[];
  prefixCacheHitsTps: TimeSeriesPoint[];
  hostKvCacheUsage: TimeSeriesPoint[];
  kvCacheUsageByEngine: { engineLabel: string; points: TimeSeriesPoint[] }[];
}

// ── Raw blob shapes (subset we read) ────────────────────────────────────

interface RawSlice {
  start_ns?: number;
  end_ns?: number;
  avg?: number;
  rate?: number;
}

interface RawSeries {
  endpoint_url?: string;
  labels?: Record<string, string>;
  timeslices?: RawSlice[];
}

interface RawMetric {
  series?: RawSeries[];
}

type MetricsMap = Record<string, RawMetric>;

/**
 * The set of metric subtrees the chart consumes. Includes both vllm:* and
 * sglang:* names so the stream-parse fallback collects whichever framework
 * the blob was emitted by — `buildSeriesFromMetrics` then picks per metric.
 */
const CHART_METRIC_KEYS = new Set([
  // vLLM
  'vllm:kv_cache_usage_perc',
  'vllm:gpu_cache_usage_perc',
  'vllm:prefix_cache_hits',
  'vllm:prefix_cache_queries',
  'vllm:num_requests_running',
  'vllm:num_requests_waiting',
  'vllm:prompt_tokens',
  'vllm:generation_tokens',
  'vllm:prompt_tokens_by_source',
  // SGLang
  'sglang:token_usage',
  'sglang:cached_tokens',
  'sglang:prompt_tokens',
  'sglang:generation_tokens',
  'sglang:num_running_reqs',
  'sglang:num_queue_reqs',
  'sglang:realtime_tokens',
  'sglang:hicache_host_used_tokens',
  'sglang:hicache_host_total_tokens',
]);

/**
 * Merge a warmup phase metric map into the profiling one by concatenating each
 * metric's `series`. The two phases' timeslices carry their own absolute
 * `start_ns` and never overlap in time, so `buildSeriesFromMetrics` (which keys
 * by `start_ns`) yields one continuous series — warmup scrapes at lower t,
 * profiling after. No-ops when either side is empty (older blobs have no warmup).
 */
function mergePhaseMetrics(profiling: MetricsMap, warmup: MetricsMap): MetricsMap {
  if (Object.keys(warmup).length === 0) return profiling;
  if (Object.keys(profiling).length === 0) return warmup;
  const out: MetricsMap = {};
  for (const name of new Set([...Object.keys(profiling), ...Object.keys(warmup)])) {
    out[name] = {
      series: [...(profiling[name]?.series ?? []), ...(warmup[name]?.series ?? [])],
    };
  }
  return out;
}

/**
 * Stream-parse fallback: collect the chart's metric subtrees from both phase
 * blocks and merge (see v11). Avoids Node's 512 MB max-string-length cap that
 * `gunzipSync(buffer).toString('utf8')` trips on high-conc TP+EP rows.
 */
async function streamCollectMetrics(buffer: Buffer): Promise<MetricsMap> {
  const [profiling, warmup] = await Promise.all([
    streamCollectKeys<RawMetric>(buffer, 'metrics', CHART_METRIC_KEYS),
    streamCollectKeys<RawMetric>(buffer, 'warmup_metrics', CHART_METRIC_KEYS),
  ]);
  return mergePhaseMetrics(profiling, warmup);
}

/**
 * Parse the gzipped server_metrics blob into the metric map. Tries the
 * synchronous fast path first; falls back to stream-parse on
 * ERR_STRING_TOO_LONG so high-conc TP+EP rows succeed. Merges the warmup block
 * into the profiling one (v11) so the series span both phases.
 */
async function parseMetrics(buffer: Buffer): Promise<MetricsMap> {
  try {
    const obj = JSON.parse(gunzipSync(buffer).toString('utf8')) as {
      metrics?: MetricsMap;
      warmup_metrics?: MetricsMap;
    };
    return mergePhaseMetrics(obj.metrics ?? {}, obj.warmup_metrics ?? {});
  } catch (error) {
    if (isStringTooLongError(error)) return await streamCollectMetrics(buffer);
    throw error;
  }
}

/**
 * Build chart-ready time-series arrays from a gzipped server_metrics blob.
 * The math mirrors `getTraceServerMetrics` — this helper exists so ingest,
 * backfill, and the API path produce byte-identical results.
 */
export async function computeChartSeries(
  blob: Buffer | null,
  context: ServerMetricsContext = {},
): Promise<ChartSeries | null> {
  if (!blob) return null;
  let metrics: MetricsMap;
  try {
    metrics = await parseMetrics(blob);
  } catch {
    // Malformed blob → no series (caller treats null as "no data").
    return null;
  }
  return buildSeriesFromMetrics(metrics, context);
}

/**
 * Aggregate one timeslice field across all series of a metric, indexed by
 * `start_ns`. Multi-engine vllm deployments report one series per engine —
 * the cluster value is the sum (for running/waiting/throughput counters)
 * or the average (for kv_cache_usage_perc, a per-engine fraction).
 */
function aggregateByStart(
  series: readonly RawSeries[] | undefined,
  field: 'avg' | 'rate',
  combine: 'sum' | 'avg',
): Map<number, number> {
  const sums = new Map<number, number>();
  const counts = new Map<number, number>();
  for (const s of series ?? []) {
    for (const ts of s.timeslices ?? []) {
      if (typeof ts.start_ns !== 'number') continue;
      const v = ts[field];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      sums.set(ts.start_ns, (sums.get(ts.start_ns) ?? 0) + v);
      counts.set(ts.start_ns, (counts.get(ts.start_ns) ?? 0) + 1);
    }
  }
  if (combine === 'sum') return sums;
  const out = new Map<number, number>();
  for (const [t, s] of sums) out.set(t, s / (counts.get(t) ?? 1));
  return out;
}

/** Stable order: emit one point per unique start_ns, chronologically. */
function sortedEntries(m: Map<number, number>): [number, number][] {
  return [...m.entries()].toSorted((a, b) => a[0] - b[0]);
}

function buildSeriesFromMetrics(
  metrics: MetricsMap,
  context: ServerMetricsContext,
  includeMetricSources = true,
  originStartNs?: number,
): ChartSeries {
  // Timing reference: smallest start_ns and largest end_ns across every
  // timeslice we extracted. timeslicesCount is the length of any single
  // series (engines are scraped on the same cadence), so picking the max
  // length across all series of all metrics is safe.
  let startNs = Number.POSITIVE_INFINITY;
  let endNs = 0;
  let timeslicesCount = 0;
  for (const metricMeta of Object.values(metrics)) {
    for (const s of metricMeta?.series ?? []) {
      const ts = s.timeslices ?? [];
      if (ts.length === 0) continue;
      timeslicesCount = Math.max(timeslicesCount, ts.length);
      const first = ts[0]!;
      const last = ts.at(-1)!;
      if (typeof first.start_ns === 'number' && first.start_ns < startNs) startNs = first.start_ns;
      if (typeof last.end_ns === 'number' && last.end_ns > endNs) endNs = last.end_ns;
    }
  }
  if (!Number.isFinite(startNs)) startNs = 0;
  const tOf = (ns: number) => (ns - (originStartNs ?? startNs)) / 1e9;

  // Pick the first metric name whose series array has any data; fallback
  // chain lets the same code path serve both vllm:* and sglang:* blobs.
  const pickSeries = (...names: string[]): readonly RawSeries[] | undefined => {
    for (const name of names) {
      const s = metrics[name]?.series;
      if (s && s.length > 0) return s;
    }
    return undefined;
  };

  // KV cache usage (gauge, 0..1) — average across engines so the value
  // stays a fraction (each engine has its own KV pool).
  const kvSeries = pickSeries(
    'vllm:kv_cache_usage_perc',
    'vllm:gpu_cache_usage_perc',
    'sglang:token_usage',
  );
  const kvCacheUsage: TimeSeriesPoint[] = sortedEntries(
    aggregateByStart(kvSeries, 'avg', 'avg'),
  ).map(([t, v]) => ({ t: tOf(t), value: v }));
  // Per-engine breakdown of the same metric. We only emit it when there's
  // more than one series — single-engine deployments would just duplicate
  // the cluster-average line.
  const kvCacheUsageByEngine: { engineLabel: string; points: TimeSeriesPoint[] }[] = [];
  if (kvSeries && kvSeries.length > 1) {
    // Sort by numeric engine label when present so rank 0..N renders in
    // order; fall back to series-array index otherwise.
    const decorated = kvSeries.map((s, idx) => {
      const raw =
        s.labels?.['engine'] ?? s.labels?.['engine_idx'] ?? s.labels?.['dp_rank'] ?? String(idx);
      const numeric = Number(raw);
      return { series: s, idx, label: raw, sortKey: Number.isFinite(numeric) ? numeric : idx };
    });
    decorated.sort((a, b) => a.sortKey - b.sortKey);
    for (const { series, label } of decorated) {
      const pts: TimeSeriesPoint[] = [];
      for (const ts of series.timeslices ?? []) {
        if (typeof ts.start_ns !== 'number' || typeof ts.avg !== 'number') continue;
        if (!Number.isFinite(ts.avg)) continue;
        pts.push({ t: tOf(ts.start_ns), value: ts.avg });
      }
      if (pts.length > 0) kvCacheUsageByEngine.push({ engineLabel: label, points: pts });
    }
  }

  // Prefix cache hit rate per scrape: Σhits.rate / Σqueries.rate across
  // engines, joined on start_ns. SGLang names: cached_tokens / prompt_tokens.
  const hitsSeries = pickSeries('vllm:prefix_cache_hits', 'sglang:cached_tokens');
  const qsSeries = pickSeries(
    'vllm:prefix_cache_queries',
    'vllm:prompt_tokens',
    'sglang:prompt_tokens',
  );
  const hitsByT = aggregateByStart(hitsSeries, 'rate', 'sum');
  const qsByT = aggregateByStart(qsSeries, 'rate', 'sum');
  const prefixCacheHitRate: TimeSeriesPoint[] = [];
  for (const [t, h] of sortedEntries(hitsByT)) {
    const q = qsByT.get(t);
    if (q !== undefined && q > 0) prefixCacheHitRate.push({ t: tOf(t), value: h / q });
  }

  // Queue depth: sum running + waiting across engines per timeslice.
  const runSeries = pickSeries('vllm:num_requests_running', 'sglang:num_running_reqs');
  const waitSeries = pickSeries('vllm:num_requests_waiting', 'sglang:num_queue_reqs');
  const runByT = aggregateByStart(runSeries, 'avg', 'sum');
  const waitByT = aggregateByStart(waitSeries, 'avg', 'sum');
  const queueDepth: QueueDepthPoint[] = [];
  // Union of timestamps so we surface activity even if one of the gauges
  // didn't report a sample on a given tick.
  const allTimes = new Set<number>([...runByT.keys(), ...waitByT.keys()]);
  for (const t of [...allTimes].toSorted((a, b) => a - b)) {
    const running = runByT.get(t) ?? 0;
    const waiting = waitByT.get(t) ?? 0;
    queueDepth.push({ t: tOf(t), running, waiting, total: running + waiting });
  }

  // Throughput: sum the counter `rate` (already per-second) across engines.
  // Takes a fallback chain so vllm:* and sglang:* both work.
  const counterRate = (...names: string[]): TimeSeriesPoint[] => {
    const s = pickSeries(...names);
    return sortedEntries(aggregateByStart(s, 'rate', 'sum')).map(([t, v]) => ({
      t: tOf(t),
      value: v,
    }));
  };
  const prefillTps = counterRate('vllm:prompt_tokens', 'sglang:prompt_tokens');
  const decodeTps = counterRate('vllm:generation_tokens', 'sglang:generation_tokens');
  // Tokens served from prefix cache per scrape. Lets the frontend derive
  // "cumulative unique input tokens served" = cumsum(prefillTps) − cumsum(hits).
  const prefixCacheHitsTps = counterRate('vllm:prefix_cache_hits', 'sglang:cached_tokens');

  // SGLang hicache: host-pool KV cache utilization as used/total per
  // timeslice. Both metrics are gauges in absolute tokens. Total stays
  // constant (it's the pool size), used fluctuates.
  const hostUsedByT = aggregateByStart(
    metrics['sglang:hicache_host_used_tokens']?.series,
    'avg',
    'sum',
  );
  const hostTotalByT = aggregateByStart(
    metrics['sglang:hicache_host_total_tokens']?.series,
    'avg',
    'sum',
  );
  const hostKvCacheUsage: TimeSeriesPoint[] = [];
  for (const [t, used] of sortedEntries(hostUsedByT)) {
    const total = hostTotalByT.get(t);
    if (total !== undefined && total > 0) {
      hostKvCacheUsage.push({ t: tOf(t), value: used / total });
    }
  }

  // Per-source prompt tokens — sum across engines per source label.
  //   vllm: vllm:prompt_tokens_by_source has one series per source label
  //         (local_cache_hit, external_cache_hit, miss, ...). Use the
  //         `source`/`reason`/`kind` label as the breakdown key.
  //   sglang: sglang:realtime_tokens uses a `mode` label with values
  //         {prefill_cache, prefill_compute, decode}. Filter to prefill_*
  //         since decode isn't prompt-token volume.
  const promptBySrcByT = new Map<string, Map<number, number>>();
  // Sum a series' per-scrape rates into the bucket for `label`. The bucket is
  // created even when the series has no valid timeslices — the SGLang fallback
  // below is gated on `promptBySrcByT.size === 0`, so an empty vllm breakdown
  // must still suppress it.
  const addSeriesRates = (label: string, series: RawSeries): void => {
    let byT = promptBySrcByT.get(label);
    if (!byT) {
      byT = new Map<number, number>();
      promptBySrcByT.set(label, byT);
    }
    for (const ts of series.timeslices ?? []) {
      if (typeof ts.rate === 'number' && typeof ts.start_ns === 'number') {
        byT.set(ts.start_ns, (byT.get(ts.start_ns) ?? 0) + ts.rate);
      }
    }
  };
  for (const series of metrics['vllm:prompt_tokens_by_source']?.series ?? []) {
    const labels = series.labels ?? {};
    const source = labels['source'] ?? labels['reason'] ?? labels['kind'] ?? JSON.stringify(labels);
    addSeriesRates(source, series);
  }
  // SGLang fallback: only consider when the vllm metric wasn't found.
  //   - Cache misses (fresh prefill): `sglang:realtime_tokens[mode=prefill_compute]`
  //   - Cache hits, split by tier: per-series `sglang:cached_tokens` where each
  //     series carries a `cache_source` label ("device" = HBM, "host" = CPU
  //     offload via hicache). Current runs have only `device`; when hicache
  //     runs land, additional series will appear and the chart will split.
  if (promptBySrcByT.size === 0) {
    for (const series of metrics['sglang:realtime_tokens']?.series ?? []) {
      const labels = series.labels ?? {};
      const mode = labels['mode'] ?? 'unknown';
      // Only carry the cache-miss line over — cache hits come from
      // sglang:cached_tokens broken out by cache_source below, so we'd
      // double-count if we kept `prefill_cache` here too.
      if (mode !== 'prefill_compute') continue;
      addSeriesRates('compute (miss)', series);
    }
    // Cache hits broken out per cache_source. Strip the noisy "total" label
    // (older sglang versions emit a single un-broken-out series labelled
    // total — show that as just "cache hit").
    for (const series of metrics['sglang:cached_tokens']?.series ?? []) {
      const labels = series.labels ?? {};
      const src = labels['cache_source'] ?? 'cache hit';
      const label =
        src === 'device'
          ? 'cache hit (HBM)'
          : src === 'host'
            ? 'cache hit (CPU offload)'
            : src === 'total'
              ? 'cache hit'
              : `cache hit (${src})`;
      addSeriesRates(label, series);
    }
  }
  const promptTokensBySource: Record<string, TimeSeriesPoint[]> = {};
  for (const [source, byT] of promptBySrcByT) {
    const arr: TimeSeriesPoint[] = [];
    for (const [t, v] of sortedEntries(byT)) {
      if (v > 0) arr.push({ t: tOf(t), value: v });
    }
    if (arr.length > 0) promptTokensBySource[source] = arr;
  }

  const metricSources: MetricSourceSeries[] = [];
  const adapter = selectServerMetricsAdapter(context);
  if (includeMetricSources && context.disagg && adapter.id !== 'generic') {
    const grouped = new Map<string, { source: MetricSource; metrics: MetricsMap }>();
    for (const [metricName, metric] of Object.entries(metrics)) {
      for (const series of metric.series ?? []) {
        const source = adapter.identifySource(series);
        let group = grouped.get(source.id);
        if (!group) {
          group = { source, metrics: {} };
          grouped.set(source.id, group);
        }
        const groupedMetric = (group.metrics[metricName] ??= { series: [] });
        groupedMetric.series!.push(series);
      }
    }
    for (const { source, metrics: sourceMetrics } of grouped.values()) {
      const sourceSeries = buildSeriesFromMetrics(
        sourceMetrics,
        context,
        false,
        originStartNs ?? startNs,
      );
      metricSources.push({
        source,
        kvCacheUsage: sourceSeries.kvCacheUsage,
        prefixCacheHitRate: sourceSeries.prefixCacheHitRate,
        queueDepth: sourceSeries.queueDepth,
        promptTokensBySource: sourceSeries.promptTokensBySource,
        promptTps: sourceSeries.prefillTps,
        generationTps: sourceSeries.decodeTps,
        prefixCacheHitsTps: sourceSeries.prefixCacheHitsTps,
        hostKvCacheUsage: sourceSeries.hostKvCacheUsage,
        kvCacheUsageByEngine: sourceSeries.kvCacheUsageByEngine,
      });
    }
    const roleOrder: Record<MetricSource['role'], number> = {
      router: 0,
      prefill: 1,
      decode: 2,
      combined: 3,
      unknown: 4,
    };
    metricSources.sort(
      (a, b) =>
        roleOrder[a.source.role] - roleOrder[b.source.role] ||
        (a.source.endpointUrl ?? '').localeCompare(b.source.endpointUrl ?? '') ||
        a.source.id.localeCompare(b.source.id),
    );
  }
  return {
    version: CHART_SERIES_VERSION,
    startNs,
    endNs,
    durationS: endNs > startNs ? (endNs - startNs) / 1e9 : 0,
    timeslicesCount,
    kvCacheUsage,
    prefixCacheHitRate,
    queueDepth,
    promptTokensBySource,
    prefillTps,
    decodeTps,
    prefixCacheHitsTps,
    hostKvCacheUsage,
    kvCacheUsageByEngine,
    metricSources,
  };
}
