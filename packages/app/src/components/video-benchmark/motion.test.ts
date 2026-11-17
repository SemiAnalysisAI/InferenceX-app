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
      from: null,
      elapsed: 0,
      age: null,
      moving: false,
    });
  });

  it('keeps a mark on its point while the point glides, with no lag', () => {
    const motion = markMotion();
    pass(motion, () => markStep(motion, 'playing', 'p1', at, { x: 100, y: 80 }, 0));
    // The point has moved 40 px; the mark's offset from it is the same.
    const next = markStep(motion, 'playing', 'p1', { x: 140, y: 100 }, { x: 140, y: 80 }, 16);
    expect(next).toMatchObject({ x: 140, y: 80, from: null, age: null, moving: false });
  });

  it('eases a mark to the point it is attached to next', () => {
    const motion = markMotion();
    pass(motion, () => markStep(motion, 'playing', 'p1', at, at, 0));
    const start = markStep(motion, 'playing', 'p2', { x: 300, y: 100 }, { x: 300, y: 100 }, 1000);
    // Drawn on the new point, with a move from the old one for the drawn mark to run.
    expect(start).toMatchObject({ x: 100, y: 100, from: at, elapsed: 0, moving: true });
    expect(motion.until).toBe(1000 + MOTION.base);
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
    expect(half).toMatchObject({ from: at, elapsed: MOTION.base / 2, moving: true });
    markPassEnd(motion);
    const end = markStep(
      motion,
      'playing',
      'p2',
      { x: 300, y: 100 },
      { x: 300, y: 100 },
      1000 + MOTION.base,
    );
    expect(end).toMatchObject({ x: 300, y: 100, from: null, age: null, moving: false });
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
    const back = markStep(motion, 'playing', 'p1', at, at, 60);
    expect(back.x).toBeCloseTo(part.x, 6);
    expect(back.from?.x).toBeCloseTo(part.x, 6);
    markPassEnd(motion);
    // With no redraw in between, a later change still starts from where the mark has got to.
    const again = markStep(motion, 'playing', 'p2', { x: 300, y: 100 }, { x: 300, y: 100 }, 170);
    expect(again.from?.x).toBeGreaterThan(100);
    expect(again.from?.x).toBeLessThan(part.x);
    markPassEnd(motion);
    markStep(motion, 'playing', 'p1', at, at, 171);
    markPassEnd(motion);
    const end = markStep(motion, 'playing', 'p1', at, at, 171 + MOTION.base);
    expect(end).toMatchObject({ x: 100, y: 100, from: null, age: null, moving: false });
  });

  it('fades in a mark that appears later, and forgets one that is gone', () => {
    const motion = markMotion();
    pass(motion, () => markStep(motion, 'pill:b200', 'p1', at, at, 0));
    const born = markStep(motion, 'pill:h100', 'p9', at, at, 100);
    // The fade is the drawn mark's own animation, so it asks for no redraw.
    expect(born).toMatchObject({ age: 0, moving: false });
    markPassEnd(motion);
    expect(motion.marks.has('pill:b200')).toBe(false);
    // A redraw part of the way through picks the fade up at its age.
    const part = markStep(motion, 'pill:h100', 'p9', at, at, 160);
    expect(part.age).toBe(60);
    markPassEnd(motion);
    const grown = markStep(motion, 'pill:h100', 'p9', at, at, 100 + MOTION.fast);
    expect(grown).toMatchObject({ age: null, moving: false });
  });

  it('keeps a mark on its place through a zoom or pan, and does not ease afterwards', () => {
    const motion = markMotion();
    pass(motion, () => markStep(motion, 'pill:b200', 'p1', at, { x: 112, y: 91 }, 0));
    // The pan clamps the pill somewhere else beside its point: it is there at once.
    const panned = markStep(motion, 'pill:b200', 'p1', at, { x: 60, y: 70 }, 500, true);
    expect(panned).toMatchObject({ x: 60, y: 70, from: null, age: null, moving: false });
    const born = markStep(motion, 'pill:h100', 'p9', at, at, 500, true);
    expect(born).toMatchObject({ age: null, moving: false });
    markPassEnd(motion);
    const after = markStep(motion, 'pill:b200', 'p1', at, { x: 60, y: 70 }, 516);
    expect(after).toMatchObject({ x: 60, y: 70, from: null, age: null, moving: false });
  });
});
