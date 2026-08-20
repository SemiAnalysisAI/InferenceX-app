import { describe, expect, it } from 'vitest';

import { EVAL_SAMPLE_FILTER_ERROR, parseEvalSampleWindow } from './eval-sample-params';

describe('parseEvalSampleWindow', () => {
  it('shares stable defaults across stored and live readers', () => {
    expect(parseEvalSampleWindow(new URLSearchParams())).toEqual({
      filter: 'all',
      offset: 0,
      limit: 200,
    });
  });

  it('normalizes non-finite pagination and clamps the window', () => {
    expect(parseEvalSampleWindow(new URLSearchParams('offset=nan&limit=nan'))).toEqual({
      filter: 'all',
      offset: 0,
      limit: 200,
    });
    expect(parseEvalSampleWindow(new URLSearchParams('offset=-8&limit=9999'))).toEqual({
      filter: 'all',
      offset: 0,
      limit: 500,
    });
  });

  it('returns the canonical filter error', () => {
    expect(parseEvalSampleWindow(new URLSearchParams('filter=unknown'))).toEqual({
      error: EVAL_SAMPLE_FILTER_ERROR,
    });
  });
});
