import { describe, expect, it } from 'vitest';

import {
  computeTcoFeed,
  computeTcoScores,
  DEFAULT_ALPHA,
  DEFAULT_TIER_WEIGHTS,
  DEFAULT_TIERS,
  DEFAULT_WORKLOADS,
  parseAlpha,
  parseTiers,
  parseTierWeights,
  parseWorkloads,
  parseWorkloadWeights,
  tcoFeedToCsv,
  tcoScoresToCsv,
  type TcoFeedRow,
  type TcoFeedSourceRow,
} from './tco-feed';

/** Build a single_turn source row: interactivity = 1/itl, output tput = otput. */
function makeRow(overrides: Partial<TcoFeedSourceRow> & { itl?: number; otput?: number } = {}) {
  const { itl = 0.02, otput = 500, ...rest } = overrides;
  return {
    hardware: 'gb200',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    metrics: { median_itl: itl, output_tput_per_gpu: otput },
    date: '2026-07-10',
    ...rest,
  };
}

const WORKLOAD_8K1K = [{ isl: 8192, osl: 1024 }];

/** Three-knot frontier: (iv 20 → 1000), (iv 50 → 400), (iv 100 → 100). */
function threeKnotRows(): TcoFeedSourceRow[] {
  return [
    makeRow({ itl: 1 / 20, otput: 1000 }),
    makeRow({ itl: 1 / 50, otput: 400 }),
    makeRow({ itl: 1 / 100, otput: 100 }),
  ];
}

function findRow(rows: TcoFeedRow[], hardware: string, workload: string, tier: number) {
  return rows.find((r) => r.hardware === hardware && r.workload === workload && r.tier === tier);
}

describe('computeTcoFeed — frontier reads', () => {
  it('returns exact values at frontier knots and interpolates between them', () => {
    const rows = computeTcoFeed(threeKnotRows(), WORKLOAD_8K1K, [20, 35, 50, 100]);
    expect(rows).toHaveLength(4);

    // Exact knots read exactly.
    expect(findRow(rows, 'gb200', '8192x1024', 20)?.output_tput_per_gpu).toBe(1000);
    expect(findRow(rows, 'gb200', '8192x1024', 50)?.output_tput_per_gpu).toBe(400);
    expect(findRow(rows, 'gb200', '8192x1024', 100)?.output_tput_per_gpu).toBe(100);

    // Between knots: strictly inside the neighboring knots' range.
    const mid = findRow(rows, 'gb200', '8192x1024', 35)!;
    expect(mid.boundary).toBe('interpolated');
    expect(mid.output_tput_per_gpu).toBeGreaterThan(400);
    expect(mid.output_tput_per_gpu).toBeLessThan(1000);
  });

  it('excludes Pareto-dominated points from the frontier and from provenance dates', () => {
    const rows = computeTcoFeed(
      [
        ...threeKnotRows(),
        // Dominated: iv 40 / 300 sits below the 20→1000 / 50→400 frontier —
        // and carries a NEWER date that must not leak into provenance.
        makeRow({ itl: 1 / 40, otput: 300, date: '2026-09-09' }),
      ],
      WORKLOAD_8K1K,
      [40],
    );
    const read = findRow(rows, 'gb200', '8192x1024', 40)!;
    expect(read.frontier_points).toBe(3);
    // Interpolates the 20→1000 / 50→400 segment, unaffected by the 300 point.
    expect(read.output_tput_per_gpu).toBeGreaterThan(400);
    expect(read.latest_date).toBe('2026-07-10');
  });

  it('builds the frontier as the envelope across configs of the same hardware', () => {
    const rows = computeTcoFeed(
      [
        makeRow({ itl: 1 / 50, otput: 400 }), // config A
        makeRow({ itl: 1 / 50, otput: 900 }), // config B dominates at the same iv
      ],
      WORKLOAD_8K1K,
      [50],
    );
    expect(findRow(rows, 'gb200', '8192x1024', 50)?.output_tput_per_gpu).toBe(900);
  });

  it('clamps below the sweep floor and zeroes above the capability ceiling', () => {
    // Frontier spans iv 40 → 80.
    const source = [makeRow({ itl: 1 / 40, otput: 800 }), makeRow({ itl: 1 / 80, otput: 200 })];
    const rows = computeTcoFeed(source, WORKLOAD_8K1K, [30, 60, 100]);

    const low = findRow(rows, 'gb200', '8192x1024', 30)!;
    expect(low.boundary).toBe('clamped_low');
    expect(low.output_tput_per_gpu).toBe(800); // min-iv knot = highest measured tput

    const mid = findRow(rows, 'gb200', '8192x1024', 60)!;
    expect(mid.boundary).toBe('interpolated');

    const high = findRow(rows, 'gb200', '8192x1024', 100)!;
    expect(high.boundary).toBe('unreachable');
    expect(high.output_tput_per_gpu).toBe(0);

    expect(low.frontier_min_interactivity).toBe(40);
    expect(low.frontier_max_interactivity).toBe(80);
  });

  it('uses stored median_intvty (chart parity), falling back to 1/median_itl', () => {
    const rows = computeTcoFeed(
      [
        // Stored intvty wins — it is what the chart plots for single_turn
        // rows — even when 1/median_itl disagrees (here itl implies iv 40).
        makeRow({
          metrics: { median_intvty: 50, median_itl: 1 / 40, output_tput_per_gpu: 600 },
        }),
        // Legacy row without intvty → derived from itl (iv 20, higher tput,
        // so it lands on the frontier as the low-iv knot).
        makeRow({ metrics: { median_itl: 1 / 20, output_tput_per_gpu: 900 } }),
        // Neither metric valid → row dropped.
        makeRow({ metrics: { output_tput_per_gpu: 5000 } }),
      ],
      WORKLOAD_8K1K,
      [20, 50],
    );
    expect(rows).toHaveLength(2);
    expect(findRow(rows, 'gb200', '8192x1024', 50)?.output_tput_per_gpu).toBe(600);
    expect(findRow(rows, 'gb200', '8192x1024', 20)?.output_tput_per_gpu).toBe(900);
    expect(rows[0].frontier_points).toBe(2);
  });

  it('treats rows without a benchmark_type (legacy fixtures) as single_turn', () => {
    const legacy = makeRow({ itl: 1 / 50, otput: 700 });
    delete (legacy as { benchmark_type?: string | null }).benchmark_type;
    const rows = computeTcoFeed([legacy], WORKLOAD_8K1K, [50]);
    expect(rows).toHaveLength(1);
    expect(rows[0].output_tput_per_gpu).toBe(700);
  });

  it('filters out agentic rows, other workloads, and invalid metrics', () => {
    const rows = computeTcoFeed(
      [
        makeRow({ itl: 1 / 50, otput: 400 }),
        makeRow({
          benchmark_type: 'agentic_traces',
          isl: null,
          osl: null,
          itl: 1 / 50,
          otput: 9000,
        }),
        makeRow({ isl: 1024, osl: 1024, itl: 1 / 50, otput: 9000 }), // different workload
        makeRow({ itl: 0, otput: 9000 }), // invalid itl
        makeRow({ itl: 1 / 50, otput: 0 }), // invalid tput
      ],
      WORKLOAD_8K1K,
      [50],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].output_tput_per_gpu).toBe(400);
  });

  it('tracks newest and oldest frontier-knot dates for freshness', () => {
    const rows = computeTcoFeed(
      [
        makeRow({ itl: 1 / 20, otput: 1000, date: '2026-04-25' }),
        makeRow({ itl: 1 / 80, otput: 300, date: '2026-07-12' }),
      ],
      WORKLOAD_8K1K,
      [50],
    );
    expect(rows[0].latest_date).toBe('2026-07-12');
    expect(rows[0].oldest_frontier_date).toBe('2026-04-25');
  });

  it("uses only an exact interior frontier knot's date as evidence", () => {
    const rows = computeTcoFeed(
      [
        makeRow({ itl: 1 / 20, otput: 1000, date: '2026-04-25' }),
        makeRow({ itl: 1 / 50, otput: 400, date: '2026-05-20' }),
        makeRow({ itl: 1 / 100, otput: 100, date: '2026-07-12' }),
      ],
      WORKLOAD_8K1K,
      [50],
    );

    expect(rows[0].evidence_date).toEqual({ from: '2026-05-20', to: '2026-05-20' });
  });

  it('uses both bracketing frontier-knot dates as evidence between knots', () => {
    const rows = computeTcoFeed(
      [
        makeRow({ itl: 1 / 20, otput: 1000, date: '2026-04-25' }),
        makeRow({ itl: 1 / 50, otput: 400, date: '2026-05-20' }),
        makeRow({ itl: 1 / 100, otput: 100, date: '2026-07-12' }),
      ],
      WORKLOAD_8K1K,
      [75],
    );

    expect(rows[0].evidence_date).toEqual({ from: '2026-05-20', to: '2026-07-12' });
  });

  it('groups by workload and hardware, sorted by hardware key', () => {
    const rows = computeTcoFeed(
      [
        makeRow({ hardware: 'gb300', itl: 1 / 50, otput: 5000 }),
        makeRow({ hardware: 'b200', itl: 1 / 50, otput: 500 }),
        makeRow({ hardware: 'b200', isl: 1024, osl: 1024, itl: 1 / 50, otput: 1300 }),
      ],
      [
        { isl: 1024, osl: 1024 },
        { isl: 8192, osl: 1024 },
      ],
      [50],
    );
    expect(rows.map((r) => `${r.hardware}:${r.workload}`)).toEqual([
      'b200:1024x1024',
      'b200:8192x1024',
      'gb300:8192x1024',
    ]);
    expect(findRow(rows, 'b200', '1024x1024', 50)?.output_tput_per_gpu).toBe(1300);
    expect(findRow(rows, 'gb300', '8192x1024', 50)?.output_tput_per_gpu).toBe(5000);
  });

  it('returns an empty feed for empty input', () => {
    expect(computeTcoFeed([], WORKLOAD_8K1K, [50])).toEqual([]);
  });
});

describe('parseTiers', () => {
  it('defaults when absent or blank', () => {
    expect(parseTiers(null)).toEqual([...DEFAULT_TIERS]);
    expect(parseTiers('  ')).toEqual([...DEFAULT_TIERS]);
  });

  it('parses valid lists including decimals and whitespace', () => {
    expect(parseTiers('30,50')).toEqual([30, 50]);
    expect(parseTiers(' 12.5 , 100 ')).toEqual([12.5, 100]);
  });

  it('rejects non-positive, non-numeric, oversized, and malformed entries', () => {
    expect(parseTiers('0,50')).toBeNull();
    expect(parseTiers('-5')).toBeNull();
    expect(parseTiers('abc')).toBeNull();
    expect(parseTiers('30,,50')).toBeNull();
    expect(parseTiers('10001')).toBeNull();
    expect(parseTiers(Array.from({ length: 21 }, (_, i) => String(i + 1)).join(','))).toBeNull();
  });

  it('rejects duplicate tiers (would double-count in the scores view)', () => {
    expect(parseTiers('50,50')).toBeNull();
    expect(parseTiers('50,50.0')).toBeNull(); // same numeric value
  });
});

describe('parseWorkloads', () => {
  it('defaults when absent or blank', () => {
    expect(parseWorkloads(null)).toEqual([...DEFAULT_WORKLOADS]);
    expect(parseWorkloads('')).toEqual([...DEFAULT_WORKLOADS]);
  });

  it('parses valid <isl>x<osl> lists', () => {
    expect(parseWorkloads('8192x1024')).toEqual([{ isl: 8192, osl: 1024 }]);
    expect(parseWorkloads('1024x1024, 8192x1024')).toEqual([
      { isl: 1024, osl: 1024 },
      { isl: 8192, osl: 1024 },
    ]);
  });

  it('rejects malformed pairs, zero lengths, and oversized lists', () => {
    expect(parseWorkloads('8192X1024')).toBeNull(); // uppercase separator
    expect(parseWorkloads('axb')).toBeNull();
    expect(parseWorkloads('0x1024')).toBeNull();
    expect(parseWorkloads('8192x')).toBeNull();
    expect(parseWorkloads(Array.from({ length: 9 }, () => '1024x1024').join(','))).toBeNull();
  });

  it('rejects duplicate workloads (would double-count in the scores view)', () => {
    expect(parseWorkloads('8192x1024,8192x1024')).toBeNull();
  });
});

describe('parseTierWeights', () => {
  it('defaults to the traffic-mix weights for the default tiers', () => {
    expect(parseTierWeights(null, DEFAULT_TIERS)).toEqual([...DEFAULT_TIER_WEIGHTS]);
    expect(parseTierWeights('  ', [30, 50, 75, 100])).toEqual([...DEFAULT_TIER_WEIGHTS]);
  });

  it('defaults to equal weights for custom tiers', () => {
    expect(parseTierWeights(null, [20, 60])).toEqual([0.5, 0.5]);
  });

  it('normalizes provided weights to sum 1', () => {
    expect(parseTierWeights('2,2,4,2', [30, 50, 75, 100])).toEqual([0.2, 0.2, 0.4, 0.2]);
  });

  it('rejects count mismatch, negatives, zero sums, and non-numbers', () => {
    expect(parseTierWeights('0.5,0.5', [30, 50, 75])).toBeNull();
    expect(parseTierWeights('-1,2', [30, 50])).toBeNull();
    expect(parseTierWeights('0,0', [30, 50])).toBeNull();
    expect(parseTierWeights('a,b', [30, 50])).toBeNull();
    expect(parseTierWeights('0.5,,0.5', [30, 50, 75])).toBeNull();
  });
});

describe('parseWorkloadWeights', () => {
  it('defaults to an equal split', () => {
    expect(parseWorkloadWeights(null, [...DEFAULT_WORKLOADS])).toEqual([0.5, 0.5]);
  });

  it('normalizes provided weights to sum 1', () => {
    expect(parseWorkloadWeights('3,1', [...DEFAULT_WORKLOADS])).toEqual([0.75, 0.25]);
  });

  it('rejects count mismatch, negatives, and zero sums', () => {
    expect(parseWorkloadWeights('1', [...DEFAULT_WORKLOADS])).toBeNull();
    expect(parseWorkloadWeights('1,-1', [...DEFAULT_WORKLOADS])).toBeNull();
    expect(parseWorkloadWeights('0,0', [...DEFAULT_WORKLOADS])).toBeNull();
  });
});

describe('parseAlpha', () => {
  it('defaults when absent or blank', () => {
    expect(parseAlpha(null)).toBe(DEFAULT_ALPHA);
    expect(parseAlpha(' ')).toBe(DEFAULT_ALPHA);
  });

  it('parses valid values including 0 (plain output throughput)', () => {
    expect(parseAlpha('0')).toBe(0);
    expect(parseAlpha('0.5')).toBe(0.5);
    expect(parseAlpha('10')).toBe(10);
  });

  it('rejects negatives, out-of-range, and non-numbers', () => {
    expect(parseAlpha('-0.1')).toBeNull();
    expect(parseAlpha('10.1')).toBeNull();
    expect(parseAlpha('abc')).toBeNull();
  });
});

describe('tcoFeedToCsv', () => {
  it('serializes header plus one line per row, newline-terminated', () => {
    const feed = computeTcoFeed(threeKnotRows(), WORKLOAD_8K1K, [50, 200]);
    const csv = tcoFeedToCsv(feed);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'hardware,workload,tier,output_tput_per_gpu,boundary,frontier_points,' +
        'frontier_min_interactivity,frontier_max_interactivity,latest_date,oldest_frontier_date',
    );
    expect(lines).toHaveLength(4); // header + 2 rows + trailing newline
    expect(lines[1]).toBe('gb200,8192x1024,50,400,interpolated,3,20,100,2026-07-10,2026-07-10');
    expect(lines[2]).toBe('gb200,8192x1024,200,0,unreachable,3,20,100,2026-07-10,2026-07-10');
    expect(csv.endsWith('\n')).toBe(true);
  });
});

const BOTH_WORKLOADS = [
  { isl: 1024, osl: 1024 },
  { isl: 8192, osl: 1024 },
];

/**
 * b200 covers both workloads (single-knot frontiers read exactly at tier
 * 50); gb300 covers only 8k1k.
 */
function twoWorkloadRows(): TcoFeedSourceRow[] {
  return [
    makeRow({
      hardware: 'b200',
      isl: 1024,
      osl: 1024,
      itl: 1 / 50,
      otput: 1000,
      date: '2026-05-01',
    }),
    makeRow({ hardware: 'b200', itl: 1 / 50, otput: 400, date: '2026-07-01' }),
    makeRow({ hardware: 'gb300', itl: 1 / 50, otput: 5000 }),
  ];
}

describe('computeTcoScores', () => {
  it('is exactly the weighted sum over the points view, times the output-equivalent factor', () => {
    // Knots at iv 20/50/100 read exactly at those tiers: 1000/400/100.
    const tiers = [20, 50, 100];
    const feed = computeTcoFeed(threeKnotRows(), WORKLOAD_8K1K, tiers);
    const scores = computeTcoScores(feed, WORKLOAD_8K1K, tiers, [0.5, 0.3, 0.2], [1], 0.25);
    expect(scores).toHaveLength(1);
    // 0.5·1000 + 0.3·400 + 0.2·100 = 640, ×(1 + 0.25·8192/1024) = ×3.
    expect(scores[0].workload_scores['8192x1024']).toBe(640);
    expect(scores[0].score).toBe(1920);
    // alpha=0 scores plain output throughput.
    const plain = computeTcoScores(feed, WORKLOAD_8K1K, tiers, [0.5, 0.3, 0.2], [1], 0);
    expect(plain[0].score).toBe(640);
  });

  it('unreachable tiers contribute 0 at full weight; clamped tiers contribute the clamp', () => {
    // Frontier spans iv 40 → 80.
    const source = [makeRow({ itl: 1 / 40, otput: 800 }), makeRow({ itl: 1 / 80, otput: 200 })];
    const tiers = [30, 40, 100];
    const feed = computeTcoFeed(source, WORKLOAD_8K1K, tiers);
    const scores = computeTcoScores(feed, WORKLOAD_8K1K, tiers, [0.25, 0.5, 0.25], [1], 0);
    // 0.25·800 (clamped) + 0.5·800 + 0.25·0 (unreachable) = 600 — the
    // unreachable tier's weight is NOT redistributed to reachable tiers.
    expect(scores[0].score).toBe(600);
    expect(scores[0].unreachable_tiers).toBe(1);
    expect(scores[0].clamped_tiers).toBe(1);
  });

  it('blends workloads and renormalizes over covered ones for partial coverage', () => {
    const feed = computeTcoFeed(twoWorkloadRows(), BOTH_WORKLOADS, [50]);
    const scores = computeTcoScores(feed, BOTH_WORKLOADS, [50], [1], [0.5, 0.5], 0);
    expect(scores.map((s) => s.hardware)).toEqual(['b200', 'gb300']);

    const b200 = scores[0];
    expect(b200.workload_scores).toEqual({ '1024x1024': 1000, '8192x1024': 400 });
    expect(b200.score).toBe(700); // 0.5·1000 + 0.5·400
    expect(b200.workloads_covered).toBe(2);

    // gb300 lacks 1k1k → its weight renormalizes onto 8k1k alone.
    const gb300 = scores[1];
    expect(gb300.workload_scores).toEqual({ '1024x1024': null, '8192x1024': 5000 });
    expect(gb300.score).toBe(5000);
    expect(gb300.workloads_covered).toBe(1);
  });

  it('applies per-workload output-equivalent factors before blending', () => {
    const feed = computeTcoFeed(twoWorkloadRows(), BOTH_WORKLOADS, [50]);
    const scores = computeTcoScores(feed, BOTH_WORKLOADS, [50], [1], [0.5, 0.5], 0.25);
    // 0.5·1000·(1 + 0.25·1) + 0.5·400·(1 + 0.25·8) = 625 + 600.
    expect(scores[0].score).toBe(1225);
  });

  it('scores 0 when the only covered workloads carry zero weight', () => {
    const feed = computeTcoFeed(twoWorkloadRows(), BOTH_WORKLOADS, [50]);
    const scores = computeTcoScores(feed, BOTH_WORKLOADS, [50], [1], [1, 0], 0);
    const gb300 = scores.find((s) => s.hardware === 'gb300')!;
    expect(gb300.score).toBe(0);
  });

  it('carries the newest latest_date and oldest frontier date across covered workloads', () => {
    const feed = computeTcoFeed(twoWorkloadRows(), BOTH_WORKLOADS, [50]);
    const scores = computeTcoScores(feed, BOTH_WORKLOADS, [50], [1], [0.5, 0.5], 0);
    expect(scores[0].latest_date).toBe('2026-07-01');
    expect(scores[0].oldest_frontier_date).toBe('2026-05-01');
  });

  it('returns an empty list for an empty feed', () => {
    expect(computeTcoScores([], BOTH_WORKLOADS, [50], [1], [0.5, 0.5], 0)).toEqual([]);
  });
});

describe('tcoScoresToCsv', () => {
  it('emits one score_<workload> column per requested workload, blank when uncovered', () => {
    const feed = computeTcoFeed(twoWorkloadRows(), BOTH_WORKLOADS, [50]);
    const scores = computeTcoScores(feed, BOTH_WORKLOADS, [50], [1], [0.5, 0.5], 0);
    const csv = tcoScoresToCsv(scores, BOTH_WORKLOADS);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'hardware,score,score_1024x1024,score_8192x1024,workloads_covered,' +
        'unreachable_tiers,clamped_tiers,latest_date,oldest_frontier_date',
    );
    expect(lines[1]).toBe('b200,700,1000,400,2,0,0,2026-07-01,2026-05-01');
    expect(lines[2]).toBe('gb300,5000,,5000,1,0,0,2026-07-10,2026-07-10');
    expect(csv.endsWith('\n')).toBe(true);
  });
});
