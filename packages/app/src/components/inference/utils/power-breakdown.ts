import type { AggDataEntry, InferenceData } from '../types';
import { getGpuSpecs, getHardwareConfig } from '@/lib/catalog/constants';
import { getPrecisionLabel, type Precision } from '@/lib/catalog/data-mappings';
import { getDisplayLabel } from '@/lib/shared/utils';
import { getOverlayLineLabel, type OverlayRunIdentity } from '@/lib/benchmarks/inference-labels';
import { overlayRunIndex } from '@/lib/charts/overlay-run-style';
import { isPositive, modeledFacilityWattsPerGpu } from '@/lib/power/power-basis';
import {
  MEASURED_SYSTEM_POWER_CATEGORIES,
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
 * measured Grace sockets (NVL72 only), the modeled host CPUs, memory, NICs,
 * NVSwitch, storage and PCIe parts, fans, PSU loss, the scale-out network
 * share and PUE facility overhead. Every part is the deployment's share
 * divided by its allocated GPUs, so the parts sum to the point's All in
 * Measured W/GPU exactly.
 */

export { SYSTEM_POWER_CATEGORIES };
export type { SystemPowerCategory };

/** Drawn bottom-up; measured parts sit under the modeled ones. */
export const POWER_BREAKDOWN_STACK_ORDER: readonly SystemPowerCategory[] = SYSTEM_POWER_CATEGORIES;

export const MEASURED_POWER_CATEGORIES = MEASURED_SYSTEM_POWER_CATEGORIES;

/**
 * The plot draws six layers, not twelve parts (PowerX Figure 1's boxes):
 * measured GPU boards, measured Grace sockets (NVL72 only), the modeled server
 * parts (host CPUs, memory, NICs, NVSwitch, storage, PCIe), fans + PSU loss,
 * the scale-out network share and the facility overhead PUE adds. The parts
 * list beside the chart carries the per-component detail.
 */
export const POWER_BANDS = [
  'gpu',
  'measuredCpu',
  'server',
  'fansPsu',
  'network',
  'facility',
] as const;
export type PowerBand = (typeof POWER_BANDS)[number];

export const POWER_BAND_CATEGORIES: Record<PowerBand, readonly SystemPowerCategory[]> = {
  gpu: ['gpu'],
  measuredCpu: ['measuredCpu'],
  server: ['cpu', 'memory', 'nic', 'nvswitch', 'storage', 'other'],
  fansPsu: ['fans', 'psuLoss'],
  network: ['network'],
  facility: ['facility'],
};

const BAND_OF_CATEGORY = Object.fromEntries(
  POWER_BANDS.flatMap((band) => POWER_BAND_CATEGORIES[band].map((category) => [category, band])),
) as Record<SystemPowerCategory, PowerBand>;

export function powerBandOf(category: SystemPowerCategory): PowerBand {
  return BAND_OF_CATEGORY[category];
}

/** The layers read from telemetry; every other layer is the model's estimate. */
export const MEASURED_POWER_BANDS: ReadonlySet<PowerBand> = new Set(
  POWER_BANDS.filter((band) =>
    POWER_BAND_CATEGORIES[band].every((category) => MEASURED_POWER_CATEGORIES.has(category)),
  ),
);

/** The bands a series draws, in stack order: those with at least one non-empty part. */
export function powerBandsOf(categories: readonly SystemPowerCategory[]): PowerBand[] {
  return POWER_BANDS.filter((band) => categories.some((key) => powerBandOf(key) === band));
}

/**
 * How a part behaves across load: read from telemetry, modeled from the GPU
 * load (fans, PSU loss, and the PUE overhead that scales with IT) or a fixed
 * figure of the chassis (`system-power-model.test.ts` pins which is which).
 */
export type PowerPartBehaviour = 'measured' | 'load' | 'fixed';

export const POWER_PART_BEHAVIOUR: Record<SystemPowerCategory, PowerPartBehaviour> = {
  gpu: 'measured',
  measuredCpu: 'measured',
  cpu: 'fixed',
  memory: 'fixed',
  nic: 'fixed',
  nvswitch: 'fixed',
  storage: 'fixed',
  other: 'fixed',
  fans: 'load',
  psuLoss: 'load',
  network: 'fixed',
  facility: 'load',
};

/**
 * One color per hardware line (the same vendor color as the main chart legend);
 * layers step down in opacity like the Profit Estimator's stacked bars, and the
 * facility overhead is hatched like its loss segment. Measured layers are the
 * most opaque so the metered base reads first. A layer's step is fixed, so it
 * reads the same with or without the facility on top.
 */
export const POWER_BAND_OPACITY: Record<PowerBand, number> = {
  gpu: 0.9,
  measuredCpu: 0.72,
  server: 0.5,
  fansPsu: 0.34,
  network: 0.2,
  facility: 0,
};

/** Background behind the facility hatch, so the stripes sit on a tint of the chip colour. */
export const HATCH_OPACITY = 0.18;

/** Modeled layers are hatched (estimates), measured layers solid. */
export const isHatchedBand = (band: PowerBand) => !MEASURED_POWER_BANDS.has(band);

/** The chip-colour tint under a layer: its step, or the hatch tint for the facility. */
export const powerBandFillOpacity = (band: PowerBand): number =>
  band === 'facility' ? HATCH_OPACITY : POWER_BAND_OPACITY[band];

/**
 * Each modeled layer gets its own stripe angle, so neighbouring estimates stay
 * distinguishable without relying on opacity alone. Degrees, SVG convention:
 * the rotation applied to a vertical stripe (0 = vertical, 90 = horizontal).
 */
export const HATCH_ANGLE: Record<PowerBand, number> = {
  gpu: 45,
  measuredCpu: 45,
  server: 45,
  fansPsu: 135,
  network: 0,
  facility: 90,
};

/** CSS `repeating-linear-gradient` angle that draws the same stripes as the SVG pattern. */
export const cssHatchAngle = (band: PowerBand) => (HATCH_ANGLE[band] + 90) % 360;

/** The chip colour at a layer's step, for CSS backgrounds (legend swatches, comparison segments). */
export const powerLayerFill = (color: string, opacity: number): string =>
  `color-mix(in oklab, ${color} ${Math.round(opacity * 100)}%, transparent)`;

/**
 * The layer a viewer is telling apart: hovered (transient) or pinned by a click.
 * A parts-list row drives it through its component, so the row and its layer
 * light together; the plot and the legends drive it by layer alone.
 */
export interface PowerLayerHighlight {
  band: PowerBand;
  category: SystemPowerCategory | null;
  pinned: boolean;
}

export type PowerLayerTarget = Pick<PowerLayerHighlight, 'band' | 'category'>;

export const bandTarget = (band: PowerBand): PowerLayerTarget => ({ band, category: null });

export const partTarget = (category: SystemPowerCategory): PowerLayerTarget => ({
  band: powerBandOf(category),
  category,
});

export const sameLayerTarget = (
  a: PowerLayerTarget | null | undefined,
  b: PowerLayerTarget | null | undefined,
): boolean => a?.band === b?.band && (a?.category ?? null) === (b?.category ?? null);

/** Faded siblings of a highlighted band keep this much of their opacity. */
export const POWER_LAYER_FADED_OPACITY = 0.25;

export type PowerLayerEmphasis = 'highlighted' | 'faded' | 'plain';

export function powerLayerEmphasis(
  band: PowerBand,
  highlight: PowerLayerHighlight | null | undefined,
): PowerLayerEmphasis {
  if (!highlight) return 'plain';
  return highlight.band === band ? 'highlighted' : 'faded';
}

/** A parts-list row: its own component, a sibling in the highlighted band, or neither. */
export type PowerPartEmphasis = 'highlighted' | 'band' | 'plain';

export function powerPartEmphasis(
  category: SystemPowerCategory,
  highlight: PowerLayerHighlight | null | undefined,
): PowerPartEmphasis {
  if (!highlight) return 'plain';
  if (highlight.category === category) return 'highlighted';
  return highlight.category === null && highlight.band === powerBandOf(category) ? 'band' : 'plain';
}

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

/** A series drawn from an unofficial-run overlay: coloured by `overlayRunColor(overlayRunIndex)`. */
export interface PowerBreakdownDisplaySeries extends PowerBreakdownSeries {
  overlayRunIndex?: number;
}

export interface PowerBreakdownOverlayInput {
  points: readonly InferenceData[];
  runIndexByUrl: Record<string, number>;
  runInfos: readonly OverlayRunIdentity[];
}

/**
 * The official series followed by one series per unofficial run and hardware
 * line, keyed `hwKey|precision|run<N>` and labelled with the run tag the chart's
 * line pills use, so an overlay never merges into the official line it shadows.
 * Only the dashboard uses this; the read-only API keeps `buildPowerBreakdowns`.
 */
export function buildPowerBreakdownsWithOverlays(
  points: readonly InferenceData[],
  overlay: PowerBreakdownOverlayInput | undefined,
  locale: 'en' | 'zh' = 'en',
  interactivity: PowerBreakdownInteractivity = powerBreakdownInteractivity(),
): PowerBreakdownDisplaySeries[] {
  const overlayPoints = new Set(overlay?.points);
  const official: PowerBreakdownDisplaySeries[] = buildPowerBreakdowns(
    points.filter((point) => !overlayPoints.has(point)),
    locale,
    interactivity,
  );
  if (!overlay || overlay.points.length === 0) return official;
  const byRun = new Map<number, InferenceData[]>();
  for (const point of overlay.points) {
    const runIndex = overlayRunIndex(point.run_url ?? null, overlay.runIndexByUrl);
    byRun.set(runIndex, [...(byRun.get(runIndex) ?? []), point]);
  }
  const overlays = [...byRun]
    .toSorted(([a], [b]) => a - b)
    .flatMap(([runIndex, group]) =>
      buildPowerBreakdowns(group, locale, interactivity).map(
        (series): PowerBreakdownDisplaySeries => {
          const run = overlay.runInfos[runIndex];
          return {
            ...series,
            key: `${series.key}|run${runIndex}`,
            label: run ? getOverlayLineLabel(series.label, run, true) : series.label,
            overlayRunIndex: runIndex,
          };
        },
      ),
    );
  return [...official, ...overlays];
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

/**
 * The same series counted at the IT boundary: the facility (PUE) part is
 * dropped from the categories and from every point's total, so a stack, a
 * total label and a comparison bar all read IT W/GPU. The source series is
 * returned unchanged when the facility is included.
 */
export function breakdownSeriesAtBoundary(
  series: PowerBreakdownSeries,
  includeFacility: boolean,
): PowerBreakdownSeries {
  if (includeFacility) return series;
  return {
    ...series,
    categories: series.categories.filter((category) => category !== 'facility'),
    points: series.points.map((entry) => ({
      ...entry,
      wattsPerGpu: { ...entry.wattsPerGpu, facility: 0 },
      totalWattsPerGpu: entry.totalWattsPerGpu - entry.wattsPerGpu.facility,
    })),
  };
}

/** IT W/GPU of a breakdown point: every part but the facility overhead. */
export function breakdownItWattsPerGpu(entry: Pick<PowerBreakdownPoint, 'wattsPerGpu'>): number {
  return SYSTEM_POWER_CATEGORIES.reduce(
    (sum, category) => (category === 'facility' ? sum : sum + entry.wattsPerGpu[category]),
    0,
  );
}

export interface StackedSegment<K extends string = PowerBand> {
  key: K;
  y0: number;
  y1: number;
  watts: number;
}

/** W/GPU of one band at a point: the sum of its parts. */
export function bandWattsPerGpu(entry: Pick<PowerBreakdownPoint, 'wattsPerGpu'>, band: PowerBand) {
  return POWER_BAND_CATEGORIES[band].reduce((sum, key) => sum + entry.wattsPerGpu[key], 0);
}

/** The layer stack of a point, bottom up, in the given band order. */
export function stackPowerBands(
  entry: PowerBreakdownPoint,
  bands: readonly PowerBand[],
): StackedSegment<PowerBand>[] {
  let y = 0;
  return bands.map((key) => {
    const watts = bandWattsPerGpu(entry, key);
    const segment = { key, y0: y, y1: y + watts, watts };
    y += watts;
    return segment;
  });
}

/** The parts of one band with watts at a point, in stack order. */
export function bandPartsAt(
  entry: Pick<PowerBreakdownPoint, 'wattsPerGpu'>,
  band: PowerBand,
): { category: SystemPowerCategory; watts: number }[] {
  return POWER_BAND_CATEGORIES[band]
    .map((category) => ({ category, watts: entry.wattsPerGpu[category] }))
    .filter((part) => part.watts > 0);
}

export interface PowerPartRow {
  category: SystemPowerCategory;
  band: PowerBand;
  behaviour: PowerPartBehaviour;
  /** W/GPU at the selected point. */
  watts: number;
  /** Share of the point's IT W/GPU; the facility row's share of its facility total. */
  share: number;
  /** The part's W/GPU at every point of the series, in interactivity order. */
  history: number[];
  /** Top of this row's own sparkline scale: the part's largest W/GPU across the series. */
  max: number;
  /** Index of the selected point within `history`. */
  selectedIndex: number;
}

/**
 * The parts list beside the chart: one row per non-empty part of the chip at
 * the selected point, heaviest first, the facility overhead last. Shares of
 * the IT rows sum to 1; the facility row is its share of the facility total.
 */
export function powerPartRows(
  series: Pick<PowerBreakdownSeries, 'points'>,
  entry: PowerBreakdownPoint,
): PowerPartRow[] {
  const itWatts = breakdownItWattsPerGpu(entry);
  const selectedIndex = Math.max(0, series.points.indexOf(entry));
  const rows = SYSTEM_POWER_CATEGORIES.filter((category) => entry.wattsPerGpu[category] > 0).map(
    (category): PowerPartRow => {
      const history = series.points.map((point) => point.wattsPerGpu[category]);
      const watts = entry.wattsPerGpu[category];
      return {
        category,
        band: powerBandOf(category),
        behaviour: POWER_PART_BEHAVIOUR[category],
        watts,
        share:
          category === 'facility'
            ? watts / entry.totalWattsPerGpu
            : itWatts > 0
              ? watts / itWatts
              : 0,
        history,
        max: Math.max(0, ...history),
        selectedIndex,
      };
    },
  );
  return rows.toSorted((a, b) => {
    if (a.category === 'facility' || b.category === 'facility') {
      return a.category === 'facility' ? 1 : -1;
    }
    return b.watts - a.watts || a.category.localeCompare(b.category);
  });
}

export interface SparklineGeometry {
  /** Closed area path from the baseline. */
  area: string;
  /** The top edge alone, for a 1 px stroke. */
  line: string;
  /** The selected point. */
  dot: { x: number; y: number };
}

/**
 * A tiny area of `values` on its own 0..max scale, one evenly spaced x per
 * value (the PowerX chart spaces points evenly too), 1 px inset so the stroke
 * and the dot stay inside the box. A single value draws a flat line.
 */
const roundPx = (value: number) => Math.round(value * 100) / 100;

export function sparklineGeometry(
  values: readonly number[],
  selectedIndex: number,
  width: number,
  height: number,
): SparklineGeometry {
  const inset = 1;
  const max = Math.max(0, ...values);
  const n = Math.max(1, values.length);
  const x = (index: number) =>
    n === 1 ? width / 2 : inset + (index / (n - 1)) * (width - 2 * inset);
  const y = (value: number) =>
    height - inset - (max > 0 ? (value / max) * (height - 2 * inset) : 0);
  const points = (values.length === 0 ? [0] : values).map((value, index) => [x(index), y(value)]);
  const f = roundPx;
  const line = points
    .map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${f(px)},${f(py)}`)
    .join('');
  const area = `${line}L${f(points.at(-1)![0])},${height - inset}L${f(points[0][0])},${height - inset}Z`;
  const selected = points[Math.min(Math.max(0, selectedIndex), points.length - 1)];
  return { area, line, dot: { x: f(selected[0]), y: f(selected[1]) } };
}

export interface PowerBreakdownComparisonRow<
  S extends PowerBreakdownSeries = PowerBreakdownSeries,
> {
  series: S;
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

/** The series' point nearest `target` on a log scale, whatever the distance; null when empty. */
export function nearestBreakdownPoint(
  series: Pick<PowerBreakdownSeries, 'points'>,
  target: number,
): PowerBreakdownPoint | null {
  if (!(target > 0)) return series.points[0] ?? null;
  let best: PowerBreakdownPoint | null = null;
  let bestDistance = Infinity;
  for (const point of series.points) {
    const distance = Math.abs(Math.log(point.interactivity / target));
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One row per series at its point nearest `target`. A series is left out when
 * its closest point is more than `maxRatio`× away, so a chip is never compared
 * at a load it was not benchmarked near.
 */
export function compareBreakdownsAt<S extends PowerBreakdownSeries>(
  series: readonly S[],
  target: number,
  maxRatio = 1.5,
): { rows: PowerBreakdownComparisonRow<S>[]; outOfRange: S[] } {
  const rows: PowerBreakdownComparisonRow<S>[] = [];
  const outOfRange: S[] = [];
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

/**
 * Every band at an arbitrary x, linearly interpolated between the two
 * neighbouring points (clamped to the ends), so a hover between columns can
 * name the band under the cursor and its W/GPU there.
 */
export function stackedBandsAt(
  points: readonly { x: number; entry: PowerBreakdownPoint }[],
  x: number,
  bands: readonly PowerBand[],
): StackedSegment<PowerBand>[] {
  if (points.length === 0) return [];
  const sorted = points.toSorted((a, b) => a.x - b.x);
  let right = sorted.findIndex((point) => point.x >= x);
  if (right === -1) right = sorted.length - 1;
  const left = Math.max(0, right - 1);
  const a = sorted[left];
  const b = sorted[right];
  const span = b.x - a.x;
  const mix = span > 0 ? Math.min(1, Math.max(0, (x - a.x) / span)) : 0;
  const stackA = stackPowerBands(a.entry, bands);
  const stackB = stackPowerBands(b.entry, bands);
  return stackA.map((segment, index) => {
    const other = stackB[index];
    const lerp = (from: number, to: number) => from + (to - from) * mix;
    return {
      key: segment.key,
      y0: lerp(segment.y0, other.y0),
      y1: lerp(segment.y1, other.y1),
      watts: lerp(segment.watts, other.watts),
    };
  });
}

/** The band (in stack order) that contains `watts`; null above the stack or below zero. */
export function bandAtWatts<K extends string>(
  bands: readonly StackedSegment<K>[],
  watts: number,
): StackedSegment<K> | null {
  if (!(watts >= 0)) return null;
  return bands.find((band) => band.watts > 0 && watts >= band.y0 && watts <= band.y1) ?? null;
}
