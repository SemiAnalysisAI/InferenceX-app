import { describe, expect, it } from 'vitest';

import {
  firstNonCollidingRect,
  fitsVertically,
  horizontalShiftIntoBounds,
  placeLineLabels,
  rectsOverlap,
  type LineLabelSeries,
} from './line-label-layer';

interface Point {
  x: number;
  y: number;
}

const series = (
  key: string,
  points: Point[],
  keepVisibleOnCollision = false,
): LineLabelSeries<Point> => ({
  key,
  seriesId: key,
  label: key,
  color: '#000',
  points,
  keepVisibleOnCollision,
});

const identity = (value: number) => value;

describe('line-label collision primitives', () => {
  it('treats edge-separated rectangles as non-overlapping', () => {
    const left = { left: 0, right: 10, top: 0, bottom: 10 };
    const right = { left: 11, right: 20, top: 0, bottom: 10 };

    expect(rectsOverlap(left, right)).toBe(false);
    expect(firstNonCollidingRect([left, right], [left])).toBe(1);
  });

  it('returns null when every candidate intersects a placed rectangle', () => {
    const placed = [{ left: 0, right: 10, top: 0, bottom: 10 }];
    const candidates = [
      { left: 2, right: 4, top: 2, bottom: 4 },
      { left: 8, right: 12, top: 8, bottom: 12 },
    ];

    expect(firstNonCollidingRect(candidates, placed)).toBeNull();
  });
});

describe('point-label plot bounding box primitives', () => {
  const plot = { left: 0, right: 100, top: 0, bottom: 50 };

  it('needs no shift when the rect already sits inside the plot', () => {
    expect(horizontalShiftIntoBounds({ left: 10, right: 40, top: 5, bottom: 15 }, plot)).toBe(0);
  });

  it('slides a rect that spills past the left edge back inside', () => {
    expect(horizontalShiftIntoBounds({ left: -8, right: 22, top: 5, bottom: 15 }, plot)).toBe(8);
  });

  it('slides a rect that spills past the right edge back inside', () => {
    expect(horizontalShiftIntoBounds({ left: 90, right: 115, top: 5, bottom: 15 }, plot)).toBe(-15);
  });

  it('gives up on a rect wider than the plot', () => {
    expect(horizontalShiftIntoBounds({ left: -10, right: 120, top: 5, bottom: 15 }, plot)).toBe(
      null,
    );
  });

  it('accepts a rect touching the plot edges as fitting', () => {
    expect(horizontalShiftIntoBounds({ left: 0, right: 100, top: 0, bottom: 50 }, plot)).toBe(0);
    expect(fitsVertically({ left: 0, right: 100, top: 0, bottom: 50 }, plot)).toBe(true);
  });

  it('rejects any vertical overflow, however small', () => {
    expect(fitsVertically({ left: 10, right: 20, top: -0.5, bottom: 10 }, plot)).toBe(false);
    expect(fitsVertically({ left: 10, right: 20, top: 40, bottom: 50.5 }, plot)).toBe(false);
  });
});

describe('line-label placement', () => {
  it('uses later candidates when the preferred anchor collides', () => {
    const labels = placeLineLabels(
      [
        series('first', [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ]),
        series('second', [
          { x: 0, y: 0 },
          { x: 20, y: 20 },
          { x: 40, y: 40 },
        ]),
      ],
      identity,
      identity,
      { collisionWidth: 15, collisionHeight: 15 },
    );

    expect(labels.find((label) => label.key === 'first')).toMatchObject({ x: 10, y: 10 });
    expect(labels.find((label) => label.key === 'second')).toMatchObject({
      x: 40,
      y: 40,
      visible: true,
    });
  });

  it('keeps pinned data-space anchors stable while scales change', () => {
    const anchors = new Map<string, number>();
    const input = [
      series('run', [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 60 },
      ]),
    ];
    const initial = placeLineLabels(input, identity, identity, {
      collisionWidth: 100,
      anchors,
      pinAnchors: true,
    });
    const zoomed = placeLineLabels(
      input,
      (value) => value * 2,
      (value) => value * 3,
      { collisionWidth: 100, anchors, pinAnchors: true },
    );

    expect(anchors.get('run')).toBe(30);
    expect(initial[0]).toMatchObject({ x: 30, y: 40, visible: true });
    expect(zoomed[0]).toMatchObject({ x: 60, y: 120, visible: true });
  });

  it('staggers anchor slots so converging curves spread along the line instead of stacking at the endpoint', () => {
    // Frontier-shaped curves that all converge on the same right-edge region,
    // like the e2e latency chart: endpoint placement used to pile every label
    // on top of the shared endpoint.
    const converging = (key: string, startY: number): LineLabelSeries<Point> =>
      series(
        key,
        [0, 25, 50, 75, 100].map((x) => ({ x, y: startY + ((50 - startY) * x) / 100 })),
      );
    const labels = placeLineLabels(
      [converging('a', 0), converging('b', 100), converging('c', 200), converging('d', 300)],
      identity,
      identity,
      { collisionWidth: 30 },
    );

    expect(labels).toHaveLength(4);
    expect(labels.every((label) => label.visible)).toBe(true);
    // Labels occupy distinct anchor slots along the x-range rather than all
    // sitting at the shared endpoint (x = 100).
    const distinctX = new Set(labels.map((label) => label.x));
    expect(distinctX.size).toBeGreaterThanOrEqual(3);
    expect(labels.filter((label) => label.x === 100).length).toBeLessThanOrEqual(1);
  });

  it('places a single-point series at its only point', () => {
    const labels = placeLineLabels([series('solo', [{ x: 5, y: 7 }])], identity, identity, {
      collisionWidth: 30,
    });

    expect(labels[0]).toMatchObject({ x: 5, y: 7, visible: true });
  });
});
