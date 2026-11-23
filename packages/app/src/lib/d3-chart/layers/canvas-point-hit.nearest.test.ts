import { describe, expect, it } from 'bun:test';

import { HIT_AREA_RADIUS } from '@/lib/charts/chart-rendering';
import { PointHitGrid } from './canvas-point-hit';

function gridFor(points: readonly (readonly [number, number])[], width = 400, height = 300) {
  const xs = Float64Array.from(points, ([x]) => x);
  const ys = Float64Array.from(points, ([, y]) => y);
  const grid = new PointHitGrid(HIT_AREA_RADIUS);
  grid.build(
    xs,
    ys,
    Uint8Array.from(points, () => 1),
    points.length,
    width,
    height,
  );
  return grid;
}

describe('PointHitGrid in a dense cluster', () => {
  // A phone-width Pareto curve: neighbours sit 6–10px apart, inside one another's hit radius.
  const CLUSTER = [
    [112.7, 100.6],
    [118.4, 96.1],
    [121.9, 88],
    [126, 81.3],
    [109, 106.2],
  ] as const;

  it('selects the point the pointer is on, not a later neighbour within the radius', () => {
    const grid = gridFor(CLUSTER);
    CLUSTER.forEach(([x, y], index) => {
      expect(grid.hit(x, y), `dot ${index}`).toBe(index);
    });
  });

  it('selects the nearest point between two neighbours', () => {
    const grid = gridFor(CLUSTER);
    // 2px from dot 0 and about 5px from dot 1.
    expect(grid.hit(114.3, 99.4)).toBe(0);
    // 1px from dot 1, 7px from dot 0.
    expect(grid.hit(117.6, 96.7)).toBe(1);
  });

  it('breaks an exact tie in favour of the later (topmost) point', () => {
    const grid = gridFor([
      [100, 100],
      [110, 100],
    ]);
    expect(grid.hit(105, 100)).toBe(1);
  });

  it('still ignores points beyond the hit radius and non-interactive points', () => {
    const xs = Float64Array.of(50, 54);
    const ys = Float64Array.of(50, 50);
    const grid = new PointHitGrid(HIT_AREA_RADIUS);
    grid.build(xs, ys, Uint8Array.of(1, 0), 2, 200, 200);
    expect(grid.hit(54, 50)).toBe(0);
    expect(grid.hit(50, 50 + HIT_AREA_RADIUS + 0.5)).toBe(-1);
  });
});
