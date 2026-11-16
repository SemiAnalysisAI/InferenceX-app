import { describe, expect, it } from 'vitest';

import {
  PILL_HEIGHT,
  boxesOverlap,
  clearOfLabels,
  labelShift,
  pillBox,
  spreadPills,
  tapTarget,
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

  it('never spreads a pill back over a shown label near the plot bottom', () => {
    const label = { x0: 50, x1: 160, y0: 250, y1: 270 };
    const dropped = clearOfLabels({ key: 'a', x: 60, y: 255, width: 80 }, { x: 152 }, [label], 400);
    expect(dropped.y).toBe(272);
    const spread = spreadPills([dropped, { key: 'b', x: 70, y: 278, width: 80 }], 300, [label]);
    const box = (p: (typeof spread)[number]) => ({
      x0: p.x,
      x1: p.x + p.width,
      y0: p.y,
      y1: p.y + PILL_HEIGHT,
    });
    for (const pill of spread) {
      expect(boxesOverlap(box(pill), label), pill.key).toBe(false);
      expect(pill.y).toBeGreaterThanOrEqual(2);
      expect(pill.y).toBeLessThanOrEqual(300 - PILL_HEIGHT - 2);
    }
    expect(boxesOverlap(box(spread[0]), box(spread[1]))).toBe(false);
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

describe('tapTarget', () => {
  // H200 and H100 at 8 GPUs plot 1 px apart; B200 sits well clear of both.
  const points = [
    { key: 'h200', x: 100, y: 200 },
    { key: 'h100', x: 101, y: 200 },
    { key: 'b200', x: 60, y: 120 },
  ];

  it('picks the nearest point within a finger of the tap and nothing beyond it', () => {
    expect(tapTarget({ x: 70, y: 135 }, points, null)).toBe('b200');
    expect(tapTarget({ x: 60, y: 143 }, points, null)).toBeNull();
    expect(tapTarget({ x: 300, y: 40 }, points, 'b200')).toBeNull();
  });

  it('gives overlapping points turns, so a second tap reaches the one underneath', () => {
    const tap = { x: 99, y: 201 };
    expect(tapTarget(tap, points, null)).toBe('h200');
    expect(tapTarget(tap, points, 'h200')).toBe('h100');
    expect(tapTarget(tap, points, 'h100')).toBe('h200');
    // A point picked elsewhere on the chart does not change whose turn it is here.
    expect(tapTarget(tap, points, 'b200')).toBe('h200');
  });

  it('keeps a tap on a point that a finger can tell from its neighbour', () => {
    const apart = [
      { key: 'near', x: 100, y: 100 },
      { key: 'far', x: 115, y: 100 },
    ];
    // Both are within reach, but the tap is plainly on `near`: tapping it again unpins it.
    expect(tapTarget({ x: 100, y: 100 }, apart, 'near')).toBe('near');
    expect(tapTarget({ x: 107, y: 100 }, apart, 'near')).toBe('far');
  });
});
