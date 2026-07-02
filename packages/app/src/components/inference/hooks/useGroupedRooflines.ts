/**
 * Shared grouping + Pareto-roofline pipeline for the inference scatter charts.
 *
 * Three near-identical memo blocks used to live inline:
 *   1. ScatterGraph official path — group by `${hwKey}_${precision}`.
 *   2. GPUGraph comparison path — group by `${date}_${hwKey}_${precision}`.
 *   3. ScatterGraph overlay path — group by `${hwKey}_${precision}_run${idx}`.
 *
 * They differ only in (a) the group key, (b) whether the front is sorted by x
 * ascending afterwards, and (c) any per-group metadata the caller wants to
 * carry (the overlay path needs `hwKey` + `runIndex` per group). Everything
 * else — the direction lookup from `chartDefinition`, the direction-flip that
 * `paretoFront*` encode, and the memo dependency semantics — is identical, so
 * it lives here once.
 *
 * The pure core (`groupPoints`, `rooflineDirectionFor`, `computeGroupedRooflines`)
 * is exported for unit testing without a renderer; the hook is the thin
 * `useMemo` wrapper components consume.
 */

import { useMemo } from 'react';

import {
  paretoFrontLowerLeft,
  paretoFrontLowerRight,
  paretoFrontUpperLeft,
  paretoFrontUpperRight,
} from '@/lib/chart-utils';
import { overlayRunIndex } from '@/lib/overlay-run-style';
import type { RooflineDirection } from '@/lib/speed-overlay';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';

/**
 * Group points into buckets keyed by `groupKeyFn`. Points for which
 * `groupKeyFn` returns `null`/`undefined` are dropped, which lets a caller
 * fold its inline precision filter into the key function (the GPU path did
 * this: it skipped points whose precision wasn't selected).
 */
export function groupPoints(
  data: InferenceData[],
  groupKeyFn: (point: InferenceData) => string | null | undefined,
): Record<string, InferenceData[]> {
  return data.reduce(
    (acc, point) => {
      const key = groupKeyFn(point);
      if (key === null || key === undefined) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(point);
      return acc;
    },
    {} as Record<string, InferenceData[]>,
  );
}

/**
 * Resolve the Pareto direction for the selected metric from the chart
 * definition. Falls back to `lower_right` (the historical default that the
 * chained ternaries used when the definition key was absent).
 */
export function rooflineDirectionFor(
  chartDefinition: ChartDefinition,
  selectedYAxisMetric: string,
): RooflineDirection {
  const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
  const dir = chartDefinition[rooflineKey] as RooflineDirection | undefined;
  return dir ?? 'lower_right';
}

/**
 * Run the direction-appropriate Pareto front over a single group's points.
 * The direction-flip logic lives inside the `paretoFront*` implementations
 * (each direction is a different scan); this dispatch mirrors the four-way
 * ternary the three call sites shared verbatim.
 */
export function paretoFrontForDirection(
  points: InferenceData[],
  dir: RooflineDirection,
): InferenceData[] {
  switch (dir) {
    case 'upper_right': {
      return paretoFrontUpperRight(points);
    }
    case 'upper_left': {
      return paretoFrontUpperLeft(points);
    }
    case 'lower_left': {
      return paretoFrontLowerLeft(points);
    }
    default: {
      return paretoFrontLowerRight(points);
    }
  }
}

/**
 * Compute per-group Pareto fronts. `sortByX` reproduces the divergence between
 * the scatter paths (which append `front.sort((a, b) => a.x - b.x)`) and the
 * GPU path (which assigns the raw front). Pure — no React, no memo — so it is
 * directly unit-testable.
 */
export function computeGroupedRooflines(
  grouped: Record<string, InferenceData[]>,
  dir: RooflineDirection,
  sortByX: boolean,
): Record<string, InferenceData[]> {
  const result: Record<string, InferenceData[]> = {};
  for (const key of Object.keys(grouped)) {
    const front = paretoFrontForDirection(grouped[key], dir);
    if (sortByX) front.sort((a, b) => a.x - b.x);
    result[key] = front;
  }
  return result;
}

interface UseGroupedRooflinesArgs {
  data: InferenceData[];
  groupKeyFn: (point: InferenceData) => string | null | undefined;
  selectedYAxisMetric: string;
  chartDefinition: ChartDefinition;
  /**
   * Sort each front by ascending x after computing it. The scatter (official +
   * overlay) paths do; the GPU comparison path does NOT — keep this matched to
   * the original behaviour or the rendered line order shifts.
   */
  sortByX: boolean;
  /**
   * Extra memo dependencies beyond `data`. `groupKeyFn` is intentionally NOT a
   * dependency (callers pass a fresh arrow each render); instead pass the
   * primitive inputs the key function closes over (e.g. `runIndexByUrl`,
   * `selectedPrecisions`) so the memo invalidates exactly when the grouping
   * would change, preserving the original dependency arrays.
   */
  groupKeyDeps?: readonly unknown[];
}

/**
 * The hook every path funnels through: group `data` with `groupKeyFn`, then
 * compute the per-group Pareto front for the metric's direction.
 *
 * Returns both the grouping and the rooflines because the official scatter and
 * GPU paths both consume `groupedData` directly (for `effectiveActiveHwTypes`,
 * `filteredData`, `idsWithData`, …), not just the rooflines.
 */
export function useGroupedRooflines({
  data,
  groupKeyFn,
  selectedYAxisMetric,
  chartDefinition,
  sortByX,
  groupKeyDeps = [],
}: UseGroupedRooflinesArgs): {
  groupedData: Record<string, InferenceData[]>;
  rooflines: Record<string, InferenceData[]>;
} {
  const groupedData = useMemo(
    () => groupPoints(data, groupKeyFn),
    // groupKeyFn is a fresh closure each render; its captured inputs are in
    // groupKeyDeps. eslint can't see through the destructure, so this is the
    // deliberate dependency set that matches the original inline memos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, ...groupKeyDeps],
  );

  const rooflines = useMemo(
    () =>
      computeGroupedRooflines(
        groupedData,
        rooflineDirectionFor(chartDefinition, selectedYAxisMetric),
        sortByX,
      ),
    [groupedData, selectedYAxisMetric, chartDefinition, sortByX],
  );

  return { groupedData, rooflines };
}

// ---------------------------------------------------------------------------
// Overlay (unofficial-run) roofline variant
// ---------------------------------------------------------------------------
//
// The overlay path reuses the exact same group → Pareto-front pipeline but
// carries per-group metadata (`hwKey`, `runIndex`) so overlay rooflines from
// different unofficial runs stay separate and can be styled with per-run hue
// shifts. The group key embeds the run index; the metadata is recovered from
// the first point of each group (points in a group share hwKey + run).

export interface OverlayRooflineEntry {
  hwKey: string;
  runIndex: number;
  points: InferenceData[];
}

/**
 * Pure core: given already-grouped overlay points and their rooflines, attach
 * `hwKey`/`runIndex` metadata per group. Kept separate from the grouping so the
 * whole thing is unit-testable and shares `computeGroupedRooflines`.
 */
export function attachOverlayMeta(
  grouped: Record<string, InferenceData[]>,
  rooflines: Record<string, InferenceData[]>,
  runIndexOf: (point: InferenceData) => number,
): Record<string, OverlayRooflineEntry> {
  const result: Record<string, OverlayRooflineEntry> = {};
  for (const [key, points] of Object.entries(rooflines)) {
    const first = grouped[key]?.[0];
    if (!first) continue;
    result[key] = {
      hwKey: String(first.hwKey),
      runIndex: runIndexOf(first),
      points,
    };
  }
  return result;
}

interface UseOverlayRooflinesArgs {
  /** Already-filtered overlay points (precision + quick filters applied). */
  overlayPoints: InferenceData[];
  selectedYAxisMetric: string;
  chartDefinition: ChartDefinition;
  /** run_url → run index map, for both grouping and metadata. */
  runIndexByUrl: Record<string, number>;
}

/**
 * Overlay rooflines, routed through the SAME `useGroupedRooflines` core (same
 * direction lookup, same Pareto dispatch, same `sortByX` as the official
 * scatter path). Group key is `${hwKey}_${precision}_run${runIndex}` so per-run
 * overlays stay separate; the result carries `hwKey`/`runIndex` per group.
 *
 * Returns an empty object identity churn-free when there are no overlay points
 * (matching the original early return), so it doesn't force a chart rebuild.
 */
export function useOverlayRooflines({
  overlayPoints,
  selectedYAxisMetric,
  chartDefinition,
  runIndexByUrl,
}: UseOverlayRooflinesArgs): Record<string, OverlayRooflineEntry> {
  const { groupedData, rooflines } = useGroupedRooflines({
    data: overlayPoints,
    groupKeyFn: (p) => {
      const runIndex = overlayRunIndex(p.run_url ?? null, runIndexByUrl);
      return `${p.hwKey}_${p.precision}_run${runIndex}`;
    },
    selectedYAxisMetric,
    chartDefinition,
    sortByX: true,
    groupKeyDeps: [runIndexByUrl],
  });

  return useMemo(
    () =>
      attachOverlayMeta(groupedData, rooflines, (p) =>
        overlayRunIndex(p.run_url ?? null, runIndexByUrl),
      ),
    [groupedData, rooflines, runIndexByUrl],
  );
}
