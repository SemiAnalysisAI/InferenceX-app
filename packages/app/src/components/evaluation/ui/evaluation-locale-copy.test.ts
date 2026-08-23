import { describe, expect, it } from 'vitest';

import { evaluationCaptionDate } from './ChartDisplay';
import { EVALUATION_TABLE_STRINGS } from './EvaluationTable';

describe('evaluation locale copy', () => {
  it('preserves the prior English caption date and formats the Chinese sibling', () => {
    expect(evaluationCaptionDate('2026-01-02', 'en')).toBe('01/02/2026');
    expect(evaluationCaptionDate('2026-01-02', 'zh')).toBe('2026年1月2日');
  });

  it('uses unambiguous Chinese evaluation table labels', () => {
    expect(EVALUATION_TABLE_STRINGS.en).toMatchObject({ conc: 'Conc', min: 'Min', max: 'Max' });
    expect(EVALUATION_TABLE_STRINGS.zh).toMatchObject({
      conc: '并发数',
      min: '最低',
      max: '最高',
    });
    expect(EVALUATION_TABLE_STRINGS.zh.unofficialTitle).not.toContain('/');
  });
});
