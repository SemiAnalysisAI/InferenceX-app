/**
 * Pre-compute the time-series for the agentic detail page chart, so the
 * API doesn't have to gunzip + JSON-parse a multi-hundred-MB blob on every
 * request. The output lands in `agentic_trace_replay.chart_series` and is
 * read directly by `getTraceServerMetrics`.
 *
 * Versioned so the backfill script knows which rows are stale — bump
 * `CHART_SERIES_VERSION` whenever the extraction algorithm changes.
 */

import { collectMetricPhases } from './gzip-json-stream';
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
 *
 * v13: give the KV-cache series a real per-engine identity instead of "one
 * entry per raw series". Three independent sources of duplication were
 * inflating `kvCacheUsageByEngine` (up to 8x — 64 lines for a run with 18
 * real engines) and fragmenting the cluster-average `kvCacheUsage`:
 *   1. v12's warmup merge concatenates each engine's warmup and profiling
 *      series, so every engine appeared at least twice — and single-engine
 *      deployments started drawing a spurious two-line "per-engine" overlay.
 *   2. vLLM run with multiple API-server frontends exposes the *same* engine
 *      set on every `/metrics` endpoint, so an 8-rank DP deployment scraped
 *      from two frontends yielded 16 series for 8 engines.
 *   3. Tensor-/pipeline-/expert-parallel ranks each report the one KV pool
 *      they share, so a TP8 worker looked like 8 engines holding identical
 *      values.
 * Series are now grouped by their Prometheus label set (see
 * `seriesIdentityKey`), and the cluster average is a real mean across those
 * logical engines (see `averageAcrossEngines`) rather than a mean over
 * whichever engines happened to share an exact `start_ns`.
 *
 * v14: give the SUMMED series the same treatment v13 gave the averaged one.
 * Components of a metric are not scraped in lockstep — a disaggregated run
 * puts every worker on its own `/metrics` endpoint and its own sub-second
 * offset, and even a single-endpoint SGLang run splits its token counters into
 * `is_streaming="true"`/`"false"` series ~16 ms apart — so summing on an exact
 * `start_ns` emitted one point per component per tick, each carrying that
 * component's share alone instead of the cluster total. The detail page reads
 * those as a comb: `rollingAverage` is a sample-count mean, so it averaged the
 * real samples together with the other components' structural gaps and drew
 * roughly 1/N of the actual throughput (measured: 2.2x low on an 8-rank SGLang
 * DP run, ~7x low on the 7-worker disaggregated rows).
 *
 * Every summed series — prefill/decode/prefix-hit rates, queue depth, host KV
 * usage and the prompt-token source breakdown — is now evaluated on one
 * canonical grid at the blob's native scrape cadence (`canonicalTickNs`), with
 * each component holding its last sample between its own scrapes
 * (`sumOntoGrid`). The grid has to be uniform, not the union of scrape
 * instants the way `averageAcrossEngines` does it: a mean is scale-free but a
 * sum is not, and `cumulativeUniqueInputTokens` turns these rates into token
 * totals with `sum += value`, which only stays correct at one point per
 * scrape bucket.
 *
 * v15: a metric SOURCE is one worker, not one engine inside it. The source
 * identity carried `dp_rank` (sglang) and `engine` (vllm), which name engines
 * *within* a worker, so the detail page's endpoint picker listed each worker
 * once per rank: a 6-prefill/1-decode run offered 35 "endpoints" for 7
 * workers, reading `Prefill - <id>` five times in a row. SGLang also emits an
 * unlabelled aggregate series alongside the per-rank ones, which became a
 * fifth entry for the same worker; vllm leaves `dp_rank` unset and duplicates
 * under `engine` instead, so the same bug wore a different label per
 * framework. Identity is now `(role, worker)` — see `seriesIdentityKey`'s
 * sibling reasoning in `server-metrics-adapters.ts`. Each worker's ranks
 * aggregate into its one source (throughput summed, KV averaged) and the
 * per-rank detail stays reachable as that source's own
 * `kvCacheUsageByEngine`.
 *
 */
export const CHART_SERIES_VERSION = 15;

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
   * Per-DP-rank KV cache utilization (0..1 each). One entry per LOGICAL
   * engine — one KV pool — not per raw series; see `resolveLogicalEngines`
   * for how mirrored endpoints, phase blocks and shard ranks collapse.
   * Ordered by role, then numeric rank, then worker. Empty for single-engine
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

export interface RawMetric {
  series?: RawSeries[];
}

export type MetricsMap = Record<string, RawMetric>;

/**
 * The set of metric subtrees the chart consumes. Includes both vllm:* and
 * sglang:* names so the stream-parse fallback collects whichever framework
 * the blob was emitted by — `buildSeriesFromMetrics` then picks per metric.
 */
export const CHART_METRIC_KEYS = new Set([
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
 * Parse the gzipped server_metrics blob into the metric map. Small blobs use
 * the synchronous fast path; oversized blobs use one streaming parser pass
 * that collects both phase blocks. Merges the warmup block into the profiling
 * one (v11) so the series span both phases.
 */
async function parseMetrics(buffer: Buffer): Promise<MetricsMap> {
  const { metrics, warmupMetrics } = await collectMetricPhases<RawMetric>(
    buffer,
    CHART_METRIC_KEYS,
  );
  return mergePhaseMetrics(metrics, warmupMetrics);
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
 * Build the chart payload from already parsed phase maps. This is the same
 * merge + projection used by `computeChartSeries()`, exposed so ingest can
 * share one server JSON parse with aggregate-stat computation.
 */
export function computeChartSeriesFromMetricPhases(
  profiling: MetricsMap,
  warmup: MetricsMap,
  context: ServerMetricsContext = {},
): ChartSeries {
  return buildSeriesFromMetrics(mergePhaseMetrics(profiling, warmup), context);
}

// Note: v14 removed `aggregateByStart`/`sortedEntries`. Nothing groups on an
// exact `start_ns` any more — averaged series go through `averageAcrossEngines`
// and summed ones through `sumOntoGrid`, both of which treat a component's
// samples as a step function rather than requiring components to share a
// nanosecond.

// ── Per-engine identity (v13) ───────────────────────────────────────────
//
// A "logical engine" is one KV-cache pool: one DP rank of one worker. The blob
// stores one `RawSeries` per (scrape endpoint × phase block × label set), which
// is NOT the same thing — see the v13 note at the top of the file.

/**
 * Ranks that shard ONE engine rather than naming a separate one. A KV cache is
 * allocated per engine and shared by its tensor-, pipeline- and expert-parallel
 * ranks, so every such rank reports the same pool: on a TP8 SGLang prefill
 * worker the eight `tp_rank` series agree to ~4 decimal places on average
 * (with rare single-scrape transients where one rank spikes alone).
 * Treating them as separate engines drew eight near-identical lines per pool.
 *
 * `engine` / `engine_idx` / `dp_rank` are deliberately NOT here — those DO name
 * distinct pools (one per DP rank / engine core).
 */
const INTRA_ENGINE_SHARD_LABELS = new Set(['tp_rank', 'pp_rank', 'ep_rank', 'moe_ep_rank']);

/**
 * Identity of a metric series, following Prometheus semantics: the label set
 * IS the series, and the scrape endpoint is transport rather than identity.
 * Two `/metrics` endpoints exposing `{engine="3", model_name="X"}` are two
 * views of one engine — which is exactly what vLLM does when it runs several
 * API-server frontends over one DP engine group.
 *
 * Deployments whose endpoints really are distinct engines say so in the
 * labels: Dynamo tags every series with `worker_id` (plus `dynamo_component`
 * / `engine_type`), so prefill worker rank 0 and decode worker rank 0 keep
 * separate identities here.
 *
 * Shard ranks are excluded (see `INTRA_ENGINE_SHARD_LABELS`). Series left with
 * no labels at all fall back to the endpoint, which keeps label-less workers
 * apart rather than silently fusing them.
 */
function seriesIdentityKey(s: RawSeries): string {
  const labels = s.labels ?? {};
  const names = Object.keys(labels)
    .filter((name) => !INTRA_ENGINE_SHARD_LABELS.has(name))
    .toSorted();
  if (names.length === 0) return `@${s.endpoint_url ?? ''}`;
  // Join on control characters so a name or value containing '=' or ','
  // cannot forge another label set's key.
  return names.map((name) => `${name}\u0001${labels[name]}`).join('\u0002');
}

/** Dynamo/SGLang name their roles differently; normalize for display. */
const ENGINE_ROLE_BY_NATIVE_LABEL: Record<string, string> = {
  prefill: 'prefill',
  decode: 'decode',
  backend: 'decode',
};

/** Label lookup that treats blank values as absent. */
function labelOrNull(labels: Record<string, string>, ...names: string[]): string | null {
  for (const name of names) {
    const value = labels[name]?.trim();
    if (value) return value;
  }
  return null;
}

/** DP-rank-ish label under any of the names the frameworks emit. */
function engineRankLabel(labels: Record<string, string>): string | null {
  return labelOrNull(labels, 'engine', 'engine_idx', 'dp_rank');
}

function engineRoleLabel(labels: Record<string, string>): string | null {
  // Try each source in turn rather than taking the first that EXISTS: an
  // aggregated dynamo-sglang worker carries engine_type="unified" (which maps
  // to no role) alongside dynamo_component="backend", and stopping at the
  // first present label would resolve the role to null.
  for (const name of ['engine_type', 'dynamo_component']) {
    const native = labelOrNull(labels, name);
    const role = native ? ENGINE_ROLE_BY_NATIVE_LABEL[native] : undefined;
    if (role) return role;
  }
  return null;
}

/** Rank as a sort key. Only plain digit strings sort numerically. */
function engineRankSortKey(rank: string | null): number {
  return rank !== null && /^\d+$/u.test(rank) ? Number(rank) : Number.POSITIVE_INFINITY;
}

/** Prefill before decode; unroled engines last. Stable across runs. */
const ROLE_SORT_ORDER: Record<string, number> = { prefill: 0, decode: 1 };
function engineRoleSortKey(role: string | null): number {
  return role === null ? 2 : (ROLE_SORT_ORDER[role] ?? 2);
}

/** `scheme://host:port/path` -> `host:port`, the human-facing part. */
function endpointHostPort(endpointUrl: string): string | null {
  const hostPort = /^\w+:\/\/(?<hostPort>[^/]+)/u.exec(endpointUrl)?.groups?.['hostPort'];
  return hostPort ?? (endpointUrl || null);
}

/**
 * Short, human-readable tiebreaker for engines that would otherwise share a
 * display label (e.g. two decode workers that each number their ranks 0..7).
 * `preferEndpoint` is set when the engines being separated came from the same
 * worker, so the worker id cannot tell them apart.
 */
function engineDiscriminator(
  labels: Record<string, string>,
  endpointUrl: string,
  preferEndpoint = false,
): string | null {
  const worker = preferEndpoint ? null : labelOrNull(labels, 'worker_id');
  if (worker) return worker.length > 4 ? worker.slice(-4) : worker;
  return endpointHostPort(endpointUrl);
}

/**
 * Absolute gap between two endpoints' whole-run means, on a 0..1 gauge, below
 * which they are treated as mirrors of one engine rather than two engines
 * sharing a label set.
 *
 * Measured mirrors sit far under this: the three two-endpoint vLLM configs in
 * the corpus differ by 0.03%-2.19% of their means (under 0.001 absolute, even
 * on the heavily loaded rows), while a genuinely distinct prefill and decode
 * worker differ by ~0.08. So both sides have roughly 4x of margin.
 *
 * Residual limitation, accepted deliberately: two independent replicas behind
 * a round-robin router would have similar means BY DESIGN and would still be
 * fused, showing one line instead of two. That case degrades the per-engine
 * overlay but not the cluster average — averaging two engines that track each
 * other gives the same number either way — whereas the case this does catch
 * (replicas under uneven load) is the one where fusing would make the average
 * itself wrong. Distinguishing the former needs lag-aligned pointwise
 * comparison, which no data in the corpus currently justifies.
 */
const MIRROR_MEAN_TOLERANCE = 0.02;

/**
 * Same idea as `MIRROR_MEAN_TOLERANCE`, but for counter rates (v14), where an
 * absolute threshold is meaningless — a token-throughput mean is O(10^5), so
 * the gauge tolerance would never fire and every mirror would be counted twice.
 *
 * Expressed as a fraction of the larger mean. The measured mirrors in the
 * corpus differ by 0.03%-2.19% of their means, and a router endpoint that
 * aggregates several workers differs from any single worker by far more than
 * 5%, so this sits above the observed mirror spread with room to spare while
 * staying well below a genuine difference.
 */
const MIRROR_RATE_RELATIVE_TOLERANCE = 0.05;

/**
 * Do these endpoints' whole-run means agree closely enough to be two views of
 * one series rather than two different ones?
 *
 * Gauges keep v13's absolute test unchanged — they are 0..1 fractions (or small
 * request counts) whose mirrors agree almost exactly. Rates need a relative
 * test because their magnitude is unbounded.
 */
function looksMirrored(means: readonly number[], field: 'avg' | 'rate'): boolean {
  const spread = Math.max(...means) - Math.min(...means);
  if (field === 'avg') return spread <= MIRROR_MEAN_TOLERANCE;
  const scale = Math.max(...means.map((m) => Math.abs(m)));
  // Two endpoints that both read ~0 are mirrors of an idle series, not two
  // engines: fall back to the absolute test so the relative one can't divide
  // by a vanishing scale.
  if (scale === 0) return true;
  return spread <= MIRROR_RATE_RELATIVE_TOLERANCE * scale;
}

interface LogicalEngine {
  engineLabel: string;
  points: TimeSeriesPoint[];
}

/** One endpoint's samples for one identity, keyed by scrape instant. */
type ScrapeMap = Map<number, { sum: number; count: number }>;

interface EngineGroup {
  labels: Record<string, string>;
  byEndpoint: Map<string, ScrapeMap>;
}

/** An engine after endpoint resolution, before its display label is composed. */
interface ResolvedEngine {
  rank: string | null;
  role: string | null;
  discriminator: string | null;
  /** Which worker owns this engine — `worker_id`, else the endpoint. */
  workerKey: string | null;
  order: number;
  points: TimeSeriesPoint[];
}

function scrapesToPoints(scrapes: ScrapeMap, tOf: (ns: number) => number): TimeSeriesPoint[] {
  return [...scrapes.entries()]
    .toSorted((a, b) => a[0] - b[0])
    .map(([startNs, { sum, count }]) => ({ t: tOf(startNs), value: sum / count }));
}

function meanOf(scrapes: ScrapeMap): number {
  let total = 0;
  for (const { sum, count } of scrapes.values()) total += sum / count;
  return scrapes.size === 0 ? 0 : total / scrapes.size;
}

/** Wall-clock span covered, so a dense-but-truncated mirror can't win. */
function spanOf(scrapes: ScrapeMap): number {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const ns of scrapes.keys()) {
    if (ns < lo) lo = ns;
    if (ns > hi) hi = ns;
  }
  return hi >= lo ? hi - lo : 0;
}

/**
 * Collapse a gauge's raw series into one entry per logical engine.
 *
 * The three kinds of duplication need three different treatments:
 *   - Same endpoint, different phase blocks (v12's warmup merge): keying by
 *     scrape instant unions them into one series. The blocks' first/last
 *     bounds can look overlapping (profiling often emits one boundary sample
 *     then gaps until warmup ends) but they never share an instant, so the
 *     union neither drops nor double-counts a scrape.
 *   - Same endpoint, same instant: intra-engine shard ranks reporting the one
 *     pool they share, so they collapse to their mean (they agree to ~4 decimal
 *     places on average, with rare single-scrape transients).
 *   - Different endpoints reporting the same identity: usually mirrored
 *     API-server frontends carrying the same measurement a few hundred ms
 *     apart. Merging those would interleave near-duplicate samples and halve
 *     the effective span of the frontend's fixed-width rolling average, so the
 *     best-covered endpoint wins and the rest are dropped — but ONLY when their
 *     values agree. Endpoints that disagree are genuinely different engines
 *     behind one label (a router in front of several replicas), and dropping
 *     one would silently lose an engine, so those are kept separate instead.
 */
function resolveComponents(
  series: readonly RawSeries[] | undefined,
  tOf: (ns: number) => number,
  field: 'avg' | 'rate' = 'avg',
): ResolvedEngine[] {
  const groups = new Map<string, EngineGroup>();
  for (const s of series ?? []) {
    const key = seriesIdentityKey(s);
    let group = groups.get(key);
    if (!group) {
      group = { labels: s.labels ?? {}, byEndpoint: new Map() };
      groups.set(key, group);
    }
    const endpoint = s.endpoint_url ?? '';
    let scrapes = group.byEndpoint.get(endpoint);
    if (!scrapes) {
      scrapes = new Map();
      group.byEndpoint.set(endpoint, scrapes);
    }
    for (const ts of s.timeslices ?? []) {
      if (typeof ts.start_ns !== 'number' || !Number.isFinite(ts.start_ns)) continue;
      const value = ts[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const at = scrapes.get(ts.start_ns);
      if (at) {
        at.sum += value;
        at.count++;
      } else {
        scrapes.set(ts.start_ns, { sum: value, count: 1 });
      }
    }
  }

  const resolved: ResolvedEngine[] = [];
  for (const group of groups.values()) {
    const endpoints = [...group.byEndpoint]
      .filter(([, scrapes]) => scrapes.size > 0)
      // Endpoint URL keeps the walk deterministic before any ranking.
      .toSorted((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    if (endpoints.length === 0) continue;

    const rank = engineRankLabel(group.labels);
    const role = engineRoleLabel(group.labels);
    const workerId = labelOrNull(group.labels, 'worker_id');
    const push = (endpointUrl: string, scrapes: ScrapeMap, preferEndpoint: boolean) => {
      resolved.push({
        rank,
        role,
        discriminator: engineDiscriminator(group.labels, endpointUrl, preferEndpoint),
        workerKey: workerId ?? (endpointUrl || null),
        order: resolved.length,
        points: scrapesToPoints(scrapes, tOf),
      });
    };

    if (endpoints.length === 1) {
      push(endpoints[0]![0], endpoints[0]![1], false);
      continue;
    }

    const means = endpoints.map(([, scrapes]) => meanOf(scrapes));
    const mirrored = looksMirrored(means, field);
    if (!mirrored) {
      // Same labels, different measurements: distinct engines, not mirrors.
      for (const [endpointUrl, scrapes] of endpoints) push(endpointUrl, scrapes, true);
      continue;
    }
    // Mirrors: keep the endpoint that covers the most wall-clock, breaking
    // ties on sample count and then URL, so a dense but truncated mirror
    // cannot shorten the engine's series.
    const best = endpoints.reduce((a, b) => {
      const sa = spanOf(a[1]);
      const sb = spanOf(b[1]);
      if (sb !== sa) return sb > sa ? b : a;
      if (b[1].size !== a[1].size) return b[1].size > a[1].size ? b : a;
      return a;
    });
    push(best[0], best[1], false);
  }

  // Sort on the identity's components, never on the composed string: role
  // first, then numeric rank, then worker, then blob order. Sorting a label
  // like "decode 3" lexically (or falling back to array index) scrambled DP
  // ranks on multi-worker runs.
  return resolved.toSorted(
    (a, b) =>
      engineRoleSortKey(a.role) - engineRoleSortKey(b.role) ||
      engineRankSortKey(a.rank) - engineRankSortKey(b.rank) ||
      (a.discriminator ?? '').localeCompare(b.discriminator ?? '') ||
      a.order - b.order,
  );
}

/** Collapse a gauge's raw series into one labelled entry per logical engine. */
function resolveLogicalEngines(
  series: readonly RawSeries[] | undefined,
  tOf: (ns: number) => number,
): LogicalEngine[] {
  const ordered = resolveComponents(series, tOf, 'avg');

  // Only name the role when there is more than one, otherwise every engine on
  // an aggregated deployment reads "decode 0", "decode 1", ... for no reason.
  const roles = new Set(ordered.map((e) => e.role).filter((r) => r !== null));
  const showRole = roles.size > 1;
  const withBase = ordered.map((engine, idx) => {
    const named =
      showRole && engine.role
        ? engine.rank === null
          ? engine.role
          : `${engine.role} ${engine.rank}`
        : engine.rank;
    // Nothing rank- or role-like to go on: the worker/endpoint is the only
    // thing that names this engine, so lead with it rather than a bare index.
    return { ...engine, base: named ?? engine.discriminator ?? `#${idx}` };
  });

  // Qualify collisions (e.g. two decode workers that each number their ranks
  // 0..7) so every legend entry names exactly one line.
  const baseCounts = new Map<string, number>();
  for (const engine of withBase) {
    baseCounts.set(engine.base, (baseCounts.get(engine.base) ?? 0) + 1);
  }
  const used = new Set<string>();
  return withBase.map((engine) => {
    let label = engine.base;
    if ((baseCounts.get(engine.base) ?? 0) > 1 && engine.discriminator) {
      label = `${engine.base} (${engine.discriminator})`;
    }
    // The discriminator isn't guaranteed unique either; fall back to a counter
    // so a legend entry never stands for two lines.
    let candidate = label;
    for (let n = 2; used.has(candidate); n++) candidate = `${label} #${n}`;
    used.add(candidate);
    return { engineLabel: candidate, points: engine.points };
  });
}

/**
 * Mean utilization across logical engines on the union of their scrape times.
 *
 * Engines are not scraped in lockstep — different workers (and occasionally a
 * single lagging rank) sit on their own sub-second grid — so grouping on an
 * exact `start_ns` would average whichever subset happened to share that
 * nanosecond. On a disaggregated run that means alternating between
 * "prefill only" and "decode only", which reads as a full-scale sawtooth
 * rather than a cluster average.
 *
 * Each engine therefore holds its last scrape until its next one (a gauge
 * keeps its value between scrapes) and contributes only inside its own
 * observed window, so an engine that starts late or stops early neither
 * pulls the mean toward a stale value nor drops it to zero. A hole in the
 * middle of that window is bounded too — see `carryLimitSeconds`.
 */
function averageAcrossEngines(
  engines: readonly { points: TimeSeriesPoint[] }[],
): TimeSeriesPoint[] {
  const active = engines.filter((engine) => engine.points.length > 0);
  if (active.length === 0) return [];
  // Single engine: its own samples already are the cluster average.
  if (active.length === 1) return active[0]!.points;

  const timeline = [...new Set(active.flatMap((e) => e.points.map((p) => p.t)))].toSorted(
    (a, b) => a - b,
  );
  const cursors: number[] = Array.from({ length: active.length }, () => -1);
  const lastT = active.map((engine) => engine.points.at(-1)!.t);
  const carryLimit = active.map((engine) => carryLimitSeconds(engine.points));
  const out: TimeSeriesPoint[] = [];
  for (const t of timeline) {
    let sum = 0;
    let n = 0;
    for (const [i, engine] of active.entries()) {
      const points = engine.points;
      let cursor = cursors[i]!;
      while (cursor + 1 < points.length && points[cursor + 1]!.t <= t) cursor++;
      cursors[i] = cursor;
      // Before this engine's first scrape or after its last — no value to
      // carry, so it sits out of this tick's mean entirely.
      if (cursor < 0 || t > lastT[i]!) continue;
      // Inside the window but far past the last sample: the engine stopped
      // reporting for a while, so don't average in a stale reading.
      if (t - points[cursor]!.t > carryLimit[i]!) continue;
      sum += points[cursor]!.value;
      n++;
    }
    if (n > 0) out.push({ t, value: sum / n });
  }
  return out;
}

/**
 * How long one engine's last sample may stand in for it: 5x its own median
 * scrape gap. A dropped scrape or two still carries (real runs sit at 1 Hz
 * with gaps never above ~1 s), but a long reporting hole drops the engine
 * out of the mean instead of pinning it to a minutes-old value.
 */
function carryLimitSeconds(points: readonly TimeSeriesPoint[]): number {
  if (points.length < 2) return Number.POSITIVE_INFINITY;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const gap = points[i]!.t - points[i - 1]!.t;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return Number.POSITIVE_INFINITY;
  gaps.sort((a, b) => a - b);
  return 5 * gaps[gaps.length >> 1]!;
}

// ── Canonical scrape grid for summed series (v14) ───────────────────────
//
// `averageAcrossEngines` can evaluate on the union of scrape instants because
// a mean is scale-free: adding more evaluation points doesn't change the level.
// A SUM cannot. Its consumers on the detail page treat one point as one
// one-second bucket — `cumulativeUniqueInputTokens` does `sum += value` to turn
// a token *rate* into a token *total*, and `rollingAverage` is a sample-count
// mean — so the emitted grid has to be uniform and at the native scrape
// cadence, or the totals and the levels both move.

/** Widest interval we will ever call a scrape cadence, in ns (5 minutes). */
const MAX_TICK_NS = 300 * 1e9;
/** Hard cap on emitted ticks, so a malformed cadence can't blow up the row. */
const MAX_GRID_TICKS = 500_000;
/**
 * Slack when snapping a component's first/last sample to the lattice, as a
 * fraction of a tick. A sample sitting a floating-point hair outside the grid
 * should still get its tick rather than losing an endpoint.
 */
const GRID_EPSILON = 1e-6;

/**
 * The blob's native scrape interval, in nanoseconds.
 *
 * Taken as the median gap of the single series with the most timeslices: that
 * series is by construction the best-sampled view of the run, and a median
 * shrugs off the one-off boundary gap that the profiling block leaves where
 * warmup used to be. Returns null when nothing in the blob has two samples to
 * compare, in which case callers fall back to the pre-v14 exact-instant path.
 */
function canonicalTickNs(metrics: MetricsMap): number | null {
  let best: readonly RawSlice[] | null = null;
  for (const metricMeta of Object.values(metrics)) {
    for (const s of metricMeta?.series ?? []) {
      const ts = s.timeslices ?? [];
      if (ts.length > (best?.length ?? 0)) best = ts;
    }
  }
  if (!best || best.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < best.length; i++) {
    const a = best[i - 1]!.start_ns;
    const b = best[i]!.start_ns;
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const gap = b - a;
    if (gap > 0 && gap <= MAX_TICK_NS) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const median = gaps[gaps.length >> 1]!;
  return median > 0 ? median : null;
}

/**
 * Evaluate a step-held component at `t`, or null when it has nothing to say.
 *
 * `cursor` is carried across calls so the whole sweep stays linear; callers
 * must visit `t` in ascending order.
 */
interface StepCursor {
  points: readonly TimeSeriesPoint[];
  carryLimit: number;
  cursor: number;
}

function stepValueAt(state: StepCursor, t: number): number | null {
  const { points } = state;
  while (state.cursor + 1 < points.length && points[state.cursor + 1]!.t <= t) state.cursor++;
  // Outside the component's own observed window it contributes nothing, so a
  // worker that starts late or stops early neither invents load nor forces a
  // zero into the cluster total.
  if (state.cursor < 0 || t > points.at(-1)!.t) return null;
  // Inside the window but long past the last sample: the component stopped
  // reporting, so don't carry a stale reading across the hole.
  if (t - points[state.cursor]!.t > state.carryLimit) return null;
  return points[state.cursor]!.value;
}

/**
 * Sum components onto a uniform grid at the native scrape cadence.
 *
 * Components of one metric are NOT scraped in lockstep: a disaggregated run
 * gives every worker its own `/metrics` endpoint on its own sub-second offset,
 * and even a single-endpoint SGLang run splits its token counters into
 * `is_streaming="true"`/`"false"` series that sit ~16 ms apart. Summing on an
 * exact `start_ns` therefore emitted one point per component per tick, each
 * holding that component's share alone. Downstream that reads as a comb —
 * `rollingAverage` averages the real samples together with the other
 * components' structural gaps, so an 8-worker run's throughput chart drew
 * roughly an eighth of the actual tokens/sec.
 *
 * Each component instead holds its last sample between scrapes (its rate is a
 * step function over its bucket) and the grid samples the sum once per tick.
 * Returns an empty array when there is nothing to place on a grid.
 */
function sumOntoGrid(
  components: readonly (readonly TimeSeriesPoint[])[],
  tickS: number | null,
): TimeSeriesPoint[] {
  const active = components.filter((points) => points.length > 0);
  if (active.length === 0) return [];
  const first = Math.min(...active.map((points) => points[0]!.t));
  const last = Math.max(...active.map((points) => points.at(-1)!.t));
  if (!Number.isFinite(first) || !Number.isFinite(last)) return [];

  // Every summed series shares one lattice anchored at t=0, so metrics that
  // are divided by one another downstream (hit rate = hits/queries, host KV
  // usage = used/total, queue depth = running+waiting) land on identical `t`
  // values and can be joined. Anchoring each metric at its OWN first sample
  // instead silently emptied the hit-rate chart, because `sglang:cached_tokens`
  // starts ~0.18 s off the grid `sglang:prompt_tokens` starts on and the two
  // lattices then never share a point.
  //
  // With no inferable cadence (every series carrying a single timeslice, as in
  // the smallest fixtures) fall back to the union of the components' own
  // instants: still a step-held sum rather than an exact-instant one, just
  // without a regular grid to place it on.
  let timeline: number[];
  if (tickS && tickS > 0) {
    const firstTick = Math.ceil(first / tickS - GRID_EPSILON);
    const lastTick = Math.floor(last / tickS + GRID_EPSILON);
    const ticks = lastTick - firstTick + 1;
    if (ticks < 1 || ticks > MAX_GRID_TICKS) return [];
    timeline = Array.from({ length: ticks }, (_, i) => (firstTick + i) * tickS);
  } else {
    timeline = [...new Set(active.flatMap((points) => points.map((p) => p.t)))].toSorted(
      (a, b) => a - b,
    );
  }

  const states: StepCursor[] = active.map((points) => ({
    points,
    carryLimit: carryLimitSeconds(points),
    cursor: -1,
  }));
  const out: TimeSeriesPoint[] = [];
  for (const t of timeline) {
    let sum = 0;
    let n = 0;
    for (const state of states) {
      const value = stepValueAt(state, t);
      if (value === null) continue;
      sum += value;
      n++;
    }
    // No component covers this tick — emit nothing rather than a false zero.
    if (n > 0) out.push({ t, value: sum });
  }
  return out;
}

/** `sumOntoGrid` over a metric's raw series, resolved to logical components. */
function summedSeries(
  series: readonly RawSeries[] | undefined,
  tOf: (ns: number) => number,
  field: 'avg' | 'rate',
  tickS: number | null,
): TimeSeriesPoint[] {
  const components = resolveComponents(series, tOf, field).map((c) => c.points);
  return sumOntoGrid(components, tickS);
}

/** Index a grid series by `t` so two of them can be divided tick-for-tick. */
function byT(points: readonly TimeSeriesPoint[]): Map<number, number> {
  return new Map(points.map((p) => [p.t, p.value]));
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
  // Grid spacing for every summed series (v14). Null when the blob has nothing
  // with two comparable samples, in which case `sumOntoGrid` emits only the
  // single-component case and multi-component metrics come out empty rather
  // than fragmented.
  const tickNs = canonicalTickNs(metrics);
  const tickS = tickNs === null ? null : tickNs / 1e9;

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
  // One entry per logical engine (v13) — mirrored API-server frontends and the
  // warmup/profiling phase split are collapsed here rather than showing up as
  // extra "engines".
  const engines = resolveLogicalEngines(kvSeries, tOf);
  const kvCacheUsage: TimeSeriesPoint[] = averageAcrossEngines(engines);
  // Per-engine breakdown of the same metric. Emitted only for genuinely
  // multi-engine deployments — with one engine it would just duplicate the
  // cluster-average line.
  const kvCacheUsageByEngine = engines.length > 1 ? engines : [];

  // Prefix cache hit rate per scrape: Σhits.rate / Σqueries.rate across
  // engines, joined on start_ns. SGLang names: cached_tokens / prompt_tokens.
  const hitsSeries = pickSeries('vllm:prefix_cache_hits', 'sglang:cached_tokens');
  const qsSeries = pickSeries(
    'vllm:prefix_cache_queries',
    'vllm:prompt_tokens',
    'sglang:prompt_tokens',
  );
  const hitsOnGrid = summedSeries(hitsSeries, tOf, 'rate', tickS);
  const qsOnGrid = summedSeries(qsSeries, tOf, 'rate', tickS);
  const qsByT = byT(qsOnGrid);
  const prefixCacheHitRate: TimeSeriesPoint[] = [];
  for (const { t, value: h } of hitsOnGrid) {
    const q = qsByT.get(t);
    if (q !== undefined && q > 0) prefixCacheHitRate.push({ t, value: h / q });
  }

  // Queue depth: sum running + waiting across engines per timeslice.
  const runSeries = pickSeries('vllm:num_requests_running', 'sglang:num_running_reqs');
  const waitSeries = pickSeries('vllm:num_requests_waiting', 'sglang:num_queue_reqs');
  const runOnGrid = summedSeries(runSeries, tOf, 'avg', tickS);
  const waitByT = byT(summedSeries(waitSeries, tOf, 'avg', tickS));
  const runByT = byT(runOnGrid);
  const queueDepth: QueueDepthPoint[] = [];
  // Union of timestamps so we surface activity even if one of the gauges
  // didn't report a sample on a given tick.
  const allTimes = new Set<number>([...runByT.keys(), ...waitByT.keys()]);
  for (const t of [...allTimes].toSorted((a, b) => a - b)) {
    const running = runByT.get(t) ?? 0;
    const waiting = waitByT.get(t) ?? 0;
    queueDepth.push({ t, running, waiting, total: running + waiting });
  }

  // Throughput: sum the counter `rate` (already per-second) across engines,
  // on the canonical grid. Takes a fallback chain so vllm:* and sglang:* both
  // work.
  const counterRate = (...names: string[]): TimeSeriesPoint[] =>
    summedSeries(pickSeries(...names), tOf, 'rate', tickS);
  const prefillTps = counterRate('vllm:prompt_tokens', 'sglang:prompt_tokens');
  const decodeTps = counterRate('vllm:generation_tokens', 'sglang:generation_tokens');
  // Tokens served from prefix cache per scrape. Lets the frontend derive
  // "cumulative unique input tokens served" = cumsum(prefillTps) − cumsum(hits).
  const prefixCacheHitsTps = counterRate('vllm:prefix_cache_hits', 'sglang:cached_tokens');

  // SGLang hicache: host-pool KV cache utilization as used/total per
  // timeslice. Both metrics are gauges in absolute tokens. Total stays
  // constant (it's the pool size), used fluctuates.
  const hostTotalByT = byT(
    summedSeries(metrics['sglang:hicache_host_total_tokens']?.series, tOf, 'avg', tickS),
  );
  const hostKvCacheUsage: TimeSeriesPoint[] = [];
  for (const { t, value: used } of summedSeries(
    metrics['sglang:hicache_host_used_tokens']?.series,
    tOf,
    'avg',
    tickS,
  )) {
    const total = hostTotalByT.get(t);
    if (total !== undefined && total > 0) {
      hostKvCacheUsage.push({ t, value: used / total });
    }
  }

  // Per-source prompt tokens — sum across engines per source label.
  //   vllm: vllm:prompt_tokens_by_source has one series per source label
  //         (local_cache_hit, external_cache_hit, miss, ...). Use the
  //         `source`/`reason`/`kind` label as the breakdown key.
  //   sglang: sglang:realtime_tokens uses a `mode` label with values
  //         {prefill_cache, prefill_compute, decode}. Filter to prefill_*
  //         since decode isn't prompt-token volume.
  // Collect the raw series per source label first, then sum each source onto
  // the canonical grid — same reason as the other summed metrics: a source's
  // per-worker series sit on their own scrape offsets, so adding them by exact
  // instant would emit one partial-sum point per worker per tick.
  const promptBySrc = new Map<string, RawSeries[]>();
  // The bucket is created even when the series has no valid timeslices — the
  // SGLang fallback below is gated on `promptBySrc.size === 0`, so an empty
  // vllm breakdown must still suppress it.
  const addSeriesRates = (label: string, series: RawSeries): void => {
    const existing = promptBySrc.get(label);
    if (existing) existing.push(series);
    else promptBySrc.set(label, [series]);
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
  if (promptBySrc.size === 0) {
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
  for (const [source, seriesForSource] of promptBySrc) {
    // Idle ticks are dropped rather than emitted as zeros: this feeds a
    // cumulative stacked area, so a zero adds nothing but payload.
    const arr = summedSeries(seriesForSource, tOf, 'rate', tickS).filter((p) => p.value > 0);
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
        group.metrics[metricName] ??= { series: [] };
        const groupedMetric = group.metrics[metricName];
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
