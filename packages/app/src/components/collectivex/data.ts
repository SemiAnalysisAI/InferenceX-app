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

/**
 * Stable within the newest-first run table. Preserve the six simple patterns,
 * then encode higher indexes as a unique dash/gap/accent tuple so two listed
 * runs never become visually identical merely because their indexes differ by
 * six.
 */
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
): string {
  const transports = system.scale_out_transport
    ? `${system.scale_up_transport}+${system.scale_out_transport}`
    : system.scale_up_transport;
  return `${system.nodes}x${system.gpus_per_node} · domain ${system.scale_up_domain} · ${transports} · ${system.topology_class}`;
}

export function collectiveXLegendLabel(series: CollectiveXSeries): string {
  return `${series.system.sku.toUpperCase()} · ${series.backend} · EP${series.system.ep_size} · ${series.mode} · ${series.phase} · ${series.precision}`;
}

export function collectiveXSeriesLabel(series: CollectiveXSeries | CollectiveXRunSeries): string {
  const runPrefix = 'run_id' in series ? `#${series.run_id} · ` : '';
  return `${runPrefix}${collectiveXLegendLabel(series)}`;
}

export function collectiveXColorKey(series: CollectiveXSeries | CollectiveXRunSeries): string {
  return `${series.system.vendor}_${series.system.sku}_${series.backend}_ep${series.system.ep_size}_${series.mode}_${series.phase}_${series.precision}`;
}

/** Namespace series ids and attach the run's current selection-order style index. */
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
  /** Fixed per-call overhead (µs): the launch/sync/rendezvous floor. */
  alphaUs: number;
  /** Per-GPU bandwidth term (GB/s): the slope of latency vs bytes. */
  betaGbps: number;
  /** Points that entered the fit. */
  pointCount: number;
}

/** Ordinary least squares; returns [intercept, slope]. */
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

/**
 * Separate the bandwidth term (β) from the fixed overhead (α) for one operation
 * across a series' token ladder: latency(bytes) ≈ α + bytes/β. Regresses the
 * per-point latency against the per-GPU payload bytes (raw `payload_bytes` ÷
 * ep_size), so β lands in the same per-GPU GB/s units as the payload-rate axis
 * and α is the fixed overhead in µs. p50 by default (p99 carries tail noise).
 * Mirrors experimental/CollectiveX/bandwidth.py. Returns null when fewer than
 * three points, a degenerate (near-zero-variance) byte axis — e.g. a constant
 * payload across the ladder — or a non-positive slope leaves no bandwidth term.
 */
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
  // Reject a near-constant byte axis (constant payload across the ladder): a
  // relative spread this small carries no real slope, only numeric noise.
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
): CollectiveXChartPoint[] {
  return series.flatMap((item) =>
    item.points.flatMap((point) => {
      const x = point.tokens_per_rank;
      const y = metricValue(point, operation, percentile, yAxis);
      if (!Number.isFinite(x) || x <= 0 || y === null || y <= 0 || !Number.isFinite(y)) return [];
      return [
        {
          seriesId: item.series_id,
          seriesLabel: collectiveXSeriesLabel(item),
          colorKey: collectiveXColorKey(item),
          x,
          y,
          point,
        },
      ];
    }),
  );
}

/**
 * The kv table cell selector, mirroring the harness's summarize: the
 * largest-ISL pull row of a (kind, page) family — the bandwidth-bound point —
 * at its smallest or largest measured batch. Null when the family was not
 * measured (e.g. a page size the sweep dropped).
 */
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

/** A kv case namespaced by its run, with the run's selection-order style index. */
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
  return `${kase.vendor ?? 'unknown'}_${kase.sku}_${kase.backend}_${kase.fabric}_${kase.precision}`;
}

export function collectiveXKvLegendLabel(kase: CollectiveXKvCase): string {
  return `${kase.sku.toUpperCase()} · ${kase.backend} · ${kase.fabric} · ${kase.precision}`;
}

/**
 * Chart points for the kv view. Batch on the x axis reads at the largest
 * measured ISL (the bandwidth-bound point, where concurrency scaling is the
 * story); ISL on the x axis reads at batch 1 (a single request's handoff).
 * Paged rows only: the single-descriptor bulk ceiling stays a table column.
 */
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
