import { describe, expect, it } from 'vitest';

import { PointHitGrid, hitAreaPath } from './canvas-point-hit';

const RADIUS = 12;

function bruteHit(
  xs: Float64Array,
  ys: Float64Array,
  interactive: Uint8Array,
  count: number,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (!(x >= 0 && x <= width && y >= 0 && y <= height)) return -1;
  let best = -1;
  for (let index = 0; index < count; index++) {
    const dx = xs[index] - x;
    const dy = ys[index] - y;
    if (interactive[index] && dx * dx + dy * dy <= RADIUS * RADIUS) best = index;
  }
  return best;
}

function edgePoints(width: number, height: number) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const y of [0, RADIUS / 2, height / 2, height - 1, height]) {
    for (const x of [-RADIUS, -RADIUS - 0.5, width + RADIUS, width + RADIUS + 0.5]) {
      xs.push(x);
      ys.push(y);
    }
  }
  for (const x of [0, RADIUS / 2, width / 2, width - 1, width]) {
    for (const y of [-RADIUS, -RADIUS - 0.5, height + RADIUS, height + RADIUS + 0.5]) {
      xs.push(x);
      ys.push(y);
    }
  }
  for (const [x, y] of [
    [Number.NaN, 10],
    [10, Number.NaN],
    [Number.POSITIVE_INFINITY, 10],
    [Number.NEGATIVE_INFINITY, 10],
    [10, Number.POSITIVE_INFINITY],
    [10, Number.NEGATIVE_INFINITY],
  ]) {
    xs.push(x);
    ys.push(y);
  }
  return { xs: Float64Array.from(xs), ys: Float64Array.from(ys) };
}

describe('PointHitGrid at the plot edges', () => {
  for (const [width, height] of [
    [120, 96],
    [125, 90],
    [0, 0],
    [12, 30],
  ]) {
    const around = (size: number) => [
      -0.25,
      0,
      0.25,
      RADIUS / 2,
      RADIUS,
      size / 2,
      size - 0.25,
      size,
      size + 0.25,
    ];

    it(`finds points one radius outside a ${width}x${height} plot from its edges`, () => {
      const { xs, ys } = edgePoints(width, height);
      const count = xs.length;
      for (const visibleFirst of [true, false]) {
        const interactive = Uint8Array.from(xs, (_, index) =>
          (index % 2 === 0) === visibleFirst ? 1 : 0,
        );
        const grid = new PointHitGrid(RADIUS);
        grid.build(xs, ys, interactive, count, width, height);
        for (const y of around(height)) {
          for (const x of around(width)) {
            expect(grid.hit(x, y), `${x},${y}`).toBe(
              bruteHit(xs, ys, interactive, count, width, height, x, y),
            );
          }
        }
      }
    });
  }

  it('reaches neighbours two cells away from the query on both axes', () => {
    const xs = Float64Array.of(6, 30, 6, 30);
    const ys = Float64Array.of(6, 6, 30, 30);
    const grid = new PointHitGrid(RADIUS);
    grid.build(xs, ys, Uint8Array.of(1, 1, 1, 1), 4, 48, 48);
    expect(grid.hit(0, 0)).toBe(0);
    expect(grid.hit(0, 6)).toBe(0);
    expect(grid.hit(36, 0)).toBe(1);
    expect(grid.hit(18, 6)).toBe(1);
    expect(grid.hit(0, 36)).toBe(2);
    expect(grid.hit(6, 18)).toBe(2);
    expect(grid.hit(18, 18)).toBe(-1);
    expect(grid.hit(24, 30)).toBe(3);
  });

  it('forgets points from a previous build', () => {
    const grid = new PointHitGrid(RADIUS);
    grid.build(Float64Array.of(10, 50), Float64Array.of(10, 50), Uint8Array.of(1, 1), 2, 100, 100);
    grid.build(Float64Array.of(80), Float64Array.of(80), Uint8Array.of(1), 1, 100, 100);
    expect(grid.hit(10, 10)).toBe(-1);
    expect(grid.hit(50, 50)).toBe(-1);
    expect(grid.hit(80, 80)).toBe(0);
  });
});

describe('hitAreaPath at the plot edges', () => {
  it('keeps circles exactly one radius outside the plot and drops the rest', () => {
    const xs = Float64Array.of(-12, -12.5, 112, 112.5, 50, 50, 50, 50, 1.26, 9);
    const ys = Float64Array.of(50, 50, 50, 50, -12, -12.5, 92, 92.5, 3.14, 9);
    const path = hitAreaPath(
      xs,
      ys,
      Uint8Array.from(xs, () => 1),
      9,
      100,
      80,
      RADIUS,
    );
    const arc = 'a12,12 0 1,0 24,0a12,12 0 1,0 -24,0';
    expect(path).toBe(
      [`M-24,50`, `M100,50`, `M38,-12`, `M38,92`, `M-10.7,3.1`].map((m) => m + arc).join(''),
    );
  });
});
