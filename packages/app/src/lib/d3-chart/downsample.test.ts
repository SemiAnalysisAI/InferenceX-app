import { describe, expect, it } from 'vitest';

import { lttbDownsample } from './downsample';

interface Point {
  x: number;
  y: number;
}

const getX = (d: Point) => d.x;
const getY = (d: Point) => d.y;

describe('lttbDownsample', () => {
  it('returns original data when below target', () => {
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ];
    expect(lttbDownsample(data, 5, getX, getY)).toBe(data);
  });

  it('returns original data when exactly at target', () => {
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ];
    expect(lttbDownsample(data, 3, getX, getY)).toBe(data);
  });

  it('returns first and last for target < 3', () => {
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 5 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    const result = lttbDownsample(data, 2, getX, getY);
    expect(result).toEqual([data[0], data[3]]);
  });

  it('always includes first and last points', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ x: i, y: Math.sin(i / 10) }));
    const result = lttbDownsample(data, 10, getX, getY);
    expect(result[0]).toBe(data[0]);
    expect(result[result.length - 1]).toBe(data[data.length - 1]);
  });

  it('returns exactly target number of points', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: Math.sin(i / 50) }));
    const result = lttbDownsample(data, 50, getX, getY);
    expect(result.length).toBe(50);
  });

  it('preserves peaks in sine wave', () => {
    const data = Array.from({ length: 200 }, (_, i) => ({ x: i, y: Math.sin((i * Math.PI) / 50) }));
    const result = lttbDownsample(data, 20, getX, getY);
    const maxY = Math.max(...result.map(getY));
    const minY = Math.min(...result.map(getY));
    // Downsampled data should still capture ~full amplitude
    expect(maxY).toBeGreaterThan(0.9);
    expect(minY).toBeLessThan(-0.9);
  });

  it('preserves spike anomaly', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i === 50 ? 100 : 1 }));
    const result = lttbDownsample(data, 10, getX, getY);
    // The spike at x=50 should be picked as the most visually significant point
    expect(result.some((p) => p.y === 100)).toBe(true);
  });

  it('returns references to original objects (no cloning)', () => {
    const data = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i * 2 }));
    const result = lttbDownsample(data, 10, getX, getY);
    for (const point of result) {
      expect(data).toContain(point);
    }
  });

  it('output is in ascending x order', () => {
    const data = Array.from({ length: 500 }, (_, i) => ({ x: i, y: Math.random() * 100 }));
    const result = lttbDownsample(data, 30, getX, getY);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].x).toBeGreaterThanOrEqual(result[i - 1].x);
    }
  });
});
