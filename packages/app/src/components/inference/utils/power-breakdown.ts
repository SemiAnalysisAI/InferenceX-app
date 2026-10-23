import type { InferenceData } from '../types';
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

export function powerBreakdownForPoint(
  point: InferenceData,
  config?: EqualServiceSource,
): PowerBreakdownPoint | null {
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
): PowerBreakdownSeries[] {
  const configs = new Map(
    getEqualServiceSources(points, locale).map((source) => [source.key, source]),
  );
  const groups = new Map<string, PowerBreakdownPoint[]>();
  for (const point of observedPoints(points)) {
    const breakdown = powerBreakdownForPoint(
      point,
      configs.get(equalServiceSourceKey(point)) ?? { key: equalServiceSourceKey(point), label: '' },
    );
    if (!breakdown) continue;
    const key = powerBreakdownSeriesKey(point);
    groups.set(key, [...(groups.get(key) ?? []), breakdown]);
  }
  return [...groups]
    .map(([key, entries]): PowerBreakdownSeries => {
      const sorted = entries.toSorted(
        (a, b) =>
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
