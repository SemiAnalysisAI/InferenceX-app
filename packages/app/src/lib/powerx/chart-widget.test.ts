import { describe, expect, it } from 'vitest';

import type { InferenceSeriesEntry } from '@/lib/views-api/series';

import {
  chartDashboardUrl,
  chartViewUrl,
  decodeChartMetric,
  encodeChartMetric,
  toPanelData,
} from './chart-widget';

function series(hwKey: string, label: string, xs: number[]): InferenceSeriesEntry {
  return {
    hwKey,
    gpu: hwKey.split('_')[0],
    framework: hwKey.split('_')[1] ?? '',
    specMethod: 'none',
    label,
    deployment: 'single-node',
    kvOffload: false,
    bestPerSku: true,
    points: xs.map((x, index) => ({
      id: index,
      precision: 'fp4',
      x,
      y: 10 / x,
      concurrency: 2 ** index,
      topologyKey: 'Single',
      tp: 8,
      date: '2026-10-23',
      frontier: true,
      bestPerSku: true,
      metrics: {},
    })),
  };
}

describe('chart widget helpers', () => {
  it('builds the views-API and dashboard URLs for each metric', () => {
    expect(chartViewUrl('energy')).toBe(
      '/api/v1/views/inference?model=DeepSeek-V4-Pro&sequence=agentic-traces&gpus=b200%2Cmi355x&precisions=fp4&metric=y_measuredJPerOutputToken',
    );
    expect(chartViewUrl('power')).toContain('metric=y_measuredP90Power');
    expect(chartDashboardUrl('power')).toBe('/inference?i_metric=y_measuredP90Power');
  });

  it('flattens series into sorted lines, markers and a legend', () => {
    const response = {
      series: [
        series('b200_vllm', 'B200 (vLLM)', [40, 10, 20]),
        series('mi355x_atom', 'MI355X', []),
      ],
      xAxis: { label: 'x' },
      metric: { label: 'y', labelZh: 'y', unit: 'W' },
      count: 3,
    };
    const panel = toPanelData(
      response,
      (key) => `color-${key}`,
      (entry, point) => `${entry.label}@${point.concurrency}`,
    );
    expect(panel.lines).toHaveLength(1);
    expect(panel.lines[0]).toMatchObject({ key: 'b200_vllm', color: 'color-b200_vllm' });
    expect(panel.lines[0].points.map((point) => point.x)).toEqual([10, 20, 40]);
    expect(panel.markers.map((marker) => marker.tooltip)).toEqual([
      'B200 (vLLM)@2',
      'B200 (vLLM)@4',
      'B200 (vLLM)@1',
    ]);
    expect(panel.legend).toEqual([{ key: 'b200_vllm', label: 'B200 (vLLM)', points: 3 }]);
  });

  it('round-trips the metric hash and snaps unknown values', () => {
    expect(decodeChartMetric(encodeChartMetric('power'))).toBe('power');
    expect(decodeChartMetric('bogus')).toBe('energy');
    expect(decodeChartMetric(null)).toBe('energy');
  });
});
