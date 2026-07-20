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
 * e2e-restricted line. This helper is that single seed.
 */
import chartDefinitions from '@/components/inference/inference-chart-config.json';
import { withPercentile } from '@/lib/benchmark-transform';
import { paretoFrontForDirection, type ParetoDirection } from '@/lib/chart-utils';

import type { ChartDefinition, InferenceData, YAxisMetricKey } from '../types';

/**
 * Returns the subset of `points` (by reference) that sit on the (e2e_latency, y)
 * Pareto frontier within each (hwKey, precision, date) group.
 *
 * The frontier is computed in (e2el, y) space using the e2e chart's roofline
 * direction for the selected y-metric and the percentile-prefixed e2e-latency
 * field (e.g. `p90_e2el`). Returns the ORIGINAL point references (not the
 * reframed copies) so callers can either read their ids or mark them in place.
 *
 * Returns an empty set when the e2e chart def or its y-metric roofline direction
 * is missing — callers treat that as "no restriction".
 */
export function e2eFrontierWinners(
  points: InferenceData[],
  selectedYAxisMetric: string,
  percentile: string,
): Set<InferenceData> {
  const winners = new Set<InferenceData>();
  const e2eChartDef = (chartDefinitions as ChartDefinition[]).find((c) => c.chartType === 'e2e');
  if (!e2eChartDef) return winners;
  const dir = e2eChartDef[`${selectedYAxisMetric}_roofline` as keyof ChartDefinition] as
    | ParetoDirection
    | undefined;
  if (!dir) return winners;
  const frontierFn = paretoFrontForDirection(dir);
  // Percentile-prefixed e2e-latency field name (e.g. 'p90_e2el').
  const e2elField = withPercentile('median_e2el', percentile);
  const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;

  // Re-frame each candidate point in (e2el, y) space, then compute the pareto per
  // (hwKey, precision, date) bucket — frontiers don't span dates (a May 17 point
  // can't dominate a May 15 plot). Keep a back-pointer from each reframed copy to
  // its original so the frontier members map back to the caller's points (the
  // pareto fns return the very refs they were handed).
  const byGroup = new Map<string, InferenceData[]>();
  const framedToOrig = new Map<InferenceData, InferenceData>();
  for (const p of points) {
    const yValue = (p[metricKey] as { y?: number } | undefined)?.y;
    const xValue = (p as unknown as Record<string, unknown>)[e2elField];
    if (typeof xValue !== 'number' || !Number.isFinite(xValue)) continue;
    if (typeof yValue !== 'number' || !Number.isFinite(yValue)) continue;
    const framed = { ...p, x: xValue, y: yValue };
    framedToOrig.set(framed, p);
    const key = `${p.hwKey}|${p.precision}|${p.date}`;
    let bucket = byGroup.get(key);
    if (!bucket) {
      bucket = [];
      byGroup.set(key, bucket);
    }
    bucket.push(framed);
  }
  for (const bucket of byGroup.values()) {
    for (const f of frontierFn(bucket)) {
      const orig = framedToOrig.get(f);
      if (orig) winners.add(orig);
    }
  }
  return winners;
}
