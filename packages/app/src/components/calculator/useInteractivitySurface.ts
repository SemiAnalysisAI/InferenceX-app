'use client';

import { useMemo } from 'react';

import { getGpuSpecs } from '@/lib/constants';

import type { HistoryGroups } from './historical-best';
import { buildSurfaceGrid, type SurfaceGrid } from './interactivity-surface';
import type { LifecycleAssumptions, LifecycleMetric } from './lifecycle';
import type { CalculatorMode, CostProvider, CostType } from './types';

export interface UseInteractivitySurfaceOptions {
  groups: HistoryGroups | null;
  visibleHwKeys: ReadonlySet<string>;
  mode: CalculatorMode;
  /** The 2D chart's y-axis selector, so both views plot the same rate. */
  metric: LifecycleMetric;
  costProvider: CostProvider;
  costType: CostType;
  /** Cached-token price as a fraction of a fresh one — shared with the 2D section. */
  cacheReadRatio: number;
  mw: number | null;
  anchorMs: number;
  horizonMonths: number;
  assumptions: LifecycleAssumptions;
  /** The calculator's slider target, highlighted on the surface. */
  currentZ: number;
  labelFor: (baseGpu: string) => string;
  colorFor: (baseGpu: string) => string;
  /**
   * Gates the build. The grid costs a Pareto pass and a slope solve per sweep plus
   * a lifecycle projection per (chip, slice), so it must not run for a reader who
   * has the section folded away.
   */
  enabled: boolean;
}

/**
 * The (time × interactivity) grid behind the 3D view.
 *
 * Kept in its own hook so the cost is visible at the call site and gated on one
 * flag. Nothing here fetches: it re-reads the frontiers `useHistoricalBest`
 * already grouped.
 */
export function useInteractivitySurface(
  options: UseInteractivitySurfaceOptions,
): SurfaceGrid | null {
  const {
    groups,
    visibleHwKeys,
    mode,
    metric,
    costProvider,
    costType,
    cacheReadRatio,
    mw,
    anchorMs,
    horizonMonths,
    assumptions,
    currentZ,
    labelFor,
    colorFor,
    enabled,
  } = options;

  return useMemo(() => {
    if (!enabled || !groups || !mw) return null;
    return buildSurfaceGrid({
      groups,
      visibleHwKeys,
      mode,
      metric,
      costProvider,
      costType,
      cacheReadRatio,
      mw,
      anchorMs,
      horizonMonths,
      assumptions,
      currentZ,
      labelFor,
      colorFor,
      specsFor: (baseGpu) => {
        const specs = getGpuSpecs(baseGpu);
        // No registered power means no fleet — the grid names the chip instead of
        // quietly leaving a gap in the legend.
        if (!specs || !(specs.power > 0)) return null;
        return { powerKwPerGpu: specs.power, costPerGpuHour: specs[costProvider] };
      },
    });
  }, [
    enabled,
    groups,
    visibleHwKeys,
    mode,
    metric,
    costProvider,
    costType,
    cacheReadRatio,
    mw,
    anchorMs,
    horizonMonths,
    assumptions,
    currentZ,
    labelFor,
    colorFor,
  ]);
}
