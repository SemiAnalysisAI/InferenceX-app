import { describe, expect, it } from 'vitest';
import { DEFAULT_VIDEO_COMPARE_SELECTION, readVideoCompareSelection } from './compare-url-state';

describe('video compare URL selection', () => {
  it('reads v_base, v_cand and v_case, ignoring malformed values', () => {
    expect(readVideoCompareSelection('')).toEqual(DEFAULT_VIDEO_COMPARE_SELECTION);
    expect(readVideoCompareSelection('?v_base=h200&v_cand=h100&v_case=3&v_x=genSpeed')).toEqual({
      baseline: 'h200',
      candidate: 'h100',
      caseIndex: 3,
    });
    expect(readVideoCompareSelection('?v_base=H200&v_cand=h1%20x&v_case=-1')).toEqual(
      DEFAULT_VIDEO_COMPARE_SELECTION,
    );
    expect(readVideoCompareSelection('?v_case=12345').caseIndex).toBe(0);
  });
});
