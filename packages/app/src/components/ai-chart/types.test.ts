import { describe, expect, it } from 'vitest';

import { validateSpec } from './types';

describe('validateSpec measured power axes', () => {
  it.each([
    'y_measuredJPerSuccessfulQuery',
    'y_measuredWhPerSuccessfulQuery',
    'y_measuredPowerPercentTdp',
  ])('preserves %s as a benchmark Y-axis metric', (yAxisMetric) => {
    const spec = validateSpec({ dataSource: 'benchmarks', yAxisMetric });

    expect(spec.yAxisMetric).toBe(yAxisMetric);
  });
});

describe('validateSpec locale fallbacks', () => {
  it('uses a Chinese fallback title for incomplete Chinese chart specs', () => {
    expect(validateSpec({}, 'zh').title).toBe('AI 生成的图表');
  });
});
