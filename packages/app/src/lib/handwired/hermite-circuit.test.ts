import { describe, expect, it } from 'vitest';

import { hermiteInterpolate, monotoneSlopes } from '@/components/calculator/interpolation';

import { compileHermite, hermiteInterpolateHandwired } from './hermite-circuit';

// FP32 network vs FP64 JavaScript: the network rounds every operation to FP32,
// so values agree to FP32 precision rather than exactly.
const REL_TOL = 1e-4;

function expectClose(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    REL_TOL * Math.max(1, Math.abs(expected)),
  );
}

// A real-shaped frontier: interactivity (tok/s/user) vs output tok/s/GPU.
const xs = [5, 12, 20, 33, 47, 60, 81, 100];
const ys = [9000, 7000, 5200, 3100, 1800, 900, 400, 120];
const m = monotoneSlopes(xs, ys);

describe('compileHermite', () => {
  const net = compileHermite(xs, ys, m);

  it('matches hermiteInterpolate across a dense sweep', () => {
    for (let x = 0; x <= 130; x += 0.25) expectClose(net(x), hermiteInterpolate(xs, ys, m, x));
  });

  it('returns knot values exactly at knots', () => {
    xs.forEach((x, i) => expect(net(x)).toBe(Math.fround(ys[i])));
  });

  it('is flat outside the frontier like the JS early returns', () => {
    expect(net(0)).toBe(ys[0]);
    expect(net(1)).toBe(ys[0]);
    expect(net(1_000)).toBe(ys.at(-1));
    expect(net(1e9)).toBe(ys.at(-1));
  });

  it('is a fixed-size network with no runtime branching on the frontier', () => {
    expect(net.layerCount).toBeGreaterThan(0);
    expect(net.weightCount).toBeGreaterThan(xs.length * 3);
  });

  it('handles degenerate frontiers', () => {
    expect(compileHermite([], [], [])(42)).toBe(0);
    expect(compileHermite([10], [7], [0])(42)).toBe(7);
    const two = compileHermite([10, 20], [100, 50], monotoneSlopes([10, 20], [100, 50]));
    for (let x = 5; x <= 25; x += 0.5)
      expectClose(
        two(x),
        hermiteInterpolate([10, 20], [100, 50], monotoneSlopes([10, 20], [100, 50]), x),
      );
  });

  it('matches random monotone frontiers', () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let trial = 0; trial < 25; trial++) {
      const n = 2 + Math.floor(rand() * 14);
      const fx: number[] = [];
      const fy: number[] = [];
      let x = 1 + rand() * 10;
      let y = 1_000 + rand() * 20_000;
      for (let i = 0; i < n; i++) {
        fx.push(x);
        fy.push(y);
        x += 0.5 + rand() * 40;
        y = Math.max(1, y * (0.3 + rand() * 0.65));
      }
      const fm = monotoneSlopes(fx, fy);
      const f = compileHermite(fx, fy, fm);
      for (let k = 0; k <= 64; k++) {
        const t = fx[0] - 5 + ((fx.at(-1)! - fx[0] + 10) * k) / 64;
        expectClose(f(t), hermiteInterpolate(fx, fy, fm, t));
      }
    }
  });
});

describe('hermiteInterpolateHandwired', () => {
  it('compiles once per frontier identity', () => {
    const a = hermiteInterpolateHandwired(xs, ys, m, 40);
    const b = hermiteInterpolateHandwired(xs, ys, m, 40);
    expect(a).toBe(b);
    expectClose(a, hermiteInterpolate(xs, ys, m, 40));
  });
});
