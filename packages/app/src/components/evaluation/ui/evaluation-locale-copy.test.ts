import { describe, expect, it } from 'vitest';

import { evaluationTableDisplayState } from './ChartDisplay';

describe('evaluation locale copy', () => {
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
