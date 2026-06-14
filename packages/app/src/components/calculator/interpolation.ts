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
  const cost = buildMetric((p) => getCostField(p, costProvider, 'total'));
  const costInput = buildMetric((p) => getCostField(p, costProvider, 'input'));
  const costOutput = buildMetric((p) => getCostField(p, costProvider, 'output'));
  const tpPerMw = buildMetric((p) => p.tpPerMw);
  const inputTpPerMw = buildMetric((p) => p.inputTpPerMw);
  const outputTpPerMw = buildMetric((p) => p.outputTpPerMw);
  const concurrency = Math.round(buildMetric((p) => p.concurrency));

  let lowerIdx = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (getInputValue(sorted[i]) <= clampedTarget) lowerIdx = i;
  }
  const upperIdx = Math.min(lowerIdx + 1, sorted.length - 1);

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
    nearestPoints: [sorted[lowerIdx], sorted[upperIdx]],
  };
}
