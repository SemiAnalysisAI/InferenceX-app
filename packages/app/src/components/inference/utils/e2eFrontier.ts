/**
 * @file e2eFrontier.ts
 * @description Shared seed for the anti-benchmark-hacking roofline restriction.
 *
 * On the non-e2e xmode charts (interactivity, ttft, session-time, prefill-tps)
 * the roofline is restricted to the configs that ALSO win on end-to-end latency,
 * so a config can't top interactivity while tanking decode (or vice versa). Both
 * the official path (`useChartData` → benchmark ids → `isOnE2eFrontier`) and the
 * `?unofficialrun=` overlay path (`processOverlayChartData` → `isOnE2eFrontier`)
 * MUST seed that restriction identically — otherwise an overlay of the same run
 * draws a fresh interactivity-plane frontier that rides above the official
 * e2e-restricted line. This helper is that single seed, and
 * `e2eRestrictedSeed` is the single interpreter of the resulting flag.
 */
import chartDefinitions from '@/components/inference/inference-chart-config.json';
import { withPercentile } from '@/lib/benchmark-transform';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  type ParetoDirection,
} from '@/lib/chart-utils';

import type { ChartDefinition, InferenceData } from '../types';

/**
 * Minimal (e2el, y) projection handed to the pareto functions — they only read
 * `.x`/`.y` and return the refs they were given, so a full `{...p}` copy of the
 * ~70-property point would be pure allocation waste in two hot memo paths.
 * `orig` maps a frontier member back to the caller's point.
 */
interface FramedPoint {
  x: number;
  y: number;
  orig: InferenceData;
}

/**
 * Returns the subset of `points` (by reference) that sit on the (e2e_latency, y)
 * Pareto frontier within each (hwKey, precision, date) group — or `null` when
 * the e2e chart declares no roofline direction for the selected y-metric (e.g.
 * the measured-power metrics), meaning NO restriction applies. Callers must
 * treat `null` as "leave `isOnE2eFrontier` unset / draw unrestricted"; an empty
 * set means "a restriction applies and nothing qualifies".
 *
 * The frontier is computed in (e2el, y) space using the e2e chart's roofline
 * direction for the selected y-metric and the percentile-prefixed e2e-latency
 * field (e.g. `p90_e2el`).
 */
export function e2eFrontierWinners(
  points: InferenceData[],
  selectedYAxisMetric: string,
  percentile: string,
): Set<InferenceData> | null {
  const e2eChartDef = (chartDefinitions as ChartDefinition[]).find((c) => c.chartType === 'e2e');
  if (!e2eChartDef) return null;
  const dir = e2eChartDef[`${selectedYAxisMetric}_roofline` as keyof ChartDefinition] as
    | ParetoDirection
    | undefined;
  if (!dir) return null;
  const frontierFn = paretoFrontForDirection(dir);
  // Percentile-prefixed e2e-latency field name (e.g. 'p90_e2el').
  const e2elField = withPercentile('median_e2el', percentile);
  const metricKey = selectedYAxisMetric.replace('y_', '') as keyof InferenceData;

  // Re-frame each candidate point in (e2el, y) space, then compute the pareto
  // per (hwKey, precision, date) bucket — frontiers don't span dates (a May 17
  // point can't dominate a May 15 plot).
  const byGroup = new Map<string, FramedPoint[]>();
  for (const p of points) {
    const yValue = (p[metricKey] as { y?: number } | undefined)?.y;
    const xValue = (p as unknown as Record<string, unknown>)[e2elField];
    if (typeof xValue !== 'number' || !Number.isFinite(xValue)) continue;
    if (typeof yValue !== 'number' || !Number.isFinite(yValue)) continue;
    const key = `${p.hwKey}|${p.precision}|${p.date}`;
    let bucket = byGroup.get(key);
    if (!bucket) {
      bucket = [];
      byGroup.set(key, bucket);
    }
    bucket.push({ x: xValue, y: yValue, orig: p });
  }
  const winners = new Set<InferenceData>();
  for (const bucket of byGroup.values()) {
    // The pareto fns only touch x/y and return input refs — safe on the
    // projection.
    for (const f of frontierFn(bucket as unknown as InferenceData[])) {
      winners.add((f as unknown as FramedPoint).orig);
    }
  }
  return winners;
}

/**
 * Narrow a roofline's seed points to the e2e-Pareto winners when the
 * `isOnE2eFrontier` flag is present.
 *
 * In non-e2e xmodes, agentic points are stamped with `isOnE2eFrontier`
 * (official: `useChartData`; overlay: `processOverlayChartData`) so the line is
 * restricted to the e2e-Pareto winners — the same set of points across every
 * chart, just re-plotted at the chosen x metric. When the flag is present on
 * ANY point in the bucket, narrow to the winners before paretoing; otherwise
 * (fixed-seq, the e2e chart itself, or metrics with no e2e roofline direction)
 * use every eligible point — recomputing a fresh frontier on the swapped x
 * axis would reintroduce the benchmark hack. Single interpreter of the flag's
 * tri-state (undefined / true / false) for both the official and overlay
 * roofline memos.
 */
export function e2eRestrictedSeed(points: InferenceData[]): InferenceData[] {
  const flagged = points.some((p) => p.isOnE2eFrontier !== undefined);
  return (flagged ? points.filter((p) => p.isOnE2eFrontier === true) : points).filter(
    isFrontierEligible,
  );
}
