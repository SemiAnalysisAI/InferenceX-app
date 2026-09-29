import type { AggDataEntry, InferenceData } from '../types';
import {
  equalServiceSourceKey,
  getEqualServiceSources,
  observedPoints,
  positiveOrNull,
  serviceMetricValue,
  type EqualServiceSource,
} from './equal-service-comparison';

/**
 * Pairs two sources' observations at the same concurrency (PowerX Figures 6,
 * 7 and 9). Matched load is a diagnostic next to the equal-service comparison,
 * not a replacement: the two sources usually serve different speeds at one
 * concurrency. Nothing is interpolated, averaged or carried between rows.
 */
export const MATCHED_CONCURRENCY_METRICS = [
  'joulesPerOutputToken',
  'meanWattsPerGpu',
  'interactivity',
] as const;
export type MatchedConcurrencyMetric = (typeof MATCHED_CONCURRENCY_METRICS)[number];
export type MatchedConcurrencyValues = Record<MatchedConcurrencyMetric, number | null>;

export type MatchedConcurrencySide =
  | { status: 'observed'; point: InferenceData; values: MatchedConcurrencyValues }
  | { status: 'missing' }
  /** Several observations of one source at one load disagree; none is chosen. */
  | { status: 'ambiguous'; points: InferenceData[] };

export interface MatchedConcurrencyRow {
  concurrency: number;
  baseline: MatchedConcurrencySide;
  comparator: MatchedConcurrencySide;
  /** `100 × (comparator ÷ baseline − 1)`; null unless both values were observed. */
  changePercent: MatchedConcurrencyValues;
}

export type MatchedConcurrencyReason = 'same-source' | 'unknown-source';

export interface MatchedConcurrencyTable {
  baseline: EqualServiceSource | null;
  comparator: EqualServiceSource | null;
  /** Streaming-speed field read for the `interactivity` column (selected statistic). */
  interactivityField: keyof AggDataEntry;
  reason?: MatchedConcurrencyReason;
  rows: MatchedConcurrencyRow[];
}

const NO_CHANGE: MatchedConcurrencyValues = {
  joulesPerOutputToken: null,
  meanWattsPerGpu: null,
  interactivity: null,
};

function values(point: InferenceData, field: keyof AggDataEntry): MatchedConcurrencyValues {
  return {
    joulesPerOutputToken: positiveOrNull(serviceMetricValue.joulesPerOutputToken(point)),
    meanWattsPerGpu: positiveOrNull(serviceMetricValue.meanWattsPerGpu(point)),
    interactivity: positiveOrNull(point[field]),
  };
}

function side(points: readonly InferenceData[], field: keyof AggDataEntry): MatchedConcurrencySide {
  if (points.length === 0) return { status: 'missing' };
  const first = values(points[0], field);
  const agree = points.every((point) => {
    const other = values(point, field);
    return MATCHED_CONCURRENCY_METRICS.every((key) => Object.is(other[key], first[key]));
  });
  return agree
    ? { status: 'observed', point: points[0], values: first }
    : { status: 'ambiguous', points: [...points] };
}

export function buildMatchedConcurrencyTable(
  points: readonly InferenceData[],
  options: { baseline: string; comparator: string; interactivityField: keyof AggDataEntry },
): MatchedConcurrencyTable {
  const { baseline, comparator, interactivityField } = options;
  const sources = getEqualServiceSources(points);
  const sourceA = sources.find((source) => source.key === baseline) ?? null;
  const sourceB = sources.find((source) => source.key === comparator) ?? null;
  const table = { baseline: sourceA, comparator: sourceB, interactivityField };
  if (baseline === comparator) return { ...table, reason: 'same-source', rows: [] };
  if (!sourceA || !sourceB) return { ...table, reason: 'unknown-source', rows: [] };

  const byConcurrency = (key: string) => {
    const groups = new Map<number, InferenceData[]>();
    for (const point of observedPoints(points)) {
      if (equalServiceSourceKey(point) !== key || !Number.isSafeInteger(point.conc)) continue;
      if (point.conc <= 0) continue;
      const group = groups.get(point.conc);
      if (group) group.push(point);
      else groups.set(point.conc, [point]);
    }
    return groups;
  };
  const a = byConcurrency(baseline);
  const b = byConcurrency(comparator);
  const rows = [...new Set([...a.keys(), ...b.keys()])]
    .toSorted((x, y) => x - y)
    .map((concurrency): MatchedConcurrencyRow => {
      const left = side(a.get(concurrency) ?? [], interactivityField);
      const right = side(b.get(concurrency) ?? [], interactivityField);
      if (left.status !== 'observed' || right.status !== 'observed') {
        return { concurrency, baseline: left, comparator: right, changePercent: NO_CHANGE };
      }
      const change = (key: MatchedConcurrencyMetric) => {
        const before = left.values[key];
        const after = right.values[key];
        if (before === null || after === null) return null;
        const percent = 100 * (after / before - 1);
        return Number.isFinite(percent) ? percent : null;
      };
      return {
        concurrency,
        baseline: left,
        comparator: right,
        changePercent: {
          joulesPerOutputToken: change('joulesPerOutputToken'),
          meanWattsPerGpu: change('meanWattsPerGpu'),
          interactivity: change('interactivity'),
        },
      };
    });
  return { ...table, rows };
}
