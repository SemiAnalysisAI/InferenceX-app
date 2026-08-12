/**
 * Pure interpolation functions — no React, no 'use client'.
 * Shared by both server-side (compare SSR) and client-side (calculator, trends).
 */

import type { CostProvider, GPUDataPoint, InterpolatedResult } from './types';

/**
 * Compute the upper-left pareto front for GPUDataPoints.
 * This is the same algorithm used by the main inference charts for the
 * interactivity view (y_tpPerGpu_roofline: "upper_left").
 *
 * For interactivity->throughput mode:
 *   x = interactivity (tok/s/user), y = throughput (tok/s/gpu)
 *   upper_left = for decreasing x, y must be strictly increasing
 *   (lower interactivity allows higher throughput on the frontier)
 *
 * For throughput->interactivity mode:
 *   x = throughput, y = interactivity
 *   We also use upper_left so the frontier represents the best tradeoff.
 */
export function paretoFrontUpperLeft<T>(
  points: T[],
  getX: (p: T) => number,
  getY: (p: T) => number,
): T[] {
  if (points.length === 0) return [];

  const sorted = [...points].toSorted((a, b) => {
    const ax = getX(a);
    const bx = getX(b);
    if (ax === bx) return getY(b) - getY(a);
    return ax - bx;
  });

  const front: T[] = [];

  for (const point of sorted) {
    const px = getX(point);
    const py = getY(point);

    if (front.length > 0 && getX(front.at(-1)!) === px) {
      if (py > getY(front.at(-1)!)) {
        front[front.length - 1] = point;
      }
      continue;
    }

    while (front.length > 0 && py >= getY(front.at(-1)!)) {
      front.pop();
    }
    front.push(point);
  }

  return front;
}

// ---------------------------------------------------------------------------
// Monotone cubic Hermite spline interpolation (Steffen method)
// Matches d3.curveMonotoneX used by the main inference chart rooflines.
// Reference: Steffen, M. 1990. A Simple Method for Monotonic Interpolation
// in One Dimension. Astronomy and Astrophysics, Vol. 239, NO. NOV(II), P. 443.
// ---------------------------------------------------------------------------

export function sign(x: number): number {
  return x < 0 ? -1 : 1;
}

/**
 * Build spline coefficients for a monotone cubic Hermite interpolant.
 * Returns the tangent slopes m[] at each knot, using the same Steffen method
 * as d3.curveMonotoneX (d3-shape/src/curve/monotone.js).
 */
export function monotoneSlopes(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  if (n < 2) return Array.from({ length: n }, () => 0);

  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const hi = xs[i + 1] - xs[i];
    h.push(hi);
    s.push(hi === 0 ? 0 : (ys[i + 1] - ys[i]) / hi);
  }

  const m: number[] = Array.from({ length: n }, () => 0);
  for (let i = 1; i < n - 1; i++) {
    const s0 = s[i - 1];
    const s1 = s[i];
    const h0 = h[i - 1];
    const h1 = h[i];
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    m[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }

  m[0] = h[0] ? (3 * s[0] - m[1]) / 2 : m[1];
  m[n - 1] = h[n - 2] ? (3 * s[n - 2] - m[n - 2]) / 2 : m[n - 2];

  return m;
}

/**
 * Evaluate a monotone cubic Hermite spline at targetX.
 * xs must be sorted ascending with no duplicates.
 */
export function hermiteInterpolate(
  xs: number[],
  ys: number[],
  m: number[],
  targetX: number,
): number {
  const n = xs.length;
  if (n === 0) return 0;
  if (n === 1) return ys[0];

  if (targetX <= xs[0]) return ys[0];
  if (targetX >= xs[n - 1]) return ys[n - 1];

  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= targetX) lo = mid;
    else hi = mid;
  }

  const hh = xs[hi] - xs[lo];
  if (hh === 0) return ys[lo];

  const t = (targetX - xs[lo]) / hh;
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * ys[lo] + h10 * hh * m[lo] + h01 * ys[hi] + h11 * hh * m[hi];
}

/** Map a (costProvider, costType) pair to the correct GPUDataPoint field. */
export function getCostField(
  p: GPUDataPoint,
  costProvider: CostProvider,
  costType: 'total' | 'input' | 'output',
): number {
  if (costType === 'input') {
    return costProvider === 'costh' ? p.costhi : costProvider === 'costn' ? p.costni : p.costri;
  }
  if (costType === 'output') {
    return costProvider === 'costh'
      ? p.costhOutput
      : costProvider === 'costn'
        ? p.costnOutput
        : p.costrOutput;
  }
  return p[costProvider];
}

/**
 * Recover the constant numerator `c` of a metric that is defined as
 * `c / throughput`, from any frontier point that carries both values.
 *
 * Cost per million tokens is `$/GPU-hr x 1e6 / (tok/s x 3600)` and energy per
 * token is `W / (tok/s)`: both are a per-chip constant divided by a throughput,
 * and the constant is identical at every point of a config. Recovering it from
 * the points avoids threading the hardware registry into this module, which must
 * stay dependency-free for the Python port.
 *
 * Why this exists: independently splining the reciprocal metric and throughput
 * produces two curves that need not satisfy `metric x throughput = c` between
 * measured knots. Deriving from the interpolated throughput preserves that
 * defining identity. The numerical effect depends on frontier density and can
 * move either direction with Steffen splines; see docs/tco-calculator.md for a
 * dated, reproducible measurement against the live API.
 *
 * Returns null unless EVERY usable point agrees on the constant. That check is
 * the safety rail: the identity is what licenses re-deriving the metric, so a
 * metric whose numerator actually varies per point (measured power, say) must
 * fall back to being splined directly rather than have its values silently
 * rewritten from one point's ratio.
 */
export function recoverReciprocalNumerator(
  values: readonly number[],
  throughputs: readonly number[],
): number | null {
  // Dashboard values come from one getGpuSpecs(hwKey) lookup, so they agree to
  // float rounding (~1e-16). The tolerance is far looser than that on purpose:
  // the Python port is fed hand-assembled JSON for blog tables, where costs are
  // written to a few decimals and a 1e-9 gate would silently reject them and
  // fall back to the worse method. 0.1% still comfortably rejects what this
  // guard is for — a numerator that genuinely varies per point, like measured
  // power, which moves by whole percent across a sweep. And a numerator varying
  // by less than 0.1% makes deriving and splining agree anyway.
  const RELATIVE_TOLERANCE = 1e-3;
  let numerator: number | null = null;

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const throughput = throughputs[i];
    if (value === undefined || throughput === undefined) continue;
    if (!(value > 0) || !(throughput > 0)) continue;

    const candidate = value * throughput;
    if (numerator === null) {
      numerator = candidate;
    } else if (Math.abs(candidate - numerator) > Math.abs(numerator) * RELATIVE_TOLERANCE) {
      return null;
    }
  }

  return numerator;
}

/** Evaluate a `numerator / throughput` metric at an interpolated throughput. */
export function reciprocalMetricAt(numerator: number | null, throughput: number): number {
  if (numerator === null || !(throughput > 0)) return 0;
  return numerator / throughput;
}

/**
 * The single provider rate that must explain every cost field on these points,
 * or null if it does not.
 *
 * All three token types share one `$/GPU-hr x 1e6/3600` and differ only in the
 * throughput they divide, so consistency has to be checked across all of them
 * together. Checking one family in isolation and falling back to another would
 * recover a rate from output tokens and then apply it to total throughput.
 */
function recoverCostRate(
  sorted: readonly GPUDataPoint[],
  costProvider: CostProvider,
): number | null {
  return recoverReciprocalNumerator(
    [
      ...sorted.map((p) => getCostField(p, costProvider, 'total')),
      ...sorted.map((p) => getCostField(p, costProvider, 'output')),
      ...sorted.map((p) => getCostField(p, costProvider, 'input')),
    ],
    [
      ...sorted.map((p) => p.throughput),
      ...sorted.map((p) => p.outputThroughput),
      ...sorted.map((p) => p.inputThroughput),
    ],
  );
}

/**
 * Given a set of data points for a single GPU, find the maximum interactivity
 * (tok/s/user) whose interpolated cost per million tokens stays at or below
 * `targetCost`, using the same Pareto frontier + monotone spline as
 * interpolateForGPU.
 *
 * Total-token cost is monotonically increasing in interactivity along the
 * frontier (throughput strictly decreases, so cost = rate/tput increases),
 * but input/output-token costs need not be — so the search is a dense scan
 * over the spline followed by a bisection refinement of the crossing segment
 * rather than a single bisection.
 *
 * Returns null when no interactivity on the frontier fits the budget.
 */
export function maxInteractivityAtCost(
  points: GPUDataPoint[],
  targetCost: number,
  costProvider: CostProvider,
  costType: 'total' | 'input' | 'output',
): number | null {
  if (points.length === 0 || targetCost <= 0) return null;

  const frontier = paretoFrontUpperLeft(
    points,
    (p) => p.interactivity,
    (p) => p.throughput,
  );
  if (frontier.length === 0) return null;

  const sorted = [...frontier].toSorted((a, b) => a.interactivity - b.interactivity);
  const getCost = (p: GPUDataPoint) => getCostField(p, costProvider, costType);

  if (sorted.length === 1) {
    return getCost(sorted[0]) <= targetCost ? sorted[0].interactivity : null;
  }

  const xs = sorted.map((p) => p.interactivity);
  // Cost is derived from the interpolated throughput of the selected token type,
  // exactly as interpolateForGPU does it — otherwise this inverse lookup would
  // answer against a different cost curve than the bars the user is reading.
  const getTput = (p: GPUDataPoint) =>
    costType === 'input'
      ? p.inputThroughput
      : costType === 'output'
        ? p.outputThroughput
        : p.throughput;
  const tputs = sorted.map(getTput);
  const costs = sorted.map(getCost);
  // Same decision as interpolateForGPU, so the inverse lookup and the bars can
  // never answer against different cost curves.
  const rate = recoverCostRate(sorted, costProvider);
  // Spline whichever series the identity licenses: the throughput when cost is
  // genuinely `rate / throughput`, otherwise cost itself (previous behaviour).
  const ys = rate === null ? costs : tputs;
  const slopes = monotoneSlopes(xs, ys);
  // Same overshoot clamp as interpolateForGPU's buildMetric.
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const splineAt = (x: number) => Math.max(lo, Math.min(hi, hermiteInterpolate(xs, ys, slopes, x)));
  const costAt = (x: number) =>
    rate === null ? splineAt(x) : reciprocalMetricAt(rate, splineAt(x));

  const minX = xs[0];
  const maxX = xs.at(-1)!;

  // Whole frontier affordable — the max interactivity is reachable.
  if (costAt(maxX) <= targetCost) return maxX;

  // Dense scan from high to low interactivity for the first affordable sample.
  const STEPS = 512;
  const step = (maxX - minX) / STEPS;
  let below = -1; // highest scanned x with cost <= target
  for (let i = STEPS - 1; i >= 0; i--) {
    const x = minX + i * step;
    if (costAt(x) <= targetCost) {
      below = x;
      break;
    }
  }
  if (below < 0) return null;

  // Refine within (below, below + step): bisect for the crossing point.
  let loX = below;
  let hiX = Math.min(below + step, maxX);
  for (let iter = 0; iter < 40; iter++) {
    const mid = (loX + hiX) / 2;
    if (costAt(mid) <= targetCost) loX = mid;
    else hiX = mid;
  }
  return loX;
}

/**
 * Given a set of data points for a single GPU, apply pareto front filtering
 * and then use monotone cubic Hermite spline interpolation (matching the main
 * inference chart's roofline curve) to find values at a given target.
 *
 * Target input values outside the pareto front range are clamped to [min, max].
 * Each interpolated metric is clamped to the min/max of that metric on the frontier (no spline overshoot).
 */
export function interpolateForGPU(
  points: GPUDataPoint[],
  targetValue: number,
  mode: 'interactivity_to_throughput' | 'throughput_to_interactivity',
  costProvider: CostProvider,
): InterpolatedResult | null {
  if (points.length === 0) return null;

  const hwKey = points[0].hwKey;

  const getInputValue = (p: GPUDataPoint) =>
    mode === 'interactivity_to_throughput' ? p.interactivity : p.throughput;
  const getOutputValue = (p: GPUDataPoint) =>
    mode === 'interactivity_to_throughput' ? p.throughput : p.interactivity;

  const frontier = paretoFrontUpperLeft(points, getInputValue, getOutputValue);
  if (frontier.length === 0) return null;

  const sorted = [...frontier].toSorted((a, b) => getInputValue(a) - getInputValue(b));

  const minInput = getInputValue(sorted[0]);
  const maxInput = getInputValue(sorted.at(-1)!);

  // Clamp target value to the data range to avoid null returns and prevent extrapolation
  const clampedTarget = Math.max(minInput, Math.min(maxInput, targetValue));
  const clampedBelow = targetValue < minInput;
  const clampedAbove = targetValue > maxInput;
  // Surfaced on the result so callers can tell the user this series was NOT
  // measured at the requested target — it is showing its nearest edge point.
  // Series can have different ranges (and an unofficial run can widen the
  // slider past every official point), so a clamped bar sitting next to an
  // unclamped one is a comparison the user needs to be able to see.
  const clamped = clampedBelow || clampedAbove;

  if (sorted.length === 1) {
    return {
      hwKey,
      resultKey: hwKey,
      value: getOutputValue(sorted[0]),
      outputTputValue: sorted[0].outputThroughput,
      inputTputValue: sorted[0].inputThroughput,
      cost: getCostField(sorted[0], costProvider, 'total'),
      costInput: getCostField(sorted[0], costProvider, 'input'),
      costOutput: getCostField(sorted[0], costProvider, 'output'),
      tpPerMw: sorted[0].tpPerMw,
      inputTpPerMw: sorted[0].inputTpPerMw,
      outputTpPerMw: sorted[0].outputTpPerMw,
      concurrency: sorted[0].concurrency,
      nearestPoints: [sorted[0]],
      clamped,
      clampedAbove,
      clampedBelow,
    };
  }

  const xs = sorted.map(getInputValue);

  // Build per-metric y-arrays and precompute their data-range bounds
  // so we can clamp the spline output to prevent overshoot.
  const buildMetric = (extract: (p: GPUDataPoint) => number) => {
    const ys = sorted.map(extract);
    let lo = ys[0];
    let hi = ys[0];
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] < lo) lo = ys[i];
      if (ys[i] > hi) hi = ys[i];
    }
    const slopes = monotoneSlopes(xs, ys);
    const raw = hermiteInterpolate(xs, ys, slopes, clampedTarget);
    return Math.max(lo, Math.min(hi, raw));
  };

  const value = buildMetric(getOutputValue);
  const outputTputValue = buildMetric((p) => p.outputThroughput);
  const inputTputValue = buildMetric((p) => p.inputThroughput);

  // Cost is `$/GPU-hr / tokens` — a constant over a throughput — so it is
  // derived from the interpolated throughput rather than splined itself. See
  // `recoverReciprocalNumerator`. In throughput_to_interactivity mode the target
  // axis *is* total throughput, so the clamped target is the value to divide by.
  const totalTputAtTarget = mode === 'interactivity_to_throughput' ? value : clampedTarget;
  const rate = recoverCostRate(sorted, costProvider);
  // `rate === null` means these points do not obey the identity, so the metric
  // is splined directly as before rather than rewritten from one point's ratio.
  const cost =
    rate === null
      ? buildMetric((p) => getCostField(p, costProvider, 'total'))
      : reciprocalMetricAt(rate, totalTputAtTarget);
  const costInput =
    rate === null
      ? buildMetric((p) => getCostField(p, costProvider, 'input'))
      : reciprocalMetricAt(rate, inputTputValue);
  const costOutput =
    rate === null
      ? buildMetric((p) => getCostField(p, costProvider, 'output'))
      : reciprocalMetricAt(rate, outputTputValue);

  const tpPerMw = buildMetric((p) => p.tpPerMw);
  const inputTpPerMw = buildMetric((p) => p.inputTpPerMw);
  const outputTpPerMw = buildMetric((p) => p.outputTpPerMw);
  const concurrency = Math.round(buildMetric((p) => p.concurrency));

  let nearestPoints: GPUDataPoint[];
  if (clampedTarget <= minInput) {
    nearestPoints = [sorted[0]];
  } else if (clampedTarget >= maxInput) {
    nearestPoints = [sorted.at(-1)!];
  } else {
    let lowerIdx = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (getInputValue(sorted[i]) <= clampedTarget) lowerIdx = i;
    }
    const upperIdx = lowerIdx + 1;
    nearestPoints = [sorted[lowerIdx], sorted[upperIdx]];
  }

  return {
    hwKey,
    resultKey: hwKey,
    value,
    outputTputValue,
    inputTputValue,
    cost,
    costInput,
    costOutput,
    tpPerMw,
    inputTpPerMw,
    outputTpPerMw,
    concurrency,
    nearestPoints,
    clamped,
    clampedAbove,
    clampedBelow,
  };
}
