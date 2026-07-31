import { describe, expect, it } from 'vitest';

import type { ClippedInferenceData, InferenceData } from '../types';
import { buildFrontierContinuations, projectContinuationToBounds } from './overflowContinuations';

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

const identity = (value: number) => value;

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
  });

  it('counts consecutive clipped frontier points behind one continuation', () => {
    const visible = point(10, 5);
    const clippedA = point(20, 4);
    const clippedB = point(30, 3);
    const dominatedClipped = point(25, 6);

    const result = buildFrontierContinuations(
      [visible],
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

describe('projectContinuationToBounds', () => {
  it('ends a rightward ray just inside the plot boundary', () => {
    const result = projectContinuationToBounds(
      { from: point(40, 50), toward: point(140, 60) },
      identity,
      identity,
      100,
      100,
      5,
    );

    expect(result).not.toBeNull();
    expect(result!.x2).toBeCloseTo(95.02, 1);
    expect(result!.y2).toBeCloseTo(55.5, 1);
    expect(result!.angle).toBeCloseTo(5.71, 1);
  });

  it('caps a distant continuation instead of crossing the whole plot', () => {
    const result = projectContinuationToBounds(
      { from: point(10, 50), toward: point(1000, 50) },
      identity,
      identity,
      800,
      100,
    );

    expect(result).not.toBeNull();
    expect(result!.x2 - result!.x1).toBe(96);
    expect(result!.y2).toBe(result!.y1);
  });

  it('returns null when the visible anchor has been panned outside the viewport', () => {
    const result = projectContinuationToBounds(
      { from: point(-1, 50), toward: point(20, 50) },
      identity,
      identity,
      100,
      100,
    );

    expect(result).toBeNull();
  });
});
