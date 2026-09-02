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

  it('uses Chinese display labels when an incomplete spec omits its Y-axis label', () => {
    expect(validateSpec({ yAxisMetric: 'y_tpPerGpu' }, 'zh').yAxisLabel).toBe(
      '每芯片 token 吞吐量（tok/s/chip）',
    );
    expect(validateSpec({ yAxisMetric: 'eval_score' }, 'zh').yAxisLabel).toBe('评估得分');
    expect(validateSpec({ yAxisMetric: 'reliability_rate' }, 'zh').yAxisLabel).toBe('运行成功率');
    expect(validateSpec({ yAxisMetric: 'y_tpPerGpu' }).yAxisLabel).toBe('y_tpPerGpu');
  });

  it('keeps a provider-supplied Chinese Y-axis label unchanged', () => {
    expect(
      validateSpec({ yAxisMetric: 'y_tpPerGpu', yAxisLabel: '每芯片吞吐量' }, 'zh').yAxisLabel,
    ).toBe('每芯片吞吐量');
  });
});
