import { describe, expect, it } from 'vitest';

import { EASE, MOTION, bezier, cssEase, markMotion, markPassEnd, markStep } from './motion';

describe('bezier', () => {
  it('starts at 0, ends at 1 and never runs backwards', () => {
    for (const curve of Object.values(EASE)) {
      expect(bezier(curve, 0)).toBe(0);
      expect(bezier(curve, 1)).toBe(1);
      let last = 0;
      for (let t = 0.05; t < 1; t += 0.05) {
        const value = bezier(curve, t);
        expect(value).toBeGreaterThanOrEqual(last);
        last = value;
      }
    }
  });

  it('matches the CSS curve it names', () => {
    // cubic-bezier(0.2, 0, 0, 1) at half time: x(u) = 0.5 at u = 0.78169, where y = 0.87783.
    expect(bezier(EASE.standard, 0.5)).toBeCloseTo(0.87783, 4);
    expect(cssEase(EASE.standard)).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });
});

const pass = (motion: ReturnType<typeof markMotion>, draw: () => void) => {
  draw();
  markPassEnd(motion);
};

describe('markStep', () => {
  const at = { x: 100, y: 100 };

  it('draws the marks of the first pass in place and opaque', () => {
    const motion = markMotion();
    expect(markStep(motion, 'playing', 'p1', at, { x: 100, y: 80 }, 0)).toEqual({
      x: 100,
      y: 80,
      opacity: 1,
      moving: false,
    });
  });

  it('keeps a mark on its point while the point glides, with no lag', () => {
    const motion = markMotion();
    pass(motion, () => markStep(motion, 'playing', 'p1', at, { x: 100, y: 80 }, 0));
    // The point has moved 40 px; the mark's offset from it is the same.
    const next = markStep(motion, 'playing', 'p1', { x: 140, y: 100 }, { x: 140, y: 80 }, 16);
    expect(next).toEqual({ x: 140, y: 80, opacity: 1, moving: false });
  });

  it('eases a mark to the point it is attached to next', () => {
    const motion = markMotion();
    pass(motion, () => markStep(motion, 'playing', 'p1', at, at, 0));
    const start = markStep(motion, 'playing', 'p2', { x: 300, y: 100 }, { x: 300, y: 100 }, 1000);
    expect(start).toMatchObject({ x: 100, y: 100, moving: true });
    markPassEnd(motion);
    const half = markStep(
      motion,
      'playing',
      'p2',
      { x: 300, y: 100 },
      { x: 300, y: 100 },
      1000 + MOTION.base / 2,
    );
    expect(half.x).toBeGreaterThan(200);
    expect(half.x).toBeLessThan(300);
    markPassEnd(motion);
    const end = markStep(
      motion,
      'playing',
      'p2',
      { x: 300, y: 100 },
      { x: 300, y: 100 },
      1000 + MOTION.base,
    );
    expect(end).toEqual({ x: 300, y: 100, opacity: 1, moving: false });
  });

  it('eases a mark placed on another side of the same point', () => {
    const motion = markMotion();
    pass(motion, () => markStep(motion, 'pill:b200', 'p1', at, { x: 112, y: 91 }, 0));
    const start = markStep(motion, 'pill:b200', 'p1', at, { x: 60, y: 70 }, 500);
    expect(start).toMatchObject({ x: 112, y: 91, moving: true });
  });

  it('starts a second move from where the first had got to', () => {
    const motion = markMotion();
    pass(motion, () => markStep(motion, 'playing', 'p1', at, at, 0));
    pass(motion, () =>
      markStep(motion, 'playing', 'p2', { x: 300, y: 100 }, { x: 300, y: 100 }, 0),
    );
    const part = markStep(motion, 'playing', 'p2', { x: 300, y: 100 }, { x: 300, y: 100 }, 60);
    markPassEnd(motion);
    // Picked again mid-move: it turns round from where it is, not from either end.
    const back = markStep(motion, 'playing', 'p1', at, at, 61);
    expect(back.x).toBeCloseTo(part.x, 6);
    markPassEnd(motion);
    const end = markStep(motion, 'playing', 'p1', at, at, 61 + MOTION.base);
    expect(end).toEqual({ x: 100, y: 100, opacity: 1, moving: false });
  });

  it('fades in a mark that appears later, and forgets one that is gone', () => {
    const motion = markMotion();
    pass(motion, () => markStep(motion, 'pill:b200', 'p1', at, at, 0));
    const born = markStep(motion, 'pill:h100', 'p9', at, at, 100);
    expect(born).toMatchObject({ opacity: 0, moving: true });
    markPassEnd(motion);
    expect(motion.marks.has('pill:b200')).toBe(false);
    const grown = markStep(motion, 'pill:h100', 'p9', at, at, 100 + MOTION.fast);
    expect(grown).toMatchObject({ opacity: 1, moving: false });
  });
});
