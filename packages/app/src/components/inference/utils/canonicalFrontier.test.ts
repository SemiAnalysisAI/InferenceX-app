import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import { canonicalNormalizedFrontierIds, canonicalParetoIntersection } from './canonicalFrontier';

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

describe('canonicalParetoIntersection', () => {
  it.each([
    [
      'E2E latency',
      [
        [5, 10.78256, 9091],
        [10, 11.35504, 17113],
        [15, 10.55072, 22505],
        [20, 14.05108, 34255],
        [30, 17.62118, 46840],
        [40, 25.18999, 54350],
        [50, 40.75138, 54443],
      ],
    ],
    [
      'TTFT',
      [
        [5, 1.13862, 9091],
        [10, 0.97378, 17113],
        [15, 0.77209, 22505],
        [20, 1.11642, 34255],
        [30, 1.27482, 46840],
        [40, 1.50933, 54350],
        [50, 2.80568, 54443],
      ],
    ],
  ])('removes the screenshot zig-zag from the %s frontier', (_axis, rows) => {
    const points = rows.map(([conc, x, y]) =>
      point(conc, y, {
        x,
        conc,
        isOnNormalizedInteractivityFrontier: true,
      }),
    );

    expect(
      canonicalParetoIntersection(points, 'upper_right')?.map((candidate) => candidate.conc),
    ).toEqual([15, 20, 30, 40, 50]);
  });

  it('computes the selected-axis frontier before intersecting the canonical set', () => {
    const nonCanonicalDominator = point(1, 110, {
      x: 1,
      isOnNormalizedInteractivityFrontier: false,
    });
    const dominatedCanonicalWinner = point(2, 100, {
      x: 2,
      isOnNormalizedInteractivityFrontier: true,
    });
    const canonicalTradeoff = point(3, 120, {
      x: 3,
      isOnNormalizedInteractivityFrontier: true,
    });

    expect(
      canonicalParetoIntersection(
        [dominatedCanonicalWinner, canonicalTradeoff, nonCanonicalDominator],
        'upper_right',
      ),
    ).toEqual([canonicalTradeoff]);
  });

  it('returns null when no canonical stamp is present', () => {
    expect(canonicalParetoIntersection([point(1, 100)], 'upper_right')).toBeNull();
  });
});
