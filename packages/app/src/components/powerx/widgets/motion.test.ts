import { describe, expect, it } from 'vitest';

import {
  clamp01,
  easeOutCubic,
  inViewAttr,
  motionVars,
  planDurationMs,
  sampleTweens,
  startFrame,
  tweenProgress,
  tweenValue,
} from './motion';

describe('easeOutCubic', () => {
  it('starts at 0, ends at 1 and front-loads the motion', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 6);
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
  });

  it('clamps outside [0, 1] so a late frame never overshoots', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.5)).toBe(0);
  });
});

describe('tweenProgress', () => {
  it('waits out the delay and then runs for the duration', () => {
    const spec = { delayMs: 100, durationMs: 400 };
    expect(tweenProgress(0, spec)).toBe(0);
    expect(tweenProgress(100, spec)).toBe(0);
    expect(tweenProgress(300, spec)).toBe(0.5);
    expect(tweenProgress(500, spec)).toBe(1);
    expect(tweenProgress(900, spec)).toBe(1);
  });

  it('treats a zero duration as a step at the delay', () => {
    const spec = { delayMs: 50, durationMs: 0 };
    expect(tweenProgress(49, spec)).toBe(0);
    expect(tweenProgress(50, spec)).toBe(1);
  });
});

describe('tweenValue', () => {
  it('eases from one value to the other and lands exactly', () => {
    const spec = { delayMs: 0, durationMs: 700 };
    expect(tweenValue(0, 1000, 0, spec)).toBe(0);
    expect(tweenValue(0, 1000, 350, spec)).toBeCloseTo(875, 6);
    expect(tweenValue(0, 1000, 700, spec)).toBe(1000);
    expect(tweenValue(1000, 400, 700, spec)).toBe(400);
  });
});

describe('planDurationMs and sampleTweens', () => {
  const specs = {
    gpu: { delayMs: 0, durationMs: 700, from: 0 },
    cpu: { delayMs: 700, durationMs: 320, from: 0 },
    scaleMax: { delayMs: 0, durationMs: 0 },
  };
  const to = { gpu: 1000, cpu: 120, scaleMax: 2000 };

  it('reports when the last key settles', () => {
    expect(planDurationMs(specs)).toBe(1020);
    expect(planDurationMs({})).toBe(0);
  });

  it('builds the start frame from each key’s from value, snapping the rest', () => {
    expect(startFrame(to, specs)).toEqual({ gpu: 0, cpu: 0, scaleMax: 2000 });
  });

  it('sequences the keys: the CPU part only moves after the GPU bar is done', () => {
    const from = startFrame(to, specs);
    const early = sampleTweens(from, to, specs, 350);
    expect(early.gpu).toBeCloseTo(875, 6);
    expect(early.cpu).toBe(0);
    expect(early.scaleMax).toBe(2000);
    const late = sampleTweens(from, to, specs, 860);
    expect(late.gpu).toBe(1000);
    expect(late.cpu).toBeCloseTo(105, 6);
    expect(sampleTweens(from, to, specs, 2000)).toEqual(to);
  });

  it('starts a key missing from the previous frame at its target', () => {
    const update = { gpu: { delayMs: 0, durationMs: 350 }, grace: { delayMs: 0, durationMs: 350 } };
    const frame = sampleTweens({ gpu: 1000 }, { gpu: 800, grace: 60 }, update, 0);
    expect(frame).toEqual({ gpu: 1000, grace: 60 });
  });
});

describe('attribute helpers', () => {
  it('only emits data-inview once the trigger fired', () => {
    expect(inViewAttr(false)).toBeUndefined();
    expect(inViewAttr(true)).toBe('true');
  });

  it('writes the custom properties the CSS reveals read', () => {
    expect(motionVars({ delayMs: 90 })).toEqual({ '--motion-delay': '90ms' });
    expect(motionVars({ delayMs: 0, fadeMs: 200, drawMs: 450 })).toEqual({
      '--motion-delay': '0ms',
      '--motion-fade-duration': '200ms',
      '--motion-draw-duration': '450ms',
    });
  });
});
