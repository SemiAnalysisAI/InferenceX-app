import { MEASURED_ENERGY_METRIC_CONFIG_KEYS, isMetricKey } from '../metric-registry';
import type { InferenceData } from '../types';

export const POWER_AVAILABILITY_STATES = [
  'strict',
  'validated',
  'unverified',
  'invalid',
  'inapplicable',
  'ambiguous',
  'missing',
] as const;
export type PowerAvailabilityState = (typeof POWER_AVAILABILITY_STATES)[number];
export type PowerAvailabilityCounts = Record<PowerAvailabilityState, number>;
const ROLE_METRICS = new Set([
  'y_measuredPrefillAvgPower',
  'y_measuredDecodeAvgPower',
  'y_measuredPrefillJPerInputToken',
  'y_measuredDecodeJPerOutputToken',
]);
const WHOLE_ENERGY_METRICS = new Set([
  'y_measuredJPerInputToken',
  'y_measuredJPerOutputToken',
  'y_measuredJPerTotalToken',
  'y_measuredJPerSuccessfulQuery',
  'y_measuredWhPerSuccessfulQuery',
]);

/** Uses the chart's actual admitted field, so conversions and semantic gates agree. */
export function powerMetricState(point: InferenceData, configKey: string): PowerAvailabilityState {
  if (ROLE_METRICS.has(configKey) && !point.disagg) return 'inapplicable';
  if (point.power_valid === 0) return 'invalid';
  const key = configKey.replace(/^y_/u, '');
  const value = isMetricKey(key) ? point[key] : undefined;
  if (
    value &&
    typeof value === 'object' &&
    'y' in value &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  ) {
    if (point.power_valid === 1)
      return point.power_metric_schema_version === 2 ? 'strict' : 'validated';
    return 'unverified';
  }
  if (
    WHOLE_ENERGY_METRICS.has(configKey) &&
    point.disagg &&
    point.power_metric_schema_version !== 2
  )
    return 'ambiguous';
  return 'missing';
}

export function powerMetricAvailability(points: readonly InferenceData[]) {
  return [...MEASURED_ENERGY_METRIC_CONFIG_KEYS].map((metric) => {
    const counts = Object.fromEntries(
      POWER_AVAILABILITY_STATES.map((state) => [state, 0]),
    ) as PowerAvailabilityCounts;
    for (const point of points) counts[powerMetricState(point, metric)]++;
    return {
      metric,
      counts,
      available: counts.strict + counts.validated + counts.unverified,
      total: points.length,
    };
  });
}
