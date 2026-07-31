import { describe, expect, it } from 'vitest';

import type { ClippedInferenceData, InferenceData } from '../types';
import { buildFrontierContinuations, fitContinuationLabelBaseline } from './overflowContinuations';

const point = (x: number, y: number): InferenceData =>
  ({
    x,
    y,
    hwKey: 'b200_dynamo-vllm',
    precision: 'fp4',
    date: '2026-07-30',
    tp: 8,
    conc: x,
    tpPerGpu: { y, roof: false },
    tpPerMw: { y, roof: false },
    costh: { y, roof: false },
    costn: { y, roof: false },
    costr: { y, roof: false },
    costhi: { y, roof: false },
    costni: { y, roof: false },
    costri: { y, roof: false },
  }) as InferenceData;

describe('fitContinuationLabelBaseline', () => {
  it('keeps labels inside the plot while preferring below-arrow placement', () => {
    expect(fitContinuationLabelBaseline(413.4, 500)).toBe(431.4);
    expect(fitContinuationLabelBaseline(500.13, 500)).toBe(488.13);
  });
});

describe('buildFrontierContinuations', () => {
  it('returns both crossings when one visible point sits between two clipped frontier regions', () => {
    const costClipped = point(5, 8);
    const visible = point(40, 1);
    const latencyClipped = point(90, 0.5);
    const clipped: ClippedInferenceData[] = [
      { point: costClipped, reasons: ['cost'] },
      { point: latencyClipped, reasons: ['latency'] },
    ];

    const result = buildFrontierContinuations([visible], clipped, 'lower_left');

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.toward)).toEqual([costClipped, latencyClipped]);
    expect(result.map((entry) => entry.reasons)).toEqual([['cost'], ['latency']]);
    expect(result.map((entry) => entry.hiddenPointCount)).toEqual([1, 1]);
    expect(result.map((entry) => entry.points)).toEqual([
      [visible, costClipped],
      [visible, latencyClipped],
    ]);
  });

  it('counts clipped points only on the continuation side', () => {
    const costClipped = point(10, 8);
    const visible = point(40, 4);
    const latencyClipped = point(90, 2);
    const mixedClipped = point(100, 1);
    const clipped: ClippedInferenceData[] = [
      { point: costClipped, reasons: ['cost'] },
      { point: latencyClipped, reasons: ['latency'] },
      { point: mixedClipped, reasons: ['cost', 'latency'] },
    ];

    const result = buildFrontierContinuations([visible], clipped, 'lower_left');

    expect(result.map((entry) => entry.hiddenPointCount)).toEqual([1, 2]);
  });

  it('interpolates through consecutive clipped frontier points', () => {
    const controlPoint = point(5, 6);
    const visible = point(10, 5);
    const clippedA = point(20, 4);
    const clippedB = point(30, 3);
    const dominatedClipped = point(25, 6);

    const result = buildFrontierContinuations(
      [controlPoint, visible],
      [
        { point: clippedA, reasons: ['latency'] },
        { point: clippedB, reasons: ['latency'] },
        { point: dominatedClipped, reasons: ['latency'] },
      ],
      'lower_left',
    );

    expect(result).toEqual([
      expect.objectContaining({
        from: visible,
        toward: clippedA,
        points: [controlPoint, visible, clippedA, clippedB],
        reasons: ['latency'],
        hiddenPointCount: 3,
      }),
    ]);
  });

  it('does not imply a continuation to a clipped point that is not on the full frontier', () => {
    const visibleA = point(10, 5);
    const visibleB = point(20, 4);
    const dominatedClipped = point(30, 6);

    const result = buildFrontierContinuations(
      [visibleA, visibleB],
      [{ point: dominatedClipped, reasons: ['latency'] }],
      'lower_left',
    );

    expect(result).toEqual([]);
  });
});
