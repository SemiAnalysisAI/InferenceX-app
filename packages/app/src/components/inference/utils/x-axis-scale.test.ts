import { describe, expect, it } from 'vitest';

import { resolveScatterXAxisScale } from './x-axis-scale';

describe('resolveScatterXAxisScale', () => {
  it.each(['P90 Time To First Token (s)', 'P90 首 token 延迟 (s)'])(
    'selects log for wide-range TTFT independently of the %s display label',
    (displayLabel) => {
      const chartDefinition = { x: 'p90_ttft', displayLabel } as const;

      expect(
        resolveScatterXAxisScale({
          extent: [0.5, 20],
          selectedYAxisMetric: 'y_inputTputPerGpu',
          xAxisField: chartDefinition.x,
          scaleType: 'auto',
        }),
      ).toBe('log');
    },
  );

  it('keeps the existing auto-scale threshold and explicit overrides', () => {
    const base = {
      selectedYAxisMetric: 'y_inputTputPerGpu',
      xAxisField: 'p90_ttft',
    } as const;

    expect(resolveScatterXAxisScale({ ...base, extent: [1, 10], scaleType: 'auto' })).toBe(
      'linear',
    );
    expect(resolveScatterXAxisScale({ ...base, extent: [1, 11], scaleType: 'auto' })).toBe('log');
    expect(resolveScatterXAxisScale({ ...base, extent: [1, 100], scaleType: 'linear' })).toBe(
      'linear',
    );
    expect(resolveScatterXAxisScale({ ...base, extent: [1, 2], scaleType: 'log' })).toBe('log');
  });

  it('does not auto-log a non-TTFT field or a different y metric', () => {
    expect(
      resolveScatterXAxisScale({
        extent: [1, 100],
        selectedYAxisMetric: 'y_inputTputPerGpu',
        xAxisField: 'median_intvty',
        scaleType: 'auto',
      }),
    ).toBe('linear');
    expect(
      resolveScatterXAxisScale({
        extent: [1, 100],
        selectedYAxisMetric: 'y_tpPerGpu',
        xAxisField: 'p90_ttft',
        scaleType: 'auto',
      }),
    ).toBe('linear');
  });
});
