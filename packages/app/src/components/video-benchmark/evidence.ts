import { GPU_SPECS } from '@/lib/gpu-specs';
import { deploymentKey, sharedLayoutCells } from './deployment';
import { hardwareSort } from './hardware';
import { metricValue, type GpuBasis, type MetricOptions, type VideoPoint } from './metrics';
import { latestVideoCells } from './points';

/**
 * Compute-bound evidence read from the measured cells only: board power against
 * the recorded enforced limit, the client-concurrency plateau, and observed
 * cross-hardware speedups against spec-sheet ratios. Every number is derived
 * from published observations or the GPU specs page; missing input reads as
 * null, never 0, so a panel can hide what the data does not support.
 */

const finite = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);
const positive = (n: number | null | undefined): n is number => finite(n) && n > 0;
const ratio = (numerator: number | null, denominator: number | null): number | null =>
  finite(numerator) && positive(denominator) ? numerator / denominator : null;

type MeasuredPoint = VideoPoint & { hardwareKey: string; concurrency: number };
const isMeasured = (p: VideoPoint): p is MeasuredPoint =>
  p.hardwareKey !== null && positive(p.concurrency);

/** Newest observation per (hardware, concurrency) in HW_REGISTRY order, then ascending concurrency. */
function measuredCells(points: VideoPoint[]): MeasuredPoint[] {
  return latestVideoCells(points)
    .filter(isMeasured)
    .toSorted(
      (a, b) =>
        hardwareSort(a.hardwareKey) - hardwareSort(b.hardwareKey) || a.concurrency - b.concurrency,
    );
}

/** The cost tier only enters priced metrics; nothing read here is priced. */
const metricOptions = (basis: GpuBasis): MetricOptions => ({ tier: 'h', basis });

export interface PowerUtilizationRow {
  hardwareKey: string;
  /** Sum of the participating boards' time-weighted mean power during generation. */
  avgPowerW: number | null;
  /** Sum of the same boards' enforced limits recorded around the run, not marketing TDP. */
  enforcedLimitW: number | null;
  percentOfCap: number | null;
}

/** One row per measured hardware, on the deployment layout the hardware share. */
export function powerUtilization(points: VideoPoint[]): PowerUtilizationRow[] {
  return sharedLayoutCells(measuredCells(points)).map((p) => ({
    hardwareKey: p.hardwareKey,
    avgPowerW: positive(p.avgPowerW) ? p.avgPowerW : null,
    enforcedLimitW: positive(p.enforcedLimitW) ? p.enforcedLimitW : null,
    percentOfCap: metricValue(p, 'powerPctCap', metricOptions('participating')),
  }));
}

export interface PowerRange {
  /** Hardware with both a mean power and a recorded limit. */
  measured: number;
  min: number;
  max: number;
}

/** Spread of the measured percentages; null when nothing recorded both power and a limit. */
export function powerRange(rows: PowerUtilizationRow[]): PowerRange | null {
  const values = rows.map((row) => row.percentOfCap).filter(finite);
  if (values.length === 0) return null;
  return { measured: values.length, min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Meter position for a share of the enforced limit. The label beside the meter
 * keeps the measured share, which can exceed 100 % when the mean-power window
 * and the limit recorded around the run skew; the widget declares 0–100, so its
 * fill and ARIA value stay inside that range at 0.1 % resolution.
 */
export function meterPercent(percentOfCap: number): number {
  return Math.min(100, Math.max(0, Math.round(percentOfCap * 10) / 10));
}

export interface ConcurrencyPlateauRow {
  hardwareKey: string;
  concurrency: number;
  videosPerGpuHour: number | null;
  p50: number | null;
  /** Throughput relative to the same hardware's C1 cell; null when C1 is missing. */
  throughputRatioVsC1: number | null;
  /** P50 time to video relative to the same hardware's C1 cell; null when C1 is missing. */
  latencyRatioVsC1: number | null;
}

/**
 * Every measured cell against its hardware's C1 cell. On a batch-one server a
 * flat throughput ratio with latency scaling by C says client concurrency only
 * queues requests. `basis` picks the GPU denominator the rest of the dashboard
 * shows; ratios within one hardware are unaffected unless its allocation changed.
 */
export function concurrencyPlateau(
  points: VideoPoint[],
  basis: GpuBasis = 'participating',
): ConcurrencyPlateauRow[] {
  const options = metricOptions(basis);
  const baseline = new Map(
    sharedLayoutCells(measuredCells(points)).map((p) => [p.hardwareKey, p] as const),
  );
  // Only cells of the baseline's own layout are concurrency steps of that deployment;
  // a hardware with no non-queued cell keeps its rows with null ratios.
  const cells = measuredCells(points).filter((p) => {
    const base = baseline.get(p.hardwareKey);
    return base === undefined || deploymentKey(p) === deploymentKey(base);
  });
  return cells.map((p) => {
    const base = baseline.get(p.hardwareKey);
    const videosPerGpuHour = metricValue(p, 'videosPerGpuHour', options);
    const p50 = positive(p.p50) ? p.p50 : null;
    return {
      hardwareKey: p.hardwareKey,
      concurrency: p.concurrency,
      videosPerGpuHour,
      p50,
      throughputRatioVsC1: ratio(
        videosPerGpuHour,
        base ? metricValue(base, 'videosPerGpuHour', options) : null,
      ),
      latencyRatioVsC1: ratio(p50, base && positive(base.p50) ? base.p50 : null),
    };
  });
}

type QueuedRow = ConcurrencyPlateauRow & { throughputRatioVsC1: number; latencyRatioVsC1: number };
const isQueued = (row: ConcurrencyPlateauRow): row is QueuedRow =>
  row.concurrency > 1 && finite(row.throughputRatioVsC1) && finite(row.latencyRatioVsC1);

export interface PlateauSummary {
  /** Cells above C1 that have a C1 baseline. */
  queued: number;
  /** Largest |throughput ratio − 1| across those cells, in percent. */
  throughputDeviationPct: number;
  /** Latency ratio spread per concurrency, ascending. */
  latency: { concurrency: number; min: number; max: number }[];
}

/** Null when no hardware has a cell above C1 with a baseline: nothing to plateau against. */
export function plateauSummary(rows: ConcurrencyPlateauRow[]): PlateauSummary | null {
  const queued = rows.filter(isQueued);
  if (queued.length === 0) return null;
  const byConcurrency = new Map<number, number[]>();
  for (const row of queued) {
    const list = byConcurrency.get(row.concurrency) ?? [];
    list.push(row.latencyRatioVsC1);
    byConcurrency.set(row.concurrency, list);
  }
  return {
    queued: queued.length,
    throughputDeviationPct:
      Math.max(...queued.map((row) => Math.abs(row.throughputRatioVsC1 - 1))) * 100,
    latency: [...byConcurrency]
      .toSorted(([a], [b]) => a - b)
      .map(([concurrency, values]) => ({
        concurrency,
        min: Math.min(...values),
        max: Math.max(...values),
      })),
  };
}

/** GPU_SPECS names for the campaign hardware; the specs page keys rows by SKU name, not registry key. */
const SPEC_NAME: Readonly<Record<string, string>> = {
  h100: 'H100 SXM',
  h200: 'H200 SXM',
  b200: 'B200 SXM',
  mi355x: 'MI355X',
};

export interface SpecNumbers {
  memoryBandwidthTbps: number | null;
  bf16Tflops: number | null;
  fp8Tflops: number | null;
}

/** `"4.8 TB/s"` → 4.8, `"3350 GB/s"` → 3.35; anything else → null. */
export function parseBandwidthTbps(text: string | null | undefined): number | null {
  const match = /^\s*(?<value>\d+(?:\.\d+)?)\s*(?<unit>[GT])B\/s\s*$/iu.exec(text ?? '');
  if (!match?.groups) return null;
  const value = Number(match.groups.value);
  if (!positive(value)) return null;
  return match.groups.unit.toUpperCase() === 'G' ? value / 1000 : value;
}

/** Per-GPU HBM bandwidth and dense tensor-core peaks from the GPU specs page; null when unlisted. */
export function specNumbers(hardwareKey: string): SpecNumbers {
  const spec = GPU_SPECS.find((entry) => entry.name === SPEC_NAME[hardwareKey]);
  return {
    memoryBandwidthTbps: spec ? parseBandwidthTbps(spec.memoryBandwidth) : null,
    bf16Tflops: spec && positive(spec.bf16) ? spec.bf16 : null,
    fp8Tflops: spec && positive(spec.fp8) ? spec.fp8 : null,
  };
}

export interface ScalingVsSpecRow {
  fromKey: string;
  toKey: string;
  /** C1 P50 of `from` over `to`: how many times faster `to` finished the same clip. */
  observedSpeedup: number | null;
  memoryBandwidthRatio: number | null;
  bf16Ratio: number | null;
  fp8Ratio: number | null;
}

type TimedPoint = MeasuredPoint & { p50: number };
const isTimed = (p: MeasuredPoint): p is TimedPoint => positive(p.p50);

/** Consecutive measured hardware from slowest to fastest P50 on the shared layout, each step against its spec ratios. */
export function scalingVsSpec(points: VideoPoint[]): ScalingVsSpecRow[] {
  const ordered = sharedLayoutCells(measuredCells(points))
    .filter(isTimed)
    .toSorted((a, b) => b.p50 - a.p50);
  return ordered.slice(1).map((to, index) => {
    const from = ordered[index];
    const fromSpec = specNumbers(from.hardwareKey);
    const toSpec = specNumbers(to.hardwareKey);
    return {
      fromKey: from.hardwareKey,
      toKey: to.hardwareKey,
      observedSpeedup: ratio(from.p50, to.p50),
      memoryBandwidthRatio: ratio(toSpec.memoryBandwidthTbps, fromSpec.memoryBandwidthTbps),
      bf16Ratio: ratio(toSpec.bf16Tflops, fromSpec.bf16Tflops),
      fp8Ratio: ratio(toSpec.fp8Tflops, fromSpec.fp8Tflops),
    };
  });
}

export interface SpeedupReading {
  /** Spec ratio the observed speedup sits nearer to, measured in log space because ratios multiply. */
  closest: 'bandwidth' | 'compute';
  /** Where the observed speedup falls relative to the smallest and largest spec ratio. */
  position: 'below' | 'between' | 'above';
  /** False when the two log-distances are within 25 % of each other: the data does not separate them. */
  decisive: boolean;
}

/** Ratio of near to far log-distance below which one spec ratio is called closer. */
const DECISIVE_BELOW = 0.75;

/** Null when the observed speedup or every spec ratio is missing. */
export function readSpeedup(row: ScalingVsSpecRow): SpeedupReading | null {
  const compute = [row.bf16Ratio, row.fp8Ratio].filter(positive);
  if (!positive(row.observedSpeedup) || !positive(row.memoryBandwidthRatio) || compute.length === 0)
    return null;
  const observed = Math.log(row.observedSpeedup);
  const toBandwidth = Math.abs(observed - Math.log(row.memoryBandwidthRatio));
  const toCompute = Math.min(...compute.map((value) => Math.abs(observed - Math.log(value))));
  const near = Math.min(toBandwidth, toCompute);
  const far = Math.max(toBandwidth, toCompute);
  const specs = [row.memoryBandwidthRatio, ...compute];
  const lowest = Math.min(...specs);
  const highest = Math.max(...specs);
  return {
    closest: toBandwidth <= toCompute ? 'bandwidth' : 'compute',
    position:
      row.observedSpeedup < lowest ? 'below' : row.observedSpeedup > highest ? 'above' : 'between',
    decisive: far > 0 && near / far < DECISIVE_BELOW,
  };
}

export interface EvidenceFacts {
  /** Participating GPUs per request when every measured cell agrees. */
  participating: number | null;
  tp: number | null;
  ulysses: number | null;
  /** Valid samples per cell across measured cells. */
  samples: { min: number; max: number } | null;
  /** Shape · duration · fps · steps from the projection's workload label, when every cell agrees. */
  workload: string | null;
  /** Attention backend per hardware, listed only when the recorded backends differ. */
  attention: { hardwareKey: string; attention: string }[];
}

/** The one value every cell shares, or null when they disagree or none recorded it. */
function uniform<T>(values: (T | null)[]): T | null {
  const present = values.filter((value): value is T => value !== null);
  if (present.length === 0) return null;
  return present.every((value) => value === present[0]) ? present[0] : null;
}

/** Caveat inputs read from the cells so the panel never states a number the data does not carry. */
export function evidenceFacts(points: VideoPoint[]): EvidenceFacts {
  const cells = measuredCells(points);
  const shared = sharedLayoutCells(cells);
  const samples = cells.map((p) => p.samples).filter(positive);
  const attention = shared.flatMap((p) =>
    p.server?.attention ? [{ hardwareKey: p.hardwareKey, attention: p.server.attention }] : [],
  );
  return {
    participating: uniform(shared.map((p) => (positive(p.participating) ? p.participating : null))),
    tp: uniform(shared.map((p) => (positive(p.server?.tp) ? p.server.tp : null))),
    ulysses: uniform(shared.map((p) => (positive(p.server?.ulysses) ? p.server.ulysses : null))),
    samples: samples.length > 0 ? { min: Math.min(...samples), max: Math.max(...samples) } : null,
    workload: uniform(cells.map((p) => p.workload.split(' · ').slice(0, 4).join(' · ') || null)),
    attention: uniform(attention.map((entry) => entry.attention)) === null ? attention : [],
  };
}
