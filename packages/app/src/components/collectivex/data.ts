import { GPU_KEYS } from '@semianalysisai/inferencex-constants';

import type { Locale } from '@/lib/i18n/i18n';

import type {
  CollectiveXChartPoint,
  CollectiveXComponent,
  CollectiveXKvCase,
  CollectiveXKvRow,
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

const COLLECTIVEX_CONCLUSION_LABELS = {
  en: {
    action_required: 'action_required',
    cancelled: 'cancelled',
    failure: 'failure',
    neutral: 'neutral',
    skipped: 'skipped',
    stale: 'stale',
    startup_failure: 'startup_failure',
    success: 'success',
    timed_out: 'timed_out',
  },
  zh: {
    action_required: '需要处理',
    cancelled: '已取消',
    failure: '失败',
    neutral: '中立',
    skipped: '已跳过',
    stale: '已过期',
    startup_failure: '启动失败',
    success: '成功',
    timed_out: '超时',
  },
} as const;

const COLLECTIVEX_MODE_LABELS_ZH: Record<CollectiveXMode, string> = {
  normal: '常规',
  'low-latency': '低延迟',
};

const COLLECTIVEX_PHASE_LABELS_ZH: Record<CollectiveXPhase, string> = {
  decode: '解码',
  prefill: '预填充',
};

export function collectiveXConclusionLabel(conclusion: string | null, locale: Locale): string {
  if (conclusion === null) return locale === 'zh' ? '待处理' : 'pending';
  const labels = COLLECTIVEX_CONCLUSION_LABELS[locale];
  return conclusion in labels
    ? labels[conclusion as keyof typeof labels]
    : locale === 'zh'
      ? '未知状态'
      : conclusion;
}

export function normalizeCollectiveXSku(sku: string): string {
  const normalized = sku.trim().toLowerCase();
  const base = normalized.split(':').at(-1)?.split('-')[0] ?? normalized;
  return GPU_KEYS.has(base) ? base : normalized;
}

export function collectiveXSkuLabel(sku: string): string {
  return normalizeCollectiveXSku(sku).toUpperCase();
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

export function collectiveXLegendLabel(series: CollectiveXSeries, locale: Locale = 'en'): string {
  const mode = locale === 'zh' ? COLLECTIVEX_MODE_LABELS_ZH[series.mode] : series.mode;
  const phase = locale === 'zh' ? COLLECTIVEX_PHASE_LABELS_ZH[series.phase] : series.phase;
  return `${collectiveXSkuLabel(series.system.sku)} · ${series.backend} · EP${series.system.ep_size} · ${mode} · ${phase} · ${series.precision}`;
}

export function collectiveXSeriesLabel(
  series: CollectiveXSeries | CollectiveXRunSeries,
  locale: Locale = 'en',
): string {
  const runPrefix = 'run_id' in series ? `#${series.run_id} · ` : '';
  return `${runPrefix}${collectiveXLegendLabel(series, locale)}`;
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
    if (latency <= 0) continue;
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

export function collectiveXKvCell(
  rows: CollectiveXKvRow[],
  kind: CollectiveXKvRow['kind'],
  pageTokens: number | null,
  batch: 'min' | 'max',
): CollectiveXKvRow | null {
  const matching = rows.filter(
    (row) => row.kind === kind && row.page_tokens === pageTokens && row.op === 'pull',
  );
  if (matching.length === 0) return null;
  const isl = Math.max(...matching.map((row) => row.isl));
  const atIsl = matching.filter((row) => row.isl === isl);
  const pick = (better: (a: number, b: number) => boolean) =>
    atIsl.reduce((best, row) => (better(row.batch, best.batch) ? row : best));
  return batch === 'min' ? pick((a, b) => a < b) : pick((a, b) => a > b);
}

export type CollectiveXKvRunCase = CollectiveXKvCase & { run_id: string; run_index: number };

export interface CollectiveXKvChartSelection {
  x: 'batch' | 'isl';
  y: 'bandwidth' | 'latency';
  op: 'pull' | 'push';
  pageTokens: number;
}

export interface CollectiveXKvChartPoint {
  seriesId: string;
  seriesLabel: string;
  colorKey: string;
  x: number;
  y: number;
  row: CollectiveXKvRow;
}

export function collectiveXKvColorKey(kase: CollectiveXKvCase): string {
  return `${kase.vendor ?? 'unknown'}_${normalizeCollectiveXSku(kase.sku)}_${kase.backend}_${kase.fabric}_${kase.precision}`;
}

export function collectiveXKvLegendLabel(kase: CollectiveXKvCase): string {
  return `${collectiveXSkuLabel(kase.sku)} · ${kase.backend} · ${kase.fabric} · ${kase.precision}`;
}

export interface CollectiveXKvFrontierSelection {
  op: 'pull' | 'push';
  pageTokens: number;
  isl?: number;
}

export interface CollectiveXKvFrontierPoint {
  seriesId: string;
  seriesLabel: string;
  colorKey: string;
  sku: string;
  x: number;
  y: number;
  onSeriesFrontier: boolean;
  onSkuFrontier: boolean;
  row: CollectiveXKvRow;
}

function frontierBeats(
  a: Pick<CollectiveXKvFrontierPoint, 'x' | 'y'>,
  b: Pick<CollectiveXKvFrontierPoint, 'x' | 'y'>,
): boolean {
  return a.x === b.x && a.y > b.y;
}

export function collectiveXKvFrontierPoints(
  cases: readonly CollectiveXKvRunCase[],
  selection: CollectiveXKvFrontierSelection,
): CollectiveXKvFrontierPoint[] {
  const points = cases.flatMap((kase) => {
    const matching = kase.rows.filter(
      (row) =>
        row.kind === 'paged' && row.op === selection.op && row.page_tokens === selection.pageTokens,
    );
    return matching.flatMap((row) => {
      const x = row.isl;
      const y = row.gbps_p50;
      if (!Number.isFinite(x) || x <= 0 || !Number.isFinite(y) || y <= 0) return [];
      return [
        {
          seriesId: `${kase.run_id}:${kase.case_id}`,
          seriesLabel: `#${kase.run_id} · ${collectiveXKvLegendLabel(kase)}`,
          colorKey: collectiveXKvColorKey(kase),
          sku: normalizeCollectiveXSku(kase.sku),
          x,
          y,
          onSeriesFrontier: false,
          onSkuFrontier: false,
          row,
        },
      ];
    });
  });
  for (const point of points) {
    point.onSeriesFrontier = !points.some(
      (other) => other.seriesId === point.seriesId && frontierBeats(other, point),
    );
    point.onSkuFrontier = !points.some(
      (other) => other.sku === point.sku && frontierBeats(other, point),
    );
  }
  return points;
}

export function collectiveXKvOverlapPoints(
  cases: readonly CollectiveXKvRunCase[],
  selection: CollectiveXKvFrontierSelection,
): CollectiveXKvChartPoint[] {
  return cases.flatMap((kase) => {
    const matching = kase.rows.filter(
      (row) =>
        row.kind === 'paged' && row.op === selection.op && row.page_tokens === selection.pageTokens,
    );
    if (matching.length === 0) return [];
    const isl = selection.isl ?? Math.max(...matching.map((row) => row.isl));
    const atIsl = matching.filter((row) => row.isl === isl);
    const baseline = atIsl.find((row) => row.batch === 1);
    if (!baseline || !(baseline.gbps_p50 > 0)) return [];
    const seriesId = `${kase.run_id}:${kase.case_id}`;
    return atIsl.flatMap((row) => {
      const y = row.gbps_p50 / baseline.gbps_p50;
      if (!Number.isFinite(y) || y <= 0) return [];
      return [
        {
          seriesId,
          seriesLabel: `#${kase.run_id} · ${collectiveXKvLegendLabel(kase)}`,
          colorKey: collectiveXKvColorKey(kase),
          x: row.batch,
          y,
          row,
        },
      ];
    });
  });
}

export function collectiveXKvIslValues(
  cases: readonly CollectiveXKvRunCase[],
  selection: Pick<CollectiveXKvFrontierSelection, 'op' | 'pageTokens'>,
): number[] {
  const values = new Set<number>();
  for (const kase of cases) {
    for (const row of kase.rows) {
      if (
        row.kind === 'paged' &&
        row.op === selection.op &&
        row.page_tokens === selection.pageTokens
      ) {
        values.add(row.isl);
      }
    }
  }
  return [...values].toSorted((a, b) => a - b);
}

export function collectiveXKvPageValues(cases: readonly CollectiveXKvRunCase[]): number[] {
  const values = new Set<number>();
  for (const kase of cases) {
    for (const row of kase.rows) {
      if (row.kind === 'paged' && row.page_tokens !== null) values.add(row.page_tokens);
    }
  }
  return [...values].toSorted((a, b) => b - a);
}

export interface CollectiveXKvWireCeilingPoint {
  x: number;
  y: number;
  row: CollectiveXKvRow;
}

export function collectiveXKvWireCeilings(
  cases: readonly CollectiveXKvRunCase[],
  op: 'pull' | 'push',
): Map<string, CollectiveXKvWireCeilingPoint[]> {
  const ceilings = new Map<string, CollectiveXKvWireCeilingPoint[]>();
  for (const kase of cases) {
    const byIsl = new Map<number, CollectiveXKvRow>();
    for (const row of kase.rows) {
      if (row.kind !== 'bulk' || row.op !== op) continue;
      if (!Number.isFinite(row.isl) || row.isl <= 0) continue;
      if (!Number.isFinite(row.gbps_p50) || row.gbps_p50 <= 0) continue;
      const best = byIsl.get(row.isl);
      if (!best || row.gbps_p50 > best.gbps_p50) byIsl.set(row.isl, row);
    }
    if (byIsl.size === 0) continue;
    ceilings.set(
      `${kase.run_id}:${kase.case_id}`,
      [...byIsl.values()]
        .toSorted((a, b) => a.isl - b.isl)
        .map((row) => ({ x: row.isl, y: row.gbps_p50, row })),
    );
  }
  return ceilings;
}

export function collectiveXKvChartPoints(
  cases: readonly CollectiveXKvRunCase[],
  selection: CollectiveXKvChartSelection,
): CollectiveXKvChartPoint[] {
  return cases.flatMap((kase) => {
    const matching = kase.rows.filter(
      (row) =>
        row.kind === 'paged' && row.op === selection.op && row.page_tokens === selection.pageTokens,
    );
    if (matching.length === 0) return [];
    const rows =
      selection.x === 'batch'
        ? matching.filter((row) => row.isl === Math.max(...matching.map((item) => item.isl)))
        : matching.filter((row) => row.batch === 1);
    const seriesId = `${kase.run_id}:${kase.case_id}`;
    return rows.map((row) => ({
      seriesId,
      seriesLabel: `#${kase.run_id} · ${collectiveXKvLegendLabel(kase)}`,
      colorKey: collectiveXKvColorKey(kase),
      x: selection.x === 'batch' ? row.batch : row.isl,
      y: selection.y === 'bandwidth' ? row.gbps_p50 : row.latency_ms.p50,
      row,
    }));
  });
}
