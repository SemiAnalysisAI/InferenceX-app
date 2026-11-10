import { DEFAULT_CHIP_BASIS, type ChipBasis } from '@/lib/benchmarks/chip-basis';
import {
  rowSupportsTrendMetric,
  rowToLightweightPoint,
} from '@/components/inference/hooks/interpolated-trend-core';
import { NORMALIZED_TOKEN_REVENUE_PRICING } from '@/components/inference/token-revenue';
import type {
  InferenceData,
  TokenRevenuePricing,
  YAxisMetricKey,
} from '@/components/inference/types';
import { pointVendor } from '@/components/inference/utils/quickFilters';
import type { BenchmarkRow } from '@/lib/api/api';
import {
  benchmarkCurveDate,
  dedupeAgenticHistoryRuns,
  seriesKey,
} from '@/lib/benchmarks/benchmark-run-selection';
import { DEFAULT_TCO_BASIS, type TcoBasis } from '@/lib/catalog/constants';
import { globalParetoFrontier } from '@/lib/charts/pareto-frontier';
import { hermiteInterpolate, monotoneSlopes } from '@/components/calculator/interpolation';
import type { DerivedMetricKey } from '@/lib/charts/chart-utils';

/** Interactivity levels at which frontier ownership is resolved (log-spaced). */
const FRONTIER_OWNERSHIP_LEVELS = 48;
/** Interactivity buckets the comparison bars are drawn at. */
export const FRONTIER_COMPARISON_BUCKETS = 12;
/** Reigns shorter than this are usually a partial or regressed nightly, not a real overtake. */
const BRIEF_REIGN_DAYS = 7;
/** A winner whose hardware first appeared this recently counts as new hardware. */
const NEW_HARDWARE_DAYS = 14;
const TIE_TOLERANCE = 0.005;
/**
 * A sweep with fewer points than this share of the configuration's recent median is a
 * partial nightly (a run that stopped early). It does not replace the last full sweep.
 */
const PARTIAL_SWEEP_RATIO = 0.6;
/** Earlier sweeps the partial-sweep median looks back over. */
const PARTIAL_SWEEP_LOOKBACK = 5;
/**
 * A configuration contributes the best of its full sweeps from this many days, so a few bad
 * nights do not dent the frontier; a regression that lasts longer shows once the window passes.
 */
const SWEEP_WINDOW_DAYS = 7;

export interface FrontierVertex {
  x: number;
  y: number;
  conc: number;
  precision: string;
  /** Date the measurement was taken, which can precede the snapshot date. */
  measured: string;
  runUrl: string | null;
  /** Hardware + engine key of the configuration that measured it, e.g. `gb200_dynamo-trt`. */
  config: string;
  /** Serving image of that run, or null when the row has none. */
  image: string | null;
}

export interface FrontierSeries {
  key: string;
  hwKey: string;
  precision: string | null;
  vendor: string | null;
  /** First snapshot date this series has any observation. */
  firstDate: string;
  /** Frontier on each date it changed; it holds until the next entry. */
  changes: { date: string; vertices: FrontierVertex[] }[];
}

export interface OwnershipCell {
  owner: string;
  value: number;
  vertex: FrontierVertex;
  runnerUp: string | null;
  runnerUpValue: number | null;
}

export type OvertakeKind = 'new-hardware' | 'improvement' | 'incumbent-regressed' | 'tie';

export interface FrontierOvertake {
  date: string;
  dateIndex: number;
  winner: string;
  loser: string;
  /** Inclusive interactivity range taken, in tok/s/user. */
  from: number;
  to: number;
  levelCount: number;
  /** How much better the new owner is than the old one at the middle level (>1 is better). */
  multiplier: number | null;
  kind: OvertakeKind;
  /** Days the winner kept the middle level; `ongoing` when it still holds it. */
  heldDays: number;
  ongoing: boolean;
  brief: boolean;
}

export interface FrontierHistory {
  dates: string[];
  levels: number[];
  higherIsBetter: boolean;
  series: FrontierSeries[];
  /** ownership[dateIndex][levelIndex]; null where no series reaches that interactivity. */
  ownership: (OwnershipCell | null)[][];
  overtakes: FrontierOvertake[];
}

export interface BuildFrontierHistoryOptions {
  readonly selectedPrecisions: readonly string[];
  readonly selectedYAxisMetric: string;
  readonly metricKey: YAxisMetricKey;
  readonly requestedMetrics: readonly DerivedMetricKey[];
  readonly higherIsBetter: boolean;
  readonly tcoBasis?: TcoBasis;
  readonly chipBasis?: ChipBasis;
  readonly tokenRevenuePricing?: TokenRevenuePricing | null;
  readonly rowFilter?: (row: BenchmarkRow) => boolean;
  /** Keeps only series whose hardware key passes, e.g. the legend's visible entries. */
  readonly hwKeyFilter?: (hwKey: string) => boolean;
  /**
   * `config` competes each hardware + engine series (the legend entries); `gpu` pools every
   * configuration of a chip so ownership reads as chip against chip; `vendor` pools every
   * chip of a vendor. Defaults to `config`.
   */
  readonly groupBy?: FrontierGroupBy;
}

export type FrontierGroupBy = 'config' | 'gpu' | 'vendor';

function metricValue(point: InferenceData, metricKey: YAxisMetricKey): number | null {
  const metric = point[metricKey];
  if (metric && typeof metric === 'object' && 'y' in metric) {
    const y = (metric as { y: number }).y;
    return Number.isFinite(y) ? y : null;
  }
  return null;
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const daysBetween = (a: string, b: string) => Math.round(dayNumber(b) - dayNumber(a));
const sameVertices = (a: FrontierVertex[], b: FrontierVertex[]) =>
  a.length === b.length && a.every((v, i) => v.x === b[i].x && v.y === b[i].y);

/**
 * Best value any vertex achieves at interactivity `x` or faster. A measured point
 * dominates everything slower and worse, so this is exact Pareto dominance with
 * no interpolation; null beyond the frontier's fastest vertex.
 */
export function achievableAt(
  vertices: readonly FrontierVertex[],
  x: number,
): FrontierVertex | null {
  for (const vertex of vertices) if (vertex.x >= x) return vertex;
  return null;
}

/** Log-spaced interactivity levels spanning every measured frontier vertex. */
function ownershipLevels(series: readonly FrontierSeries[], count: number): number[] {
  const xs = series.flatMap((s) => s.changes.flatMap((c) => c.vertices.map((v) => v.x)));
  const positive = xs.filter((x) => x > 0);
  if (positive.length === 0) return [];
  const lo = Math.min(...positive);
  const hi = Math.max(...positive);
  if (lo === hi) return [lo];
  return Array.from({ length: count }, (_, i) => lo * (hi / lo) ** (i / (count - 1)));
}

/** Each series' frontier as of `dateIndex` (latest change on or before that snapshot). */
export function seriesFrontiersAt(
  history: { readonly dates: readonly string[]; readonly series: readonly FrontierSeries[] },
  dateIndex: number,
): Map<string, FrontierVertex[]> {
  const date = history.dates[dateIndex];
  const result = new Map<string, FrontierVertex[]>();
  for (const series of history.series) {
    let current: FrontierVertex[] | null = null;
    for (const change of series.changes) {
      if (change.date > date) break;
      current = change.vertices;
    }
    if (current && current.length > 0) result.set(series.key, current);
  }
  return result;
}

/** Pooled frontier across series, each vertex tagged with the series that measured it. */
export function pooledFrontier(
  frontiers: ReadonlyMap<string, readonly FrontierVertex[]>,
  higherIsBetter: boolean,
): (FrontierVertex & { key: string })[] {
  const points = [...frontiers].flatMap(([key, vertices]) => vertices.map((v) => ({ ...v, key })));
  return globalParetoFrontier(points, true, higherIsBetter);
}

/**
 * Dates of a configuration's sweeps that are not partial. The median looks back over every
 * earlier sweep, partial or not, so a configuration whose sweep is deliberately narrowed is
 * accepted again after a few nights.
 */
function completeSweepDates(byDate: ReadonlyMap<string, readonly unknown[]>): string[] {
  const dates = [...byDate.keys()].toSorted();
  const counts = dates.map((date) => byDate.get(date)!.length);
  return dates.filter((_, index) => {
    const previous = counts.slice(Math.max(0, index - PARTIAL_SWEEP_LOOKBACK), index);
    if (previous.length === 0) return true;
    const sorted = previous.toSorted((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return counts[index] >= PARTIAL_SWEEP_RATIO * median;
  });
}

/**
 * Full sweeps that count for `date`: those within the trailing window, or the latest earlier
 * one when the configuration has not run inside it (the as-of carry-forward).
 */
function sweepsInWindow(sweepDates: readonly string[], date: string): string[] {
  const upTo = sweepDates.filter((d) => d <= date);
  const recent = upTo.filter((d) => dayNumber(date) - dayNumber(d) < SWEEP_WINDOW_DAYS);
  return recent.length > 0 ? recent : upTo.slice(-1);
}

/** The row as a chart point when it can be plotted for the selected metric, ignoring precision. */
function plottablePoint(row: BenchmarkRow, options: BuildFrontierHistoryOptions) {
  if (!rowSupportsTrendMetric(row, options.selectedYAxisMetric)) return null;
  if (options.rowFilter && !options.rowFilter(row)) return null;
  const point = rowToLightweightPoint(
    row,
    options.requestedMetrics,
    options.tokenRevenuePricing ?? NORMALIZED_TOKEN_REVENUE_PRICING,
    options.tcoBasis ?? DEFAULT_TCO_BASIS,
    options.chipBasis ?? DEFAULT_CHIP_BASIS,
  );
  if (!point || metricValue(point, options.metricKey) === null || !(point.x > 0)) return null;
  return point;
}

/**
 * Vendors with plottable data for the metric only at precisions outside the selection, and
 * those precisions, so a view can say who is hidden by the precision filter rather than
 * missing. The legend filter is not applied: it only lists the selected precisions' configs.
 */
export function vendorsAtOtherPrecisions(
  rows: readonly BenchmarkRow[],
  options: BuildFrontierHistoryOptions,
): { vendor: string; precisions: string[]; hardware: string[] }[] {
  const shown = new Set<string>();
  const hidden = new Map<string, { precisions: Set<string>; hardware: Set<string> }>();
  for (const row of rows) {
    const point = plottablePoint(row, options);
    if (!point) continue;
    const vendor = pointVendor(point.hwKey as string);
    if (!vendor) continue;
    if (options.selectedPrecisions.includes(row.precision)) {
      shown.add(vendor);
      continue;
    }
    const entry = hidden.get(vendor) ?? { precisions: new Set(), hardware: new Set() };
    entry.precisions.add(row.precision);
    entry.hardware.add((point.hwKey as string).split('_')[0]);
    hidden.set(vendor, entry);
  }
  return [...hidden]
    .filter(([vendor]) => !shown.has(vendor))
    .map(([vendor, entry]) => ({
      vendor,
      precisions: [...entry.precisions].toSorted(),
      hardware: [...entry.hardware].toSorted(),
    }))
    .toSorted((a, b) => a.vendor.localeCompare(b.vendor));
}

function buildSeries(
  rows: readonly BenchmarkRow[],
  options: BuildFrontierHistoryOptions,
): { dates: string[]; series: FrontierSeries[] } {
  const groupBy = options.groupBy ?? 'config';
  const multiPrecision = options.selectedPrecisions.length > 1 && groupBy === 'config';
  // config -> curve date -> points, plus the legend series each config belongs to
  const configs = new Map<string, { group: string; byDate: Map<string, FrontierVertex[]> }>();
  const groupHw = new Map<
    string,
    { hwKey: string; precision: string | null; vendor: string | null }
  >();
  const dates = new Set<string>();

  for (const row of dedupeAgenticHistoryRuns([...rows])) {
    if (!options.selectedPrecisions.includes(row.precision)) continue;
    const point = plottablePoint(row, options);
    if (!point) continue;

    const hwKey = point.hwKey as string;
    if (options.hwKeyFilter && !options.hwKeyFilter(hwKey)) continue;
    const gpu = hwKey.split('_')[0];
    const vendor = pointVendor(hwKey) ?? null;
    const group =
      groupBy === 'vendor'
        ? (vendor ?? gpu)
        : groupBy === 'gpu'
          ? gpu
          : multiPrecision
            ? `${hwKey}__${row.precision}`
            : hwKey;
    groupHw.set(group, {
      hwKey: groupBy === 'config' ? hwKey : group,
      precision: multiPrecision ? row.precision : null,
      vendor,
    });
    const date = benchmarkCurveDate(row);
    dates.add(date);
    const config = seriesKey(row);
    let entry = configs.get(config);
    if (!entry) {
      entry = { group, byDate: new Map() };
      configs.set(config, entry);
    }
    const list = entry.byDate.get(date) ?? [];
    list.push({
      x: point.x,
      y: metricValue(point, options.metricKey)!,
      conc: point.conc,
      precision: point.precision,
      measured: point.trendSource?.date ?? point.date,
      runUrl: point.trendSource?.runUrl ?? null,
      config: hwKey,
      image: row.image ?? null,
    });
    entry.byDate.set(date, list);
  }

  const sortedDates = [...dates].toSorted();
  const configDates = new Map(
    [...configs].map(([key, entry]) => [key, completeSweepDates(entry.byDate)]),
  );
  const changes = new Map<string, FrontierSeries['changes']>();
  const firstDate = new Map<string, string>();

  for (const date of sortedDates) {
    const pointsByGroup = new Map<string, FrontierVertex[]>();
    for (const [key, entry] of configs) {
      const sweeps = sweepsInWindow(configDates.get(key)!, date);
      if (sweeps.length === 0) continue;
      const list = pointsByGroup.get(entry.group) ?? [];
      for (const sweep of sweeps) list.push(...entry.byDate.get(sweep)!);
      pointsByGroup.set(entry.group, list);
    }
    for (const [group, points] of pointsByGroup) {
      if (!firstDate.has(group)) firstDate.set(group, date);
      const vertices = globalParetoFrontier(points, true, options.higherIsBetter);
      const list = changes.get(group) ?? [];
      if (list.length === 0 || !sameVertices(list.at(-1)!.vertices, vertices))
        list.push({ date, vertices });
      changes.set(group, list);
    }
  }

  const series = [...changes]
    .map(([key, list]) => {
      const { hwKey, precision, vendor } = groupHw.get(key)!;
      return {
        key,
        hwKey,
        precision,
        vendor,
        firstDate: firstDate.get(key)!,
        changes: list,
      };
    })
    .toSorted((a, b) => a.key.localeCompare(b.key));
  return { dates: sortedDates, series };
}

function resolveOwnership(
  dates: readonly string[],
  levels: readonly number[],
  series: readonly FrontierSeries[],
  higherIsBetter: boolean,
): (OwnershipCell | null)[][] {
  const better = (a: number, b: number) => (higherIsBetter ? a > b : a < b);
  const grid: (OwnershipCell | null)[][] = [];
  dates.forEach((_, dateIndex) => {
    const frontiers = seriesFrontiersAt({ dates, series }, dateIndex);
    const previous = grid.at(-1);
    grid.push(
      levels.map((x, levelIndex) => {
        const candidates = [...frontiers]
          .map(([key, vertices]) => ({ key, vertex: achievableAt(vertices, x) }))
          .filter((c): c is { key: string; vertex: FrontierVertex } => c.vertex !== null)
          // Exact ties keep the incumbent so ownership never flickers on equal values.
          .toSorted((a, b) =>
            a.vertex.y === b.vertex.y
              ? Number(b.key === previous?.[levelIndex]?.owner) -
                  Number(a.key === previous?.[levelIndex]?.owner) || a.key.localeCompare(b.key)
              : better(a.vertex.y, b.vertex.y)
                ? -1
                : 1,
          );
        if (candidates.length === 0) return null;
        const [best, second] = candidates;
        return {
          owner: best.key,
          value: best.vertex.y,
          vertex: best.vertex,
          runnerUp: second?.key ?? null,
          runnerUpValue: second?.vertex.y ?? null,
        };
      }),
    );
  });
  return grid;
}

function detectOvertakes(
  dates: readonly string[],
  levels: readonly number[],
  series: readonly FrontierSeries[],
  ownership: readonly (OwnershipCell | null)[][],
  higherIsBetter: boolean,
): FrontierOvertake[] {
  const hwFirstDate = new Map<string, string>();
  for (const s of series) {
    const gpu = s.hwKey.split('_')[0];
    const seen = hwFirstDate.get(gpu);
    if (!seen || s.firstDate < seen) hwFirstDate.set(gpu, s.firstDate);
  }

  const holdUntil = (levelIndex: number, dateIndex: number, owner: string) => {
    let end = dateIndex;
    while (end + 1 < dates.length && ownership[end + 1][levelIndex]?.owner === owner) end += 1;
    const ongoing = end === dates.length - 1;
    return {
      ongoing,
      days: Math.max(1, daysBetween(dates[dateIndex], ongoing ? dates[end] : dates[end + 1])),
    };
  };

  const overtakes: FrontierOvertake[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const runs: { winner: string; loser: string; levels: number[] }[] = [];
    levels.forEach((_, levelIndex) => {
      const before = ownership[i - 1][levelIndex];
      const after = ownership[i][levelIndex];
      if (!before || !after || before.owner === after.owner) return;
      const run = runs.at(-1);
      if (
        run &&
        run.winner === after.owner &&
        run.loser === before.owner &&
        run.levels.at(-1) === levelIndex - 1
      )
        run.levels.push(levelIndex);
      else runs.push({ winner: after.owner, loser: before.owner, levels: [levelIndex] });
    });

    for (const run of runs) {
      const mid = run.levels[Math.floor(run.levels.length / 2)];
      const now = ownership[i][mid]!;
      const was = ownership[i - 1][mid]!;
      const multiplier =
        was.value > 0 && now.value > 0
          ? higherIsBetter
            ? now.value / was.value
            : was.value / now.value
          : null;
      const winnerSeries = series.find((s) => s.key === run.winner);
      const gpu = winnerSeries?.hwKey.split('_')[0];
      const gpuFirst = gpu ? hwFirstDate.get(gpu) : undefined;
      const kind: OvertakeKind =
        gpuFirst !== undefined && daysBetween(gpuFirst, dates[i]) <= NEW_HARDWARE_DAYS
          ? 'new-hardware'
          : multiplier !== null && Math.abs(multiplier - 1) < TIE_TOLERANCE
            ? 'tie'
            : multiplier !== null && multiplier < 1
              ? 'incumbent-regressed'
              : 'improvement';
      const held = holdUntil(mid, i, run.winner);
      overtakes.push({
        date: dates[i],
        dateIndex: i,
        winner: run.winner,
        loser: run.loser,
        from: levels[run.levels[0]],
        to: levels[run.levels.at(-1)!],
        levelCount: run.levels.length,
        multiplier,
        kind,
        heldDays: held.days,
        ongoing: held.ongoing,
        brief: held.days < BRIEF_REIGN_DAYS,
      });
    }
  }
  return overtakes;
}

/**
 * Frontier history for one model and sequence: every series' Pareto frontier on each
 * snapshot date, who owns each interactivity level, and every change of owner.
 *
 * On each date a configuration contributes its latest sweep on or before that date,
 * matching the dashboard's as-of snapshot rule (`dedupeRowsToLatestPerConfig`).
 */
export function buildFrontierHistory(
  rows: readonly BenchmarkRow[],
  options: BuildFrontierHistoryOptions,
): FrontierHistory {
  const { dates, series } = buildSeries(rows, options);
  const levels = ownershipLevels(series, FRONTIER_OWNERSHIP_LEVELS);
  const ownership = resolveOwnership(dates, levels, series, options.higherIsBetter);
  return {
    dates,
    levels,
    higherIsBetter: options.higherIsBetter,
    series,
    ownership,
    overtakes: detectOvertakes(dates, levels, series, ownership, options.higherIsBetter),
  };
}

/**
 * The history from the first date any of `keys` has a frontier, so a view of a subset does
 * not open on empty snapshots. Series keep their full change lists; only the timeline,
 * ownership rows and overtake indexes shift.
 */
export function historyFromFirstData(
  history: FrontierHistory,
  keys: readonly string[],
): FrontierHistory {
  const wanted = new Set(keys);
  const firstDates = history.series.filter((s) => wanted.has(s.key)).map((s) => s.firstDate);
  if (firstDates.length === 0) return history;
  const first = firstDates.toSorted()[0];
  const start = Math.max(0, history.dates.indexOf(first));
  if (start === 0) return history;
  return {
    ...history,
    dates: history.dates.slice(start),
    ownership: history.ownership.slice(start),
    overtakes: history.overtakes
      .filter((o) => o.dateIndex >= start)
      .map((o) => ({ ...o, dateIndex: o.dateIndex - start })),
  };
}

/** Share of reachable interactivity levels each series owns on one date, largest first. */
export function territoryShares(
  history: FrontierHistory,
  dateIndex: number,
): { key: string; share: number; from: number; to: number }[] {
  const row = history.ownership[dateIndex] ?? [];
  const reachable = row.filter(Boolean).length;
  if (reachable === 0) return [];
  const byOwner = new Map<string, number[]>();
  row.forEach((cell, levelIndex) => {
    if (!cell) return;
    byOwner.set(cell.owner, [...(byOwner.get(cell.owner) ?? []), levelIndex]);
  });
  return [...byOwner]
    .map(([key, levelIndexes]) => ({
      key,
      share: levelIndexes.length / reachable,
      from: history.levels[levelIndexes[0]],
      to: history.levels[levelIndexes.at(-1)!],
    }))
    .toSorted((a, b) => b.share - a.share);
}

/**
 * Area under a frontier's dominance step function, from zero to its fastest vertex: the
 * ground it covers. Lower-is-better metrics integrate the reciprocal (cost becomes value
 * per cost) so a larger area is always better.
 */
export function frontierArea(vertices: readonly FrontierVertex[], higherIsBetter: boolean): number {
  let area = 0;
  let previousX = 0;
  for (const vertex of vertices) {
    const value = higherIsBetter ? vertex.y : vertex.y > 0 ? 1 / vertex.y : 0;
    area += (vertex.x - previousX) * value;
    previousX = vertex.x;
  }
  return area;
}

/** A metric value oriented so larger is always better. */
const goodnessOf = (history: FrontierHistory, y: number) =>
  history.higherIsBetter ? y : y > 0 ? 1 / y : 0;

/** Each series' frontier area on every snapshot date; 0 before its first observation. */
export function frontierAreas(history: FrontierHistory): Map<string, number[]> {
  const areas = new Map(history.series.map((s) => [s.key, [] as number[]]));
  history.dates.forEach((_, index) => {
    const frontiers = seriesFrontiersAt(history, index);
    for (const [key, list] of areas)
      list.push(frontierArea(frontiers.get(key) ?? [], history.higherIsBetter));
  });
  return areas;
}

/**
 * Same-hardware gains: each series' frontier area divided by its area on its first snapshot.
 * Grouped by chip, the hardware is fixed, so this is the improvement software, serving
 * configurations and precision bring to that chip. Null before the series appears.
 */
export function softwareGains(history: FrontierHistory): Map<string, (number | null)[]> {
  return new Map(
    [...frontierAreas(history)].map(([key, areas]) => {
      const base = areas.find((area) => area > 0);
      return [key, areas.map((area) => (base && area > 0 ? area / base : null))];
    }),
  );
}

/** Trailing windows, in days, the gain-rate view offers. */
export const GAIN_RATE_WINDOWS = [30, 60, 90] as const;
export type GainRateWindow = (typeof GAIN_RATE_WINDOWS)[number];
export const DEFAULT_GAIN_RATE_WINDOW: GainRateWindow = 60;
/** Days in an average month, so rates read as compounded growth per month. */
const DAYS_PER_MONTH = 365.25 / 12;

/**
 * The slope of the software gain: each series' compounded growth per month over the trailing
 * `windowDays`, on every date (0.25 = +25%/month). The window is clipped to the series' first
 * run and a rate needs at least half the window of history, so a chip's first weeks do not
 * read as infinite growth. Null before then and wherever the series has no frontier.
 */
export function softwareGainRates(
  history: FrontierHistory,
  windowDays: number,
): Map<string, (number | null)[]> {
  const days = history.dates.map(dayNumber);
  return new Map(
    [...softwareGains(history)].map(([key, gains]) => [
      key,
      gains.map((gain, index) => {
        if (gain === null || gain <= 0) return null;
        const from = days[index] - windowDays;
        let start = index;
        for (let j = index - 1; j >= 0 && days[j] >= from; j--) {
          const earlier = gains[j];
          if (earlier !== null && earlier > 0) start = j;
        }
        const span = days[index] - days[start];
        const base = gains[start];
        if (start === index || base === null || span < windowDays / 2) return null;
        return (gain / base) ** (DAYS_PER_MONTH / span) - 1;
      }),
    ]),
  );
}

/**
 * The shared part of the gain rate: on each date, the median rate across every series that
 * has one, null with fewer than two. Optimisations that land for every chip at once (a
 * framework release, a new kernel) move it; a chip's distance from it is its own.
 */
export function commonSoftwareGainRate(
  rates: ReadonlyMap<string, readonly (number | null)[]>,
  length: number,
): (number | null)[] {
  return Array.from({ length }, (_, index) => {
    const values = [...rates.values()]
      .map((list) => list[index])
      .filter((value): value is number => value !== null && value !== undefined)
      .toSorted((a, b) => a - b);
    if (values.length < 2) return null;
    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  });
}

/** Days since a series' first run on each snapshot date; null before that run. */
export function daysSinceFirstRun(history: FrontierHistory, key: string): (number | null)[] {
  const first = history.series.find((entry) => entry.key === key)?.firstDate;
  if (!first) return history.dates.map(() => null);
  const start = dayNumber(first);
  return history.dates.map((date) => {
    const age = dayNumber(date) - start;
    return age >= 0 ? age : null;
  });
}

/** Compounded monthly growth implied by a total gain over a number of days; null under a day. */
export function monthlyRate(gain: number | null, days: number | null): number | null {
  if (gain === null || gain <= 0 || days === null || days < 1) return null;
  return gain ** (DAYS_PER_MONTH / days) - 1;
}

/**
 * How much better a series' frontier is on one date than on its first snapshot, at each
 * interactivity bucket, read off the drawn curves; null where either curve does not reach.
 */
export function softwareGainByInteractivity(
  history: FrontierHistory,
  key: string,
  dateIndex: number,
  buckets: readonly number[],
): { x: number; ratio: number | null }[] {
  const series = history.series.find((entry) => entry.key === key);
  const first = series?.changes[0]?.vertices ?? [];
  const now = seriesFrontiersAt(history, dateIndex).get(key) ?? [];
  const goodness = (y: number) => goodnessOf(history, y);
  return buckets.map((x) => {
    const before = frontierValueAt(first, x);
    const after = frontierValueAt(now, x);
    return {
      x,
      ratio:
        before === null || after === null || goodness(before) === 0
          ? null
          : goodness(after) / goodness(before),
    };
  });
}

/**
 * Average of a chip's software gain across the interactivity levels both curves reach: the
 * geometric mean of the ratios, since a 2x gain and a 0.5x loss should cancel. Null when no
 * level is reached on both dates.
 */
export function averageSoftwareGain(
  gains: readonly { x: number; ratio: number | null }[],
): number | null {
  const ratios = gains.flatMap((gain) =>
    gain.ratio !== null && gain.ratio > 0 ? [gain.ratio] : [],
  );
  if (ratios.length === 0) return null;
  return Math.exp(ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length);
}

/**
 * Software-gain bar axis across playback, in log2 units: the top from the largest gain (at
 * least 2x), the bottom from the deepest loss rounded down (1x when nothing fell), so big
 * losses never stretch the gain side or the reverse.
 */
export function softwareGainBarExtent(
  history: FrontierHistory,
  keys: readonly string[],
  buckets: readonly number[],
): { min: number; max: number } {
  let min = 0;
  let max = 1;
  for (const key of keys)
    for (let index = 0; index < history.dates.length; index++)
      for (const { ratio } of softwareGainByInteractivity(history, key, index, buckets)) {
        if (ratio === null || ratio <= 0) continue;
        const log = Math.log2(ratio);
        min = Math.min(min, log);
        max = Math.max(max, log);
      }
  return { min: Math.max(-6, Math.floor(min)), max: Math.min(max, 6) };
}

export interface LeadMargin {
  /** Interactivity in tok/s/user. */
  x: number;
  /** Best series at `x`, or null when none of the compared series reaches it. */
  leader: string | null;
  runnerUp: string | null;
  /** Leader over runner-up, oriented so >1 is better; null when only one series reaches `x`. */
  ratio: number | null;
}

/** Log-spaced interactivity buckets across the levels, for comparison bars. */
export function comparisonBuckets(history: FrontierHistory, count: number): number[] {
  const { levels } = history;
  if (levels.length <= count) return [...levels];
  return Array.from(
    { length: count },
    (_, i) => levels[Math.round((i * (levels.length - 1)) / (count - 1))],
  );
}

/**
 * A frontier's value at interactivity `x`, read off the monotone curve the chart draws
 * (Steffen slopes, as `d3.curveMonotoneX` and the dashboard's interpolation helpers use).
 * Below the slowest vertex it is that vertex's value, which the vertex dominates; beyond the
 * fastest vertex the series does not reach `x` and the result is null.
 */
export function frontierValueAt(vertices: readonly FrontierVertex[], x: number): number | null {
  if (vertices.length === 0 || x > vertices.at(-1)!.x) return null;
  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  return hermiteInterpolate(xs, ys, monotoneSlopes(xs, ys), x);
}

/**
 * Who leads among the compared series at each bucket on one date, and by how much, reading
 * each series' drawn frontier curve.
 */
export function leadMargins(
  history: FrontierHistory,
  dateIndex: number,
  keys: readonly string[],
  buckets: readonly number[],
): LeadMargin[] {
  const frontiers = seriesFrontiersAt(history, dateIndex);
  const goodness = (y: number) => goodnessOf(history, y);
  return buckets.map((x) => {
    const ranked = keys
      .map((key) => ({ key, value: frontierValueAt(frontiers.get(key) ?? [], x) }))
      .filter((entry): entry is { key: string; value: number } => entry.value !== null)
      .toSorted((a, b) => goodness(b.value) - goodness(a.value));
    const [first, second] = ranked;
    return {
      x,
      leader: first?.key ?? null,
      runnerUp: second?.key ?? null,
      ratio: first && second ? goodness(first.value) / goodness(second.value) : null,
    };
  });
}

export type ChapterCause = 'new-series' | 'new-config' | 'software-update' | 'rerun' | 'regression';

/** A date where a frontier's area moved by at least `CHAPTER_MIN_CHANGE`, with its cause. */
export interface FrontierChapter {
  date: string;
  dateIndex: number;
  /** Compared series this chapter belongs to; null for the pooled frontier of every series. */
  track: string | null;
  /** Series whose own frontier moved and so moved the track. */
  driver: string;
  /** Area after over area before; above 1 the frontier grew. Null when the track is new. */
  change: number | null;
  /** Largest single-interactivity move, oriented like `change`, where both curves reach. */
  peak: { x: number; ratio: number } | null;
  cause: ChapterCause;
  /**
   * Configurations new to the driver's frontier (`new-config`), updated (`software-update`) or
   * behind a `regression`: the one whose serving image changed, else the one that lost the most.
   */
  configs: string[];
  /** Serving image before and after, for `software-update` and a `regression` with a new image. */
  image: ImageChange | null;
}

export interface ImageChange {
  from: string | null;
  to: string | null;
}

/**
 * Area change that makes a chapter, and how far below its best a frontier must be to count as
 * regressed: big enough to be a visible step, not nightly noise.
 */
const CHAPTER_MIN_CHANGE = 0.1;

const MAX_IMAGE_LENGTH = 48;

/** The tag-bearing tail of an image reference, e.g. `sglang:v0.5.5.post2`, for display. */
export function shortImage(image: string | null, unknown: string): string {
  if (!image) return unknown;
  const tail = image.split('/').at(-1) ?? image;
  return tail.length > MAX_IMAGE_LENGTH ? `${tail.slice(0, MAX_IMAGE_LENGTH - 1)}…` : tail;
}

/** The serving image most of a frontier's vertices from one configuration ran. */
function dominantImage(vertices: readonly FrontierVertex[], config: string): string | null {
  const counts = new Map<string | null, number>();
  for (const v of vertices)
    if (v.config === config) counts.set(v.image, (counts.get(v.image) ?? 0) + 1);
  return [...counts].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Share of a frontier's vertices one configuration measured. */
const configShare = (vertices: readonly FrontierVertex[], config: string) =>
  vertices.filter((v) => v.config === config).length / Math.max(1, vertices.length);

/**
 * The configuration on both frontiers whose serving image changed, the one with the most
 * vertices after the change when several did, with its image before and after.
 */
function imageUpdate(
  before: readonly FrontierVertex[],
  after: readonly FrontierVertex[],
): { config: string; image: ImageChange } | null {
  const beforeConfigs = new Set(before.map((v) => v.config));
  const main = [...new Set(after.map((v) => v.config))]
    .filter(
      (config) =>
        beforeConfigs.has(config) && dominantImage(before, config) !== dominantImage(after, config),
    )
    .map((config) => ({ config, count: after.filter((v) => v.config === config).length }))
    .toSorted((a, b) => b.count - a.count)[0]?.config;
  return main
    ? { config: main, image: { from: dominantImage(before, main), to: dominantImage(after, main) } }
    : null;
}

/**
 * What lies behind a frontier that shrank: a configuration that changed serving image, else
 * the configuration that lost the largest share of the frontier.
 */
function regressionCause(
  before: readonly FrontierVertex[],
  after: readonly FrontierVertex[],
): { config: string | null; image: ImageChange | null } {
  const update = imageUpdate(before, after);
  if (update) return update;
  const lost = [...new Set(before.map((v) => v.config))]
    .map((config) => ({ config, loss: configShare(before, config) - configShare(after, config) }))
    .toSorted((a, b) => b.loss - a.loss)[0];
  return { config: lost?.config ?? null, image: null };
}

/** Why `driver`'s frontier changed between two dates; `grew` is the step's direction. */
function chapterCause(
  before: readonly FrontierVertex[],
  after: readonly FrontierVertex[],
  grew: boolean,
): Pick<FrontierChapter, 'cause' | 'configs' | 'image'> {
  if (before.length === 0) return { cause: 'new-series', configs: [], image: null };
  if (!grew) {
    const { config, image } = regressionCause(before, after);
    return { cause: 'regression', configs: config ? [config] : [], image };
  }
  const beforeConfigs = new Set(before.map((v) => v.config));
  const added = [...new Set(after.map((v) => v.config))].filter(
    (config) => !beforeConfigs.has(config),
  );
  if (added.length > 0) return { cause: 'new-config', configs: added, image: null };
  const update = imageUpdate(before, after);
  if (update) return { cause: 'software-update', configs: [update.config], image: update.image };
  return { cause: 'rerun', configs: [], image: null };
}

/**
 * Largest single-interactivity move between two curves where both reach, oriented so >1 is
 * better; the largest gain when `grew`, otherwise the largest loss.
 */
function peakMove(
  history: FrontierHistory,
  before: readonly FrontierVertex[],
  after: readonly FrontierVertex[],
  grew: boolean,
): { x: number; ratio: number } | null {
  let peak: { x: number; ratio: number } | null = null;
  for (const x of history.levels) {
    const old = frontierValueAt(before, x);
    const now = frontierValueAt(after, x);
    if (old === null || now === null || goodnessOf(history, old) === 0) continue;
    const ratio = goodnessOf(history, now) / goodnessOf(history, old);
    if (grew ? ratio > (peak?.ratio ?? 1) : ratio < (peak?.ratio ?? 1)) peak = { x, ratio };
  }
  return peak;
}

/**
 * Dates where a frontier stepped by at least `CHAPTER_MIN_CHANGE` of its area, and why.
 * `pooled` follows the single best frontier of `keys` and names the series that moved it;
 * otherwise each key is its own track. A series' first appearance is a chapter on its own
 * track; on the pooled track it counts when it moves the curve.
 */
export function frontierChapters(
  history: FrontierHistory,
  keys: readonly string[],
  pooled: boolean,
): FrontierChapter[] {
  const wanted = new Set(keys);
  const at = (index: number) => {
    const frontiers = seriesFrontiersAt(history, index);
    for (const key of frontiers.keys()) if (!wanted.has(key)) frontiers.delete(key);
    return frontiers;
  };
  const area = (vertices: readonly FrontierVertex[]) =>
    frontierArea(vertices, history.higherIsBetter);

  const chapters: FrontierChapter[] = [];
  const frontiersByDate = history.dates.map((_, index) => at(index));
  for (let index = 1; index < history.dates.length; index++) {
    const previous = frontiersByDate[index - 1];
    const current = frontiersByDate[index];
    const tracks = pooled
      ? [
          {
            track: null,
            before: pooledFrontier(previous, history.higherIsBetter),
            after: pooledFrontier(current, history.higherIsBetter),
          },
        ]
      : keys.map((key) => ({
          track: key,
          before: previous.get(key) ?? [],
          after: current.get(key) ?? [],
        }));
    for (const { track, before, after } of tracks) {
      const areaBefore = area(before);
      const areaAfter = area(after);
      if (areaAfter === 0 || (pooled && areaBefore === 0)) continue;
      const change = areaBefore === 0 ? null : areaAfter / areaBefore;
      if (change !== null && Math.abs(change - 1) < CHAPTER_MIN_CHANGE) continue;
      const grew = change === null || change > 1;
      // The driver is the series whose own area moved most in the direction of the step.
      const driver =
        track ??
        [...wanted]
          .map((key) => ({
            key,
            delta: area(current.get(key) ?? []) - area(previous.get(key) ?? []),
          }))
          .toSorted((a, b) => (grew ? b.delta - a.delta : a.delta - b.delta))[0].key;
      chapters.push({
        date: history.dates[index],
        dateIndex: index,
        track,
        driver,
        change,
        peak: peakMove(history, before, after, grew),
        ...chapterCause(previous.get(driver) ?? [], current.get(driver) ?? [], grew),
      });
    }
  }
  return chapters;
}

/** A frontier that covers at least `CHAPTER_MIN_CHANGE` less ground than its best so far. */
export interface FrontierRegression {
  key: string;
  /** Date the series' frontier covered the most ground, up to the date asked about. */
  bestDate: string;
  /** Area now over area at its best, below 1. */
  change: number;
  /** Largest single-interactivity drop against the best curve, where both reach. */
  peak: { x: number; ratio: number } | null;
  /** Configuration behind the drop: the one whose serving image changed, else the one that lost most. */
  config: string | null;
  /** That configuration's serving image at the best and now, when it changed. */
  image: ImageChange | null;
}

/**
 * Series among `keys` whose frontier on `dateIndex` covers at least `CHAPTER_MIN_CHANGE` less
 * ground than at its best up to that date. The frontier follows the latest full sweeps, so a
 * re-run that measures lower replaces a better one; this names it instead of hiding it.
 */
export function frontierRegressions(
  history: FrontierHistory,
  dateIndex: number,
  keys: readonly string[],
): FrontierRegression[] {
  const date = history.dates[dateIndex];
  const area = (vertices: readonly FrontierVertex[]) =>
    frontierArea(vertices, history.higherIsBetter);
  return keys.flatMap((key) => {
    const changes = (history.series.find((s) => s.key === key)?.changes ?? []).filter(
      (c) => c.date <= date,
    );
    const now = changes.at(-1);
    const best = changes.reduce<(typeof changes)[number] | undefined>(
      (top, c) => (!top || area(c.vertices) > area(top.vertices) ? c : top),
      undefined,
    );
    if (!now || !best || area(best.vertices) === 0) return [];
    const change = area(now.vertices) / area(best.vertices);
    if (change === 0 || change > 1 - CHAPTER_MIN_CHANGE) return [];
    return [
      {
        key,
        bestDate: best.date,
        change,
        peak: peakMove(history, best.vertices, now.vertices, false),
        ...regressionCause(best.vertices, now.vertices),
      },
    ];
  });
}

/** Every frontier vertex on every date it changed, one row per vertex. */
export function frontierHistoryToCsv(
  history: FrontierHistory,
  labelOf: (key: string) => string,
): { headers: string[]; rows: (string | number)[][] } {
  return {
    headers: [
      'series',
      'label',
      'date',
      'interactivity',
      'value',
      'concurrency',
      'precision',
      'measured',
      'runUrl',
      'config',
      'image',
    ],
    rows: history.series.flatMap((series) =>
      series.changes.flatMap((change) =>
        change.vertices.map((v) => [
          series.key,
          labelOf(series.key),
          change.date,
          v.x,
          v.y,
          v.conc,
          v.precision,
          v.measured,
          v.runUrl ?? '',
          v.config,
          v.image ?? '',
        ]),
      ),
    ),
  };
}
