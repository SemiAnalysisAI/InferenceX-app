import { describe, expect, it } from 'vitest';

import type { InferenceSeriesEntry } from '@/lib/views-api/series';

import {
  decodeMmView,
  encodeMmView,
  frontierLine,
  mmDashboardUrl,
  mmViewUrl,
  pairSeries,
} from './measured-vs-modeled';
import { pickPoint, type TutorialViewResponse } from './views-api';

function series(
  hwKey: string,
  label: string,
  points: [number, number, number][],
): InferenceSeriesEntry {
  return {
    hwKey,
    gpu: hwKey.split('_')[0],
    framework: hwKey.split('_')[1] ?? '',
    specMethod: 'none',
    label,
    deployment: 'single-node',
    kvOffload: false,
    bestPerSku: true,
    points: points.map(([id, x, y]) => ({
      id,
      precision: 'fp4',
      x,
      y,
      concurrency: id * 8,
      topologyKey: 'Single',
      tp: 8,
      date: '2026-10-21',
      frontier: true,
      bestPerSku: true,
      metrics: {},
    })),
  };
}

const response = (entries: InferenceSeriesEntry[]): TutorialViewResponse => ({
  series: entries,
  xAxis: { label: 'x' },
  metric: { label: 'm', labelZh: 'm', unit: 'J/tok' },
  count: entries.reduce((sum, entry) => sum + entry.points.length, 0),
});

describe('pairSeries', () => {
  it('joins the modeled value onto each measured point by id and sorts by interactivity', () => {
    const measured = response([
      series('b200_vllm', 'B200 (vLLM)', [
        [2, 60, 1.8],
        [1, 30, 1.4],
      ]),
      series('mi355x_sglang', 'MI355X (SGLang)', [[9, 20, 1.5]]),
    ]);
    const modeled = response([
      series('b200_vllm', 'B200 (vLLM)', [
        [1, 30, 2.7],
        [2, 60, 3.4],
      ]),
    ]);
    const paired = pairSeries(measured, modeled);
    expect(paired.map((entry) => entry.hwKey)).toEqual(['b200_vllm', 'mi355x_sglang']);
    expect(paired[0].points.map((point) => [point.x, point.measured, point.modeled])).toEqual([
      [30, 1.4, 2.7],
      [60, 1.8, 3.4],
    ]);
    expect(paired[1].points[0].modeled).toBeNull();
  });

  it('drops non-positive and non-finite points', () => {
    const measured = response([
      series('b200_vllm', 'B200', [
        [1, 30, 0],
        [2, Number.NaN, 1],
        [3, 50, 2],
      ]),
    ]);
    expect(pairSeries(measured, response([]))[0].points.map((point) => point.id)).toEqual([3]);
  });
});

describe('frontierLine', () => {
  it('keeps only the lower-right frontier (higher interactivity, lower joules), per value kind', () => {
    const measured = response([
      series('b200_vllm', 'B200', [
        [1, 30, 1.4],
        [2, 50, 1.7],
        [3, 40, 1.9], // dominated by point 2: slower and more joules
        [4, 80, 1.6], // dominates point 2 on both axes
      ]),
    ]);
    const modeled = response([
      series('b200_vllm', 'B200', [
        [1, 30, 2.8],
        [2, 50, 3.2],
        [3, 40, 3.5], // dominated by point 2 on the modeled axis too
        [4, 80, 3.9],
      ]),
    ]);
    const [paired] = pairSeries(measured, modeled);
    expect(frontierLine(paired, 'measured').map((point) => point.id)).toEqual([1, 4]);
    expect(frontierLine(paired, 'modeled').map((point) => point.id)).toEqual([1, 2, 4]);
    expect(paired.points).toHaveLength(4);
  });
});

describe('pickPoint', () => {
  it('picks the chip point nearest the target interactivity', () => {
    const entries = [
      series('b200_vllm', 'B200 (vLLM)', [
        [1, 28, 1],
        [2, 56, 2],
        [3, 112, 3],
      ]),
      series('mi355x_sglang', 'MI355X', [[4, 49, 4]]),
    ];
    expect(pickPoint(entries, 'b200', 50)).toMatchObject({ hwKey: 'b200_vllm', x: 56, y: 2 });
    expect(pickPoint(entries, 'mi355x', 50)).toMatchObject({ x: 49, concurrency: 32 });
    expect(pickPoint(entries, 'gb200', 50)).toBeNull();
  });
});

describe('measured-vs-modeled urls and codec', () => {
  it('asks the views API for the same preset on both metrics', () => {
    expect(mmViewUrl('measured')).toBe(
      '/api/v1/views/inference?model=DeepSeek-V4-Pro&sequence=agentic-traces&gpus=b200%2Cmi355x&precisions=fp4&metric=y_measuredJPerOutputToken',
    );
    expect(mmViewUrl('modeled')).toContain('metric=y_utilityModeledJPerOutputToken');
    expect(mmDashboardUrl('modeled')).toBe('/inference?i_metric=y_utilityModeledJPerOutputToken');
    expect(encodeMmView('modeled')).toBe('modeled');
    expect(decodeMmView(null)).toBe('measured');
    expect(decodeMmView('nope')).toBe('measured');
    expect(decodeMmView('modeled')).toBe('modeled');
  });
});
