/**
 * The five checks the offline validator re-runs from the raw samples before a point is
 * Validated. Thresholds and reason codes mirror InferenceX at e1356ab
 * (`inferencex-e2e/infx/results/power/multinode.py` and `common.py`).
 */

export const MAX_SAMPLE_GAP_SECONDS = 3;

export const VALIDITY_CHECKS = [
  { id: 'devices', reason: 'expected_device_missing' },
  { id: 'gap', reason: 'sample_gap_exceeded' },
  { id: 'clock', reason: 'measurement_window_clock_mismatch' },
  { id: 'producer', reason: 'producer_commit_mismatch' },
  { id: 'tokens', reason: 'invalid_output_token_count' },
] as const;
export type ValidityCheckId = (typeof VALIDITY_CHECKS)[number]['id'];
