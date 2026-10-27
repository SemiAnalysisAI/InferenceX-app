import { snapNumber, snapTo } from './widget-hash';

/**
 * Pure rules behind the "Validity explorer" widget on /powerx/tutorial.
 *
 * Thresholds and reason codes mirror the InferenceX offline validator
 * (`inferencex-e2e/infx/results/power/multinode.py` and `common.py` at e1356ab):
 * - `MAX_SAMPLE_GAP_SECONDS = 3.0` → `sample_gap_exceeded` (multinode.py:86, :773-774)
 * - an expected device with no samples → `expected_device_missing` (multinode.py:503)
 * - `max(0.5 s, 1 % × window)` clock tolerance → `measurement_window_clock_mismatch`
 *   (multinode.py:96-97, :729-731; common.py:173-175 applies the same tolerance as
 *   `benchmark_duration_mismatch`)
 * - producer SHA differs from the pin → `producer_commit_mismatch` (multinode.py:993-996)
 * - non-positive output tokens → `invalid_output_token_count` (common.py:178-189)
 */

export const MAX_SAMPLE_GAP_SECONDS = 3;
export const CLOCK_TOLERANCE_SECONDS = 0.5;
export const CLOCK_TOLERANCE_FRACTION = 0.01;
export const EXPECTED_GPUS = 8;
export const WINDOW_LENGTHS = [60, 300, 1800] as const;
export type WindowLength = (typeof WINDOW_LENGTHS)[number];
export const MAX_GAP_INPUT_SECONDS = 6;
export const MAX_MISMATCH_INPUT_SECONDS = 3;

export const PRODUCER_STATES = ['matches', 'differs'] as const;
export type ProducerState = (typeof PRODUCER_STATES)[number];
export const TOKEN_STATES = ['positive', 'zero'] as const;
export type TokenState = (typeof TOKEN_STATES)[number];

export const VALIDITY_REASONS = [
  'sample_gap_exceeded',
  'expected_device_missing',
  'measurement_window_clock_mismatch',
  'producer_commit_mismatch',
  'invalid_output_token_count',
] as const;
export type ValidityReason = (typeof VALIDITY_REASONS)[number];

export interface ValidityInput {
  gapSeconds: number;
  reportedGpus: number;
  expectedGpus: number;
  mismatchSeconds: number;
  windowSeconds: WindowLength;
  producer: ProducerState;
  tokens: TokenState;
}

export interface ValidityVerdict {
  valid: boolean;
  reasons: ValidityReason[];
  toleranceSeconds: number;
}

export const DEFAULT_VALIDITY_INPUT: ValidityInput = {
  gapSeconds: 1,
  reportedGpus: EXPECTED_GPUS,
  expectedGpus: EXPECTED_GPUS,
  mismatchSeconds: 0.1,
  windowSeconds: 300,
  producer: 'matches',
  tokens: 'positive',
};

export function windowTolerance(windowSeconds: number): number {
  return Math.max(CLOCK_TOLERANCE_SECONDS, CLOCK_TOLERANCE_FRACTION * windowSeconds);
}

export function evaluateValidity(input: ValidityInput): ValidityVerdict {
  const reasons: ValidityReason[] = [];
  if (input.reportedGpus < input.expectedGpus) reasons.push('expected_device_missing');
  if (input.gapSeconds > MAX_SAMPLE_GAP_SECONDS) reasons.push('sample_gap_exceeded');
  const toleranceSeconds = windowTolerance(input.windowSeconds);
  if (input.mismatchSeconds > toleranceSeconds) reasons.push('measurement_window_clock_mismatch');
  if (input.producer === 'differs') reasons.push('producer_commit_mismatch');
  if (input.tokens === 'zero') reasons.push('invalid_output_token_count');
  return { valid: reasons.length === 0, reasons, toleranceSeconds };
}

/** `gap_reported_mismatch_window_producer_tokens`, e.g. `1_8_0.1_300_matches_positive`. */
export function encodeValidity(input: ValidityInput): string {
  return [
    String(input.gapSeconds),
    String(input.reportedGpus),
    String(input.mismatchSeconds),
    String(input.windowSeconds),
    input.producer,
    input.tokens,
  ].join('_');
}

export function decodeValidity(raw: string | null): ValidityInput {
  const [gap, reported, mismatch, window, producer, tokens] = (raw ?? '').split('_');
  const defaults = DEFAULT_VALIDITY_INPUT;
  const windowSeconds = Number(window);
  return {
    gapSeconds: snapNumber(gap, 0, MAX_GAP_INPUT_SECONDS, defaults.gapSeconds),
    reportedGpus: Math.round(snapNumber(reported, 0, EXPECTED_GPUS, defaults.reportedGpus)),
    expectedGpus: EXPECTED_GPUS,
    mismatchSeconds: snapNumber(mismatch, 0, MAX_MISMATCH_INPUT_SECONDS, defaults.mismatchSeconds),
    windowSeconds: (WINDOW_LENGTHS as readonly number[]).includes(windowSeconds)
      ? (windowSeconds as WindowLength)
      : defaults.windowSeconds,
    producer: snapTo(producer, PRODUCER_STATES, defaults.producer),
    tokens: snapTo(tokens, TOKEN_STATES, defaults.tokens),
  };
}
