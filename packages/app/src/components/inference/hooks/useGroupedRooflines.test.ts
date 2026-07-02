import { describe, it, expect } from 'vitest';

import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import {
  attachOverlayMeta,
  computeGroupedRooflines,
  groupPoints,
  paretoFrontForDirection,
  rooflineDirectionFor,
} from './useGroupedRooflines';

// ─── Factory ───

function makePoint(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2025-06-15',
    x: 100,
    y: 500,
    tp: 8,
    conc: 64,
    hwKey: 'h100',
    precision: 'fp8',
    tpPerGpu: { y: 1000, roof: false },
    ...overrides,
  } as InferenceData;
}

// ─── groupPoints ───

describe('groupPoints', () => {
  it('groups points by the key function', () => {
    const pts = [
      makePoint({ hwKey: 'h100', precision: 'fp8', x: 1 }),
      makePoint({ hwKey: 'h100', precision: 'fp8', x: 2 }),
      makePoint({ hwKey: 'b200', precision: 'fp4', x: 3 }),
    ];
    const grouped = groupPoints(pts, (p) => `${p.hwKey}_${p.precision}`);
    expect(Object.keys(grouped).toSorted()).toEqual(['b200_fp4', 'h100_fp8']);
    expect(grouped['h100_fp8']).toHaveLength(2);
    expect(grouped['b200_fp4']).toHaveLength(1);
  });

  it('drops points whose key function returns null (folded-in filter)', () => {
    const pts = [makePoint({ precision: 'fp8', x: 1 }), makePoint({ precision: 'fp4', x: 2 })];
    // Mimic the GPU path folding a precision filter into the key.
    const grouped = groupPoints(pts, (p) => (p.precision === 'fp8' ? `k_${p.precision}` : null));
    expect(Object.keys(grouped)).toEqual(['k_fp8']);
  });

  it('returns an empty object for empty input', () => {
    expect(groupPoints([], (p) => String(p.hwKey))).toEqual({});
  });
});

// ─── rooflineDirectionFor ───

describe('rooflineDirectionFor', () => {
  it('reads the direction for the selected metric', () => {
    const def = { y_tpPerGpu_roofline: 'upper_left' } as unknown as ChartDefinition;
    expect(rooflineDirectionFor(def, 'y_tpPerGpu')).toBe('upper_left');
  });

  it('falls back to lower_right when the definition key is absent', () => {
    const def = {} as ChartDefinition;
    expect(rooflineDirectionFor(def, 'y_tpPerGpu')).toBe('lower_right');
  });
});

// ─── paretoFrontForDirection (direction-flip dispatch) ───

describe('paretoFrontForDirection', () => {
  // Points spanning a monotone-decreasing and monotone-increasing shape so the
  // four directions genuinely select different subsets.
  const pts = () => [
    makePoint({ x: 1, y: 10 }),
    makePoint({ x: 2, y: 20 }),
    makePoint({ x: 3, y: 5 }),
    makePoint({ x: 4, y: 30 }),
  ];

  it('upper_right keeps the increasing upper hull', () => {
    const front = paretoFrontForDirection(pts(), 'upper_right');
    expect(front.map((p) => [p.x, p.y])).toEqual([
      [1, 10],
      [2, 20],
      [4, 30],
    ]);
  });

  it('lower_left keeps new global minima scanning x ascending', () => {
    const front = paretoFrontForDirection(pts(), 'lower_left');
    // sorted x asc: (1,10),(2,20),(3,5),(4,30) → minima at 10, then 5
    expect(front.map((p) => [p.x, p.y])).toEqual([
      [1, 10],
      [3, 5],
    ]);
  });

  it('different directions produce different fronts (flip logic exercised)', () => {
    const ur = paretoFrontForDirection(pts(), 'upper_right');
    const ll = paretoFrontForDirection(pts(), 'lower_left');
    expect(ur).not.toEqual(ll);
  });
});

// ─── computeGroupedRooflines ───

describe('computeGroupedRooflines', () => {
  it('computes a front per group', () => {
    const grouped = {
      a: [makePoint({ x: 1, y: 10 }), makePoint({ x: 2, y: 20 })],
      b: [makePoint({ x: 5, y: 3 }), makePoint({ x: 6, y: 8 })],
    };
    const result = computeGroupedRooflines(grouped, 'upper_right', true);
    expect(Object.keys(result).toSorted()).toEqual(['a', 'b']);
  });

  it('sorts each front by x ascending when sortByX is true (scatter path)', () => {
    // lower_right sorts x desc internally + keeps new minima; increasing y with
    // x → all three survive in desc order, and the post-sort flips to ascending.
    const grouped = {
      g: [makePoint({ x: 1, y: 10 }), makePoint({ x: 2, y: 20 }), makePoint({ x: 3, y: 30 })],
    };
    const sorted = computeGroupedRooflines(grouped, 'lower_right', true);
    expect(sorted['g'].map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('does NOT reorder when sortByX is false (GPU path)', () => {
    // lower_right sorts x descending internally, then keeps new global minima.
    // Points where y increases with x → scanning x-desc every point is a new
    // minimum, so all survive in descending x order (proving no post-sort).
    const grouped = {
      g: [makePoint({ x: 1, y: 10 }), makePoint({ x: 2, y: 20 }), makePoint({ x: 3, y: 30 })],
    };
    const unsorted = computeGroupedRooflines(grouped, 'lower_right', false);
    const xs = unsorted['g'].map((p) => p.x);
    expect(xs).toEqual([3, 2, 1]);
    // And with sortByX the same input comes back ascending.
    const sorted = computeGroupedRooflines(
      { g: [makePoint({ x: 1, y: 10 }), makePoint({ x: 2, y: 20 }), makePoint({ x: 3, y: 30 })] },
      'lower_right',
      true,
    );
    expect(sorted['g'].map((p) => p.x)).toEqual([1, 2, 3]);
  });
});

// ─── attachOverlayMeta ───

describe('attachOverlayMeta', () => {
  it('attaches hwKey + runIndex from the first point of each group', () => {
    const grouped = {
      b200_fp4_run1: [
        makePoint({ hwKey: 'b200', precision: 'fp4', run_url: 'https://x/runs/1', x: 1 }),
        makePoint({ hwKey: 'b200', precision: 'fp4', run_url: 'https://x/runs/1', x: 2 }),
      ],
    };
    const rooflines = { b200_fp4_run1: grouped['b200_fp4_run1'] };
    const result = attachOverlayMeta(grouped, rooflines, (p) =>
      p.run_url?.includes('/runs/1') ? 1 : 0,
    );
    expect(result['b200_fp4_run1'].hwKey).toBe('b200');
    expect(result['b200_fp4_run1'].runIndex).toBe(1);
    expect(result['b200_fp4_run1'].points).toHaveLength(2);
  });

  it('skips a roofline group with no backing points', () => {
    const result = attachOverlayMeta({}, { orphan: [] }, () => 0);
    expect(result).toEqual({});
  });

  it('returns empty for empty input (stable empty overlay)', () => {
    expect(attachOverlayMeta({}, {}, () => 0)).toEqual({});
  });
});
