import { describe, expect, it } from 'vitest';

import {
  decodeValidity,
  DEFAULT_VALIDITY_INPUT,
  encodeValidity,
  evaluateValidity,
  MAX_SAMPLE_GAP_SECONDS,
  windowTolerance,
} from './validity-rules';

describe('evaluateValidity', () => {
  it('validates the default window', () => {
    expect(evaluateValidity(DEFAULT_VALIDITY_INPUT)).toEqual({
      valid: true,
      reasons: [],
      toleranceSeconds: 3,
    });
  });

  it('applies the 3 s sample-gap limit inclusively', () => {
    expect(
      evaluateValidity({ ...DEFAULT_VALIDITY_INPUT, gapSeconds: MAX_SAMPLE_GAP_SECONDS }).valid,
    ).toBe(true);
    expect(evaluateValidity({ ...DEFAULT_VALIDITY_INPUT, gapSeconds: 3.1 }).reasons).toEqual([
      'sample_gap_exceeded',
    ]);
  });

  it('requires every expected GPU', () => {
    expect(evaluateValidity({ ...DEFAULT_VALIDITY_INPUT, reportedGpus: 7 }).reasons).toEqual([
      'expected_device_missing',
    ]);
  });

  it('uses max(0.5 s, 1 %) of the window as the clock tolerance', () => {
    expect(windowTolerance(60)).toBe(0.6);
    expect(windowTolerance(300)).toBe(3);
    expect(windowTolerance(1800)).toBe(18);
    expect(windowTolerance(10)).toBe(0.5);
    const short = { ...DEFAULT_VALIDITY_INPUT, windowSeconds: 60 as const, mismatchSeconds: 0.7 };
    expect(evaluateValidity(short).reasons).toEqual(['measurement_window_clock_mismatch']);
    expect(evaluateValidity({ ...short, windowSeconds: 300 }).valid).toBe(true);
  });

  it('names the producer and token reasons exactly as the validator does', () => {
    const verdict = evaluateValidity({
      ...DEFAULT_VALIDITY_INPUT,
      producer: 'differs',
      tokens: 'zero',
      reportedGpus: 0,
      gapSeconds: 6,
      mismatchSeconds: 3,
      windowSeconds: 60,
    });
    expect(verdict.valid).toBe(false);
    expect(verdict.reasons).toEqual([
      'expected_device_missing',
      'sample_gap_exceeded',
      'measurement_window_clock_mismatch',
      'producer_commit_mismatch',
      'invalid_output_token_count',
    ]);
  });
});

describe('validity hash codec', () => {
  it('round-trips and snaps', () => {
    const input = {
      ...DEFAULT_VALIDITY_INPUT,
      gapSeconds: 3.5,
      reportedGpus: 6,
      mismatchSeconds: 0.25,
      windowSeconds: 1800 as const,
      producer: 'differs' as const,
      tokens: 'zero' as const,
    };
    expect(encodeValidity(input)).toBe('3.5_6_0.25_1800_differs_zero');
    expect(decodeValidity(encodeValidity(input))).toEqual(input);
    expect(decodeValidity(null)).toEqual(DEFAULT_VALIDITY_INPUT);
    expect(decodeValidity('99_12_-1_42_x_y')).toEqual({
      ...DEFAULT_VALIDITY_INPUT,
      gapSeconds: 6,
      reportedGpus: 8,
      mismatchSeconds: 0,
    });
  });
});
