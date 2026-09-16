import { describe, expect, it } from 'vitest';
import type { InferenceData } from '@/components/inference/types';
import type { PerfRulerPathLike } from '@/lib/d3-chart/layers/perf-ruler';
import { evaluateRenderedIso } from './rendered-iso';

const point = (x: number, y: number): InferenceData => ({
  hwKey: 'h200',
  date: '2026-09-15',
  precision: 'fp8',
  tp: 8,
  conc: x,
  x,
  y,
  tpPerGpu: { y: 50, roof: false },
  tpPerMw: { y: 1, roof: false },
  costh: { y: 1, roof: false },
  costr: { y: 1, roof: false },
  costhi: { y: 1, roof: false },
  costri: { y: 1, roof: false },
});
const points = [point(50, 400), point(100, 600)];
const series = { key: 'roofline-h200_fp8', points };
// A curved path whose midpoint is 450, deliberately different from linear 500.
const curve: PerfRulerPathLike = {
  getTotalLength: () => 100,
  getPointAtLength: (length) => ({ x: 50 + length / 2, y: 400 + 200 * (length / 100) ** 2 }),
};
const identity = (value: number) => value;

describe('rendered ISO comparisons', () => {
  it('reads the plotted curve rather than inventing a linear interpolation', () => {
    const result = evaluateRenderedIso(series, 75, curve, identity, identity);
    expect(result.status).toBe('curve');
    expect(result.value).toBeCloseTo(450, 3);
    expect(result.sources).toEqual(points);
  });

  it('uses current plot scales and retains unofficial provenance', () => {
    const scaled: PerfRulerPathLike = {
      getTotalLength: () => 100,
      getPointAtLength: (length) => ({
        x: 100 + length,
        y: Math.log(400 + 200 * (length / 100) ** 2),
      }),
    };
    const result = evaluateRenderedIso(
      { ...series, overlayIndex: 1 },
      75,
      scaled,
      (x) => x * 2,
      Math.exp,
    );
    expect(result.value).toBeCloseTo(450, 3);
    expect(result.overlayIndex).toBe(1);
  });

  it('does not extrapolate even within the pixel helper endpoint slack', () => {
    expect(evaluateRenderedIso(series, 100.01, curve, identity, identity)).toMatchObject({
      status: 'outside-range',
      value: null,
    });
    expect(evaluateRenderedIso(series, 0, curve, identity, identity).value).toBeNull();
  });

  it('keeps a singleton exact point and its legacy validation metadata', () => {
    const legacy = { ...points[0], power_valid: undefined, power_metric_schema_version: undefined };
    expect(
      evaluateRenderedIso({ key: 'legacy', points: [legacy] }, 50, null, identity, identity),
    ).toMatchObject({ status: 'exact', value: 400, sources: [legacy] });
    expect(
      evaluateRenderedIso({ key: 'legacy', points: [legacy] }, 75, null, identity, identity).status,
    ).toBe('outside-range');
  });

  it('does not fill in a missing path or an ambiguous exact X', () => {
    expect(evaluateRenderedIso(series, 75, null, identity, identity)).toMatchObject({
      status: 'missing',
      value: null,
    });
    expect(
      evaluateRenderedIso(
        { ...series, points: [...points, point(50, 450)] },
        50,
        curve,
        identity,
        identity,
      ),
    ).toMatchObject({ status: 'ambiguous', value: null });
  });
});
