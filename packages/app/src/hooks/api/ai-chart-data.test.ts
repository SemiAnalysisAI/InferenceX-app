import { describe, expect, it } from 'vitest';

import chartDefinitions from '@/components/inference/inference-chart-config.json';

import {
  buildAiLineData,
  getAiMetricDirection,
  normalizeAiRadarRows,
  rankAiHardwareKeys,
  readAiMetric,
} from './ai-chart-data';

const chartDefinition = chartDefinitions[0] as Record<string, unknown>;

describe('readAiMetric', () => {
  it('preserves an explicitly measured zero while rejecting a missing telemetry property', () => {
    expect(
      readAiMetric({ measuredAvgPower: { y: 0 } }, 'measuredAvgPower.y', 'y_measuredAvgPower'),
    ).toBe(0);
    expect(readAiMetric({}, 'measuredAvgPower.y', 'y_measuredAvgPower')).toBeNull();
    expect(
      readAiMetric(
        { measuredAvgPower: { y: Number.NaN } },
        'measuredAvgPower.y',
        'y_measuredAvgPower',
      ),
    ).toBeNull();
  });

  it.each([
    ['costh.y', 'y_costh'],
    ['tpPerGpu.y', 'y_tpPerGpu'],
    ['jTotal.y', 'y_jTotal'],
  ])('rejects a synthetic zero sentinel for %s', (path, metric) => {
    const [field] = path.split('.');
    expect(readAiMetric({ [field]: { y: 0 } }, path, metric)).toBeNull();
  });
});

describe('getAiMetricDirection', () => {
  const lowerIsBetterMetrics = Object.entries(chartDefinition)
    .filter(([key, value]) => key.endsWith('_roofline') && String(value).startsWith('lower_'))
    .map(([key]) => key.slice(0, -'_roofline'.length));

  it.each(lowerIsBetterMetrics)('derives lower-is-better for %s from its roofline', (metric) => {
    expect(getAiMetricDirection(metric, chartDefinition)).toBe('lower');
  });

  it('derives higher-is-better from an upper roofline', () => {
    expect(getAiMetricDirection('y_tpPerGpu', chartDefinition)).toBe('higher');
  });

  it('defaults a directionless metric to higher-is-better', () => {
    expect(getAiMetricDirection('y_measuredPowerPercentTdp', chartDefinition)).toBe('higher');
  });
});

describe('buildAiLineData', () => {
  it('keeps missing X positions as line gaps while preserving a real zero', () => {
    const points = [
      { hwKey: 'b200_vllm', x: 10, metric: { y: 5 } },
      { hwKey: 'b200_vllm', x: 20 },
      { hwKey: 'b200_vllm', x: 30, metric: { y: 0 } },
    ];

    const lines = buildAiLineData(points, 'y_measuredAvgPower', 'metric.y', new Set(['b200_vllm']));

    expect(lines.b200_vllm).toHaveLength(3);
    expect(lines.b200_vllm?.map((point) => point.x)).toEqual([10, 20, 30]);
    expect(lines.b200_vllm?.[0]?.y).toBe(5);
    expect(lines.b200_vllm?.[1]?.y).toBeNaN();
    expect(lines.b200_vllm?.[2]?.y).toBe(0);
  });

  it('excludes a line whose selected metric is missing at every point', () => {
    const lines = buildAiLineData(
      [
        { hwKey: 'b200_vllm', x: 10 },
        { hwKey: 'b200_vllm', x: 20 },
      ],
      'y_measuredAvgPower',
      'metric.y',
      new Set(['b200_vllm']),
    );

    expect(lines).toEqual({});
  });
});

describe('normalizeAiRadarRows', () => {
  it('places lower measured power farther out on the radar', () => {
    const normalized = normalizeAiRadarRows(
      new Map([
        ['low-power', [300]],
        ['high-power', [600]],
      ]),
      ['y_measuredAvgPower'],
      chartDefinition,
    );

    expect(normalized.get('low-power')?.[0]).toBe(1);
    expect(normalized.get('high-power')?.[0]).toBe(0);
  });

  it('preserves missing radar metrics without treating them as zero', () => {
    const normalized = normalizeAiRadarRows(
      new Map([
        ['missing', [null]],
        ['low', [5]],
        ['positive', [10]],
      ]),
      ['y_tpPerGpu'],
      chartDefinition,
    );

    expect(normalized.get('missing')?.[0]).toBeNull();
    expect(normalized.get('low')?.[0]).toBe(0);
    expect(normalized.get('positive')?.[0]).toBe(1);
  });

  it('rejects synthetic zero sentinels while preserving measured zero telemetry', () => {
    const unavailableCost = normalizeAiRadarRows(
      new Map([
        ['unavailable', [0]],
        ['valid-low', [1]],
        ['valid-high', [2]],
      ]),
      ['y_costh'],
      chartDefinition,
    );
    const measuredPower = normalizeAiRadarRows(
      new Map([
        ['zero', [0]],
        ['positive', [100]],
      ]),
      ['y_measuredAvgPower'],
      chartDefinition,
    );

    expect(unavailableCost.get('unavailable')?.[0]).toBeNull();
    expect(measuredPower.get('zero')?.[0]).toBe(1);
  });
});

describe('synthetic metric availability', () => {
  it('turns an unavailable cost into no bar value, a radar gap, and a line gap', () => {
    const unavailable = { hwKey: 'b200_vllm', x: 20, costh: { y: 0 } };
    const lines = buildAiLineData(
      [
        { hwKey: 'b200_vllm', x: 10, costh: { y: 2 } },
        unavailable,
        { hwKey: 'b200_vllm', x: 30, costh: { y: 1 } },
      ],
      'y_costh',
      'costh.y',
      new Set(['b200_vllm']),
    );
    const radar = normalizeAiRadarRows(
      new Map([
        ['unavailable', [0]],
        ['valid-low', [1]],
        ['valid-high', [2]],
      ]),
      ['y_costh'],
      chartDefinition,
    );

    expect(readAiMetric(unavailable, 'costh.y', 'y_costh')).toBeNull();
    expect(lines.b200_vllm?.[1]?.y).toBeNaN();
    expect(radar.get('unavailable')?.[0]).toBeNull();
  });
});

describe('rankAiHardwareKeys', () => {
  const baseOptions = {
    chartDefinition,
    topN: 1,
    distinctGpus: false,
  };

  it('selects minima for lower-is-better cost metrics', () => {
    const points = [
      { hwKey: 'b200_vllm', x: 10, costh: { y: 2 } },
      { hwKey: 'b200_vllm', x: 20, costh: { y: 1.8 } },
      { hwKey: 'mi355x_sglang', x: 10, costh: { y: 1.2 } },
    ];

    expect(
      rankAiHardwareKeys(points, {
        ...baseOptions,
        metric: 'y_costh',
        metricPath: 'costh.y',
      }),
    ).toEqual(['mi355x_sglang']);
  });

  it('selects maxima for higher-is-better throughput metrics', () => {
    const points = [
      { hwKey: 'b200_vllm', x: 10, tpPerGpu: { y: 80 } },
      { hwKey: 'b200_vllm', x: 20, tpPerGpu: { y: 100 } },
      { hwKey: 'mi355x_sglang', x: 10, tpPerGpu: { y: 90 } },
    ];

    expect(
      rankAiHardwareKeys(points, {
        ...baseOptions,
        metric: 'y_tpPerGpu',
        metricPath: 'tpPerGpu.y',
      }),
    ).toEqual(['b200_vllm']);
  });

  it('picks one best config per GPU before ranking distinct GPU families', () => {
    const points = [
      { hwKey: 'b200_vllm', x: 10, costh: { y: 2 } },
      { hwKey: 'b200_sglang', x: 10, costh: { y: 1 } },
      { hwKey: 'mi355x_vllm', x: 10, costh: { y: 1.5 } },
      { hwKey: 'h200_vllm', x: 10, costh: { y: 3 } },
    ];

    expect(
      rankAiHardwareKeys(points, {
        chartDefinition,
        metric: 'y_costh',
        metricPath: 'costh.y',
        topN: 2,
        distinctGpus: true,
      }),
    ).toEqual(['b200_sglang', 'mi355x_vllm']);
  });

  it('excludes missing and synthetic zero values from lower-is-better ranking', () => {
    const points = [
      { hwKey: 'missing', x: 10 },
      { hwKey: 'zero', x: 10, costh: { y: 0 } },
      { hwKey: 'positive', x: 10, costh: { y: 1 } },
    ];

    expect(
      rankAiHardwareKeys(points, {
        ...baseOptions,
        metric: 'y_costh',
        metricPath: 'costh.y',
      }),
    ).toEqual(['positive']);
  });

  it('preserves measured zero telemetry in lower-is-better ranking', () => {
    const points = [
      { hwKey: 'zero', x: 10, measuredAvgPower: { y: 0 } },
      { hwKey: 'positive', x: 10, measuredAvgPower: { y: 1 } },
    ];

    expect(
      rankAiHardwareKeys(points, {
        ...baseOptions,
        metric: 'y_measuredAvgPower',
        metricPath: 'measuredAvgPower.y',
      }),
    ).toEqual(['zero']);
  });
});
