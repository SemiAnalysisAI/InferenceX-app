import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { observedWindowRangeForXAxis, withObservedWindowRange } from './observed-window-range';

describe('observedWindowRangeForXAxis', () => {
  it('selects bounds matching the resolved x-axis field', () => {
    const point = {
      observed_window_count: 6,
      observed_window_p90_ttft_min: 1.4,
      observed_window_p90_ttft_max: 4.1,
      observed_window_p75_e2el_min: 40,
      observed_window_p75_e2el_max: 80,
    };

    expect(observedWindowRangeForXAxis(point, 'p90_ttft')).toEqual({ min: 1.4, max: 4.1 });
    expect(observedWindowRangeForXAxis(point, 'p75_e2el')).toEqual({ min: 40, max: 80 });
  });

  it('requires at least two observed windows', () => {
    expect(
      observedWindowRangeForXAxis(
        {
          observed_window_count: 1,
          observed_window_p90_ttft_min: 1,
          observed_window_p90_ttft_max: 2,
        },
        'p90_ttft',
      ),
    ).toBeNull();
  });

  it('rejects missing, non-positive, reversed, and degenerate bounds', () => {
    expect(observedWindowRangeForXAxis({ observed_window_count: 6 }, 'p90_ttft')).toBeNull();
    expect(
      observedWindowRangeForXAxis(
        {
          observed_window_count: 6,
          observed_window_p90_ttft_min: 0,
          observed_window_p90_ttft_max: 2,
        },
        'p90_ttft',
      ),
    ).toBeNull();
    expect(
      observedWindowRangeForXAxis(
        {
          observed_window_count: 6,
          observed_window_p90_ttft_min: 2,
          observed_window_p90_ttft_max: 2,
        },
        'p90_ttft',
      ),
    ).toBeNull();
  });
});

describe('withObservedWindowRange', () => {
  it('stamps chart-ready bounds and clears stale bounds when the x field changes', () => {
    const point = {
      x: 2,
      y: 100,
      date: '2026-07-21',
      tp: 8,
      conc: 16,
      precision: 'fp4',
      hwKey: 'b300-vllm',
      tpPerGpu: { y: 100, roof: true },
      tpPerMw: { y: 1, roof: true },
      costh: { y: 1, roof: true },
      costn: { y: 1, roof: true },
      costr: { y: 1, roof: true },
      costhi: { y: 1, roof: true },
      costni: { y: 1, roof: true },
      costri: { y: 1, roof: true },
      observed_window_count: 6,
      observed_window_p90_ttft_min: 1,
      observed_window_p90_ttft_max: 3,
    } as InferenceData;

    const stamped = withObservedWindowRange(point, 'p90_ttft');
    expect(stamped.observedXMin).toBe(1);
    expect(stamped.observedXMax).toBe(3);

    const cleared = withObservedWindowRange(stamped, 'median_ttft');
    expect(cleared.observedXMin).toBeUndefined();
    expect(cleared.observedXMax).toBeUndefined();
  });
});
