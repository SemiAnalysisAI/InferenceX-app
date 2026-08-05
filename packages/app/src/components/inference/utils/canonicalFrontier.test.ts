import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import { canonicalFrontierPoints, canonicalNormalizedFrontierIds } from './canonicalFrontier';

const point = (id: number, y: number, over: Partial<InferenceData> = {}): InferenceData =>
  ({
    id,
    x: id,
    y,
    hwKey: 'b300',
    precision: 'fp4',
    date: '2026-08-01',
    tp: 1,
    conc: 1,
    tpPerGpu: { y, roof: false },
    tpPerMw: { y, roof: false },
    costh: { y, roof: false },
    costn: { y, roof: false },
    costr: { y, roof: false },
    ...over,
  }) as InferenceData;

describe('canonicalNormalizedFrontierIds', () => {
  it('computes the true normalized-interactivity frontier', () => {
    const points = [point(1, 100), point(2, 150), point(3, 120)];
    const metrics = {
      1: { id: 1, p75_e2e_norm_intvty: 10, p90_e2e_norm_intvty: 10 },
      2: { id: 2, p75_e2e_norm_intvty: 20, p90_e2e_norm_intvty: 20 },
      3: { id: 3, p75_e2e_norm_intvty: 30, p90_e2e_norm_intvty: 30 },
    };

    expect(
      [...canonicalNormalizedFrontierIds(points, metrics, 'p90', 'upper_left')!].toSorted(),
    ).toEqual([2, 3]);
  });

  it('keeps frontiers independent across dates', () => {
    const points = [point(1, 500, { date: '2026-08-01' }), point(2, 100, { date: '2026-08-02' })];
    const metrics = {
      1: { id: 1, p75_e2e_norm_intvty: 50, p90_e2e_norm_intvty: 50 },
      2: { id: 2, p75_e2e_norm_intvty: 10, p90_e2e_norm_intvty: 10 },
    };
    expect(
      [...canonicalNormalizedFrontierIds(points, metrics, 'p90', 'upper_left')!].toSorted(),
    ).toEqual([1, 2]);
  });

  it('returns null when the y metric has no Pareto direction', () => {
    expect(canonicalNormalizedFrontierIds([point(1, 1)], {}, 'p90', undefined)).toBeNull();
  });
});

describe('canonicalFrontierPoints', () => {
  it('returns the exact stamped set without a second axis-local Pareto pass', () => {
    const canonicalA = point(1, 100, { x: 1, isOnNormalizedInteractivityFrontier: true });
    const canonicalB = point(2, 90, { x: 2, isOnNormalizedInteractivityFrontier: true });
    const localOnly = point(3, 500, { x: 3, isOnNormalizedInteractivityFrontier: false });

    expect(canonicalFrontierPoints([canonicalA, canonicalB, localOnly])).toEqual([
      canonicalA,
      canonicalB,
    ]);
  });

  it('returns null when no canonical stamp is present', () => {
    expect(canonicalFrontierPoints([point(1, 100)])).toBeNull();
  });
});
