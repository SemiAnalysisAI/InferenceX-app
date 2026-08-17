/**
 * The Fleet Lifecycle surface: revenue or margin over (time × interactivity),
 * following the same y-axis selector as the 2D chart.
 *
 * The 2D lifecycle chart plots one staircase per chip at ONE interactivity — the
 * calculator's slider target. This adds the interactivity axis back, and answers:
 * **the fleet I would deploy for my target, what does it earn if users turn out to
 * want faster or slower tokens than I planned for?**
 *
 * 🔴 The rule that shapes everything: **a fleet runs one config at a time.** So the
 * rungs are chosen ONCE, at the target, by exactly the 1D pipeline — and every slice
 * then re-reads *those same sweeps* at its own interactivity. A date has one config
 * across the whole z axis, because that is what a deployed fleet has.
 *
 * The tempting alternative is to re-derive the best-so-far staircase per slice, so
 * each slice shows its own winner. That draws something no operator can buy: at one
 * instant it has the fleet running config A for the users who want 20 tok/s/user and
 * config B for the users who want 120, which is two fleets. It also puts step changes
 * along z wherever the winner flips, and those cliffs read as economics when they are
 * really just the boundary of where a sweep was run.
 *
 * The cost of the honest rule is worth stating plainly, because it is a real
 * limitation of the view: **away from the target, the surface is not the best this
 * chip could do.** A config picked for 35 tok/s/user may be beaten at 120 by one the
 * fleet passed over, and this surface will not show that — it shows what the fleet
 * you chose actually delivers there. Callers must say so.
 *
 * The grid a 3D view draws:
 *
 *        margin/day
 *          ▲     ╱▔▔▔▔▔╲          one surface per chip
 *          │   ╱╱       ╲╲        the slice at the target IS the 2D chart's line
 *          │ ╱╱___________╲╲      elsewhere: the same configs, read faster/slower
 *          └──────────────────▶ time
 *           ╲
 *            ▼ interactivity
 *
 * Three properties of the data drive every decision here:
 *
 * 1. **Rungs are not aligned across slices.** A rung exists on a slice only where its
 *    own sweep was measured, so slices are never interpolated into one another —
 *    every slice is evaluated independently and sampled onto one shared time grid.
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
 * **Which way does the surface tilt along z?** For total-token pricing: down. Chip
 * count is fixed by the power budget and price is one scalar, so revenue tracks the
 * throughput read — and for `costType === 'total'` that read is the Pareto frontier's
 * own y axis, which `paretoFrontUpperLeft` constructs strictly decreasing in
 * interactivity. That much is a theorem about the selection, not an observation about
 * the data: on the shipped fixture (1k/1k, fp8 + fp4, 197 sweeps) all 160 multi-point
 * frontiers fall across their own range and the 37 singletons are flat, because they
 * cannot do anything else.
 *
 * The selection guaranteeing it is not the same as the plot showing it, and for a
 * while it did not. What a slice plots is `computeLifecycle`'s reconstruction of the
 * rungs readable there, and a rung unreadable at one slice is dropped from that
 * slice's timeline — which moves where the previous rollout's ramp ends. While the
 * ramp was sampled by cutting that window into a fixed number of pieces, the sample
 * spacing moved with it, so two slices reconstructed the identical governing config
 * on different grids and disagreed by more than the selection ever could. Real, on
 * the real fixture, invisible at `rampMonths: 0` and present at the shipped default
 * of 3. The sampler is now anchored to a cadence fixed by `rampMonths` alone
 * (`lifecycle.ts`, and the pin lives there because the invariant is not about this
 * module), which restores the guarantee: 0 rises in ~415k cross-slice comparisons at
 * every ramp from 0 to 12.
 *
 * For input- or output-token pricing there is **no such guarantee**: those reads are
 * not the axis the frontier is built on, and on disaggregated sweeps the
 * prefill:decode mix shifts along the frontier, so input tok/s/chip can genuinely
 * rise with interactivity. The shipped fixture does it — `mi355x_mori-sglang`
 * (8k/1k, 2026-05-28) rises 1.4× mid-range on input throughput while its total falls
 * 47× across the same range — and grids built at
 * `costType === 'input'` carry z-rises of up to ~4% per slice step. A rise there is
 * measured data, not a config leaking across slices: the one-config-per-date rule
 * still holds; it is the priced token mix that moves.
 *
 * **A running total cannot span a hole.** Where a rung the fleet ran is missing from
 * a slice's timeline, the integral across that window is the previous config's rate
 * standing in for a faster one, and every later total carries the error invisibly. So
 * cumulative rows stop at their first gap, and a slice missing its first rung shows
 * nothing at all. The rates are left to resume after a gap, because a rate depends
 * only on the config governing at that instant.
 *
 * Holding the config fixed is what lets that read cleanly. With a per-slice winner
 * the same fixture jumps 5,009 → 14,275 tok/s between the 15.1 and 18.5 tok/s/user
 * slices — not because the economics turn, but because below 18.5 the 2.85×-better
 * `b300_dynamo-trt_mtp@2026-01-28` was never swept and a weaker config inherits the
 * slice. Fixing the rungs turns that artefact back into what it is: a hole.
 *
 * The selection rules are the 1D module's, deliberately duplicated rather than
 * re-derived: clamped reads never count, a sweep that fails to beat the incumbent
 * is not a rung, and a chip's line is the upper envelope over its hwKeys.
 * `interactivity-surface.test.ts` pins that duplication by asserting
 * `stepsAtInteractivity` agrees with `bestSoFarProgression` +
 * `mergeProgressionsByChip` at every target. If either side drifts, that test fails —
 * and because the grid selects at the calculator's own target, that agreement is also
 * what makes the slice at the target identical to the 2D chart's line.
 *
 * Nothing here imports React, and nothing here edits the interpolation
 * primitives — `paretoFrontUpperLeft`, `monotoneSlopes` and `hermiteInterpolate`
 * are composed as-is, because AGENTS.md hard-syncs them with a Python port.
 */

import { computeFleetStats } from './fleet';
import type { HistoryGroups } from './historical-best';
import { hermiteInterpolate, monotoneSlopes, paretoFrontUpperLeft } from './interpolation';
import {
  billableTokPerSec,
  computeLifecycle,
  isCumulative,
  MS_PER_MONTH,
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
  /** Input throughput, tok/s/chip — the base the cached-token discount applies to. */
  inputTput: number;
  /**
   * Cached fraction of input tokens, or undefined when the frontier did not
   * carry a measured rate on every point. Same rule as the 1D path, so both
   * views discount the same tokens.
   */
  cacheHitRate?: number;
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
 * five metrics a fleet projection needs out of that function's eleven.
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
              inputTput: only.inputThroughput,
              cacheHitRate: only.cacheHitRate,
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
  const readInputTput = metricReader(
    xs,
    sorted.map((p) => p.inputThroughput),
  );
  const readRank = metricReader(xs, sorted.map(rankOf));
  // All-or-nothing, exactly as `interpolateForGPU` decides it — a frontier that
  // is only partly measured opts out rather than having zeros splined into it.
  const readCacheHitRate = sorted.every((p) => typeof p.cacheHitRate === 'number')
    ? metricReader(
        xs,
        sorted.map((p) => p.cacheHitRate!),
      )
    : null;

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
        inputTput: readInputTput(target),
        cacheHitRate: readCacheHitRate ? readCacheHitRate(target) : undefined,
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
  /**
   * The sweep this rung came from, still readable at other interactivities.
   *
   * This is what lets the surface hold one config per date across the whole z axis:
   * the rung is selected once, then re-read along z instead of a new winner being
   * chosen per slice.
   */
  frontier: FrontierReader;
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
        frontier,
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

/**
 * The span the *chosen* configs actually cover.
 *
 * Narrower than `measuredInteractivitySpan`, and that is the point: once the rungs
 * are fixed at the target, sweeps that never appear on any fleet cannot contribute a
 * cell, so an axis drawn to their envelope would be mostly empty.
 */
export function spanOfSteps(chosen: Map<string, SurfaceStep[]>): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const steps of chosen.values()) {
    for (const step of steps) {
      if (step.frontier.min < min) min = step.frontier.min;
      if (step.frontier.max > max) max = step.frontier.max;
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
  /**
   * Price of a cached input token as a fraction of a fresh one. Shared with the
   * 2D section so both views bill the same tokens; 1 disables the discount, and
   * it has no effect at all where no cache rate was measured.
   */
  cacheReadRatio: number;
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

/**
 * Rungs whose rollout starts from a level this slice cannot see.
 *
 * A config ramps up from whatever the fleet was already serving. If the config before
 * it was never measured at this interactivity, that starting level is unknown here, so
 * the ramp — and only the ramp — is not a real number. The plateau after it is this
 * config's own rate and is fine.
 *
 * Contamination chains: a rung that ramps from a rung which was itself still ramping
 * from an unmeasured level inherits the problem, but only while that earlier rollout
 * was still climbing.
 */
function contaminatedRungs(
  reads: readonly (FrontierRead | null)[],
  months: readonly number[],
  rampMonths: number,
): boolean[] {
  const suspect: boolean[] = [];
  for (let i = 0; i < reads.length; i += 1) {
    if (i === 0 || !reads[i]) {
      suspect[i] = false;
      continue;
    }
    if (!reads[i - 1]) {
      suspect[i] = true;
      continue;
    }
    suspect[i] = suspect[i - 1]! && months[i]! < months[i - 1]! + rampMonths;
  }
  return suspect;
}

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
    cacheReadRatio,
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

  // The config timeline is chosen ONCE, at the calculator's target — see the note on
  // this function. Every slice then re-reads these same rungs.
  const chosen = stepsAtInteractivity(prepared, currentZ, visibleHwKeys);
  if (chosen.size === 0) return null;

  const span = spanOfSteps(chosen);
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
  const rampMonths =
    Number.isFinite(assumptions.rampMonths) && assumptions.rampMonths > 0
      ? assumptions.rampMonths
      : 0;

  /** cells per chip, filled slice by slice. */
  const cellsByChip = new Map<string, (number | null)[][]>();
  const disaggByChip = new Map<string, boolean>();
  const seen = new Set<string>();
  let yMin = 0;
  let yMax = 0;

  for (const [baseGpu, steps] of chosen) {
    seen.add(baseGpu);
    const specs = specsFor(baseGpu);
    if (!specs) continue;
    if (steps.some((s) => s.disagg)) disaggByChip.set(baseGpu, true);

    const rungMonths = steps.map(
      (step) => (Date.parse(`${step.date}T00:00:00Z`) - anchorMs) / MS_PER_MONTH,
    );

    for (let zi = 0; zi < zs.length; zi += 1) {
      // The rungs' own sweeps, re-read at this interactivity. A rung whose sweep was
      // never measured this fast or this slow has no value here — the fleet still ran
      // that config, but nothing measured says what it did at this speed.
      const reads = steps.map((step) => {
        const read = step.frontier.read(zs[zi]!);
        return read && read.value > 0 ? read : null;
      });
      if (reads.every((read) => read === null)) continue;

      const throughputSteps: ThroughputStep[] = [];
      // Which rungs actually reached the integrated timeline. Today this is exactly
      // `reads[i] !== null`, because the only way to lose a readable rung below is a
      // sizing failure and those depend on mw and per-GPU power alone — - fixed for
      // the whole chip. It is recorded from the push anyway so that what a running
      // total is judged against is the timeline the integral was built from, rather
      // than a second list that happens to agree.
      const onTimeline = reads.map(() => false);
      let costPerHour: number | null = null;
      let provisionedMw: number | null = null;
      for (const [i, read] of reads.entries()) {
        if (!read) continue;
        const stats = computeFleetStats({
          mw,
          powerKwPerGpu: specs.powerKwPerGpu,
          costPerGpuHour: specs.costPerGpuHour,
          tputPerGpu: read.tput,
          outputTputPerGpu: read.outputTput,
          interactivity: zs[zi]!,
        });
        if (!stats) continue;
        // Chip count and $/chip/hr come from the base GPU, so cost is flat across
        // both axes — the same invariant the 2D section relies on.
        costPerHour ??= stats.costPerHour;
        // Whole chips, so the fleet occupies slightly less than the budget — the
        // 2D section divides by the same actually-provisioned figure.
        provisionedMw ??= (stats.gpus * specs.powerKwPerGpu) / 1000;
        onTimeline[i] = true;
        // Sized on the physical rate, billed on the discounted one — `gpus` is
        // whole chips either way, so this is exactly `stats.fleetTokPerSec` when
        // there is no cached fraction to discount.
        throughputSteps.push({
          month: rungMonths[i]!,
          billableTokPerSec:
            stats.gpus *
            billableTokPerSec(
              read.tput,
              read.inputTput,
              read.cacheHitRate,
              cacheReadRatio,
              costType,
            ),
        });
      }
      if (throughputSteps.length === 0 || costPerHour === null || provisionedMw === null) continue;

      const series = computeLifecycle({
        steps: throughputSteps,
        costPerHour,
        provisionedMw,
        horizonMonths,
        assumptions,
      });
      if (!series) continue;

      const suspect = contaminatedRungs(reads, rungMonths, rampMonths);

      // A running total inherits every interval before it. Where a rung the fleet
      // actually ran is missing from this slice's timeline, the integral across that
      // window is a fiction — the previous config's rate standing in for one the
      // staircase says was faster — and every later total silently carries it. A rate
      // can honestly resume after such a gap, because it depends only on the config
      // governing at that instant; a total cannot. So a cumulative row stops at its
      // first gap, and a slice missing its first rung has no origin to integrate from
      // and shows nothing at all. Otherwise the totals compared along z would cover
      // different windows, which is not a comparison. Where there is more than one
      // gap it is the FIRST that ends the row — everything past it is downstream of a
      // window this slice cannot account for, including the stretches it can see.
      const firstGap = onTimeline.indexOf(false);
      const truncateFrom =
        isCumulative(metric) && firstGap !== -1 ? rungMonths[firstGap]! : Number.POSITIVE_INFINITY;

      let cells = cellsByChip.get(baseGpu);
      if (!cells) {
        cells = Array.from({ length: zs.length }, () =>
          Array.from({ length: times.length }, () => null as number | null),
        );
        cellsByChip.set(baseGpu, cells);
      }
      const row = cells[zi]!;
      for (let ti = 0; ti < monthOf.length; ti += 1) {
        const month = monthOf[ti]!;
        if (month >= truncateFrom) continue;
        // Which config the fleet is running at this instant. Fixed by the timeline,
        // so it is the same config on every slice — that is the whole rule.
        let governing = -1;
        for (let i = 0; i < rungMonths.length; i += 1) {
          if (rungMonths[i]! <= month) governing = i;
        }
        if (governing < 0) continue;
        // The config in effect here was never measured at this interactivity: a hole,
        // not the previous config. Falling back would put a different config at this
        // date on this slice than on the next one, which is the bug this guards.
        if (!reads[governing]) continue;
        // Still rolling out from a level this slice cannot see — the ramp would start
        // from the wrong place. Once it completes, the level is this config's own.
        if (suspect[governing] && month < rungMonths[governing]! + rampMonths) continue;

        const value = valueAtMonth(series.points, month, (p) => metricValue(p, metric));
        if (value === null) continue;
        row[ti] = value;
        if (value < yMin) yMin = value;
        if (value > yMax) yMax = value;
      }
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
