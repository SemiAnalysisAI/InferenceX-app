import { describe, expect, it } from 'vitest';
import { clampBrushRange } from '@/components/agentic-workload-explorer/brush-bar';

describe('clampBrushRange', () => {
  it('returns the input unchanged when it sits inside bounds', () => {
    expect(clampBrushRange(100, 200, 0, 1000)).toEqual([100, 200]);
  });

  it('reorders endpoints when start > end (handle dragged past the other one)', () => {
    expect(clampBrushRange(300, 200, 0, 1000)).toEqual([200, 300]);
  });

  it('clamps the lower bound to fullStart', () => {
    expect(clampBrushRange(-50, 200, 0, 1000)).toEqual([0, 200]);
  });

  it('clamps the upper bound to fullEnd', () => {
    expect(clampBrushRange(100, 5000, 0, 1000)).toEqual([100, 1000]);
  });

  it('clamps both bounds when the input straddles the full range', () => {
    expect(clampBrushRange(-100, 5000, 0, 1000)).toEqual([0, 1000]);
  });

  it('enforces a minimum 1-unit span centered on the collapsed range', () => {
    const [lo, hi] = clampBrushRange(500, 500, 0, 1000);
    expect(hi - lo).toBeGreaterThanOrEqual(1);
    expect(lo).toBeCloseTo(499.5, 5);
    expect(hi).toBeCloseTo(500.5, 5);
  });

  it('keeps the minimum span inside fullStart/fullEnd at the left edge', () => {
    const [lo, hi] = clampBrushRange(0, 0, 0, 1000);
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(0.5, 5);
  });

  it('keeps the minimum span inside fullStart/fullEnd at the right edge', () => {
    const [lo, hi] = clampBrushRange(1000, 1000, 0, 1000);
    expect(lo).toBeCloseTo(999.5, 5);
    expect(hi).toBe(1000);
  });

  it('handles non-zero fullStart (e.g., trajectories anchored after t=0)', () => {
    expect(clampBrushRange(50, 200, 100, 500)).toEqual([100, 200]);
    expect(clampBrushRange(50, 600, 100, 500)).toEqual([100, 500]);
  });
});
