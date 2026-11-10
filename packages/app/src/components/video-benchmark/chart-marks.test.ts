import { describe, expect, it } from 'vitest';

import {
  PILL_HEIGHT,
  boxesOverlap,
  clearOfLabels,
  labelShift,
  pillBox,
  spreadPills,
} from './chart-marks';

describe('pillBox', () => {
  it('sits right of the last point when it fits', () => {
    expect(pillBox('a', { x: 100, y: 50 }, 80, 400)).toEqual({
      key: 'a',
      x: 112,
      y: 41,
      width: 80,
    });
  });

  it('flips left of the point near the right edge', () => {
    expect(pillBox('a', { x: 380, y: 50 }, 80, 400).x).toBe(288);
  });

  it('never starts left of the plot', () => {
    expect(pillBox('a', { x: 30, y: 50 }, 80, 60).x).toBe(2);
  });
});

describe('spreadPills', () => {
  it('pushes overlapping pills apart, keeping input order', () => {
    const spread = spreadPills(
      [
        { key: 'low', x: 100, y: 52, width: 80 },
        { key: 'high', x: 110, y: 50, width: 80 },
      ],
      300,
    );
    expect(spread.map((pill) => pill.key)).toEqual(['low', 'high']);
    expect(spread[1].y).toBe(50);
    expect(spread[0].y).toBe(50 + PILL_HEIGHT + 3);
  });

  it('leaves pills that are side by side with room alone', () => {
    const pills = [
      { key: 'a', x: 0, y: 50, width: 80 },
      { key: 'b', x: 200, y: 50, width: 80 },
    ];
    expect(spreadPills(pills, 300)).toEqual(pills);
  });

  it('keeps every pill inside the plot', () => {
    const spread = spreadPills(
      [
        { key: 'a', x: 0, y: -20, width: 80 },
        { key: 'b', x: 0, y: 295, width: 80 },
      ],
      300,
    );
    expect(spread[0].y).toBe(2);
    expect(spread[1].y).toBe(300 - PILL_HEIGHT - 2);
  });

  it('keeps a stack apart when the plot edge clamps it', () => {
    for (const ys of [
      [295, 296],
      [-10, -9],
    ]) {
      const spread = spreadPills(
        ys.map((y, index) => ({ key: String(index), x: 100, y, width: 80 })),
        300,
      );
      const [a, b] = spread.toSorted((p, q) => p.y - q.y);
      expect(b.y - a.y, `stack from ${ys.join(', ')}`).toBeGreaterThanOrEqual(PILL_HEIGHT + 3);
      for (const pill of spread) {
        expect(pill.y).toBeGreaterThanOrEqual(2);
        expect(pill.y).toBeLessThanOrEqual(300 - PILL_HEIGHT - 2);
      }
    }
  });

  it('no two of three stacked pills overlap', () => {
    const spread = spreadPills(
      ['a', 'b', 'c'].map((key) => ({ key, x: 100, y: 100, width: 90 })),
      400,
    );
    for (const [i, a] of spread.entries())
      for (const b of spread.slice(i + 1)) {
        const box = (p: typeof a) => ({
          x0: p.x,
          x1: p.x + p.width,
          y0: p.y,
          y1: p.y + PILL_HEIGHT,
        });
        expect(boxesOverlap(box(a), box(b))).toBe(false);
      }
  });
});

describe('labelShift', () => {
  it('moves a label off the left edge', () => {
    expect(labelShift(4, 20, 300)).toBe(8);
  });

  it('moves a label off the right edge', () => {
    expect(labelShift(296, 20, 300)).toBe(-8);
  });

  it('leaves a label inside the plot alone', () => {
    expect(labelShift(150, 20, 300)).toBe(0);
  });
});

describe('clearOfLabels', () => {
  const label = { x0: 90, x1: 130, y0: 32, y1: 44 };

  it('steps a right-hand pill past its point’s label', () => {
    const pill = clearOfLabels({ key: 'a', x: 122, y: 41, width: 80 }, { x: 110 }, [label], 400);
    expect(pill.x).toBe(134);
    expect(pill.y).toBe(41);
  });

  it('drops a flipped pill below a label it would cover', () => {
    const pill = clearOfLabels({ key: 'a', x: 60, y: 30, width: 80 }, { x: 152 }, [label], 400);
    expect(pill.x).toBe(60);
    expect(pill.y).toBe(46);
  });

  it('leaves a pill clear of every label alone', () => {
    const pill = { key: 'a', x: 200, y: 100, width: 80 };
    expect(clearOfLabels({ ...pill }, { x: 188 }, [label], 400)).toEqual(pill);
  });
});
