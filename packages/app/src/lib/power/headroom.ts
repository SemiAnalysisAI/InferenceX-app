import { interpolateMetricAtInteractivity } from '@/components/inference/hooks/interpolated-trend-core';
import type { InferenceData } from '@/components/inference/types';
import { observedPoints } from '@/components/inference/utils/equal-service-comparison';
import { powerBreakdownSeriesKey } from '@/components/inference/utils/power-breakdown';
import { getGpuSpecs, getHardwareConfig } from '@/lib/catalog/constants';
import { getPrecisionLabel, type Precision } from '@/lib/catalog/data-mappings';
import { getOverlayLineLabel, type OverlayRunIdentity } from '@/lib/benchmarks/inference-labels';
import { overlayRunIndex } from '@/lib/charts/overlay-run-style';
import { getDisplayLabel } from '@/lib/shared/utils';

import { isPositive } from './power-basis';

/**
 * Measured-vs-TDP headroom by interactivity (PowerX P0-2).
 *
 * For each chip line (hardware key + precision, the chart legend grouping) the
 * average and P90 GPU W per chip are read at four standard interactivities
 * through `interpolateMetricAtInteractivity`: the throughput Pareto front of the
 * chip's points, splined monotonically (Steffen), never extrapolated. A chip
 * without points on both sides of an interactivity gets `null` there, not a
 * guess. Headroom = 1 − P90 ÷ TDP, with TDP from the hardware registry.
 */
export const HEADROOM_INTERACTIVITIES = [25, 50, 100, 300] as const;

export interface HeadroomCell {
  interactivity: number;
  /** Interpolated measured average W per chip. */
  avgWatts: number;
  /** Interpolated measured P90 fleet W per chip. */
  p90Watts: number;
  /** P90 ÷ TDP, in percent. */
  percentTdpP90: number;
  /** 1 − P90 ÷ TDP, in percent. */
  headroomPercent: number;
}

export interface HeadroomRow {
  key: string;
  hwKey: string;
  precision: string;
  label: string;
  /** Set on rows read from an unofficial-run overlay: the run's palette index. */
  runIndex?: number;
  tdpWatts: number;
  /** Interactivity range of the measured points the cells are read from. */
  interactivityMin: number;
  interactivityMax: number;
  /** One cell per `HEADROOM_INTERACTIVITIES` entry; null outside the measured range. */
  cells: (HeadroomCell | null)[];
}

function cellAt(
  points: InferenceData[],
  interactivity: number,
  tdpWatts: number,
): HeadroomCell | null {
  const avgWatts = interpolateMetricAtInteractivity(points, interactivity, 'measuredAvgPower');
  const p90Watts = interpolateMetricAtInteractivity(points, interactivity, 'measuredP90Power');
  if (!isPositive(avgWatts) || !isPositive(p90Watts)) return null;
  const percentTdpP90 = (p90Watts / tdpWatts) * 100;
  return {
    interactivity,
    avgWatts,
    p90Watts,
    percentTdpP90,
    headroomPercent: 100 - percentTdpP90,
  };
}

/** The unofficial-run overlay points shown beside the official ones, with their run identities. */
export interface HeadroomOverlayInput {
  points: readonly InferenceData[];
  runIndexByUrl: Record<string, number>;
  runInfos: readonly OverlayRunIdentity[];
}

const usable = (point: InferenceData) =>
  isPositive(point.x) &&
  isPositive(point.measuredAvgPower?.y) &&
  isPositive(point.measuredP90Power?.y) &&
  isPositive(point.tpPerGpu?.y);

function headroomRow(
  key: string,
  group: InferenceData[],
  interactivities: readonly number[],
  overlay?: { runIndex: number; run: OverlayRunIdentity | undefined },
): HeadroomRow | null {
  const first = group[0];
  const tdpWatts = getGpuSpecs(first.hwKey).tdp;
  if (!isPositive(tdpWatts)) return null;
  const xs = group.map((point) => point.x);
  const interactivityMin = Math.min(...xs);
  const interactivityMax = Math.max(...xs);
  if (!(interactivityMax > interactivityMin)) return null;
  const chipLabel = [
    getDisplayLabel(getHardwareConfig(first.hwKey, first.model)),
    getPrecisionLabel(first.precision as Precision),
  ]
    .filter(Boolean)
    .join(' ');
  return {
    key,
    hwKey: first.hwKey,
    precision: first.precision,
    // Overlay rows carry the run tag the chart's line pills use, so the two match.
    label: overlay?.run ? getOverlayLineLabel(chipLabel, overlay.run, true) : chipLabel,
    ...(overlay ? { runIndex: overlay.runIndex } : {}),
    tdpWatts,
    interactivityMin,
    interactivityMax,
    cells: interactivities.map((interactivity) => cellAt(group, interactivity, tdpWatts)),
  };
}

/**
 * One row per visible chip line that has measured average and P90 power, a
 * registry TDP and at least two measured points. Points are the main chart's
 * points, so `x` is already the chart's interactivity. Unofficial-run overlay
 * points get their own rows per run, after the official ones.
 */
export function buildHeadroomRows(
  points: readonly InferenceData[],
  interactivities: readonly number[] = HEADROOM_INTERACTIVITIES,
  overlay?: HeadroomOverlayInput,
): HeadroomRow[] {
  const groups = new Map<string, InferenceData[]>();
  for (const point of observedPoints(points)) {
    if (!usable(point)) continue;
    const key = powerBreakdownSeriesKey(point);
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  const rows: HeadroomRow[] = [];
  for (const [key, group] of groups) {
    const row = headroomRow(key, group, interactivities);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));

  const overlayGroups = new Map<string, { runIndex: number; points: InferenceData[] }>();
  for (const point of observedPoints(overlay?.points ?? [])) {
    if (!usable(point)) continue;
    const runIndex = overlayRunIndex(point.run_url ?? null, overlay!.runIndexByUrl);
    const key = `${powerBreakdownSeriesKey(point)}|run${runIndex}`;
    const entry = overlayGroups.get(key) ?? { runIndex, points: [] };
    entry.points.push(point);
    overlayGroups.set(key, entry);
  }
  const overlayRows: HeadroomRow[] = [];
  for (const [key, { runIndex, points: group }] of overlayGroups) {
    const row = headroomRow(key, group, interactivities, {
      runIndex,
      run: overlay?.runInfos[runIndex],
    });
    if (row) overlayRows.push(row);
  }
  overlayRows.sort(
    (a, b) => (a.runIndex ?? 0) - (b.runIndex ?? 0) || a.label.localeCompare(b.label),
  );
  return [...rows, ...overlayRows];
}

export interface HeadroomExample {
  row: HeadroomRow;
  /** The faster operating point (at most 300 tok/s/user). */
  high: HeadroomCell;
  /** The slower operating point (at least 150 tok/s/user). */
  low: HeadroomCell;
  /** True when 300 tok/s/user is outside the chip's measured range. */
  clippedHigh: boolean;
}

/**
 * The "300 → 150 tok/s/user" example callout: the chip with the widest
 * measured interactivity range, read at its fastest point up to 300 and at 150
 * (or its slowest point above it). Null when no chip spans two such points.
 */
export function headroomExample(
  points: readonly InferenceData[],
  rows: readonly HeadroomRow[] = buildHeadroomRows(points),
): HeadroomExample | null {
  const groups = new Map<string, InferenceData[]>();
  for (const point of observedPoints(points)) {
    const key = powerBreakdownSeriesKey(point);
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  const ordered = rows.toSorted(
    (a, b) =>
      Math.log(b.interactivityMax / b.interactivityMin) -
      Math.log(a.interactivityMax / a.interactivityMin),
  );
  for (const row of ordered) {
    const highX = Math.min(300, row.interactivityMax);
    const lowX = Math.max(150, row.interactivityMin);
    if (!(highX > lowX)) continue;
    const group = groups.get(row.key) ?? [];
    const high = cellAt(group, highX, row.tdpWatts);
    const low = cellAt(group, lowX, row.tdpWatts);
    if (!high || !low) continue;
    return { row, high, low, clippedHigh: highX < 300 };
  }
  return null;
}

/** Flat rows for the CSV export and the views API: one per chip × interactivity. */
export function headroomCsvRows(rows: readonly HeadroomRow[]) {
  return rows.flatMap((row) =>
    row.cells.map((cell, index) => ({
      chip: row.label,
      hwKey: row.hwKey,
      precision: row.precision,
      interactivity_tok_s_user: HEADROOM_INTERACTIVITIES[index] ?? cell?.interactivity ?? '',
      avg_w_per_gpu: cell ? Number(cell.avgWatts.toFixed(1)) : '',
      p90_w_per_gpu: cell ? Number(cell.p90Watts.toFixed(1)) : '',
      pct_tdp_p90: cell ? Number(cell.percentTdpP90.toFixed(1)) : '',
      headroom_pct: cell ? Number(cell.headroomPercent.toFixed(1)) : '',
      tdp_w: row.tdpWatts,
      basis: 'GPU',
      source: row.runIndex === undefined ? 'official' : 'unofficial',
    })),
  );
}
