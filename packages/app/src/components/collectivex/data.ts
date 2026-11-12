import { GPU_KEYS } from '@semianalysisai/inferencex-constants';

import type { Locale } from '@/lib/i18n/i18n';

import type {
  CollectiveXChartPoint,
  CollectiveXComponent,
  CollectiveXMode,
  CollectiveXOperation,
  CollectiveXPercentile,
  CollectiveXPhase,
  CollectiveXPoint,
  CollectiveXPrecision,
  CollectiveXRunSeries,
  CollectiveXSeries,
  CollectiveXYAxis,
} from './types';

export interface CollectiveXSeriesSelection {
  epSize: number;
  phase: CollectiveXPhase;
  modes: readonly CollectiveXMode[];
  precision: CollectiveXPrecision;
}

const BASE_RUN_DASHARRAYS = ['none', '9 4', '3 3', '10 3 2 3', '2 3', '12 3 2 3'] as const;

const COLLECTIVEX_MODE_LABELS_ZH: Record<CollectiveXMode, string> = {
  normal: '常规',
  'low-latency': '低延迟',
};

const COLLECTIVEX_PHASE_LABELS_ZH: Record<CollectiveXPhase, string> = {
  decode: '解码',
  prefill: '预填充',
};

export function normalizeCollectiveXSku(sku: string): string {
  const normalized = sku.trim().toLowerCase();
  const base = normalized.split(':').at(-1)?.split('-')[0] ?? normalized;
  return GPU_KEYS.has(base) ? base : normalized;
}

export function collectiveXSkuLabel(sku: string): string {
  return normalizeCollectiveXSku(sku).toUpperCase();
}

/** Display names for backends whose project styles the name differently from the backend id. */
const COLLECTIVEX_BACKEND_LABELS: Record<string, string> = {
  mori: 'MoRI',
  nixl: 'NIXL',
  mooncake: 'Mooncake',
};

export function collectiveXBackendLabel(backend: string): string {
  return COLLECTIVEX_BACKEND_LABELS[backend] ?? backend;
}

export function collectiveXCaseLabel(label: string, sku: string): string {
  return label.startsWith(sku) ? `${collectiveXSkuLabel(sku)}${label.slice(sku.length)}` : label;
}

export function collectiveXRunDasharray(runIndex: number): string {
  const normalized = Math.max(0, Math.trunc(runIndex));
  if (normalized < BASE_RUN_DASHARRAYS.length) return BASE_RUN_DASHARRAYS[normalized];
  const encoded = normalized - BASE_RUN_DASHARRAYS.length;
  const dash = 4 + (encoded % 7);
  const gap = 3 + (Math.floor(encoded / 7) % 7);
  const accent = 1 + Math.floor(encoded / 49);
  return `${dash} 3 ${accent} ${gap}`;
}

export function collectiveXTopologyLabel(
  system: Pick<
    CollectiveXSeries['system'],
    | 'nodes'
    | 'gpus_per_node'
    | 'scale_up_domain'
    | 'scale_up_transport'
    | 'scale_out_transport'
    | 'topology_class'
  >,
  locale: Locale = 'en',
): string {
  const transports = system.scale_out_transport
    ? `${system.scale_up_transport}+${system.scale_out_transport}`
    : system.scale_up_transport;
  const domain =
    locale === 'zh' ? `域内芯片数 ${system.scale_up_domain}` : `domain ${system.scale_up_domain}`;
  return `${system.nodes}x${system.gpus_per_node} · ${domain} · ${transports} · ${system.topology_class}`;
}

/** A dagger on series no engine can select today; the chart carries the footnote. */
export function collectiveXCandidateMark(series: Pick<CollectiveXSeries, 'maturity'>): string {
  return series.maturity === 'candidate' ? ' †' : '';
}

export function collectiveXLegendLabel(series: CollectiveXSeries, locale: Locale = 'en'): string {
  const mode = locale === 'zh' ? COLLECTIVEX_MODE_LABELS_ZH[series.mode] : series.mode;
  const phase = locale === 'zh' ? COLLECTIVEX_PHASE_LABELS_ZH[series.phase] : series.phase;
  return `${collectiveXSkuLabel(series.system.sku)} · ${collectiveXBackendLabel(series.backend)} · EP${series.system.ep_size} · ${mode} · ${phase} · ${series.precision}${collectiveXCandidateMark(series)}`;
}

export function collectiveXSeriesLabel(
  series: CollectiveXSeries | CollectiveXRunSeries,
  locale: Locale = 'en',
): string {
  return collectiveXLegendLabel(series, locale);
}

export function collectiveXColorKey(series: CollectiveXSeries | CollectiveXRunSeries): string {
  return `${series.system.vendor}_${normalizeCollectiveXSku(series.system.sku)}_${series.backend}_ep${series.system.ep_size}_${series.mode}_${series.phase}_${series.precision}`;
}

export function collectiveXSeriesForRun(
  series: readonly CollectiveXSeries[],
  runId: string,
  runIndex = 0,
): CollectiveXRunSeries[] {
  return series.map((item) => ({
    ...item,
    series_id: `${runId}:${item.series_id}`,
    run_id: runId,
    run_index: runIndex,
  }));
}

export function seriesMatchesSelection(
  series: CollectiveXSeries,
  selection: CollectiveXSeriesSelection,
): boolean {
  return (
    series.system.ep_size === selection.epSize &&
    series.phase === selection.phase &&
    selection.modes.includes(series.mode) &&
    series.precision === selection.precision
  );
}

export function metricValue(
  point: CollectiveXPoint,
  operation: CollectiveXOperation,
  percentile: CollectiveXPercentile,
  yAxis: CollectiveXYAxis,
): number | null {
  const component: CollectiveXComponent | null = point.components[operation];
  if (component === null) return null;
  if (yAxis === 'latency') return component.latency_us[percentile];
  if (yAxis === 'tokens-per-second') {
    return operation === 'roundtrip'
      ? point.roundtrip_token_rate_at_latency_percentile[percentile]
      : null;
  }
  if (yAxis === 'payload-rate') {
    return component.payload_data_rate_gbps_at_latency_percentile?.[percentile] ?? null;
  }
  return component.activation_data_rate_gbps_at_latency_percentile?.[percentile] ?? null;
}

interface CollectiveXFit {
  alphaUs: number;
  betaGbps: number;
  pointCount: number;
}

function ols(xs: number[], ys: number[]): [number, number] {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2;
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
  }
  const slope = sxy / sxx;
  return [meanY - slope * meanX, slope];
}

export function fitAlphaBeta(
  series: CollectiveXSeries,
  operation: CollectiveXOperation,
  percentile: CollectiveXPercentile = 'p50',
): CollectiveXFit | null {
  const ep = Math.max(1, series.system.ep_size);
  const bytesPerGpu: number[] = [];
  const latencies: number[] = [];
  for (const point of series.points) {
    const component = point.components[operation];
    if (component === null || component.payload_bytes === null) continue;
    const latency = component.latency_us[percentile];
    if (latency === null || latency <= 0) continue;
    bytesPerGpu.push(component.payload_bytes / ep);
    latencies.push(latency);
  }
  if (bytesPerGpu.length < 3) return null;
  const min = Math.min(...bytesPerGpu);
  const max = Math.max(...bytesPerGpu);
  if (max - min <= 1e-9 * max) return null;
  const [alphaUs, slopeUsPerByte] = ols(bytesPerGpu, latencies);
  if (slopeUsPerByte <= 0) return null;
  return { alphaUs, betaGbps: 1e-3 / slopeUsPerByte, pointCount: bytesPerGpu.length };
}

const COLLECTIVEX_LATENCY_PERCENTILES = ['p50', 'p90', 'p95', 'p99'] as const;

/**
 * Sweep artifacts emit null for percentiles a shard sampled too few times to
 * estimate, so each value is formatted independently.
 */
export function formatCollectiveXLatencyPercentiles(
  component: CollectiveXComponent | null,
  unavailable: string,
): string {
  if (component === null) return unavailable;
  const latency: Partial<Record<CollectiveXPercentile, number | null>> = component.latency_us;
  const values = COLLECTIVEX_LATENCY_PERCENTILES.map((percentile) => {
    const value = latency[percentile];
    return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '-';
  });
  return `${values.join(' / ')} µs`;
}

export function chartPoints(
  series: CollectiveXSeries[],
  operation: CollectiveXOperation,
  percentile: CollectiveXPercentile,
  yAxis: CollectiveXYAxis,
  locale: Locale = 'en',
): CollectiveXChartPoint[] {
  return series.flatMap((item) =>
    item.points.flatMap((point) => {
      const x = point.tokens_per_rank;
      const y = metricValue(point, operation, percentile, yAxis);
      if (!Number.isFinite(x) || x <= 0 || y === null || y <= 0 || !Number.isFinite(y)) return [];
      return [
        {
          seriesId: item.series_id,
          seriesLabel: collectiveXSeriesLabel(item, locale),
          colorKey: collectiveXColorKey(item),
          x,
          y,
          point,
        },
      ];
    }),
  );
}

/** One library-and-mode value inside a SKU range at one token count. */
export interface CollectiveXRangeMember {
  seriesId: string;
  backend: string;
  label: string;
  y: number;
  point: CollectiveXPoint;
}

/** A SKU range at one token count: the lowest, median and highest value across its series. */
export interface CollectiveXRangePoint {
  x: number;
  lo: number;
  mid: number;
  hi: number;
  /** Distinct libraries among the members (a library can contribute one series per mode). */
  libraries: number;
  /** Every contributing series, best first for the y-axis (lowest latency, highest rate). */
  members: CollectiveXRangeMember[];
}

/** Every library and selected mode of one SKU, EP size and run, combined into one band. */
export interface CollectiveXRangeBand {
  id: string;
  label: string;
  colorKey: string;
  runIndex: number;
  points: CollectiveXRangePoint[];
}

export function collectiveXRangeColorKey(series: CollectiveXSeries | CollectiveXRunSeries): string {
  return `${series.system.vendor}_${normalizeCollectiveXSku(series.system.sku)}_ep${series.system.ep_size}_range`;
}

function rangeMemberLabel(series: CollectiveXSeries, locale: Locale): string {
  const mode = locale === 'zh' ? COLLECTIVEX_MODE_LABELS_ZH[series.mode] : series.mode;
  return `${collectiveXBackendLabel(series.backend)} · ${mode}${collectiveXCandidateMark(series)}`;
}

/**
 * Combine the given series into one band per (run, SKU, EP size): at each token count with any
 * value, the band spans the lowest to the highest value across every library and mode, and its
 * line is their median. A token count only one series measured is a point band (lo = mid = hi).
 */
export function collectiveXRangeBands(
  series: readonly CollectiveXRunSeries[],
  operation: CollectiveXOperation,
  percentile: CollectiveXPercentile,
  yAxis: CollectiveXYAxis,
  locale: Locale = 'en',
): CollectiveXRangeBand[] {
  const higherIsBetter = yAxis !== 'latency';
  const bands = new Map<
    string,
    { band: Omit<CollectiveXRangeBand, 'points'>; byX: Map<number, CollectiveXRangeMember[]> }
  >();
  for (const item of series) {
    const id = `${item.run_id}:${collectiveXRangeColorKey(item)}`;
    let entry = bands.get(id);
    if (!entry) {
      entry = {
        band: {
          id,
          label: `${collectiveXSkuLabel(item.system.sku)} · EP${item.system.ep_size}`,
          colorKey: collectiveXRangeColorKey(item),
          runIndex: item.run_index,
        },
        byX: new Map(),
      };
      bands.set(id, entry);
    }
    for (const point of item.points) {
      const x = point.tokens_per_rank;
      const y = metricValue(point, operation, percentile, yAxis);
      if (!Number.isFinite(x) || x <= 0 || y === null || y <= 0 || !Number.isFinite(y)) continue;
      const members = entry.byX.get(x) ?? [];
      members.push({
        seriesId: item.series_id,
        backend: item.backend,
        label: rangeMemberLabel(item, locale),
        y,
        point,
      });
      entry.byX.set(x, members);
    }
  }
  return [...bands.values()]
    .map(({ band, byX }) => ({
      ...band,
      points: [...byX]
        .map(([x, members]) => {
          const ys = members.map((member) => member.y).toSorted((a, b) => a - b);
          const middle = Math.floor(ys.length / 2);
          const mid = ys.length % 2 === 1 ? ys[middle] : (ys[middle - 1] + ys[middle]) / 2;
          return {
            x,
            lo: ys[0],
            mid,
            hi: ys.at(-1)!,
            libraries: new Set(members.map((member) => member.backend)).size,
            members: members.toSorted((a, b) => (higherIsBetter ? b.y - a.y : a.y - b.y)),
          };
        })
        .toSorted((a, b) => a.x - b.x),
    }))
    .filter((band) => band.points.length > 0)
    .toSorted((a, b) => a.label.localeCompare(b.label));
}
