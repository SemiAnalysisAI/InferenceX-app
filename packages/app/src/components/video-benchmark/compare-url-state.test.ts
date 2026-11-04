import { describe, expect, it } from 'vitest';
import { readVideoCompareSelection } from './compare-url-state';

const UNSELECTED = { baseline: null, candidate: null, caseIndex: 0 };

describe('video compare URL selection', () => {
  it('reads v_base, v_cand and v_case, ignoring malformed values', () => {
    expect(readVideoCompareSelection('')).toEqual(UNSELECTED);
    expect(readVideoCompareSelection('?v_base=h200&v_cand=h100&v_case=3&v_x=genSpeed')).toEqual({
      baseline: 'h200',
      candidate: 'h100',
      caseIndex: 3,
    });
    expect(readVideoCompareSelection('?v_base=H200&v_cand=h1%20x&v_case=-1')).toEqual(UNSELECTED);
    expect(readVideoCompareSelection('?v_case=12345').caseIndex).toBe(0);
  });
});
