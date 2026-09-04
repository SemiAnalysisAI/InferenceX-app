import { describe, expect, it, vi } from 'vitest';

import {
  resolveEvaluationDate,
  retryFailedEvaluationQueries,
} from '@/components/evaluation/EvaluationContext';

describe('resolveEvaluationDate', () => {
  const dates = ['2026-08-01', '2026-08-10', '2026-08-20'];

  it('uses latest when neither evaluation nor global intent provides a date', () => {
    expect(resolveEvaluationDate('', dates)).toBe('2026-08-20');
  });

  it('keeps an available requested date', () => {
    expect(resolveEvaluationDate('2026-08-10', dates)).toBe('2026-08-10');
  });

  it('selects the nearest evaluation date without copying it into intent', () => {
    expect(resolveEvaluationDate('2026-08-13', dates)).toBe('2026-08-10');
    expect(resolveEvaluationDate('2026-08-18', dates)).toBe('2026-08-20');
  });

  it('preserves requested intent while evaluation availability is empty', () => {
    expect(resolveEvaluationDate('2026-08-13', [])).toBe('2026-08-13');
  });
});

describe('retryFailedEvaluationQueries', () => {
  it('retries only the availability query when availability metadata failed', () => {
    const refetchAvailability = vi.fn();
    const refetchEvaluations = vi.fn();

    retryFailedEvaluationQueries({
      availabilityFailed: true,
      evaluationsFailed: false,
      refetchAvailability,
      refetchEvaluations,
    });

    expect(refetchAvailability).toHaveBeenCalledOnce();
    expect(refetchEvaluations).not.toHaveBeenCalled();
  });

  it('retries every failed query when both sources failed', () => {
    const refetchAvailability = vi.fn();
    const refetchEvaluations = vi.fn();

    retryFailedEvaluationQueries({
      availabilityFailed: true,
      evaluationsFailed: true,
      refetchAvailability,
      refetchEvaluations,
    });

    expect(refetchAvailability).toHaveBeenCalledOnce();
    expect(refetchEvaluations).toHaveBeenCalledOnce();
  });
});
