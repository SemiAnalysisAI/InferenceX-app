import { interpolateForGPU } from '@/components/calculator/interpolation';
import type { GPUDataPoint } from '@/components/calculator/types';
import type { SsrInterpolatedRow } from '@/lib/compare/compare-ssr';

export interface CompareTableData {
  defaultTargets: number[];
  ssrRows: SsrInterpolatedRow[];
  interactivityRange: { min: number; max: number };
}

export function emptyCompareTableData(): CompareTableData {
  return { defaultTargets: [], ssrRows: [], interactivityRange: { min: 0, max: 100 } };
}

function interactivityRangeOf(pts: GPUDataPoint[]): { min: number; max: number } | null {
  if (pts.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.interactivity < min) min = p.interactivity;
    if (p.interactivity > max) max = p.interactivity;
  }
  return { min, max };
}

/**
 * Default target columns, interpolated cells, and input range for the two sides of a
 * comparison. The server uses it for the default sequence and the client uses it for
 * any other sequence, so both produce the same columns from the same points.
 */
export function compareTableDataFromPoints(
  pointsA: GPUDataPoint[],
  pointsB: GPUDataPoint[],
): CompareTableData {
  const rangeA = interactivityRangeOf(pointsA);
  const rangeB = interactivityRangeOf(pointsB);
  if (!rangeA && !rangeB) return emptyCompareTableData();

  let globalMin: number, globalMax: number;
  if (rangeA && rangeB) {
    globalMin = Math.max(rangeA.min, rangeB.min);
    globalMax = Math.min(rangeA.max, rangeB.max);
    if (globalMin >= globalMax) {
      globalMin = Math.min(rangeA.min, rangeB.min);
      globalMax = Math.max(rangeA.max, rangeB.max);
    }
  } else {
    const r = rangeA ?? rangeB!;
    globalMin = r.min;
    globalMax = r.max;
  }

  const interactivityRange = {
    min: Math.ceil(globalMin),
    max: Math.floor(globalMax),
  };

  const span = globalMax - globalMin;
  const defaultTargets =
    span > 0
      ? [
          Math.round(globalMin + span * 0.25),
          Math.round(globalMin + span * 0.5),
          Math.round(globalMin + span * 0.75),
        ]
      : [Math.round(globalMin)];

  const ssrRows: SsrInterpolatedRow[] = defaultTargets.map((target) => ({
    target,
    a:
      pointsA.length > 0
        ? interpolateForGPU(pointsA, target, 'interactivity_to_throughput', 'costh')
        : null,
    b:
      pointsB.length > 0
        ? interpolateForGPU(pointsB, target, 'interactivity_to_throughput', 'costh')
        : null,
  }));

  return { defaultTargets, ssrRows, interactivityRange };
}

export interface CompareTableViewInput {
  /** Table the server rendered for `ssrSequence`. */
  ssrTableData: CompareTableData;
  /** Sequence the server computed `ssrTableData` for; null when it found no data. */
  ssrSequence: string | null;
  /** Model the server computed `ssrTableData` for; undefined when it is not a known model. */
  ssrModel: string | undefined;
  /** Precisions the server computed `ssrTableData` for. */
  ssrPrecisions: readonly string[];
  /** Sequence requested by the controls, before availability resolves it. */
  selectedSequence: string;
  /** Sequence the client fetches rows for. */
  effectiveSequence: string;
  sequenceResolved: boolean;
  /** Model the controls select, which the client fetches rows for. */
  selectedModel: string;
  /** Precisions requested by the controls, before availability resolves them. */
  selectedPrecisions: readonly string[];
  /** Precisions the client fetches rows for. */
  effectivePrecisions: readonly string[];
  /** True while the controls show the latest run, which is the only run the server reads. */
  latestRun: boolean;
  /** Client rows for `effectiveSequence`, split into the two compared sides. */
  pointsA: GPUDataPoint[];
  pointsB: GPUDataPoint[];
  /** Interactivity range of all client rows, or null before any rows load. */
  clientInteractivityRange: { min: number; max: number } | null;
  loading: boolean;
  error: string | null;
}

const NO_POINTS: GPUDataPoint[] = [];

export type CompareTableView =
  | {
      status: 'table';
      /** Remounts the table, and so resets its target columns, when the data source changes. */
      key: string;
      data: CompareTableData;
      interactivityRange: { min: number; max: number };
      pointsA: GPUDataPoint[];
      pointsB: GPUDataPoint[];
    }
  | { status: 'ssr-empty' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' };

/**
 * Precisions the table actually shows when it is pinned to one page precision: other
 * control precisions only change the chart, so they must not count as a different selection.
 */
export function pinTablePrecisions(list: string[], pinned: string | null): string[] {
  return pinned !== null && list.includes(pinned) ? [pinned] : list;
}

/**
 * Decides what the compare table shows. Server-rendered cells and the server's empty
 * state describe only the server's sequence, model, precisions, and latest run, so they
 * are used only while the controls show exactly that selection. Any other selection shows
 * the client's loading, error, empty, or table state.
 */
export function resolveCompareTableView({
  ssrTableData,
  ssrSequence,
  ssrModel,
  ssrPrecisions,
  selectedSequence,
  effectiveSequence,
  sequenceResolved,
  selectedModel,
  selectedPrecisions,
  effectivePrecisions,
  latestRun,
  pointsA,
  pointsB,
  clientInteractivityRange,
  loading,
  error,
}: CompareTableViewInput): CompareTableView {
  // Before availability resolves, the client may still be fetching the app default sequence,
  // so its rows describe neither the controls nor the server table.
  const clientSequence = sequenceResolved ? effectiveSequence : selectedSequence;
  const clientPrecisions = sequenceResolved ? effectivePrecisions : selectedPrecisions;
  // With no server sequence the server found no data for its model at all, so its empty
  // state holds for any precision of that model until the client resolves its sequence.
  const matchesSsr =
    latestRun &&
    selectedModel === ssrModel &&
    (ssrSequence === null
      ? !sequenceResolved
      : clientSequence === ssrSequence &&
        clientPrecisions.length === ssrPrecisions.length &&
        clientPrecisions.every((p) => ssrPrecisions.includes(p)));

  if (matchesSsr) {
    if (ssrTableData.defaultTargets.length === 0) return { status: 'ssr-empty' };
    return {
      status: 'table',
      key: 'ssr',
      data: ssrTableData,
      interactivityRange:
        sequenceResolved && clientInteractivityRange
          ? clientInteractivityRange
          : ssrTableData.interactivityRange,
      pointsA: sequenceResolved ? pointsA : NO_POINTS,
      pointsB: sequenceResolved ? pointsB : NO_POINTS,
    };
  }

  if (!sequenceResolved) return { status: 'loading' };
  if (pointsA.length > 0 || pointsB.length > 0) {
    const data = compareTableDataFromPoints(pointsA, pointsB);
    return {
      status: 'table',
      key: `client:${selectedModel}:${effectiveSequence}:${effectivePrecisions.join(',')}`,
      data,
      interactivityRange: data.interactivityRange,
      pointsA,
      pointsB,
    };
  }
  if (error) return { status: 'error' };
  if (loading) return { status: 'loading' };
  return { status: 'empty' };
}
