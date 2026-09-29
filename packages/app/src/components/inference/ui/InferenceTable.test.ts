import { describe, it, expect } from 'vitest';

import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { formatInferenceTableNumber } from '@/components/inference/ui/InferenceTable';

import * as inferenceTableModule from './InferenceTable';
import { chartDefinitions } from '../metric-registry';
import { sortRowsByYMetric } from './inference-table-sort';

const CHART_DEF = {
  chartType: 'interactivity',
  heading: 'vs. Interactivity',
  x: 'median_intvty',
  x_label: 'Interactivity (tok/s/user)',
  x_labelZh: '交互性 (tok/s/user)',
  y: 'tput_per_gpu',
  y_tpPerGpu: 'tpPerGpu.y',
  y_tpPerGpu_label: 'Token Throughput per GPU (tok/s/gpu)',
  y_tpPerGpu_labelZh: '单 GPU token 吞吐量 (tok/s/gpu)',
  y_tpPerGpu_title: 'Token Throughput per GPU',
  y_tpPerGpu_roofline: 'upper_left',
} as unknown as ChartDefinition;

function makePoint(overrides: Partial<InferenceData>): InferenceData {
  return {
    x: 10,
    y: 100,
    hwKey: 'b200_sglang',
    date: '2026-04-07',
    tp: 8,
    conc: 16,
    precision: 'fp8',
    tpPerGpu: { y: 500, roof: false },
    tpPerMw: { y: 200, roof: false },
    costh: { y: 0.5, roof: false },
    costr: { y: 0.3, roof: false },
    costhi: { y: 0.2, roof: false },
    costri: { y: 0.1, roof: false },
    tokensPerDollarH: { y: 2_000_000, roof: false },
    ...overrides,
  } as InferenceData;
}

describe('InferenceTable sorting logic', () => {
  it('sorts supported modeled estimates by ascending power', () => {
    const definition = chartDefinitions[0];
    const metric = 'y_modeledChassisPowerPerGpu';
    const points = [
      makePoint({ modeledChassisPowerPerGpu: { y: 1200, roof: false } }),
      makePoint({ modeledChassisPowerPerGpu: { y: 750, roof: false } }),
    ];
    const sorted = sortRowsByYMetric(points, definition, metric);
    expect(sorted.map((point) => point.modeledChassisPowerPerGpu?.y)).toEqual([750, 1200]);
  });

  it('provides locale-aware table headers without changing the English source', () => {
    const headerLabels = (
      inferenceTableModule as typeof inferenceTableModule & {
        inferenceTableHeaderLabels?: (
          chartDefinition: ChartDefinition,
          selectedYAxisMetric: string,
          locale: 'en' | 'zh',
        ) => Record<string, string>;
      }
    ).inferenceTableHeaderLabels;

    expect(headerLabels).toBeTypeOf('function');
    const en = headerLabels?.(CHART_DEF, 'y_tpPerGpu', 'en');
    const zh = headerLabels?.(CHART_DEF, 'y_tpPerGpu', 'zh');
    expect(en).toMatchObject({
      chip: 'Chip',
      precision: 'Precision',
      concurrency: 'Conc',
      throughput: 'Throughput/Chip (tok/s)',
    });
    expect(Object.keys(zh ?? {})).toEqual(Object.keys(en ?? {}));
    expect(zh).toMatchObject({ chip: '芯片', precision: '精度', concurrency: '并发数' });
    expect(zh?.yMetric).not.toBe(en?.yMetric);
    expect(zh?.xMetric).not.toBe(en?.xMetric);
  });

  it('sorts by Y value descending for upper_left roofline (throughput)', () => {
    const points = [
      makePoint({ tpPerGpu: { y: 100, roof: false } }),
      makePoint({ tpPerGpu: { y: 500, roof: true } }),
      makePoint({ tpPerGpu: { y: 300, roof: false } }),
    ];

    const definition = chartDefinitions.find((chart) => chart.chartType === 'interactivity')!;
    const sorted = sortRowsByYMetric(points, definition, 'y_tpPerGpu');

    expect(sorted.map((point) => point.tpPerGpu.y)).toEqual([500, 300, 100]);
  });

  it('sorts tokens-per-dollar purchasing power descending', () => {
    const points = [
      makePoint({ tokensPerDollarH: { y: 800_000, roof: false } }),
      makePoint({ tokensPerDollarH: { y: 200_000, roof: false } }),
      makePoint({ tokensPerDollarH: { y: 1_500_000, roof: true } }),
    ];

    const definition = chartDefinitions.find((chart) => chart.chartType === 'interactivity')!;
    const sorted = sortRowsByYMetric(points, definition, 'y_tokensPerDollarH');

    expect(sorted.map((point) => point.tokensPerDollarH?.y)).toEqual([1_500_000, 800_000, 200_000]);
  });
});

describe('formatInferenceTableNumber', () => {
  it('groups large chart values with commas', () => {
    expect(formatInferenceTableNumber(87_000)).toBe('87,000');
    expect(formatInferenceTableNumber(125_500)).toBe('125,500');
  });

  it('preserves the requested fixed precision while grouping thousands', () => {
    expect(formatInferenceTableNumber(125_500, 1)).toBe('125,500.0');
  });

  it('keeps the existing magnitude-based precision for smaller values', () => {
    expect(formatInferenceTableNumber(12.34)).toBe('12.3');
    expect(formatInferenceTableNumber(0.1234)).toBe('0.123');
    expect(formatInferenceTableNumber(0.00123)).toBe('0.0012');
  });
});
