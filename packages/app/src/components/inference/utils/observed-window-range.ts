import type { AggDataEntry, InferenceData } from '@/components/inference/types';

export interface ObservedWindowRange {
  min: number;
  max: number;
}

/**
 * Resolve the descriptive window bounds matching the chart's current x field.
 * Missing, degenerate, and single-window diagnostics intentionally render no
 * whisker: there is no within-run range to communicate in those cases.
 */
export function observedWindowRangeForXAxis(
  point: Partial<AggDataEntry>,
  xAxisField: string,
): ObservedWindowRange | null {
  if ((point.observed_window_count ?? 0) < 2) return null;
  const values = point as unknown as Record<string, unknown>;
  const min = values[`observed_window_${xAxisField}_min`];
  const max = values[`observed_window_${xAxisField}_max`];
  if (
    typeof min !== 'number' ||
    typeof max !== 'number' ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min <= 0 ||
    max <= min
  ) {
    return null;
  }
  return { min, max };
}

export function withObservedWindowRange(point: InferenceData, xAxisField: string): InferenceData {
  const range = observedWindowRangeForXAxis(point, xAxisField);
  return {
    ...point,
    observedXMin: range?.min,
    observedXMax: range?.max,
  };
}
