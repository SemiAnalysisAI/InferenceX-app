import { describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import {
  firstNonCollidingRect,
  placeEndpointLineLabels,
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

  it('nudges endpoint labels into the scale range without changing identities', () => {
    const yScale = d3.scaleLinear().domain([0, 100]).range([100, 0]);
    const labels = placeEndpointLineLabels(
      [series('a', [{ x: 1, y: 50 }]), series('b', [{ x: 2, y: 51 }])],
      identity,
      yScale,
    );

    expect(labels.map((label) => label.key).toSorted()).toEqual(['a', 'b']);
    expect(Math.abs(labels[0].y - labels[1].y)).toBeGreaterThanOrEqual(17.9);
    expect(labels.every((label) => label.y >= 18 && label.y <= 82)).toBe(true);
  });
});
