import { describe, expect, it } from 'vitest';

import { interpolateAtStep, type PerStepValue } from '../interpolateAtTime';

const v = (visible: boolean, x: number, y: number): PerStepValue => ({ visible, x, y });

describe('interpolateAtStep', () => {
  it('returns invisible for empty stepValues', () => {
    expect(interpolateAtStep([], 0)).toEqual({ visible: false, x: 0, y: 0 });
  });

  it('returns the exact step when idxFloat lands on an integer', () => {
    const steps = [v(true, 100, 50), v(true, 200, 75)];
    expect(interpolateAtStep(steps, 0)).toEqual({ visible: true, x: 100, y: 50 });
    expect(interpolateAtStep(steps, 1)).toEqual({ visible: true, x: 200, y: 75 });
  });

  it('lerps linearly between two visible steps', () => {
    const steps = [v(true, 0, 0), v(true, 100, 100)];
    const r = interpolateAtStep(steps, 0.5);
    expect(r).toEqual({ visible: true, x: 50, y: 50 });
  });

  it('pops in at the destination during an invisible→visible segment', () => {
    const steps = [v(false, 0, 0), v(true, 200, 75)];
    const r = interpolateAtStep(steps, 0.25);
    expect(r).toEqual({ visible: true, x: 200, y: 75 });
  });

  it('keeps both endpoints invisible across an invisible→invisible segment', () => {
    const steps = [v(false, 0, 0), v(false, 0, 0)];
    expect(interpolateAtStep(steps, 0.5)).toEqual({ visible: false, x: 0, y: 0 });
  });

  it('clamps idxFloat to the valid range and returns the last step at idxFloat ≥ n-1', () => {
    const steps = [v(true, 10, 1), v(true, 20, 2), v(true, 30, 3)];
    expect(interpolateAtStep(steps, 5)).toEqual({ visible: true, x: 30, y: 3 });
    expect(interpolateAtStep(steps, -1)).toEqual({ visible: true, x: 10, y: 1 });
  });
});
