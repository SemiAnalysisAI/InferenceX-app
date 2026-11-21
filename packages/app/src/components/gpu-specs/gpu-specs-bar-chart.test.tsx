// @test-environment jsdom
import { useState } from 'react';
import { describe, expect, it } from 'bun:test';

import { click, contains, eventually, get, render } from '@/test/dom';

import { GpuSpecsBarChart } from './gpu-specs-bar-chart';

function BarChartWrapper({ initialMetric = 'fp8' }: { initialMetric?: string }) {
  const [metric, setMetric] = useState(initialMetric);
  return <GpuSpecsBarChart selectedMetric={metric} onMetricChange={setMetric} />;
}

describe('GpuSpecsBarChart', () => {
  it('changing metric re-renders chart', async () => {
    render(<BarChartWrapper initialMetric="fp8" />);
    expect(get('[data-testid="gpu-specs-bar-chart"]').textContent).toContain('FP8');
    click(get('[data-testid="gpu-specs-metric-select"]'));
    click(await eventually(() => contains('[role="option"]', 'Memory (GB)')));
    await eventually(() =>
      expect(get('[data-testid="gpu-specs-bar-chart"]').textContent).toContain('Memory'),
    );
  });
});
