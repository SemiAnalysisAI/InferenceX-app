/**
 * The part of `/api/v1/trace-server-metrics` derived from `chart_series`,
 * precomputed at ingest into `agentic_trace_replay.chart_series_summary_gz`.
 *
 * `chart_series` keeps every metric source's full series next to the
 * aggregate ones (52 MB of JSON on the largest point), and the route needs
 * only the aggregates, a per-worker KV overlay averaged from the sources, and
 * the source descriptors. Reading the whole JSONB to rebuild that on every
 * request shipped up to 47 MB from the database for a 6 MB response.
 *
 * The stored bytes are gzip JSON of exactly what the route builds from the
 * jsonb value, so serving them is byte-identical to deriving them.
 */

import { gunzipSync, gzipSync } from 'node:zlib';

import {
  CHART_SERIES_VERSION,
  type ChartSeries,
  type MetricSourceSeries,
  type TimeSeriesPoint,
} from './compute-chart-series';

/**
 * Bump with any change to how the summary is derived (`summarizeChartSeries`
 * and the overlay below), so stored summaries stop being served until the
 * backfill rewrites them. A `CHART_SERIES_VERSION` bump rolls it as well.
 */
const SUMMARY_FORMAT = 1;
export const CHART_SERIES_SUMMARY_VERSION = CHART_SERIES_VERSION * 100 + SUMMARY_FORMAT;

export interface MetricSourceDescriptor {
  source: MetricSourceSeries['source'];
}

/** The route payload's series fields, in response order. */
export type ChartSeriesSummary = Omit<ChartSeries, 'version' | 'metricSources'> & {
  metricSources: MetricSourceDescriptor[];
};

export type KvMetricSource = Pick<
  MetricSourceSeries,
  'source' | 'kvCacheUsage' | 'kvCacheUsageByEngine'
>;

/** Mean of several engine series, matched on scrape instant. */
function meanOfEngines(engines: readonly { points: TimeSeriesPoint[] }[]): TimeSeriesPoint[] {
  const active = engines.filter((engine) => engine.points.length > 0);
  if (active.length === 0) return [];
  if (active.length === 1) return active[0]!.points;
  // Engines inside one worker are scraped together, so they share instants and
  // a pointwise mean is exact. A `t` only some of them reported averages those,
  // rather than counting the absent ones as zero.
  const byT = new Map<number, { sum: number; n: number }>();
  for (const engine of active) {
    for (const point of engine.points) {
      const at = byT.get(point.t);
      if (at) {
        at.sum += point.value;
        at.n++;
      } else {
        byT.set(point.t, { sum: point.value, n: 1 });
      }
    }
  }
  return [...byT.entries()]
    .toSorted((a, b) => a[0] - b[0])
    .map(([t, { sum, n }]) => ({ t, value: sum / n }));
}

/**
 * All-endpoints KV overlay: one line per WORKER, averaged over the ranks it
 * owns.
 *
 * `chart_series.kvCacheUsageByEngine` is per rank, which stops being readable
 * on a PD-disaggregated run — 6 prefill workers at DP4 plus a decode worker is
 * 28 lines, and ranks inside one worker track each other closely, so the
 * comparison worth seeing is worker-vs-worker.
 *
 * Derived from `chart_series` rather than inside the ETL because everything it
 * needs is already stored: each source carries its own per-rank breakdown.
 * Keeping it out of `chart_series` means no chart-series version bump for what
 * is a presentation choice. Changing it bumps `SUMMARY_FORMAT` instead.
 *
 * Returns null when collapsing would not help — a single worker, or a run with
 * no per-source data, keeps the per-rank overlay, which is exactly where rank
 * skew is the signal.
 */
function collapseKvByWorker(
  sources: readonly KvMetricSource[],
): { engineLabel: string; points: TimeSeriesPoint[] }[] | null {
  if (sources.length < 2) return null;
  const entries = sources
    .map((entry) => ({
      source: entry.source,
      // Single-pool workers intentionally omit the per-engine array because
      // it would duplicate their aggregate line. Preserve that worker when a
      // sibling with multiple ranks makes the all-endpoints collapse useful.
      engines:
        entry.kvCacheUsageByEngine?.length > 0
          ? entry.kvCacheUsageByEngine
          : entry.kvCacheUsage.length > 0
            ? [{ points: entry.kvCacheUsage }]
            : [],
    }))
    .filter((entry) => entry.engines.length > 0);
  if (entries.length < 2) return null;
  // Already one engine per worker — nothing to average, so leave the stored
  // labels alone rather than relabelling for no gain.
  const totalEngines = entries.reduce((sum, entry) => sum + entry.engines.length, 0);
  if (totalEngines <= entries.length) return null;

  const workersPerRole = new Map<string, number>();
  for (const { source } of entries) {
    workersPerRole.set(source.role, (workersPerRole.get(source.role) ?? 0) + 1);
  }
  const used = new Set<string>();
  return entries.map(({ source, engines }, index) => {
    const worker = source.workerId;
    const short = worker && worker.length > 4 ? worker.slice(-4) : worker;
    // Qualify by worker only when the role actually has several, so a lone
    // decode worker reads "decode" rather than "decode 0842".
    const base =
      (workersPerRole.get(source.role) ?? 0) > 1 && short
        ? `${source.role} ${short}`
        : (source.role ?? short ?? `#${index}`);
    let label = base;
    for (let n = 2; used.has(label); n++) label = `${base} #${n}`;
    used.add(label);
    return { engineLabel: label, points: meanOfEngines(engines) };
  });
}

/** The route's series fields from a chart series and its sources' KV series. */
export function summarizeChartSeries(
  series: Omit<ChartSeries, 'metricSources'>,
  sources: readonly KvMetricSource[],
): ChartSeriesSummary {
  return {
    startNs: series.startNs,
    endNs: series.endNs,
    durationS: series.durationS,
    timeslicesCount: series.timeslicesCount,
    kvCacheUsage: series.kvCacheUsage,
    prefixCacheHitRate: series.prefixCacheHitRate,
    queueDepth: series.queueDepth,
    promptTokensBySource: series.promptTokensBySource,
    prefillTps: series.prefillTps,
    decodeTps: series.decodeTps,
    // v2 chart_series rows pre-backfill don't have this field — default to []
    prefixCacheHitsTps: series.prefixCacheHitsTps ?? [],
    hostKvCacheUsage: series.hostKvCacheUsage ?? [],
    // v8+ field; older chart_series rows lack it → omit per-engine overlay.
    kvCacheUsageByEngine: collapseKvByWorker(sources) ?? series.kvCacheUsageByEngine ?? [],
    // v9+ field; old rows are served without a source selector until backfilled.
    metricSources: sources.map(({ source }) => ({ source })),
  };
}

/** Orders keys the way jsonb stores them. Shorter UTF-8 keys come first, then bytewise order. */
function compareJsonbKeys(a: string, b: string): number {
  const bytesA = Buffer.byteLength(a);
  const bytesB = Buffer.byteLength(b);
  if (bytesA !== bytesB) return bytesA - bytesB;
  // ASCII code units order like their bytes.
  if (bytesA === a.length && bytesB === b.length) return a < b ? -1 : a > b ? 1 : 0;
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

/** A parsed JSON value with every object's keys inserted in jsonb order. */
function inJsonbKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inJsonbKeyOrder);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([a], [b]) => compareJsonbKeys(a, b))
      .map(([key, item]) => [key, inJsonbKeyOrder(item)]),
  );
}

/**
 * Gzip summary of the `chart_series` stored as `chartSeriesJson`.
 *
 * The route reads `chart_series` back from jsonb, which keeps each number's
 * decimal value but reorders object keys, and serializes what it builds from
 * that. Summarizing the JSON with its keys in jsonb order therefore yields the
 * route's bytes exactly.
 */
export function encodeChartSeriesSummary(chartSeriesJson: string): Buffer {
  const series = inJsonbKeyOrder(JSON.parse(chartSeriesJson)) as ChartSeries;
  // Mirrors the route's per-source projection, which defaults both arrays.
  const sources: KvMetricSource[] = (series.metricSources ?? []).map((source) => ({
    source: source.source,
    kvCacheUsage: source.kvCacheUsage ?? [],
    kvCacheUsageByEngine: source.kvCacheUsageByEngine ?? [],
  }));
  return gzipSync(JSON.stringify(summarizeChartSeries(series, sources)));
}

export function decodeChartSeriesSummary(gz: Uint8Array): ChartSeriesSummary {
  return JSON.parse(gunzipSync(gz).toString('utf8')) as ChartSeriesSummary;
}
