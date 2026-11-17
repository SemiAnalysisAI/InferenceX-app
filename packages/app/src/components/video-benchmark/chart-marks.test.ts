import { describe, expect, it } from 'vitest';

import {
  BADGE_HEIGHT,
  PILL_HEIGHT,
  badgeBox,
  boxesOverlap,
  clearOfLabels,
  deploymentLabels,
  labelShift,
  pillBox,
  placePill,
  segmentCrosses,
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

describe('deploymentLabels', () => {
  it('starts with the GPU-count labels off on a phone and on elsewhere', () => {
    expect(deploymentLabels(null, true)).toBe(false);
    expect(deploymentLabels(null, false)).toBe(true);
  });

  it('follows the switch once the reader has set it, at any width', () => {
    expect(deploymentLabels(true, true)).toBe(true);
    expect(deploymentLabels(false, false)).toBe(false);
  });
});

describe('segmentCrosses', () => {
  const box = { x0: 10, x1: 20, y0: 10, y1: 20 };

  it('finds a line that passes through a box, whichever way it runs', () => {
    expect(segmentCrosses({ x: 0, y: 15 }, { x: 30, y: 15 }, box)).toBe(true);
    expect(segmentCrosses({ x: 30, y: 25 }, { x: 0, y: 5 }, box)).toBe(true);
    expect(segmentCrosses({ x: 15, y: 0 }, { x: 15, y: 30 }, box)).toBe(true);
  });

  it('ignores a line that stops short of the box or passes beside it', () => {
    expect(segmentCrosses({ x: 0, y: 15 }, { x: 9, y: 15 }, box)).toBe(false);
    expect(segmentCrosses({ x: 0, y: 0 }, { x: 30, y: 5 }, box)).toBe(false);
    expect(segmentCrosses({ x: 25, y: 0 }, { x: 25, y: 30 }, box)).toBe(false);
  });
});

describe('badgeBox', () => {
  const plot = { width: 230, height: 300 };
  const clear = { boxes: [], points: [], lines: [] };

  it('sits centred above its point when nothing is in the way', () => {
    expect(badgeBox({ x: 100, y: 100 }, 50, plot, clear)).toEqual({
      x0: 75,
      x1: 125,
      y0: 100 - 12 - BADGE_HEIGHT,
      y1: 88,
    });
  });

  it('stays inside the plot beside either edge', () => {
    expect(badgeBox({ x: 5, y: 100 }, 50, plot, clear).x0).toBe(2);
    expect(badgeBox({ x: 228, y: 100 }, 50, plot, clear).x1).toBe(228);
  });

  it('drops below a point at the top of the plot', () => {
    expect(badgeBox({ x: 100, y: 10 }, 50, plot, clear).y0).toBe(22);
  });

  it('drops below its point rather than cover a line, a point or the other badge', () => {
    const at = { x: 100, y: 100 };
    const line = [
      { x: 60, y: 90 },
      { x: 140, y: 70 },
    ];
    expect(badgeBox(at, 50, plot, { ...clear, lines: [line] }).y0).toBe(112);
    expect(badgeBox(at, 50, plot, { ...clear, points: [{ x: 110, y: 80 }] }).y0).toBe(112);
    const other = badgeBox(at, 50, plot, clear);
    expect(badgeBox({ x: 110, y: 102 }, 50, plot, { ...clear, boxes: [other] }).y0).toBe(114);
  });

  it('keeps to the top when below is no clearer', () => {
    const lines = [
      [
        { x: 60, y: 80 },
        { x: 140, y: 80 },
      ],
      [
        { x: 60, y: 120 },
        { x: 140, y: 120 },
      ],
    ];
    expect(badgeBox({ x: 100, y: 100 }, 50, plot, { ...clear, lines }).y1).toBe(88);
  });
});

const edges = (pill: { x: number; y: number; width: number }) => ({
  x0: pill.x,
  x1: pill.x + pill.width,
  y0: pill.y,
  y1: pill.y + PILL_HEIGHT,
});

describe('placePill', () => {
  const plot = { width: 230, height: 300 };
  const clear = { boxes: [], points: [], lines: [] };

  it('sits right of the last point when that place is free', () => {
    expect(placePill('a', { x: 100, y: 50 }, 60, plot, clear)).toEqual(
      pillBox('a', { x: 100, y: 50 }, 60, plot.width),
    );
  });

  it('goes above the point, inside the plot, when the right has no room', () => {
    // The line reaches its last point from the lower left, so a pill on the left would lie on it.
    const line = [
      { x: 60, y: 140 },
      { x: 200, y: 100 },
    ];
    const pill = placePill('a', line[1], 60, plot, { ...clear, points: line, lines: [line] });
    expect(pill).toEqual({ key: 'a', x: 168, y: 100 - 12 - PILL_HEIGHT, width: 60 });
    expect(segmentCrosses(line[0], line[1], edges(pill))).toBe(false);
  });

  it('takes the first place that covers no badge, label, point or line', () => {
    const end = { x: 100, y: 100 };
    const badge = { x0: 110, x1: 160, y0: 92, y1: 108 };
    const above = placePill('a', end, 60, plot, { ...clear, boxes: [badge] });
    expect(above.y).toBe(100 - 12 - PILL_HEIGHT);
    expect(boxesOverlap(badge, edges(above))).toBe(false);
    // With a point above as well, it goes below.
    const below = placePill('a', end, 60, plot, {
      ...clear,
      boxes: [badge],
      points: [{ x: 130, y: 78 }],
    });
    expect(below.y).toBe(112);
  });

  it('covers a line sooner than a point, and a point sooner than a badge', () => {
    const end = { x: 200, y: 100 };
    const badge = { x0: 160, x1: 228, y0: 68, y1: 90 };
    const point = { x: 190, y: 120 };
    const line = [
      { x: 60, y: 100 },
      { x: 200, y: 100 },
    ];
    // Right is off the plot, above is on the badge, below is on the point, left is on the line.
    expect(
      placePill('a', end, 60, plot, { boxes: [badge], points: [point], lines: [line] }),
    ).toEqual({ key: 'a', x: 128, y: 91, width: 60 });
  });

  it('goes below a labelled last point near the right edge, never onto the point', () => {
    const end = { x: 200, y: 100 };
    // The point's GPU-count label, reaching down over the point as the chart passes it.
    const label = { x0: 185, x1: 215, y0: 82, y1: 105 };
    const pill = placePill('a', end, 60, plot, { ...clear, points: [end] }, [label]);
    // Above would cover the label, and stepping off it there would land on the point.
    expect(pill).toEqual({ key: 'a', x: 168, y: 112, width: 60 });
    expect(boxesOverlap(label, edges(pill))).toBe(false);
  });

  it('goes left of a labelled point rather than drop off the label onto its neighbour', () => {
    const end = { x: 170, y: 100 };
    const neighbour = { x: 192, y: 122 };
    const label = { x0: 155, x1: 185, y0: 82, y1: 105 };
    // Right is free until the label pushes the pill down, since the plot has no room to step past.
    const pill = placePill('a', end, 44, plot, { ...clear, points: [end, neighbour] }, [label]);
    expect(pill).toEqual({ key: 'a', x: 114, y: 107, width: 44 });
  });

  it('still steps a right-hand pill past its point’s label when the plot has room', () => {
    const end = { x: 100, y: 100 };
    const label = { x0: 85, x1: 125, y0: 82, y1: 105 };
    expect(placePill('a', end, 60, plot, { ...clear, points: [end] }, [label])).toEqual({
      key: 'a',
      x: 129,
      y: 91,
      width: 60,
    });
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
