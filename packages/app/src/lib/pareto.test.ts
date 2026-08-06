import { describe, expect, it } from 'vitest';

import {
  aucUnderFrontier,
  aucWindow,
  interpAlongFrontier,
  paretoFrontier,
  type Point2D,
} from '@/lib/pareto';

import eightConfigData from './__fixtures__/eight_config_data.json';

interface RawPoint {
  Conc: number;
  Interactivity_tok_s_user: number;
  Token_Throughput_per_GPU_tok_s_gpu: number;
  Median_TTFT_ms: number;
}

const toPoints = (raw: RawPoint[]): Point2D[] =>
  raw.map((p) => ({ x: p.Interactivity_tok_s_user, y: p.Token_Throughput_per_GPU_tok_s_gpu }));

// Independent fine-grid trapezoidal reference. Matches the Python np.interp
// + np.trapezoid approach used in the original spec. Used by the sanity
// check below — kept out of `src/lib/pareto.ts` because the production
// implementation is the closed-form piecewise integral, which agrees with
// this to fp drift on piecewise-linear input.
function referenceAuc(frontier: Point2D[], lo: number, hi: number): number {
  if (frontier.length === 0 || hi <= lo) return 0;
  const minX = frontier[0].x;
  const last = frontier.at(-1);
  if (!last) return 0;
  const maxX = last.x;
  const N = 100_001;
  const step = (hi - lo) / (N - 1);
  const ys: number[] = [];
  for (let i = 0; i < N; i++) {
    const x = lo + i * step;
    if (x < minX || x > maxX) {
      ys.push(0);
      continue;
    }
    let j = 0;
    while (j < frontier.length - 1 && frontier[j + 1].x < x) j++;
    const a = frontier[j];
    const b = frontier[Math.min(j + 1, frontier.length - 1)];
    if (b.x === a.x) {
      ys.push(Math.max(a.y, b.y));
    } else {
      const t = (x - a.x) / (b.x - a.x);
      ys.push(a.y + t * (b.y - a.y));
    }
  }
  let area = 0;
  for (let i = 0; i < ys.length - 1; i++) {
    area += ((ys[i] + ys[i + 1]) / 2) * step;
  }
  return area;
}

describe('paretoFrontier', () => {
  it('returns empty for empty input', () => {
    expect(paretoFrontier([])).toEqual([]);
  });

  it('keeps only non-dominated points and sorts ascending x (higher-is-better)', () => {
    const pts: Point2D[] = [
      { x: 10, y: 100 },
      { x: 20, y: 90 }, // dominated by (10,100)? no — x is higher
      { x: 5, y: 110 },
      { x: 15, y: 50 }, // dominated by (20,90)
      { x: 30, y: 60 },
    ];
    const f = paretoFrontier(pts);
    // non-dominated: (5,110), (10,100)?, (20,90), (30,60)
    // (10,100) dominated by (5,110)? (5,110) has lower x but higher y → not dominated
    // For "higher x AND higher y both better", (10,100) is dominated iff some point has
    // x > 10 AND y > 100. (20,90)? no. (30,60)? no. So (10,100) is on the frontier.
    expect(f.map((p) => p.x)).toEqual([5, 10, 20, 30]);
    expect(f.map((p) => p.y)).toEqual([110, 100, 90, 60]);
  });

  // For lower-is-better, a point dominates iff x > other.x AND y < other.y.
  // Frontier consists of points with no dominator.
  it('keeps only non-dominated points (lower-is-better)', () => {
    // Cost-like metric where less is better. Higher x is still better.
    const pts: Point2D[] = [
      { x: 5, y: 1 },
      { x: 10, y: 0.5 }, // dominates (5, 1.0)? x=10>5 AND y=0.5<1.0 → YES, dominates
      { x: 15, y: 0.8 }, // not dominated by (10, 0.5) since y=0.8 > 0.5; dominated by (20, 0.3)? yes
      { x: 20, y: 0.3 },
      { x: 25, y: 0.6 }, // dominated by (20, 0.3)? x=20<25 → no; dominator would need x>25 AND y<0.6
      { x: 30, y: 0.4 }, // dominates (25, 0.6)? x=30>25 AND y=0.4<0.6 → yes
    ];
    const f = paretoFrontier(pts, 'lower');
    // Walking: keep points where no other has x>p.x AND y<p.y.
    // (5,1.0): dominated by (10,0.5)? yes → drop
    // (10,0.5): dominated by (20,0.3)? x=20>10, y=0.3<0.5 → yes → drop
    // (15,0.8): dominated by (20,0.3)? yes → drop
    // (20,0.3): dominated? need x>20 AND y<0.3 — (30,0.4) no, (25,0.6) no → keep
    // (25,0.6): dominated by (30,0.4)? yes → drop
    // (30,0.4): dominated? need x>30 — none → keep
    expect(f.map((p) => p.x)).toEqual([20, 30]);
    expect(f.map((p) => p.y)).toEqual([0.3, 0.4]);
  });
});

describe('interpAlongFrontier', () => {
  const f: Point2D[] = [
    { x: 10, y: 100 },
    { x: 20, y: 200 },
    { x: 50, y: 350 },
  ];

  it('returns null outside range', () => {
    expect(interpAlongFrontier(f, 5)).toBeNull();
    expect(interpAlongFrontier(f, 100)).toBeNull();
  });

  it('returns exact value at vertices', () => {
    expect(interpAlongFrontier(f, 10)).toBe(100);
    expect(interpAlongFrontier(f, 20)).toBe(200);
    expect(interpAlongFrontier(f, 50)).toBe(350);
  });

  it('linearly interpolates between vertices', () => {
    // midpoint of (10,100)-(20,200) → 15, 150
    expect(interpAlongFrontier(f, 15)).toBeCloseTo(150, 9);
    // 1/3 of the way (20→50, 0→1/3) at x=30 → y = 200 + (30-20)/(50-20) * (350-200) = 200 + 50 = 250
    expect(interpAlongFrontier(f, 30)).toBeCloseTo(250, 9);
  });

  it('linearly interpolates the same way for lower-is-better frontiers', () => {
    // Direction only affects which y wins at duplicate-x ties; here all x's
    // are unique so the result is identical.
    const lf: Point2D[] = [
      { x: 10, y: 1 },
      { x: 20, y: 0.5 },
      { x: 50, y: 0.2 },
    ];
    expect(interpAlongFrontier(lf, 15, 'lower')).toBeCloseTo(0.75, 9);
    expect(interpAlongFrontier(lf, 50, 'lower')).toBe(0.2);
  });
});

describe('aucUnderFrontier', () => {
  it('integrates a trivial triangle exactly', () => {
    // frontier y=x from x=0..10, AUC over [0,10] = 50
    const f = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(aucUnderFrontier(f, 0, 10)).toBeCloseTo(50, 9);
  });

  it('zeros the integrand outside the frontier x-range (higher-better)', () => {
    // frontier only covers x in [10, 20], integrate [0, 30]
    const f = [
      { x: 10, y: 5 },
      { x: 20, y: 5 },
    ];
    // y=5 over x in [10,20] → AUC = 50. Outside that range y treated as 0.
    expect(aucUnderFrontier(f, 0, 30)).toBeCloseTo(50, 9);
  });

  it('returns 0 when integration window is outside the frontier', () => {
    const f = [
      { x: 10, y: 5 },
      { x: 20, y: 5 },
    ];
    expect(aucUnderFrontier(f, 30, 40)).toBe(0);
  });

  // For lower-is-better: integrate only over the reachable x-range. The
  // result is identical to higher-better when the requested [lo, hi] is a
  // strict subset of [minX, maxX] (no zero-pad region in either case), and
  // differs only when the requested window extends beyond the frontier.
  it('lower-better integrates only over reachable range', () => {
    // frontier covers x in [10, 20] with constant y=2
    const f = [
      { x: 10, y: 2 },
      { x: 20, y: 2 },
    ];
    // Integrate the whole range — should give 20 (y=2 × span=10).
    expect(aucUnderFrontier(f, 10, 20, 'lower')).toBeCloseTo(20, 9);
    // Higher-better with window beyond range: zero-pads → still 20.
    expect(aucUnderFrontier(f, 0, 30, 'higher')).toBeCloseTo(20, 9);
    // Lower-better with the same window: clips to reachable [10, 20] → 20 too.
    expect(aucUnderFrontier(f, 0, 30, 'lower')).toBeCloseTo(20, 9);
  });

  it('lower-better AUC matches reachable-only window, not zero-padded', () => {
    // Non-flat lower-better frontier: cost falls then rises.
    const f = [
      { x: 10, y: 1 },
      { x: 20, y: 0.5 },
      { x: 30, y: 0.4 },
    ];
    // Requested [0, 50]: lower-better should clip to [10, 30].
    // Trapezoid (10→20): (1.0+0.5)/2 * 10 = 7.5
    // Trapezoid (20→30): (0.5+0.4)/2 * 10 = 4.5
    // Total: 12
    expect(aucUnderFrontier(f, 0, 50, 'lower')).toBeCloseTo(12, 9);

    // Higher-better with same window would zero-pad [0,10] and [30,50],
    // adding 0 contribution there, so total is also 12 — but the SEMANTICS
    // differ. Verify by changing a range where higher-better differs:
    // Pretend the frontier extends y outwards by adding 0-pad ranges:
    // For higher-better, [0,50] integrates the same 12 (zero outside).
    expect(aucUnderFrontier(f, 0, 50, 'higher')).toBeCloseTo(12, 9);
  });
});

describe('aucWindow', () => {
  const f: Point2D[] = [
    { x: 10, y: 5 },
    { x: 30, y: 8 },
  ];

  it('returns the requested window for higher-better', () => {
    expect(aucWindow(f, 0, 50, 'higher')).toEqual({ lo: 0, hi: 50 });
  });

  it('clips to reachable range for lower-better', () => {
    expect(aucWindow(f, 0, 50, 'lower')).toEqual({ lo: 10, hi: 30 });
    expect(aucWindow(f, 15, 25, 'lower')).toEqual({ lo: 15, hi: 25 });
  });

  it('returns null when reachable window is empty', () => {
    expect(aucWindow(f, 40, 50, 'lower')).toBeNull();
  });
});

// Sanity-check the full pipeline (pareto → AUC) on the spec's 8-config
// sample dataset (FP4 DeepSeek V4 Pro, 8K/1K, TP=8) using the production
// integration window: [10, floor(globalMax / 10) * 10].
//
// We re-derive the expected AUC for each config from first principles —
// independent trapezoidal integration over the same Pareto frontier — and
// assert that aucUnderFrontier matches. Hard-coding numeric expectations
// would bake in whichever upper bound the test was written against; this
// way the test continues to be a meaningful sanity check if the window
// rule changes again.
describe('matches independent trapezoidal AUCs on spec sample data', () => {
  const allXs = (Object.values(eightConfigData) as RawPoint[][]).flatMap((rows) =>
    rows.map((r) => r.Interactivity_tok_s_user),
  );
  const globalMax = Math.max(...allXs);
  const upperBound = Math.floor(globalMax / 10) * 10;
  const window: [number, number] = [10, upperBound];

  const names = Object.keys(eightConfigData as Record<string, RawPoint[]>);
  for (const name of names) {
    it(`${name} matches independent reference (higher-better)`, () => {
      const raw = (eightConfigData as Record<string, RawPoint[]>)[name];
      expect(raw, `fixture missing ${name}`).toBeTruthy();
      const f = paretoFrontier(toPoints(raw));
      const auc = aucUnderFrontier(f, window[0], window[1]);
      const expected = referenceAuc(f, window[0], window[1]);
      // Both methods are trapezoidal on the same piecewise-linear function;
      // they should agree to within tiny floating-point drift.
      expect(Math.abs(auc - expected) / Math.max(expected, 1)).toBeLessThan(0.001);
    });
  }
});

// Synthetic lower-is-better fixture — cost-per-token style metric across
// three configs. Verifies the direction-aware path end-to-end:
// pareto → interp → AUC and the window clipping.
describe('lower-is-better integration (synthetic cost fixture)', () => {
  // Treat y as $/M tokens (lower = better). x is interactivity.
  const configs: Record<string, Point2D[]> = {
    // "Cheap-fast": low cost, broad interactivity range — should dominate.
    cheap: [
      { x: 10, y: 0.5 },
      { x: 25, y: 0.4 },
      { x: 50, y: 0.6 },
      { x: 80, y: 1.2 },
    ],
    // "Expensive-slow": consistently higher cost, narrower range.
    expensive: [
      { x: 15, y: 1.5 },
      { x: 30, y: 1.2 },
      { x: 45, y: 1 },
      { x: 60, y: 1.3 },
    ],
    // "Niche": only reaches very high interactivity. Cost dips then rises so
    // the lower-better frontier keeps multiple points.
    niche: [
      { x: 60, y: 0.9 },
      { x: 80, y: 0.5 },
      { x: 100, y: 0.7 },
    ],
  };

  it('pareto frontiers prune dominated points correctly', () => {
    const cheap = paretoFrontier(configs.cheap, 'lower');
    // For 'cheap': dominator needs x>p.x AND y<p.y.
    // (10,0.5): need x>10, y<0.5. (25,0.4) qualifies → drop (10,0.5)? Yes.
    // (25,0.4): need x>25 AND y<0.4. (50,0.6) no, (80,1.2) no → keep
    // (50,0.6): need x>50 AND y<0.6. (80,1.2) no → keep
    // (80,1.2): need x>80 — none → keep
    expect(cheap.map((p) => p.x)).toEqual([25, 50, 80]);

    const expensive = paretoFrontier(configs.expensive, 'lower');
    // (15,1.5): (30,1.2) dominates → drop
    // (30,1.2): (45,1.0) dominates → drop
    // (45,1.0): need x>45, y<1.0 — (60,1.3) no → keep
    // (60,1.3): keep
    expect(expensive.map((p) => p.x)).toEqual([45, 60]);
  });

  it('AUC is restricted to reachable window for each config', () => {
    const cheap = paretoFrontier(configs.cheap, 'lower');
    const niche = paretoFrontier(configs.niche, 'lower');

    // For cheap, reachable x: [25, 80]. Common window [10, 100] clips.
    const cheapWin = aucWindow(cheap, 10, 100, 'lower');
    expect(cheapWin).toEqual({ lo: 25, hi: 80 });

    // For niche, the lower-better frontier prunes the (60, 0.9) point
    // (dominated by (80, 0.5)). Reachable x range becomes [80, 100].
    const nicheWin = aucWindow(niche, 10, 100, 'lower');
    expect(nicheWin).toEqual({ lo: 80, hi: 100 });

    // AUCs:
    // cheap: (25,0.4)→(50,0.6)→(80,1.2). Trapezoids:
    //   25→50: (0.4+0.6)/2*25 = 12.5
    //   50→80: (0.6+1.2)/2*30 = 27
    //   total = 39.5
    expect(aucUnderFrontier(cheap, 10, 100, 'lower')).toBeCloseTo(39.5, 6);

    // niche frontier: (80,0.5)→(100,0.7). Trapezoid (80→100):
    //   (0.5+0.7)/2 * 20 = 12
    expect(aucUnderFrontier(niche, 10, 100, 'lower')).toBeCloseTo(12, 6);
  });

  it('interpolation respects lower-better best at duplicate x', () => {
    // Construct a frontier with duplicate x to verify min vs max selection.
    const f: Point2D[] = [
      { x: 10, y: 1 },
      { x: 20, y: 0.5 },
      { x: 20, y: 0.7 }, // wouldn't naturally appear post-frontier, but the
      // helper should still return the better (min) y for lower-better.
    ];
    // For lower direction at duplicate x, prefer min y.
    expect(interpAlongFrontier(f, 20, 'lower')).toBe(0.5);
    // For higher direction, prefer max y.
    expect(interpAlongFrontier(f, 20, 'higher')).toBe(0.7);
  });
});
