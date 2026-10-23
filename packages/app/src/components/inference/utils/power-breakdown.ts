import type { AggDataEntry, InferenceData } from '../types';
import { getGpuSpecs, getHardwareConfig } from '@/lib/catalog/constants';
import { getPrecisionLabel, type Precision } from '@/lib/catalog/data-mappings';
import { getDisplayLabel } from '@/lib/shared/utils';
import { isPositive, modeledFacilityWattsPerGpu } from '@/lib/power/power-basis';
import {
  SYSTEM_POWER_CATEGORIES,
  type SystemPowerBreakdown,
  type SystemPowerCategory,
} from '@/lib/power/system-power-model';
import {
  equalServiceSourceKey,
  getEqualServiceSources,
  observedPoints,
  type EqualServiceSource,
} from './equal-service-comparison';

/**
 * Per-point "what each power account counts" breakdown (PowerX Figure 1): the
 * All in Measured W/GPU of one point split into measured GPU board power,
 * measured Grace sockets (NVL72 only), modeled server parts, fans + PSU loss,
 * the scale-out network share and PUE facility overhead. Every part is the
 * deployment's share divided by its allocated GPUs, so the parts sum to the
 * point's All in Measured W/GPU exactly.
 */

export { SYSTEM_POWER_CATEGORIES };
export type { SystemPowerCategory };

/** Drawn bottom-up; measured parts sit under the modeled ones. */
export const POWER_BREAKDOWN_STACK_ORDER: readonly SystemPowerCategory[] = [
  'gpu',
  'measuredCpu',
  'server',
  'fansPsu',
  'network',
  'facility',
];

export const MEASURED_POWER_CATEGORIES: ReadonlySet<SystemPowerCategory> = new Set([
  'gpu',
  'measuredCpu',
]);

export interface PowerBreakdownPoint {
  point: InferenceData;
  concurrency: number;
  /** x position: the point's interactivity (tok/s/user), see `powerBreakdownInteractivity`. */
  interactivity: number;
  /** The equal-service configuration this point belongs to (date, topology, recipe...). */
  configKey: string;
  configLabel: string;
  /** W/GPU per part; sums to `totalWattsPerGpu`. */
  wattsPerGpu: SystemPowerBreakdown;
  /** All in Measured W/GPU. */
  totalWattsPerGpu: number;
  pue: number;
  cpuBasis: 'measured' | 'modeled' | null;
  chassisBasis: 'full' | 'extrapolated';
}

/**
 * One hardware line of the main chart: a hardware key at one precision, the
 * same grouping and color the scatter legend uses. Its points may span several
 * equal-service configurations (topologies, recipes), each labeled per point.
 */
export interface PowerBreakdownSeries {
  key: string;
  hwKey: string;
  precision: string;
  label: string;
  points: PowerBreakdownPoint[];
  /** Categories with watts on at least one point, in stack order. */
  categories: SystemPowerCategory[];
  tdpWattsPerGpu: number | null;
  allInProvisionedWattsPerGpu: number | null;
}

const DERIVED_INTERACTIVITY = /^p\d+_e2e_norm_intvty$/u;

export interface PowerBreakdownInteractivity {
  /** The interactivity field the x positions come from. */
  field: string;
  /** True when that is the main chart's own x-axis (so its axis label applies). */
  fromChart: boolean;
  value: (point: InferenceData) => number | null | undefined;
}

/**
 * The breakdown is always drawn against interactivity. On an interactivity
 * chart that is the chart's own x (including the trace-derived AgentX P90/P75
 * axes, which live only on `point.x`), so a bar sits under its scatter point;
 * on a latency chart it falls back to median interactivity.
 */
export function powerBreakdownInteractivity(
  xField?: keyof AggDataEntry | string,
): PowerBreakdownInteractivity {
  const field = xField === undefined ? '' : String(xField);
  if (DERIVED_INTERACTIVITY.test(field)) {
    return { field, fromChart: true, value: (point) => point.x };
  }
  if (/(?:^|_)intvty$/u.test(field)) {
    return {
      field,
      fromChart: true,
      value: (point) => point[field as keyof InferenceData] as number | undefined,
    };
  }
  return { field: 'median_intvty', fromChart: false, value: (point) => point.median_intvty };
}

export function powerBreakdownForPoint(
  point: InferenceData,
  config?: EqualServiceSource,
  interactivity: PowerBreakdownInteractivity = powerBreakdownInteractivity(),
): PowerBreakdownPoint | null {
  const x = interactivity.value(point);
  if (!isPositive(x)) return null;
  const model = point.modeledSystemPower;
  if (model?.status !== 'supported') return null;
  const total = modeledFacilityWattsPerGpu(point);
  if (total === null || !isPositive(point.utilityModeledWatts?.y)) return null;
  const parts = model.deploymentBreakdownWatts;
  if (!parts) return null;
  const wattsPerGpu = {} as SystemPowerBreakdown;
  for (const key of SYSTEM_POWER_CATEGORIES) {
    const watts = parts[key] / model.gpuCount;
    if (!Number.isFinite(watts) || watts < 0) return null;
    wattsPerGpu[key] = watts;
  }
  return {
    point,
    concurrency: point.conc,
    interactivity: x,
    configKey: config?.key ?? '',
    configLabel: config?.label ?? '',
    wattsPerGpu,
    totalWattsPerGpu: total,
    pue: model.pue,
    cpuBasis: model.unit === 'nvl72-tray' ? model.cpuBasis : null,
    chassisBasis: model.chassisBasis,
  };
}

export const powerBreakdownSeriesKey = (point: Pick<InferenceData, 'hwKey' | 'precision'>) =>
  `${point.hwKey}|${point.precision}`;

export function buildPowerBreakdowns(
  points: readonly InferenceData[],
  locale: 'en' | 'zh' = 'en',
  interactivity: PowerBreakdownInteractivity = powerBreakdownInteractivity(),
): PowerBreakdownSeries[] {
  const configs = new Map(
    getEqualServiceSources(points, locale).map((source) => [source.key, source]),
  );
  const groups = new Map<string, PowerBreakdownPoint[]>();
  for (const point of observedPoints(points)) {
    const breakdown = powerBreakdownForPoint(
      point,
      configs.get(equalServiceSourceKey(point)) ?? { key: equalServiceSourceKey(point), label: '' },
      interactivity,
    );
    if (!breakdown) continue;
    const key = powerBreakdownSeriesKey(point);
    groups.set(key, [...(groups.get(key) ?? []), breakdown]);
  }
  return [...groups]
    .map(([key, entries]): PowerBreakdownSeries => {
      const sorted = entries.toSorted(
        (a, b) =>
          a.interactivity - b.interactivity ||
          a.concurrency - b.concurrency ||
          a.configKey.localeCompare(b.configKey) ||
          (a.point.id ?? 0) - (b.point.id ?? 0),
      );
      const first = sorted[0].point;
      const specs = getGpuSpecs(first.hwKey);
      return {
        key,
        hwKey: first.hwKey,
        precision: first.precision,
        label: [
          getDisplayLabel(getHardwareConfig(first.hwKey, first.model)),
          getPrecisionLabel(first.precision as Precision),
        ]
          .filter(Boolean)
          .join(' '),
        points: sorted,
        categories: POWER_BREAKDOWN_STACK_ORDER.filter((category) =>
          sorted.some((entry) => entry.wattsPerGpu[category] > 0),
        ),
        tdpWattsPerGpu: isPositive(specs.tdp) ? specs.tdp : null,
        allInProvisionedWattsPerGpu: isPositive(specs.power) ? specs.power * 1000 : null,
      };
    })
    .toSorted((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

/**
 * Category labels for x ticks: `c16`, disambiguated as `c16 · 2` when a source
 * has more than one point at one concurrency.
 */
export function powerBreakdownPointLabels(points: readonly PowerBreakdownPoint[]): string[] {
  const totals = new Map<number, number>();
  for (const entry of points) {
    totals.set(entry.concurrency, (totals.get(entry.concurrency) ?? 0) + 1);
  }
  const seen = new Map<number, number>();
  return points.map((entry) => {
    const index = (seen.get(entry.concurrency) ?? 0) + 1;
    seen.set(entry.concurrency, index);
    return (totals.get(entry.concurrency) ?? 0) > 1
      ? `c${entry.concurrency} · ${index}`
      : `c${entry.concurrency}`;
  });
}

export interface StackedSegment {
  key: SystemPowerCategory;
  y0: number;
  y1: number;
  watts: number;
}

export function stackPowerBreakdown(
  entry: PowerBreakdownPoint,
  categories: readonly SystemPowerCategory[],
): StackedSegment[] {
  let y = 0;
  return categories.map((key) => {
    const watts = entry.wattsPerGpu[key];
    const segment = { key, y0: y, y1: y + watts, watts };
    y += watts;
    return segment;
  });
}

export interface PowerBreakdownComparisonRow {
  series: PowerBreakdownSeries;
  /** The series' benchmark point closest to the target interactivity (log distance). */
  entry: PowerBreakdownPoint;
}

/**
 * Interactivity every series can be compared at: the geometric middle of the
 * range all series cover, or of the full range when they do not overlap.
 */
export function defaultComparisonInteractivity(
  series: readonly PowerBreakdownSeries[],
): number | null {
  const ranges = series
    .map((entry) => entry.points.map((point) => point.interactivity))
    .filter((values) => values.length > 0)
    .map((values) => [Math.min(...values), Math.max(...values)] as const);
  if (ranges.length === 0) return null;
  const lo = Math.max(...ranges.map(([min]) => min));
  const hi = Math.min(...ranges.map(([, max]) => max));
  const [a, b] =
    lo <= hi
      ? [lo, hi]
      : [Math.min(...ranges.map(([min]) => min)), Math.max(...ranges.map(([, max]) => max))];
  return Math.sqrt(a * b);
}

/**
 * One row per series at its point nearest `target`. A series is left out when
 * its closest point is more than `maxRatio`× away, so a chip is never compared
 * at a load it was not benchmarked near.
 */
export function compareBreakdownsAt(
  series: readonly PowerBreakdownSeries[],
  target: number,
  maxRatio = 1.5,
): { rows: PowerBreakdownComparisonRow[]; outOfRange: PowerBreakdownSeries[] } {
  const rows: PowerBreakdownComparisonRow[] = [];
  const outOfRange: PowerBreakdownSeries[] = [];
  if (!(target > 0)) return { rows, outOfRange: [...series] };
  for (const entry of series) {
    let best: PowerBreakdownPoint | null = null;
    let bestDistance = Infinity;
    for (const point of entry.points) {
      const distance = Math.abs(Math.log(point.interactivity / target));
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
    if (best && bestDistance <= Math.log(maxRatio)) rows.push({ series: entry, entry: best });
    else outOfRange.push(entry);
  }
  rows.sort(
    (a, b) =>
      a.entry.totalWattsPerGpu - b.entry.totalWattsPerGpu ||
      a.series.label.localeCompare(b.series.label),
  );
  return { rows, outOfRange };
}
