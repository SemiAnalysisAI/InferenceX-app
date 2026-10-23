import { describe, expect, it } from 'vitest';

import { evaluationCaptionDate, evaluationTableDisplayState } from './ChartDisplay';

describe('evaluation locale copy', () => {
  it('preserves the prior English caption date and formats the Chinese sibling', () => {
    expect(evaluationCaptionDate('2026-01-02', 'en')).toBe('01/02/2026');
    expect(evaluationCaptionDate('2026-01-02', 'zh')).toBe('2026年1月2日');
  });

  it('keeps table mode loading until the evaluations query settles', () => {
    expect(
      evaluationTableDisplayState({
        isEvaluationDataSettled: false,
        isEvaluationDataError: false,
        hasDisplayData: false,
      }),
    ).toBe('loading');
    expect(
      evaluationTableDisplayState({
        isEvaluationDataSettled: true,
        isEvaluationDataError: false,
        hasDisplayData: false,
      }),
    ).toBe('ready');
    expect(
      evaluationTableDisplayState({
        isEvaluationDataSettled: true,
        isEvaluationDataError: true,
        hasDisplayData: false,
      }),
    ).toBe('error');
  });

  it('keeps valid unofficial table rows visible when the official query fails', () => {
    expect(
      evaluationTableDisplayState({
        isEvaluationDataSettled: true,
        isEvaluationDataError: true,
        hasDisplayData: true,
      }),
    ).toBe('ready');
  });
});
