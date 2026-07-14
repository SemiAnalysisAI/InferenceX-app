import { describe, expect, it } from 'vitest';

import {
  computeTcoFeed,
  DEFAULT_TIERS,
  DEFAULT_WORKLOADS,
  parseTiers,
  parseWorkloads,
  tcoFeedToCsv,
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
