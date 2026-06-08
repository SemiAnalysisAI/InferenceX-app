import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { pointNearestX } from './line-label-anchor';

// Minimal InferenceData stand-ins — pointNearestX only reads `x`.
const pt = (x: number, y: number): InferenceData => ({ x, y }) as InferenceData;

describe('pointNearestX', () => {
  it('returns the point whose x is closest to the target', () => {
    const pts = [pt(0, 10), pt(5, 20), pt(10, 30)];
    expect(pointNearestX(pts, 4).x).toBe(5);
    expect(pointNearestX(pts, 1).x).toBe(0);
    expect(pointNearestX(pts, 9).x).toBe(10);
  });

  it('keeps a stable anchor as the line shifts between frames', () => {
    // An anchor stored at x=5 should resolve to whichever current point sits
    // nearest x=5 — this is what keeps a replay label glued to its line.
    const anchorX = 5;
    const frameA = [pt(0, 10), pt(5, 22), pt(10, 30)];
    const frameB = [pt(0, 12), pt(5, 18), pt(10, 26)];
    expect(pointNearestX(frameA, anchorX)).toMatchObject({ x: 5, y: 22 });
    expect(pointNearestX(frameB, anchorX)).toMatchObject({ x: 5, y: 18 });
  });

  it('clamps to the nearest endpoint when the anchor is out of range', () => {
    const pts = [pt(2, 10), pt(4, 20), pt(6, 30)];
    expect(pointNearestX(pts, -100).x).toBe(2);
    expect(pointNearestX(pts, 100).x).toBe(6);
  });

  it('handles a single-point line', () => {
    const pts = [pt(3, 7)];
    expect(pointNearestX(pts, 999)).toMatchObject({ x: 3, y: 7 });
  });
});
