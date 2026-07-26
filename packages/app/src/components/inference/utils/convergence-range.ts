import type { AggDataEntry, InferenceData } from '@/components/inference/types';

export interface ConvergenceRange {
  min: number;
  max: number;
  timeSeconds: number;
  requests: number;
  maxRelativeDeviation: number;
}

const CONVERGENCE_X_FIELD = /^(?:p75|p90)_(?:ttft|e2el|intvty)$/u;

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Whether this run evaluated cumulative convergence for the selected x field. */
export function convergenceEvaluatedForXAxis(
  point: Partial<AggDataEntry>,
  xAxisField: string,
): boolean {
  return (
    CONVERGENCE_X_FIELD.test(xAxisField) &&
    finiteNumber(point.convergence_checkpoint_seconds) &&
    point.convergence_checkpoint_seconds > 0 &&
    finiteNumber(point.convergence_tolerance_ratio) &&
    point.convergence_tolerance_ratio >= 0 &&
    finiteNumber(point.convergence_min_confirmation_seconds) &&
    point.convergence_min_confirmation_seconds >= 0 &&
    finiteNumber(point.convergence_horizon_seconds) &&
    point.convergence_horizon_seconds > 0
  );
}

/** Resolve post-stabilization cumulative bounds for the chart's current x field. */
export function convergenceRangeForXAxis(
  point: Partial<AggDataEntry>,
  xAxisField: string,
): ConvergenceRange | null {
  if (!convergenceEvaluatedForXAxis(point, xAxisField)) return null;

  const values = point as unknown as Record<string, unknown>;
  const prefix = `convergence_${xAxisField}`;
  const min = values[`${prefix}_min`];
  const max = values[`${prefix}_max`];
  const timeSeconds = values[`${prefix}_time_seconds`];
  const requests = values[`${prefix}_requests`];
  const maxRelativeDeviation = values[`${prefix}_max_relative_deviation`];
  if (
    !finiteNumber(min) ||
    min <= 0 ||
    !finiteNumber(max) ||
    max < min ||
    !finiteNumber(timeSeconds) ||
    timeSeconds <= 0 ||
    !finiteNumber(requests) ||
    requests < 0 ||
    !finiteNumber(maxRelativeDeviation) ||
    maxRelativeDeviation < 0
  ) {
    return null;
  }

  return { min, max, timeSeconds, requests, maxRelativeDeviation };
}

/** Stamp the selected convergence result onto a chart-ready point. */
export function withConvergenceRange(point: InferenceData, xAxisField: string): InferenceData {
  const range = convergenceRangeForXAxis(point, xAxisField);
  return {
    ...point,
    convergenceEvaluated: convergenceEvaluatedForXAxis(point, xAxisField),
    convergenceXMin: range?.min,
    convergenceXMax: range?.max,
    convergenceTimeSeconds: range?.timeSeconds,
    convergenceRequests: range?.requests,
    convergenceMaxRelativeDeviation: range?.maxRelativeDeviation,
  };
}
