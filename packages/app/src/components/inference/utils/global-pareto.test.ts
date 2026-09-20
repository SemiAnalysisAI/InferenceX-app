import { describe, expect, it } from 'vitest';
import { scaleLinear, scaleLog } from 'd3';
import {
  globalParetoFrontier,
  paretoHighlightArea,
  paretoHighlightGeometry,
} from './global-pareto';

describe('paretoHighlightArea', () => {
  it.each([
    [100, 0, 'M20,0L20,80L80,20L100,20L100,0Z'],
    [0, 100, 'M0,80L20,80L80,20L80,100L0,100Z'],
    [0, 0, 'M0,80L20,80L80,20L80,0L0,0Z'],
    [100, 100, 'M20,100L20,80L80,20L100,20L100,100Z'],
  ] as const)('closes only toward corner (%s, %s)', (x, y, expected) => {
    expect(
      paretoHighlightArea(
        [
          { x: 20, y: 80 },
          { x: 80, y: 20 },
        ],
        x,
        y,
      ),
    ).toBe(expected);
  });
  it('handles empty and singleton boundaries', () => {
    expect(paretoHighlightArea([], 100, 0)).toBeNull();
    expect(paretoHighlightArea([{ x: 20, y: 20 }], 100, 0)).toBe('M20,0L20,20L100,20L100,0Z');
  });
});

describe('globalParetoFrontier', () => {
  const points = [
    { x: 1, y: 1 },
    { x: 1, y: 3 },
    { x: 2, y: 2 },
    { x: 3, y: 1 },
    { x: 3, y: 3 },
  ];
  it.each([
    [true, true, [{ x: 3, y: 3 }]],
    [false, false, [{ x: 1, y: 1 }]],
    [false, true, [{ x: 1, y: 3 }]],
    [true, false, [{ x: 3, y: 1 }]],
  ] as const)('handles X maximize=%s, Y maximize=%s', (maximizeX, maximizeY, expected) => {
    expect(globalParetoFrontier(points, maximizeX, maximizeY)).toEqual(expected);
  });
  it('retains tradeoffs, removes ties and invalid values without mutating input', () => {
    const input = [
      { x: 3, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 2 },
      { x: 2, y: 2 },
      { x: NaN, y: 9 },
      { x: 9, y: Infinity },
    ];
    const original = [...input];
    expect(globalParetoFrontier(input, true, true)).toEqual([
      { x: 1, y: 3 },
      { x: 2, y: 2 },
      { x: 3, y: 1 },
    ]);
    expect(input).toEqual(original);
    expect(globalParetoFrontier([], true, true)).toEqual([]);
  });
  it('recomputes the combined official and overlay frontier after dismissal', () => {
    const official = [
      { x: 1, y: 3 },
      { x: 3, y: 1 },
    ];
    const overlay = [{ x: 4, y: 4 }];
    expect(globalParetoFrontier([...official, ...overlay], true, true)).toEqual(overlay);
    expect(globalParetoFrontier(official, true, true)).toEqual(official);
  });
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])('keeps only non-dominated observations for X=%s and Y=%s', (maximizeX, maximizeY) => {
    const input = [
      { x: 1, y: 2 },
      { x: 2, y: 1 },
      { x: 3, y: 4 },
      { x: 4, y: 3 },
    ];
    const frontier = globalParetoFrontier(input, maximizeX, maximizeY);
    for (const point of frontier) {
      expect(
        input.some(
          (other) =>
            (maximizeX ? other.x >= point.x : other.x <= point.x) &&
            (maximizeY ? other.y >= point.y : other.y <= point.y) &&
            (other.x !== point.x || other.y !== point.y),
        ),
      ).toBe(false);
    }
    if (maximizeX && maximizeY) expect(frontier).toEqual(input.slice(2));
    if (!maximizeX && !maximizeY) expect(frontier).toEqual(input.slice(0, 2));
  });
});

describe('paretoHighlightGeometry', () => {
  const x = scaleLinear().domain([0, 10]).range([0, 100]);
  const y = scaleLinear().domain([0, 10]).range([100, 0]);
  it('connects observations without filling a region or extending to plot edges', () => {
    expect(
      paretoHighlightGeometry(
        [
          { x: 2, y: 8 },
          { x: 8, y: 2 },
        ],
        x,
        x,
      ),
    ).toEqual({
      line: 'M20,80L80,20',
      points: [
        { x: 20, y: 80 },
        { x: 80, y: 20 },
      ],
    });
  });
  it('keeps the opposite boundary open', () => {
    const result = paretoHighlightGeometry(
      [
        { x: 2, y: 8 },
        { x: 8, y: 2 },
      ],
      x,
      x,
    );
    expect(result.line).toBe('M20,80L80,20');
    expect(result).not.toHaveProperty('area');
  });
  it('supports log scales, reversed axes and zoom coordinates', () => {
    const log = scaleLog().domain([1, 100]).range([0, 100]);
    const result = paretoHighlightGeometry(
      [
        { x: 1, y: 2 },
        { x: 100, y: 8 },
      ],
      log,
      y,
    );
    expect(result.points[0]).toEqual({ x: 0, y: 80 });
    expect(result.points[1].x).toBe(100);
    const reversed = x.copy().range([100, 0]);
    expect(paretoHighlightGeometry([{ x: 2, y: 2 }], reversed, x).points[0].x).toBe(80);
    expect(paretoHighlightGeometry([{ x: 2, y: 2 }], x.copy().domain([0, 5]), x).points[0].x).toBe(
      40,
    );
  });
  it('handles one point and empty input without invalid paths', () => {
    expect(paretoHighlightGeometry([{ x: 2, y: 2 }], x, x).line).toBe('M20,20');
    expect(paretoHighlightGeometry([], x, y)).toEqual({
      line: null,
      points: [],
    });
  });
});
