import { describe, expect, it } from 'vitest';

import { resolveEvaluationDate } from '@/components/evaluation/EvaluationContext';

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
