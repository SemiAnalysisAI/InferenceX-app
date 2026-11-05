import { gunzipSync, gzipSync } from 'node:zlib';

import {
  CHART_SERIES_VERSION,
  type ChartSeries,
  type MetricSourceSeries,
  type TimeSeriesPoint,
} from './compute-chart-series';

const SUMMARY_FORMAT = 1;
export const CHART_SERIES_SUMMARY_VERSION = CHART_SERIES_VERSION * 100 + SUMMARY_FORMAT;

export interface MetricSourceDescriptor {
  source: MetricSourceSeries['source'];
}

export type ChartSeriesSummary = Omit<ChartSeries, 'version' | 'metricSources'> & {
  metricSources: MetricSourceDescriptor[];
};

export type KvMetricSource = Pick<
  MetricSourceSeries,
  'source' | 'kvCacheUsage' | 'kvCacheUsageByEngine'
>;

function meanOfEngines(engines: readonly { points: TimeSeriesPoint[] }[]): TimeSeriesPoint[] {
  const active = engines.filter((engine) => engine.points.length > 0);
  if (active.length === 0) return [];
  if (active.length === 1) return active[0]!.points;
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

function collapseKvByWorker(
  sources: readonly KvMetricSource[],
): { engineLabel: string; points: TimeSeriesPoint[] }[] | null {
  if (sources.length < 2) return null;
  const entries = sources
    .map((entry) => ({
      source: entry.source,
      engines:
        entry.kvCacheUsageByEngine?.length > 0
          ? entry.kvCacheUsageByEngine
          : entry.kvCacheUsage.length > 0
            ? [{ points: entry.kvCacheUsage }]
            : [],
    }))
    .filter((entry) => entry.engines.length > 0);
  if (entries.length < 2) return null;
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
    prefixCacheHitsTps: series.prefixCacheHitsTps ?? [],
    hostKvCacheUsage: series.hostKvCacheUsage ?? [],
    kvCacheUsageByEngine: collapseKvByWorker(sources) ?? series.kvCacheUsageByEngine ?? [],
    metricSources: sources.map(({ source }) => ({ source })),
  };
}

function compareJsonbKeys(a: string, b: string): number {
  const bytesA = Buffer.byteLength(a);
  const bytesB = Buffer.byteLength(b);
  if (bytesA !== bytesB) return bytesA - bytesB;
  if (bytesA === a.length && bytesB === b.length) return a < b ? -1 : a > b ? 1 : 0;
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

function inJsonbKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inJsonbKeyOrder);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([a], [b]) => compareJsonbKeys(a, b))
      .map(([key, item]) => [key, inJsonbKeyOrder(item)]),
  );
}

export function encodeChartSeriesSummary(chartSeriesJson: string): Buffer {
  const series = inJsonbKeyOrder(JSON.parse(chartSeriesJson)) as ChartSeries;
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
