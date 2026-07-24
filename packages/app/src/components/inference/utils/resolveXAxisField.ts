/**
 * @file resolveXAxisField.ts
 * @description Single source of truth for which data field a chart's x-axis
 * plots. Both the official pipeline (`useChartData.stableChartDefinitions`)
 * and the `?unofficialrun=` overlay pipeline (`processOverlayChartData`) call
 * this — they previously each carried a copy of the branch ladder held in sync
 * only by "must mirror" comments, and three of the four overlay-misalignment
 * bugs fixed on this branch were exactly that mirror drifting. Change the
 * resolution logic here and both paths move together.
 *
 * (`buildReplayTimeline.resolveXAxisField` is a third, older copy — replay is
 * fixed-seq-only today so its missing percentile handling is inert, but it
 * should adopt this resolver if replay ever grows agentic support.)
 */
import { withPercentile } from '@/lib/benchmark-transform';

import type { ChartDefinition } from '../types';

/** Which rung of the branch ladder chose the x field (drives label choice). */
export type XAxisBranch =
  | 'natural'
  | 'user-input-override'
  | 'config-input-override'
  | 'e2e-ttft-override';

export interface ResolvedXAxis {
  /** The data field the x-axis plots (percentile-adjusted for agentic). */
  xAxisField: string;
  /** The chart's natural latency metric, percentile-adjusted — the "no
   * override" baseline the flip check compares against. */
  naturalX: string;
  isInputMetric: boolean;
  isTtftOverride: boolean;
  branch: XAxisBranch;
}

/**
 * Resolve the x-axis data field for a chart definition + metric selection.
 *
 * Rules, in order:
 * - Natural x = the chart's latency metric at the selected percentile for
 *   agentic, forced to median for fixed-seq (whose p90_/p99_ columns don't
 *   exist — a stale 'p90' from a previous agentic view would resolve to a
 *   null column and drop every point).
 * - Input metrics on the interactivity chart override x to a TTFT column:
 *   the user-picked metric for fixed-seq (the manual dropdown is hidden in
 *   agentic mode), else the config default.
 * - Any *_ttft `effectiveXMetric` overrides the e2e chart's x (the 'ttft'
 *   x-axis mode) — the percentile prefix was already reconciled by the
 *   x-axis-mode picker.
 * - Agentic: the resolved field is rewritten to the selected percentile.
 *   Idempotent for overrides that already carry it (e.g. p90_ttft), and
 *   carries it onto config-default overrides (median_ttft → p90_ttft) and
 *   the natural intvty/e2el field.
 */
export function resolveXAxisField(
  chartDef: ChartDefinition,
  selectedYAxisMetric: string,
  effectiveXMetric: string | null,
  opts: { isAgentic: boolean; percentile: string },
): ResolvedXAxis {
  const { isAgentic, percentile } = opts;
  const naturalX = withPercentile(chartDef.x, isAgentic ? percentile : 'median');

  const metricTitle =
    (chartDef[`${selectedYAxisMetric}_title` as keyof ChartDefinition] as string) || '';
  const isInputMetric = metricTitle.toLowerCase().includes('input');
  // Any *_ttft metric counts — the x-axis-mode picker can select any
  // percentile (median/p75/p90/p99) depending on sequence kind.
  const isTtftOverride = typeof effectiveXMetric === 'string' && effectiveXMetric.endsWith('_ttft');

  let xAxisField: string = naturalX;
  let branch: XAxisBranch = 'natural';
  if (effectiveXMetric && chartDef.chartType === 'interactivity' && isInputMetric && !isAgentic) {
    xAxisField = effectiveXMetric;
    branch = 'user-input-override';
  } else if (chartDef.chartType === 'interactivity' && isInputMetric) {
    const xOverrideKey = `${selectedYAxisMetric}_x` as keyof ChartDefinition;
    xAxisField = (chartDef[xOverrideKey] as string) || chartDef.x;
    branch = 'config-input-override';
  } else if (chartDef.chartType === 'e2e' && isTtftOverride) {
    xAxisField = effectiveXMetric!;
    branch = 'e2e-ttft-override';
  }

  if (isAgentic) {
    xAxisField = withPercentile(xAxisField, percentile);
  }

  return { xAxisField, naturalX, isInputMetric, isTtftOverride, branch };
}
