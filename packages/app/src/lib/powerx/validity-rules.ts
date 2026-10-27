/**
 * The five checks the offline validator re-runs from the raw samples before a point is
 * Validated. Thresholds and reason codes mirror InferenceX at e1356ab
 * (`inferencex-e2e/infx/results/power/multinode.py` and `common.py`).
 */

export const MAX_SAMPLE_GAP_SECONDS = 3;
export const CLOCK_TOLERANCE_SECONDS = 0.5;
export const CLOCK_TOLERANCE_FRACTION = 0.01;

export const VALIDITY_CHECKS = [
  { id: 'devices', reason: 'expected_device_missing', source: 'multinode.py:503' },
  { id: 'gap', reason: 'sample_gap_exceeded', source: 'multinode.py:86, :773' },
  { id: 'clock', reason: 'measurement_window_clock_mismatch', source: 'multinode.py:96, :729' },
  { id: 'producer', reason: 'producer_commit_mismatch', source: 'multinode.py:993' },
  { id: 'tokens', reason: 'invalid_output_token_count', source: 'common.py:178' },
] as const;
export type ValidityCheckId = (typeof VALIDITY_CHECKS)[number]['id'];
export type ValidityReason = (typeof VALIDITY_CHECKS)[number]['reason'];

/** Allowed drift between the client's window and the telemetry window: max(0.5 s, 1 %). */
export function windowTolerance(windowSeconds: number): number {
  return Math.max(CLOCK_TOLERANCE_SECONDS, CLOCK_TOLERANCE_FRACTION * windowSeconds);
}
