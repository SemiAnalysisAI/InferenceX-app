import { describe, expect, it } from 'vitest';

import { MAX_SAMPLE_GAP_SECONDS, VALIDITY_CHECKS, windowTolerance } from './validity-rules';

describe('validity checks', () => {
  it('lists the five validator checks with their exact reason codes', () => {
    expect(VALIDITY_CHECKS.map((check) => check.reason)).toEqual([
      'expected_device_missing',
      'sample_gap_exceeded',
      'measurement_window_clock_mismatch',
      'producer_commit_mismatch',
      'invalid_output_token_count',
    ]);
    expect(new Set(VALIDITY_CHECKS.map((check) => check.id)).size).toBe(VALIDITY_CHECKS.length);
    for (const check of VALIDITY_CHECKS) expect(check.source).toMatch(/\.py:\d+/u);
  });

  it('keeps the 3 s sample-gap limit and the max(0.5 s, 1 %) clock tolerance', () => {
    expect(MAX_SAMPLE_GAP_SECONDS).toBe(3);
    expect(windowTolerance(10)).toBe(0.5);
    expect(windowTolerance(50)).toBe(0.5);
    expect(windowTolerance(300)).toBe(3);
    expect(windowTolerance(1800)).toBe(18);
  });
});
