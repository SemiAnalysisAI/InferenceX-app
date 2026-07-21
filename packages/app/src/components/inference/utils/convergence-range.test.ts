import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import {
  convergenceEvaluatedForXAxis,
  convergenceRangeForXAxis,
  withConvergenceRange,
} from './convergence-range';

const diagnostic = {
  convergence_checkpoint_seconds: 300,
  convergence_tolerance_ratio: 0.05,
  convergence_min_confirmation_seconds: 1200,
  convergence_horizon_seconds: 3600,
};

describe('convergenceRangeForXAxis', () => {
  it('selects the stabilization result matching the resolved x-axis field', () => {
    const point = {
      ...diagnostic,
      convergence_p90_ttft_time_seconds: 900,
      convergence_p90_ttft_requests: 312,
      convergence_p90_ttft_min: 1.4,
      convergence_p90_ttft_max: 1.52,
      convergence_p90_ttft_max_relative_deviation: 0.041,
      convergence_p75_e2el_time_seconds: 1200,
      convergence_p75_e2el_requests: 407,
      convergence_p75_e2el_min: 40,
      convergence_p75_e2el_max: 42,
      convergence_p75_e2el_max_relative_deviation: 0.03,
    };

    expect(convergenceRangeForXAxis(point, 'p90_ttft')).toEqual({
      min: 1.4,
      max: 1.52,
      timeSeconds: 900,
      requests: 312,
      maxRelativeDeviation: 0.041,
    });
    expect(convergenceRangeForXAxis(point, 'p75_e2el')?.timeSeconds).toBe(1200);
  });

  it('distinguishes an evaluated metric that did not stabilize from missing diagnostics', () => {
    expect(convergenceEvaluatedForXAxis(diagnostic, 'p90_intvty')).toBe(true);
    expect(convergenceRangeForXAxis(diagnostic, 'p90_intvty')).toBeNull();
    expect(convergenceEvaluatedForXAxis({}, 'p90_intvty')).toBe(false);
    expect(convergenceEvaluatedForXAxis(diagnostic, 'median_intvty')).toBe(false);
  });

  it('rejects invalid bounds and metadata while allowing a flat stabilized span', () => {
    const base = {
      ...diagnostic,
      convergence_p90_ttft_time_seconds: 1200,
      convergence_p90_ttft_requests: 407,
      convergence_p90_ttft_min: 2,
      convergence_p90_ttft_max: 2,
      convergence_p90_ttft_max_relative_deviation: 0,
    };
    expect(convergenceRangeForXAxis(base, 'p90_ttft')).toMatchObject({ min: 2, max: 2 });
    expect(
      convergenceRangeForXAxis({ ...base, convergence_p90_ttft_min: 0 }, 'p90_ttft'),
    ).toBeNull();
    expect(
      convergenceRangeForXAxis({ ...base, convergence_p90_ttft_max: 1 }, 'p90_ttft'),
    ).toBeNull();
    expect(
      convergenceRangeForXAxis(
        { ...base, convergence_p90_ttft_max_relative_deviation: Number.NaN },
        'p90_ttft',
      ),
    ).toBeNull();
  });
});

describe('withConvergenceRange', () => {
  it('stamps chart-ready convergence metadata and clears it when the x field changes', () => {
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
      ...diagnostic,
      convergence_p90_ttft_time_seconds: 1200,
      convergence_p90_ttft_requests: 407,
      convergence_p90_ttft_min: 1,
      convergence_p90_ttft_max: 3,
      convergence_p90_ttft_max_relative_deviation: 0.04,
    } as InferenceData;

    const stamped = withConvergenceRange(point, 'p90_ttft');
    expect(stamped.convergenceEvaluated).toBe(true);
    expect(stamped.convergenceXMin).toBe(1);
    expect(stamped.convergenceXMax).toBe(3);
    expect(stamped.convergenceTimeSeconds).toBe(1200);
    expect(stamped.convergenceRequests).toBe(407);

    const cleared = withConvergenceRange(stamped, 'median_ttft');
    expect(cleared.convergenceEvaluated).toBe(false);
    expect(cleared.convergenceXMin).toBeUndefined();
    expect(cleared.convergenceTimeSeconds).toBeUndefined();
  });
});
