/**
 * The Fleet Lifecycle surface: revenue or margin over (time × interactivity),
 * following the same y-axis selector as the 2D chart.
 *
 * The 2D lifecycle chart plots one staircase per chip at ONE interactivity — the
 * calculator's slider target. That hides the most interesting fact in the run
 * history: **which config wins changes with interactivity.** A chip's all-time
 * best at 30 tok/s/user is routinely a different sweep, from a different date,
 * than its best at 150. The staircase is a function of the operating point, not a
 * curve you can slide sideways.
 *
 * So this evaluates the whole 1D pipeline once per interactivity slice and
 * assembles the results into a grid a 3D view can draw:
 *
 *        margin/day
 *          ▲     ╱▔▔▔▔▔╲          one surface per chip
 *          │   ╱╱       ╲╲        ridges across z = configs that only win
 *          │ ╱╱___________╲╲      in a band of interactivity
 *          └──────────────────▶ time
 *           ╲
 *            ▼ interactivity
 *
 * Three properties of the data drive every decision here:
 *
 * 1. **Rungs are not aligned across slices.** Each slice's risers land on its own
 *    run dates, so slices are never interpolated into one another — every slice is
 *    evaluated independently and sampled onto one shared time grid.
 * 2. **Holes are real, banded and large.** A read outside a run's measured
 *    interactivity range is dropped rather than clamped, exactly as
 *    `historical-best.ts` does it, so a cell can honestly have no value. At the
 *    extremes of the interactivity axis almost every sweep is out of range. Those
 *    gaps are the finding, and callers must draw them as gaps.
 * 3. **The frontier is target-independent; only the read is not.** Building a
 *    frontier costs a Pareto pass plus a monotone-slope solve per metric, and
 *    `interpolateForGPU` pays that for ten metrics on every call. Twenty slices
 *    that way is ~160k spline builds. So this prepares each frontier once and
 *    reads it at every slice — and only for the three metrics a fleet needs.
 *
 * **Which way does the surface tilt along z?** Down, and steeply. Chip count is
 * fixed by the power budget and price is one scalar, so revenue tracks tok/s/chip —
 * and on the Pareto frontier that falls as interactivity rises, because faster
 * tokens per user means smaller batches. Measured on the shipped fixture: of 197
 * sweeps, tok/s/chip is lower at the top of the frontier's own range than at the
 * bottom in 160, unchanged in the 37 single-point frontiers, and **higher in none**.
 *
 * So a surface that climbs along z is never that trend reversing — it is the winner
 * changing at a coverage boundary. B300 on the fixture jumps 5,009 → 14,275 tok/s
 * between the 15.1 and 18.5 tok/s/user slices, and the reason is visible in the
 * rungs: below 18.5 the only readable config is `b300_dynamo-trt@2026-02-07`,
 * because the 2.85×-better `b300_dynamo-trt_mtp@2026-01-28` was never swept that
 * slow and so cannot be read there at all. The cliff is where a benchmark stops,
 * not where the economics turn — which is exactly why the holes are drawn as holes.
 *
 * The selection rules are the 1D module's, deliberately duplicated rather than
 * re-derived: clamped reads never count, a sweep that fails to beat the incumbent
 * is not a rung, and a chip's line is the upper envelope over its hwKeys.
 * `interactivity-surface.test.ts` pins that duplication by asserting this module
 * agrees with `bestSoFarProgression` + `mergeProgressionsByChip` slice by slice.
 * If either side drifts, that test fails.
 *
 * Nothing here imports React, and nothing here edits the interpolation
 * primitives — `paretoFrontUpperLeft`, `monotoneSlopes` and `hermiteInterpolate`
 * are composed as-is, because AGENTS.md hard-syncs them with a Python port.
 */

import { computeFleetStats } from './fleet';
import type { HistoryGroups } from './historical-best';
import { hermiteInterpolate, monotoneSlopes, paretoFrontUpperLeft } from './interpolation';
import {
  computeLifecycle,
  metricValue,
  valueAtMonth,
  type LifecycleAssumptions,
  type LifecycleMetric,
  type ThroughputStep,
} from './lifecycle';
import type { CalculatorMode, CostProvider, CostType, GPUDataPoint } from './types';

/** One chip's surface: a value per (interactivity slice, time sample), or null. */
export interface SurfaceChip {
  /** Base GPU registry key — the silicon the fleet is built from. */
  key: string;
  label: string;
  color: string;
  /** True when any rung on any slice came from a disaggregated run. */
  disagg: boolean;
  /** `cells[zIndex][timeIndex]` — the grid's metric in $/day, or null where nothing was measured. */
  cells: (number | null)[][];
  /** Slices this chip appears on at all, for the coverage disclosure. */
  slicesCovered: number;
}

export interface SurfaceGrid {
  chips: SurfaceChip[];
  /**
   * Which rate the cells hold, mirroring the 2D chart's y-axis selector. Carried on
   * the grid rather than passed alongside it so a view cannot label an axis with one
   * metric while drawing another — and so the break-even plane, which only means
   * something for margin, can be suppressed for revenue.
   */
  metric: LifecycleMetric;
  /** Shared time samples, ms. */
  times: number[];
  /** Shared interactivity slices, tok/s/user, ascending and log-spaced. */
  zs: number[];
  /** The calculator's current target, so a view can tie itself back to the 2D chart. */
  currentZ: number;
  /** Value range across every chip, always including zero. */
  yMin: number;
  yMax: number;
  /** Chips that had run history but produced no cell at any slice. */
  empty: string[];
}

/** A frontier prepared once, readable at any interactivity. */
export interface FrontierReader {
  /** Lowest measured interactivity on this frontier. */
  min: number;
  /** Highest measured interactivity on this frontier. */
  max: number;
  /**
   * The read at `target`, or null when it falls outside the measured range — the
   * no-extrapolation rule, matching `result.clamped` being rejected upstream.
   */
  read: (target: number) => FrontierRead | null;
}

export interface FrontierRead {
  /** The mode's output metric. Gated `> 0` upstream, as in the 1D path. */
  value: number;
  /** Throughput for the selected token type, tok/s/chip. */
  tput: number;
  /** Output throughput, tok/s/chip — concurrent users divide by this. */
  outputTput: number;
  /** tok/s/MW for the selected token type: the ranking basis. */
  rank: number;
  /** True when the bracketing frontier points came from a disaggregated run. */
  disagg: boolean;
}

/** Clamp a spline read into the metric's own data range, as `interpolateForGPU` does. */
function metricReader(xs: number[], ys: number[]): (target: number) => number {
  let lo = ys[0]!;
  let hi = ys[0]!;
  for (let i = 1; i < ys.length; i += 1) {
    if (ys[i]! < lo) lo = ys[i]!;
    if (ys[i]! > hi) hi = ys[i]!;
  }
  const slopes = monotoneSlopes(xs, ys);
  return (target: number) => Math.max(lo, Math.min(hi, hermiteInterpolate(xs, ys, slopes, target)));
}

/**
 * Prepare one sweep's frontier for reading at many interactivities.
 *
 * This is `interpolateForGPU`'s prologue — Pareto front, sort, per-metric slopes —
 * hoisted out so it is paid once instead of once per slice, and narrowed to the
 * three metrics a fleet projection needs out of that function's ten.
 */
export function prepareFrontier(
  points: readonly GPUDataPoint[],
  mode: CalculatorMode,
  costType: CostType,
): FrontierReader | null {
  if (points.length === 0) return null;

  const getInput = (p: GPUDataPoint) =>
    mode === 'interactivity_to_throughput' ? p.interactivity : p.throughput;
  const getOutput = (p: GPUDataPoint) =>
    mode === 'interactivity_to_throughput' ? p.throughput : p.interactivity;

  const frontier = paretoFrontUpperLeft([...points], getInput, getOutput);
  if (frontier.length === 0) return null;

  const sorted = [...frontier].toSorted((a, b) => getInput(a) - getInput(b));
  const min = getInput(sorted[0]!);
  const max = getInput(sorted.at(-1)!);

  const tputOf = (p: GPUDataPoint) => {
    if (costType === 'input') return p.inputThroughput;
    if (costType === 'output') return p.outputThroughput;
    return getOutput(p);
  };
  const rankOf = (p: GPUDataPoint) => {
    if (costType === 'input') return p.inputTpPerMw;
    if (costType === 'output') return p.outputTpPerMw;
    return p.tpPerMw;
  };

  /** Frontier points bracketing a target — the 1D path's `nearestPoints`. */
  const bracket = (target: number): GPUDataPoint[] => {
    if (target <= min) return [sorted[0]!];
    if (target >= max) return [sorted.at(-1)!];
    let lower = 0;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      if (getInput(sorted[i]!) <= target) lower = i;
    }
    return [sorted[lower]!, sorted[lower + 1]!];
  };

  // A single-point frontier can only be read at exactly its own interactivity;
  // anywhere else is extrapolation. In practice that means singleton sweeps never
  // contribute to a grid, which matches the 1D path rejecting them as clamped.
  if (sorted.length === 1) {
    const only = sorted[0]!;
    return {
      min,
      max,
      read: (target) =>
        target === min
          ? {
              value: getOutput(only),
              tput: tputOf(only),
              outputTput: only.outputThroughput,
              rank: rankOf(only),
              disagg: Boolean(only.disagg),
            }
          : null,
    };
  }

  const xs = sorted.map(getInput);
  const readValue = metricReader(xs, sorted.map(getOutput));
  const readTput = metricReader(xs, sorted.map(tputOf));
  const readOutputTput = metricReader(
    xs,
    sorted.map((p) => p.outputThroughput),
  );
  const readRank = metricReader(xs, sorted.map(rankOf));

  return {
    min,
    max,
    read: (target) => {
      // No extrapolation: outside the measured range there is no honest number,
      // which is the same reason the 1D path drops `clamped` reads.
      if (target < min || target > max) return null;
      return {
        value: readValue(target),
        tput: readTput(target),
        outputTput: readOutputTput(target),
        rank: readRank(target),
        disagg: bracket(target).some((p) => p.disagg),
      };
    },
  };
}

/** One rung of a chip's staircase at one interactivity slice. */
export interface SurfaceStep {
  date: string;
  hwKey: string;
  rank: number;
  tput: number;
  outputTput: number;
  disagg: boolean;
}

/** Frontiers for every (hwKey, date), prepared once and read at every slice. */
export type PreparedGroups = Map<string, { date: string; frontier: FrontierReader }[]>;

export function prepareGroups(
  groups: HistoryGroups,
  mode: CalculatorMode,
  costType: CostType,
): PreparedGroups {
  const prepared: PreparedGroups = new Map();
  for (const [hwKey, dated] of groups.byHwKey) {
    const ready = dated
      .flatMap((sweep) => {
        const frontier = prepareFrontier(sweep.points, mode, costType);
        return frontier ? [{ date: sweep.date, frontier }] : [];
      })
      .toSorted((a, b) => a.date.localeCompare(b.date));
    if (ready.length > 0) prepared.set(hwKey, ready);
  }
  return prepared;
}

/**
 * One chip's rungs at one interactivity, pooled across its hwKeys.
 *
 * Mirrors `bestSoFarProgression` (running maximum over dates, clamped reads and
 * non-improving sweeps skipped) followed by `mergeProgressionsByChip` (pool by
 * base GPU, stronger read first within a date). The equivalence with those two is
 * asserted in the tests rather than assumed.
 */
export function stepsAtInteractivity(
  prepared: PreparedGroups,
  target: number,
  visibleHwKeys?: ReadonlySet<string>,
): Map<string, SurfaceStep[]> {
  const pooled = new Map<string, SurfaceStep[]>();

  for (const [hwKey, dated] of prepared) {
    if (visibleHwKeys && !visibleHwKeys.has(hwKey)) continue;
    const baseGpu = hwKey.split('_')[0] ?? hwKey;
    let best = -Infinity;

    for (const { date, frontier } of dated) {
      const read = frontier.read(target);
      if (!read || !(read.value > 0)) continue;
      if (!Number.isFinite(read.rank) || read.rank <= 0) continue;
      // Per-hwKey running maximum, mirroring `bestSoFarProgression`. Note this
      // gate cannot change the merged output — the pooled pass below runs its own
      // running maximum and would drop the same candidates — so it is an early
      // filter, not the rule that makes the staircase a staircase. Mutating it
      // away leaves every test green; that is the algorithm, not a gap in them.
      if (read.rank <= best) continue;
      best = read.rank;
      const list = pooled.get(baseGpu) ?? [];
      list.push({
        date,
        hwKey,
        rank: read.rank,
        tput: read.tput,
        outputTput: read.outputTput,
        disagg: read.disagg,
      });
      pooled.set(baseGpu, list);
    }
  }

  // Second running maximum, over the pooled rungs: the pointwise maximum of
  // running maxima is the running maximum of their union.
  const merged = new Map<string, SurfaceStep[]>();
  for (const [baseGpu, candidates] of pooled) {
    const ordered = [...candidates].toSorted(
      (a, b) => a.date.localeCompare(b.date) || b.rank - a.rank,
    );
    const steps: SurfaceStep[] = [];
    let best = -Infinity;
    for (const candidate of ordered) {
      if (candidate.rank <= best) continue;
      best = candidate.rank;
      steps.push(candidate);
    }
    if (steps.length > 0) merged.set(baseGpu, steps);
  }
  return merged;
}

/** Ascending, log-spaced slice values. Log because both coverage and the physics are multiplicative. */
export function logSpacedSlices(min: number, max: number, count: number): number[] {
  if (!(min > 0) || !(max > min) || count < 2) return min > 0 ? [min] : [];
  const lo = Math.log(min);
  const hi = Math.log(max);
  return Array.from({ length: count }, (_, i) => Math.exp(lo + ((hi - lo) * i) / (count - 1)));
}

/**
 * The interactivity span worth sampling: the envelope of every frontier's own
 * measured range. Sampling wider would only produce empty slices.
 */
export function measuredInteractivitySpan(prepared: PreparedGroups): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const dated of prepared.values()) {
    for (const { frontier } of dated) {
      if (frontier.min < min) min = frontier.min;
      if (frontier.max > max) max = frontier.max;
    }
  }
  return Number.isFinite(min) && max > min ? [min, max] : null;
}

export interface SurfaceGridOptions {
  groups: HistoryGroups;
  /** Legend visibility, applied per hwKey exactly as the 2D path does. */
  visibleHwKeys?: ReadonlySet<string>;
  mode: CalculatorMode;
  /**
   * Which rate to fill the cells with — the 2D chart's y-axis selector, shared so
   * the two views never disagree about what is being plotted.
   */
  metric: LifecycleMetric;
  /**
   * Retained for API symmetry with the 1D path even though the grid reads cost
   * through `specsFor`: callers pass the same options object to both.
   */
  costProvider: CostProvider;
  costType: CostType;
  /** Facility power budget, MW. */
  mw: number;
  /** x origin: the model's release date, as a timestamp. */
  anchorMs: number;
  horizonMonths: number;
  /** Shared with the 2D section, price included — see the note below. */
  assumptions: LifecycleAssumptions;
  /** The calculator's current interactivity target. */
  currentZ: number;
  /** Interactivity slices. Default: log-spaced across the measured span. */
  zs?: number[];
  /** Time samples across the window. Default: `TIME_SAMPLES` uniform. */
  times?: number[];
  labelFor: (baseGpu: string) => string;
  colorFor: (baseGpu: string) => string;
  /** All-in power (kW) and $/chip/hr for a base GPU, or null when unregistered. */
  specsFor: (baseGpu: string) => { powerKwPerGpu: number; costPerGpuHour: number } | null;
}

const MS_PER_MONTH = (365.25 / 12) * 24 * 3600 * 1000;

/** Slices across the interactivity axis. Twenty reads as a surface without melting a laptop. */
export const SLICE_COUNT = 20;

/** Samples along the time axis, shared by every chip and slice so quads stay well-formed. */
export const TIME_SAMPLES = 120;

/**
 * Assemble the grid.
 *
 * **Price is one scalar for the whole surface**, shared with the 2D section rather
 * than re-seeded to break-even per slice. Margin is revenue − cost, and re-seeding
 * would zero the margin along every slice at once — flattening the break-even
 * crossing into a plane and destroying the cross-slice comparison the third axis
 * exists for. One price means the zero contour is a real answer: it is where this
 * fleet, at the price you set, stops losing money.
 *
 * On the revenue metric the same price still applies, but zero is then just the
 * floor rather than a threshold — cost is not subtracted, so nothing crosses it.
 * Callers must not draw a break-even plane over a revenue grid.
 */
export function buildSurfaceGrid(options: SurfaceGridOptions): SurfaceGrid | null {
  const {
    groups,
    visibleHwKeys,
    mode,
    metric,
    costType,
    mw,
    anchorMs,
    horizonMonths,
    assumptions,
    currentZ,
    labelFor,
    colorFor,
    specsFor,
  } = options;

  if (!(mw > 0) || !Number.isFinite(anchorMs) || !(horizonMonths > 0)) return null;

  const prepared = prepareGroups(groups, mode, costType);
  if (prepared.size === 0) return null;

  const span = measuredInteractivitySpan(prepared);
  if (!span) return null;
  const zs = options.zs ?? logSpacedSlices(span[0], span[1], SLICE_COUNT);
  if (zs.length === 0) return null;

  const times =
    options.times ??
    Array.from(
      { length: TIME_SAMPLES },
      (_, i) => anchorMs + (horizonMonths * MS_PER_MONTH * i) / (TIME_SAMPLES - 1),
    );
  const monthOf = times.map((ms) => (ms - anchorMs) / MS_PER_MONTH);

  /** cells per chip, filled slice by slice. */
  const cellsByChip = new Map<string, (number | null)[][]>();
  const disaggByChip = new Map<string, boolean>();
  const seen = new Set<string>();
  let yMin = 0;
  let yMax = 0;

  for (let zi = 0; zi < zs.length; zi += 1) {
    const merged = stepsAtInteractivity(prepared, zs[zi]!, visibleHwKeys);

    for (const [baseGpu, steps] of merged) {
      seen.add(baseGpu);
      const specs = specsFor(baseGpu);
      if (!specs) continue;

      const throughputSteps: ThroughputStep[] = [];
      let costPerHour: number | null = null;
      for (const step of steps) {
        const stats = computeFleetStats({
          mw,
          powerKwPerGpu: specs.powerKwPerGpu,
          costPerGpuHour: specs.costPerGpuHour,
          tputPerGpu: step.tput,
          outputTputPerGpu: step.outputTput,
          interactivity: zs[zi]!,
        });
        if (!stats) continue;
        // Chip count and $/chip/hr come from the base GPU, so cost is flat across
        // both axes — the same invariant the 2D section relies on.
        costPerHour ??= stats.costPerHour;
        throughputSteps.push({
          month: (Date.parse(`${step.date}T00:00:00Z`) - anchorMs) / MS_PER_MONTH,
          fleetTokPerSec: stats.fleetTokPerSec,
        });
      }
      if (throughputSteps.length === 0 || costPerHour === null) continue;

      const series = computeLifecycle({
        steps: throughputSteps,
        costPerHour,
        horizonMonths,
        assumptions,
      });
      if (!series) continue;

      let cells = cellsByChip.get(baseGpu);
      if (!cells) {
        cells = Array.from({ length: zs.length }, () =>
          Array.from({ length: times.length }, () => null as number | null),
        );
        cellsByChip.set(baseGpu, cells);
      }
      const row = cells[zi]!;
      for (let ti = 0; ti < monthOf.length; ti += 1) {
        const value = valueAtMonth(series.points, monthOf[ti]!, (p) => metricValue(p, metric));
        if (value === null) continue;
        row[ti] = value;
        if (value < yMin) yMin = value;
        if (value > yMax) yMax = value;
      }
      if (steps.some((s) => s.disagg)) disaggByChip.set(baseGpu, true);
    }
  }

  const chips: SurfaceChip[] = [];
  for (const [key, cells] of cellsByChip) {
    const slicesCovered = cells.filter((row) => row.some((v) => v !== null)).length;
    if (slicesCovered === 0) continue;
    chips.push({
      key,
      label: labelFor(key),
      color: colorFor(key),
      disagg: disaggByChip.get(key) ?? false,
      cells,
      slicesCovered,
    });
  }
  if (chips.length === 0) return null;

  chips.sort((a, b) => a.label.localeCompare(b.label));
  // Named, not dropped: a chip the legend shows and the surface cannot size reads
  // as missing data unless the caller says why.
  const empty = [...seen].filter((key) => !cellsByChip.has(key)).toSorted();

  return { chips, metric, times, zs, currentZ, yMin, yMax, empty };
}
