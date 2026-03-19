'use client';

import { useCallback, useMemo } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { HardwareConfig } from '@/components/inference/types';
import { useBenchmarks } from '@/hooks/api/use-benchmarks';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import { getHardwareKey } from '@/lib/chart-utils';
import { getModelSortIndex, getHardwareConfig, getGpuSpecs } from '@/lib/constants';
import { Model, Sequence } from '@/lib/data-mappings';

import { CostProvider, GPUDataPoint, InterpolatedResult } from './types';

// ---------------------------------------------------------------------------
// Pareto front — matches the main inference chart's roofline algorithm
// ---------------------------------------------------------------------------

/**
 * Compute the upper-left pareto front for GPUDataPoints.
 * This is the same algorithm used by the main inference charts for the
 * interactivity view (y_tpPerGpu_roofline: "upper_left").
 *
 * For interactivity→throughput mode:
 *   x = interactivity (tok/s/user), y = throughput (tok/s/gpu)
 *   upper_left = for decreasing x, y must be strictly increasing
 *   (lower interactivity allows higher throughput on the frontier)
 *
 * For throughput→interactivity mode:
 *   x = throughput, y = interactivity
 *   We also use upper_left so the frontier represents the best tradeoff.
 */
export function paretoFrontUpperLeft<T>(
  points: T[],
  getX: (p: T) => number,
  getY: (p: T) => number,
): T[] {
  if (points.length === 0) return [];

  // Sort by x ascending, then y descending for ties
  const sorted = [...points].sort((a, b) => {
    const ax = getX(a);
    const bx = getX(b);
    if (ax === bx) return getY(b) - getY(a);
    return ax - bx;
  });

  const front: T[] = [];

  for (const point of sorted) {
    const px = getX(point);
    const py = getY(point);

    // Deduplicate same x: keep highest y
    if (front.length > 0 && getX(front[front.length - 1]) === px) {
      if (py > getY(front[front.length - 1])) {
        front[front.length - 1] = point;
      }
      continue;
    }

    // Remove dominated points: pop while current point's y >= last front point's y
    while (front.length >= 1 && py >= getY(front[front.length - 1])) {
      front.pop();
    }
    front.push(point);
  }

  return front;
}

// ---------------------------------------------------------------------------
// Monotone cubic Hermite spline interpolation (Steffen method)
// This matches d3.curveMonotoneX used by the main inference chart rooflines.
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

  // Step 1: compute segment widths (h) and secant slopes (s)
  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const hi = xs[i + 1] - xs[i];
    h.push(hi);
    s.push(hi === 0 ? 0 : (ys[i + 1] - ys[i]) / hi);
  }

  // Step 2: interior tangent slopes using Steffen's method
  // p = (s0 * h1 + s1 * h0) / (h0 + h1)   — weighted average by segment lengths
  // m = (sign(s0) + sign(s1)) * min(|s0|, |s1|, 0.5 * |p|) || 0
  const m: number[] = Array.from({ length: n }, () => 0);
  for (let i = 1; i < n - 1; i++) {
    const s0 = s[i - 1];
    const s1 = s[i];
    const h0 = h[i - 1];
    const h1 = h[i];
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    m[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }

  // Step 3: endpoint tangent slopes using d3's slope2 formula:
  // slope2(s, t) = (3 * s - t) / 2
  // For the first point, t is the interior slope at the second point
  // For the last point, t is the interior slope at the second-to-last point
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

  // Clamp to range (caller ensures this, but be safe)
  if (targetX <= xs[0]) return ys[0];
  if (targetX >= xs[n - 1]) return ys[n - 1];

  // Binary search for the interval
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= targetX) lo = mid;
    else hi = mid;
  }

  const h = xs[hi] - xs[lo];
  if (h === 0) return ys[lo];

  const t = (targetX - xs[lo]) / h;
  const t2 = t * t;
  const t3 = t2 * t;

  // Hermite basis functions
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * ys[lo] + h10 * h * m[lo] + h01 * ys[hi] + h11 * h * m[hi];
}

/**
 * Given a set of data points for a single GPU, apply pareto front filtering
 * and then use monotone cubic Hermite spline interpolation (matching the main
 * inference chart's roofline curve) to find values at a given target.
 *
 * Only interpolates within the pareto front's data range — no extrapolation.
 */
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
  // total
  return p[costProvider];
}

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

  // Apply pareto front filtering — same as the main inference chart rooflines
  const frontier = paretoFrontUpperLeft(points, getInputValue, getOutputValue);
  if (frontier.length === 0) return null;

  // Sort frontier by input value ascending for spline interpolation
  const sorted = [...frontier].sort((a, b) => getInputValue(a) - getInputValue(b));

  const minInput = getInputValue(sorted[0]);
  const maxInput = getInputValue(sorted[sorted.length - 1]);

  // Skip if target is outside the frontier's data range (no extrapolation)
  if (targetValue < minInput || targetValue > maxInput) {
    return null;
  }

  // Single point — return it directly if target matches
  if (sorted.length === 1) {
    if (Math.abs(targetValue - minInput) < 1e-6) {
      return {
        hwKey,
        resultKey: hwKey, // will be overridden by getResults when multi-precision
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
    return null;
  }

  // Build x arrays and y arrays for each metric, then compute spline slopes
  const xs = sorted.map(getInputValue);
  const outputYs = sorted.map(getOutputValue);
  const outputTputYs = sorted.map((p) => p.outputThroughput);
  const inputTputYs = sorted.map((p) => p.inputThroughput);
  const costTotalYs = sorted.map((p) => getCostField(p, costProvider, 'total'));
  const costInputYs = sorted.map((p) => getCostField(p, costProvider, 'input'));
  const costOutputYs = sorted.map((p) => getCostField(p, costProvider, 'output'));
  const powerYs = sorted.map((p) => p.tpPerMw);
  const inputPowerYs = sorted.map((p) => p.inputTpPerMw);
  const outputPowerYs = sorted.map((p) => p.outputTpPerMw);
  const concYs = sorted.map((p) => p.concurrency);

  const outputSlopes = monotoneSlopes(xs, outputYs);
  const outputTputSlopes = monotoneSlopes(xs, outputTputYs);
  const inputTputSlopes = monotoneSlopes(xs, inputTputYs);
  const costTotalSlopes = monotoneSlopes(xs, costTotalYs);
  const costInputSlopes = monotoneSlopes(xs, costInputYs);
  const costOutputSlopes = monotoneSlopes(xs, costOutputYs);
  const powerSlopes = monotoneSlopes(xs, powerYs);
  const inputPowerSlopes = monotoneSlopes(xs, inputPowerYs);
  const outputPowerSlopes = monotoneSlopes(xs, outputPowerYs);
  const concSlopes = monotoneSlopes(xs, concYs);

  const interpolatedOutput = hermiteInterpolate(xs, outputYs, outputSlopes, targetValue);
  const interpolatedOutputTput = hermiteInterpolate(
    xs,
    outputTputYs,
    outputTputSlopes,
    targetValue,
  );
  const interpolatedInputTput = hermiteInterpolate(xs, inputTputYs, inputTputSlopes, targetValue);
  const interpolatedCostTotal = hermiteInterpolate(xs, costTotalYs, costTotalSlopes, targetValue);
  const interpolatedCostInput = hermiteInterpolate(xs, costInputYs, costInputSlopes, targetValue);
  const interpolatedCostOutput = hermiteInterpolate(
    xs,
    costOutputYs,
    costOutputSlopes,
    targetValue,
  );
  const interpolatedPower = hermiteInterpolate(xs, powerYs, powerSlopes, targetValue);
  const interpolatedInputPower = hermiteInterpolate(
    xs,
    inputPowerYs,
    inputPowerSlopes,
    targetValue,
  );
  const interpolatedOutputPower = hermiteInterpolate(
    xs,
    outputPowerYs,
    outputPowerSlopes,
    targetValue,
  );
  const interpolatedConc = hermiteInterpolate(xs, concYs, concSlopes, targetValue);

  // Find the two bracketing pareto front points for reference
  let lowerIdx = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (getInputValue(sorted[i]) <= targetValue) lowerIdx = i;
  }
  const upperIdx = Math.min(lowerIdx + 1, sorted.length - 1);

  return {
    hwKey,
    resultKey: hwKey, // will be overridden by getResults when multi-precision
    value: Math.max(0, interpolatedOutput),
    outputTputValue: Math.max(0, interpolatedOutputTput),
    inputTputValue: Math.max(0, interpolatedInputTput),
    cost: Math.max(0, interpolatedCostTotal),
    costInput: Math.max(0, interpolatedCostInput),
    costOutput: Math.max(0, interpolatedCostOutput),
    tpPerMw: Math.max(0, interpolatedPower),
    inputTpPerMw: Math.max(0, interpolatedInputPower),
    outputTpPerMw: Math.max(0, interpolatedOutputPower),
    concurrency: Math.round(Math.max(0, interpolatedConc)),
    nearestPoints: [sorted[lowerIdx], sorted[upperIdx]],
  };
}

export function useThroughputData(
  selectedModel: Model,
  selectedSequence: Sequence,
  selectedPrecisions: string[],
  selectedRunDate: string,
) {
  // Reuse the same API + React Query cache as the inference charts
  const {
    data: allRows,
    isLoading: queryLoading,
    error: queryError,
  } = useBenchmarks(selectedModel, selectedRunDate);

  const loading = queryLoading || !allRows;
  const error = queryError ? queryError.message : null;

  // Build GPUDataPoints directly from raw rows, skipping transformBenchmarkRows.
  // This avoids the expensive roofline/chart-data pipeline that isn't needed for interpolation.
  const { gpuDataByGroupKey, hardwareConfig, hasData } = useMemo(() => {
    if (!allRows)
      return {
        gpuDataByGroupKey: {} as Record<string, GPUDataPoint[]>,
        hardwareConfig: {} as HardwareConfig,
        hasData: false,
      };
    const seqIslOsl = sequenceToIslOsl(selectedSequence);
    if (!seqIslOsl)
      return {
        gpuDataByGroupKey: {} as Record<string, GPUDataPoint[]>,
        hardwareConfig: {} as HardwareConfig,
        hasData: false,
      };

    const multiPrecision = selectedPrecisions.length > 1;
    const grouped: Record<string, GPUDataPoint[]> = {};
    const hwConfigMap: HardwareConfig = {};

    for (const row of allRows) {
      if (row.isl !== seqIslOsl.isl || row.osl !== seqIslOsl.osl) continue;
      if (!selectedPrecisions.includes(row.precision)) continue;

      const entry = rowToAggDataEntry(row);
      const hwKey = getHardwareKey(entry);
      const hwConfig = getHardwareConfig(hwKey);
      if (!hwConfig) continue;

      if (!hwConfigMap[hwKey]) hwConfigMap[hwKey] = { ...hwConfig, name: hwKey };

      const m = row.metrics;
      const tput = m.tput_per_gpu ?? 0;
      const outputTput = m.output_tput_per_gpu ?? tput;
      const inputTput = m.input_tput_per_gpu ?? 0;
      const specs = getGpuSpecs(hwKey);
      const power = specs.power;

      // Cost calculations: costPerHour / (tokPerSec * 3600 / 1_000_000)
      const computeCost = (costPerHour: number, tps: number) =>
        costPerHour && tps > 0 ? costPerHour / ((tps * 3600) / 1_000_000) : 0;

      const groupKey = multiPrecision ? `${hwKey}__${row.precision}` : hwKey;
      if (!grouped[groupKey]) grouped[groupKey] = [];

      grouped[groupKey].push({
        hwKey,
        interactivity: m.median_intvty ?? 0,
        throughput: tput,
        outputThroughput: outputTput,
        inputThroughput: inputTput,
        concurrency: row.conc,
        tp: row.decode_tp,
        precision: row.precision,
        ep: row.decode_ep,
        dp_attention: row.decode_dp_attention,
        disagg: row.disagg,
        costh: computeCost(specs.costh, tput),
        costn: computeCost(specs.costn, tput),
        costr: computeCost(specs.costr, tput),
        costhi: computeCost(specs.costh, inputTput),
        costni: computeCost(specs.costn, inputTput),
        costri: computeCost(specs.costr, inputTput),
        costhOutput: computeCost(specs.costh, outputTput),
        costnOutput: computeCost(specs.costn, outputTput),
        costrOutput: computeCost(specs.costr, outputTput),
        tpPerMw: power && power > 0 ? (tput * 1000) / power : 0,
        inputTpPerMw: power && power > 0 ? (inputTput * 1000) / power : 0,
        outputTpPerMw: power && power > 0 ? (outputTput * 1000) / power : 0,
      });
    }

    // Sort hardware config
    const sortedKeys = Object.keys(hwConfigMap).sort(
      (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
    );
    const config: HardwareConfig = {};
    sortedKeys.forEach((key) => {
      config[key] = hwConfigMap[key];
    });

    return {
      gpuDataByGroupKey: grouped,
      hardwareConfig: config,
      hasData: Object.keys(grouped).length > 0,
    };
  }, [allRows, selectedSequence, selectedPrecisions]);

  // All available GPU hardware keys from data, ordered by hardwareConfig (HARDWARE_CONFIG order)
  // This returns unique GPU-level hwKeys (not composite keys) for the legend
  const availableHwKeys = useMemo(() => {
    // Extract unique hwKeys from group keys (strip __precision suffix if present)
    const dataHwKeys = new Set<string>();
    for (const groupKey of Object.keys(gpuDataByGroupKey)) {
      const hwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
      dataHwKeys.add(hwKey);
    }
    // Use hardwareConfig key order (already sorted by HARDWARE_CONFIG), then append any extras
    const ordered = Object.keys(hardwareConfig).filter((k) => dataHwKeys.has(k));
    // Add any keys in data but not in hardwareConfig at the end
    for (const k of dataHwKeys) {
      if (!hardwareConfig[k]) ordered.push(k);
    }
    return ordered;
  }, [gpuDataByGroupKey, hardwareConfig]);

  // Compute global ranges from GPUDataPoints
  const ranges = useMemo(() => {
    const allPoints = Object.values(gpuDataByGroupKey).flat();
    if (allPoints.length === 0) {
      return {
        interactivity: { min: 0, max: 100 },
        throughput: { min: 0, max: 1000 },
      };
    }

    let minIntvty = Infinity,
      maxIntvty = -Infinity,
      minTput = Infinity,
      maxTput = -Infinity;
    for (const p of allPoints) {
      if (p.interactivity < minIntvty) minIntvty = p.interactivity;
      if (p.interactivity > maxIntvty) maxIntvty = p.interactivity;
      if (p.throughput < minTput) minTput = p.throughput;
      if (p.throughput > maxTput) maxTput = p.throughput;
    }

    return {
      interactivity: {
        min: Math.ceil(minIntvty),
        max: Math.floor(maxIntvty),
      },
      throughput: {
        min: Math.floor(minTput),
        max: Math.ceil(maxTput),
      },
    };
  }, [gpuDataByGroupKey]);

  // Interpolate results for all GPUs at a given target value
  const getResults = useCallback(
    (
      targetValue: number,
      mode: 'interactivity_to_throughput' | 'throughput_to_interactivity',
      costProvider: CostProvider,
      visibleHwKeys?: Set<string>,
    ): InterpolatedResult[] => {
      const results: InterpolatedResult[] = [];

      for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
        // Extract the base hwKey for visibility check and config lookup
        const hwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
        const precision = groupKey.includes('__') ? groupKey.split('__')[1] : undefined;

        // Skip GPUs that are not visible (legend filters by hwKey)
        if (visibleHwKeys && !visibleHwKeys.has(hwKey)) continue;

        const result = interpolateForGPU(points, targetValue, mode, costProvider);
        if (result && result.value > 0) {
          results.push({
            ...result,
            hwKey, // always the base hwKey for color/config lookup
            resultKey: groupKey, // unique key (hwKey or hwKey__precision)
            precision, // precision label when multi-precision
          });
        }
      }

      // Sort by value descending (highest throughput or interactivity first)
      results.sort((a, b) => b.value - a.value);

      return results;
    },
    [gpuDataByGroupKey],
  );

  return {
    gpuDataByGroupKey,
    hardwareConfig,
    ranges,
    getResults,
    loading,
    error,
    hasData,
    availableHwKeys,
  };
}
