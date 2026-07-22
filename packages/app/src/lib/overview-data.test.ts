import { describe, expect, it } from 'vitest';

import overviewRowsFixture from '../../cypress/fixtures/api/overview-rows.json';

import type { BenchmarkRow } from './api';
import { getHardwareConfig } from './constants';
import { DEFAULT_MODELS, Model, Precision } from './data-mappings';
import { overviewConfigIdentityKey } from './overview-config-identity';
import {
  assembleOverviewPageData,
  buildOverviewHardwareOrder,
  buildOverviewModelSummary,
  overviewPrimaryValue,
  selectOverviewPrecision,
  type OverviewModelSummary,
} from './overview-data';

let nextId = 1;

function row(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: nextId++,
    hardware: 'b200',
    framework: 'sglang',
    model: 'qwen3.5',
    precision: 'fp8',
    spec_method: 'mtp',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 16,
    offload_mode: 'off',
    image: null,
    metrics: { median_intvty: 50, output_tput_per_gpu: 1000 },
    date: '2026-07-20',
    run_url: null,
    ...overrides,
  };
}

/** One frontier point per tier for a single configuration. */
function frontier(
  throughputs: [number, number, number, number],
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow[] {
  return [30, 50, 75, 100].map((tier, index) =>
    row({
      conc: index + 1,
      metrics: { median_intvty: tier, output_tput_per_gpu: throughputs[index] },
      ...overrides,
    }),
  );
}

/** Frontier at explicit [interactivity, throughput] knots — for clamped/unreachable tiers. */
function frontierAt(
  points: [number, number][],
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow[] {
  return points.map(([intvty, tput], index) =>
    row({
      conc: index + 1,
      metrics: { median_intvty: intvty, output_tput_per_gpu: tput },
      ...overrides,
    }),
  );
}

/** One config's frontier at explicit [interactivity, throughput, date] knots. */
function datedFrontier(
  knots: [number, number, string][],
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow[] {
  return knots.map(([intvty, tput, date], index) =>
    row({
      conc: index + 1,
      metrics: { median_intvty: intvty, output_tput_per_gpu: tput },
      date,
      ...overrides,
    }),
  );
}

function statusOf(summary: OverviewModelSummary, hardware: string) {
  return summary.hardwareStatuses.find((status) => status.hardware === hardware);
}

/**
 * Leader of the model's first comparable cohort. Leadership only ever exists
 * inside a cohort, so every ranking assertion reads it from there — there is no
 * model-global winner to compare across engine families or deployment modes.
 */
function primaryLeaderOf(summary: OverviewModelSummary) {
  return summary.comparisonGroups[0]?.primaryRanking.leader ?? null;
}

describe('selectOverviewPrecision', () => {
  it('returns null without any FP4/FP8 rows', () => {
    expect(selectOverviewPrecision(Model.Qwen3_5, [row({ precision: Precision.BF16 })])).toBeNull();
    expect(selectOverviewPrecision(Model.Qwen3_5, [row({ precision: Precision.INT4 })])).toBeNull();
  });

  it('ignores standard-decode rows when counting exact-@50 coverage', () => {
    // FP8 has the most curves but every one is standard decode; FP4's single
    // speculative curve is the only exact-@50 coverage, so it wins outnumbered.
    const rows = [
      ...frontier([1200, 1000, 800, 600], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'gb200',
        precision: Precision.FP8,
        spec_method: 'none',
      }),
      ...frontier([1000, 800, 600, 400], {
        hardware: 'gb300',
        precision: Precision.FP8,
        spec_method: 'none',
      }),
    ];

    expect(selectOverviewPrecision(Model.Qwen3_5, rows)).toBe(Precision.FP4);
  });
});

describe('buildOverviewModelSummary', () => {
  it('keeps Kimi point releases as separate exact results, never one blended frontier', () => {
    // kimik2.5 and kimik2.7-code both map to Model.Kimi_K2_5. Otherwise
    // identical (same hardware/date/config), a model-blind key would merge them
    // into one frontier — kimik2.5's 100 tok/s/user point would make the winner
    // reachable there. Exact identity keeps kimik2.7-code's frontier pure.
    const summary = buildOverviewModelSummary(Model.Kimi_K2_5, [
      row({
        model: 'kimik2.7-code',
        conc: 1,
        metrics: { median_intvty: 30, output_tput_per_gpu: 1200 },
      }),
      row({
        model: 'kimik2.7-code',
        conc: 2,
        metrics: { median_intvty: 50, output_tput_per_gpu: 1000 },
      }),
      row({
        model: 'kimik2.7-code',
        conc: 3,
        metrics: { median_intvty: 75, output_tput_per_gpu: 800 },
      }),
      row({ model: 'kimik2.5', conc: 4, metrics: { median_intvty: 50, output_tput_per_gpu: 400 } }),
      row({
        model: 'kimik2.5',
        conc: 5,
        metrics: { median_intvty: 100, output_tput_per_gpu: 700 },
      }),
    ]);

    const leader = primaryLeaderOf(summary);

    expect(leader?.dbModel).toBe('kimik2.7-code');
    expect(overviewPrimaryValue(leader!)).toBe(1000);
    expect(leader?.tierValues.find(({ tier }) => tier === 100)).toEqual({
      tier: 100,
      value: null,
      boundary: 'unreachable',
      evidenceDate: null,
    });
  });

  it('splits cohorts by db model so point releases never rank against each other', () => {
    // Same hardware, engine group and deployment mode; only the db model
    // differs, so the two point releases must land in separate cohorts.
    const summary = buildOverviewModelSummary(Model.Kimi_K2_5, [
      ...frontier([1200, 1000, 800, 600], { model: 'kimik2.5' }),
      ...frontier([1100, 900, 700, 500], { model: 'kimik2.7-code' }),
    ]);

    expect(summary.comparisonGroups.map((group) => group.dbModel).toSorted()).toEqual([
      'kimik2.5',
      'kimik2.7-code',
    ]);
  });

  it('never compares incompatible DeepSeek MTP engine families', () => {
    const summary = buildOverviewModelSummary(Model.DeepSeek_V4_Pro, [
      ...frontier([1200, 1000, 800, 600], { framework: 'dynamo-trt' }),
      ...frontier([1100, 900, 700, 500], { framework: 'mori-sglang' }),
    ]);

    expect(summary.comparisonGroups.map(({ engineGroup }) => engineGroup).toSorted()).toEqual([
      'sglang',
      'trt',
    ]);
    expect(summary.comparisonGroups.every((group) => group.primaryRanking.runnerUp === null)).toBe(
      true,
    );
  });

  it('keeps aggregate and disaggregate denominators in separate cohorts', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { disagg: false }),
      ...frontier([1800, 1500, 1200, 900], {
        hardware: 'gb200',
        disagg: true,
        is_multinode: true,
      }),
    ]);
    expect(summary.comparisonGroups.map(({ deploymentMode }) => deploymentMode).toSorted()).toEqual(
      ['aggregated', 'disaggregated'],
    );
  });

  it('counts aggregated GPUs as one pool and disaggregated as prefill + decode', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { num_prefill_gpu: 4, num_decode_gpu: 4 }),
      ...frontier([1800, 1500, 1200, 900], {
        hardware: 'gb200',
        disagg: true,
        is_multinode: true,
        num_prefill_gpu: 16,
        num_decode_gpu: 16,
      }),
    ]);
    const leaderFor = (mode: string) =>
      summary.comparisonGroups.find((group) => group.deploymentMode === mode)?.primaryRanking
        .leader;

    expect(leaderFor('aggregated')?.totalGpu).toBe(4);
    expect(leaderFor('disaggregated')?.totalGpu).toBe(32);
  });

  it('ranks 50 and 100 independently across hardware with a real gap', () => {
    // b200 leads 50 (1000 vs 800) but bottoms out at 100 (300), where gb200's
    // shallower curve (400) takes over — two exact reads, so the gap is real.
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 300], { hardware: 'b200' }),
      ...frontier([1100, 800, 600, 400], { hardware: 'gb200' }),
    ]);
    const [group] = summary.comparisonGroups;
    const expectedHighConfigKey = overviewConfigIdentityKey(row({ hardware: 'gb200' }));

    expect(group.primaryRanking.state).toBe('comparable');
    expect(group.primaryRanking.leader?.hardware).toBe('b200');
    expect(group.primaryRanking.runnerUp?.hardware).toBe('gb200');
    expect(group.primaryRanking.gapPercent).toBeCloseTo((1000 / 800 - 1) * 100);
    expect(group.highRanking.leader?.key).toBe(expectedHighConfigKey);
    expect(group.highRanking.leader?.hardware).toBe('gb200');
    expect(group.highLeaderTransition).toBe('changed_hardware');
  });

  it('picks the best per-hardware config independently at each tier', () => {
    // On b200, sglang wins 50 (1000 > 700) while dynamo-trt wins 100 (400 > 200).
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 200], { framework: 'sglang' }),
      ...frontier([1100, 700, 500, 400], { framework: 'dynamo-trt' }),
    ]);
    const [group] = summary.comparisonGroups;

    expect(group.primaryRanking.leader).toMatchObject({ hardware: 'b200', framework: 'sglang' });
    expect(group.highRanking.leader).toMatchObject({ hardware: 'b200', framework: 'dynamo-trt' });
    expect(group.highLeaderTransition).toBe('same_hardware');
  });

  it('reports no_primary_baseline when 50 has no exact read but 100 does', () => {
    // Frontier floor at 60 tok/s/user: tier 50 is clamped_low (no exact read),
    // so the primary tier has no leader, while tier 100 sits inside [60, 110]
    // and interpolates — a high leader with no primary baseline to compare to.
    // FP4 rows so this insufficient-coverage precision is the primary (0-0 exact
    // tie → FP4); the transition mechanics under test are precision-agnostic.
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontierAt(
        [
          [60, 900],
          [75, 800],
          [90, 700],
          [110, 600],
        ],
        { precision: Precision.FP4 },
      ),
    ]);
    const [group] = summary.comparisonGroups;

    expect(group.primaryRanking.state).toBe('insufficient_coverage');
    expect(group.highLeaderTransition).toBe('no_primary_baseline');
  });

  it('never lets clamped or unreachable reads lead or form a gap at a tier', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      // Frontier floor at 60 tok/s/user → 50 read is clamped_low.
      ...frontierAt(
        [
          [60, 900],
          [70, 800],
          [80, 700],
          [90, 600],
        ],
        { hardware: 'b300', precision: Precision.FP4 },
      ),
      // Frontier ceiling at 35 tok/s/user → 50 read is unreachable.
      ...frontierAt(
        [
          [20, 500],
          [25, 450],
          [30, 400],
          [35, 350],
        ],
        { hardware: 'b200', precision: Precision.FP4 },
      ),
    ]);
    const [group] = summary.comparisonGroups;

    expect(group.primaryRanking.state).toBe('insufficient_coverage');
    expect(group.primaryRanking.gapPercent).toBeNull();
    expect(group.primaryRanking.leader).toBeNull();
    expect(group.hardwareStatuses.find((s) => s.hardware === 'b300')?.primary.boundary).toBe(
      'clamped_low',
    );
  });

  it('lets a lower exact read outrank a higher clamped one', () => {
    // b300's clamped 900 is its frontier floor, not a 50 tok/s/user result, so
    // gb200's real 500 leads and no gap is claimed against unmeasured coverage.
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontierAt(
        [
          [60, 900],
          [70, 800],
          [80, 700],
          [90, 600],
        ],
        { hardware: 'b300' },
      ),
      ...frontier([700, 500, 400, 300], { hardware: 'gb200' }),
    ]);
    const [group] = summary.comparisonGroups;

    expect(group.primaryRanking.leader?.hardware).toBe('gb200');
    expect(group.primaryRanking.state).toBe('single_measured');
    expect(group.primaryRanking.gapPercent).toBeNull();
    expect(group.hardwareStatuses.find((s) => s.hardware === 'b300')?.primary).toMatchObject({
      value: 900,
      boundary: 'clamped_low',
    });
  });

  it('dates a model by its newest workload row, and null when it has none', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { date: '2026-07-01' }),
      ...frontier([1100, 900, 700, 500], { hardware: 'gb200', date: '2026-07-15' }),
    ]);

    expect(summary.latestWorkloadDate).toBe('2026-07-15');
    expect(buildOverviewModelSummary(Model.Qwen3_5, []).latestWorkloadDate).toBeNull();
  });
});

describe('overview precision selection and secondary', () => {
  it('makes the wider exact-@50 coverage the primary precision', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([1100, 900, 700, 500], { hardware: 'gb200', precision: Precision.FP8 }),
      ...frontier([1000, 800, 600, 400], { hardware: 'gb300', precision: Precision.FP8 }),
    ]);

    expect(summary.selectedPrecision).toBe(Precision.FP8);
  });

  it('breaks an exact-@50 coverage tie toward FP4', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([1100, 900, 700, 500], { hardware: 'gb200', precision: Precision.FP8 }),
    ]);

    expect(summary.selectedPrecision).toBe(Precision.FP4);
  });

  it('ranks each precision within itself, never across FP4 and FP8', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { hardware: 'b300', precision: Precision.FP4 }),
      ...frontier([1100, 900, 700, 500], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([1000, 800, 600, 400], { hardware: 'gb200', precision: Precision.FP8 }),
    ]);

    // The FP4 cohort ranks only its own two hardware; the FP8 platform is the
    // secondary precision, never a cross-precision delta in the primary cohort.
    expect(summary.comparisonGroups[0].hardwareStatuses.map((s) => s.hardware).toSorted()).toEqual([
      'b200',
      'b300',
    ]);
    expect(summary.secondary?.precision).toBe(Precision.FP8);
  });

  it('keeps FP8 visible as secondary coverage when FP4 is primary', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { hardware: 'b300', precision: Precision.FP4 }),
      ...frontier([1100, 900, 700, 500], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([1000, 800, 600, 400], { hardware: 'h200', precision: Precision.FP8 }),
    ]);

    expect(summary.selectedPrecision).toBe(Precision.FP4);
    expect(summary.secondary?.state).toBe('coverage');
    expect(summary.secondary?.measuredHardware).toContain(getHardwareConfig('h200').label);
  });

  it('opens secondary rows only when FP8 ranks a pair on hardware FP4 lacks', () => {
    const ranked = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { hardware: 'b300', precision: Precision.FP4 }),
      ...frontier([1150, 950, 750, 550], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([1100, 900, 700, 500], { hardware: 'gb300', precision: Precision.FP4 }),
      ...frontier([1000, 800, 600, 400], { hardware: 'gb200', precision: Precision.FP8 }),
      ...frontier([980, 780, 580, 380], { hardware: 'mi355x', precision: Precision.FP8 }),
    ]);
    // FP4 leads on three hardware; FP8 ranks a comparable pair on two it lacks.
    expect(ranked.selectedPrecision).toBe(Precision.FP4);
    expect(ranked.secondary?.state).toBe('ranked');

    const covered = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { hardware: 'gb200', precision: Precision.FP4 }),
      ...frontier([1150, 950, 750, 550], { hardware: 'mi355x', precision: Precision.FP4 }),
      ...frontier([900, 850, 650, 450], { hardware: 'gb200', precision: Precision.FP8 }),
      ...frontier([880, 820, 620, 420], { hardware: 'mi355x', precision: Precision.FP8 }),
    ]);
    // Same FP8 pair, but both hardware already rank in FP4 → no new coverage.
    expect(covered.secondary?.state).toBe('coverage');
  });
});

describe('overview not-ranked reasons', () => {
  it('accounts for every page hardware with an exact value or one reason', () => {
    const model = [
      ...frontier([1200, 1000, 800, 600], { hardware: 'b300', precision: Precision.FP4 }),
      ...frontier([1100, 900, 700, 500], { hardware: 'b200', precision: Precision.FP4 }),
      // gb200 measured at the primary precision, but standard decode only.
      ...frontier([1000, 800, 600, 400], {
        hardware: 'gb200',
        precision: Precision.FP4,
        spec_method: 'none',
      }),
    ];
    // mi355x reaches the page order only because another model measured it.
    const other = frontier([900, 800, 700, 600], { hardware: 'mi355x', precision: Precision.FP4 });
    const order = buildOverviewHardwareOrder([...model, ...other]);
    const summary = buildOverviewModelSummary(Model.Qwen3_5, model, order);

    // b300/b200 rank (exact @50) and are absent; gb200 and mi355x each get one.
    expect(summary.notRanked.map((entry) => [entry.hardware, entry.reason])).toEqual([
      ['gb200', 'standard_decode_only'],
      ['mi355x', 'no_8k1k_data'],
    ]);
  });

  it('separates a frontier that tops out below 50 from a missing @50 read', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      // b200 frontier ceiling at 45 tok/s/user → @50 unreachable.
      ...frontierAt(
        [
          [20, 500],
          [30, 450],
          [40, 400],
          [45, 350],
        ],
        { hardware: 'b200', precision: Precision.FP4 },
      ),
      // b300 frontier floor at 60 tok/s/user → @50 clamped_low, not unreachable.
      ...frontierAt(
        [
          [60, 900],
          [70, 800],
          [80, 700],
          [90, 600],
        ],
        { hardware: 'b300', precision: Precision.FP4 },
      ),
    ]);
    const reasonOf = (hardware: string) =>
      summary.notRanked.find((entry) => entry.hardware === hardware)?.reason;

    expect(reasonOf('b200')).toBe('cannot_reach_at50');
    expect(reasonOf('b300')).toBe('no_exact_at50');
  });
});

describe('overview result-level evidence dates', () => {
  it('dates each read from its own config frontier, never a sibling', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...datedFrontier(
        [
          [40, 1100, '2026-07-10'],
          [60, 900, '2026-07-10'],
        ],
        { hardware: 'b300', precision: Precision.FP4 },
      ),
      ...datedFrontier(
        [
          [40, 900, '2026-07-16'],
          [60, 700, '2026-07-16'],
        ],
        { hardware: 'b200', precision: Precision.FP4 },
      ),
    ]);

    expect(statusOf(summary, 'b300')?.primary.evidenceDate).toEqual({
      from: '2026-07-10',
      to: '2026-07-10',
    });
    expect(statusOf(summary, 'b200')?.primary.evidenceDate).toEqual({
      from: '2026-07-16',
      to: '2026-07-16',
    });
  });

  it('collapses a same-day bracket and spans a cross-day one', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...datedFrontier(
        [
          [40, 1100, '2026-07-10'],
          [60, 900, '2026-07-10'],
        ],
        { hardware: 'b300', precision: Precision.FP4 },
      ),
      ...datedFrontier(
        [
          [40, 900, '2026-06-24'],
          [60, 700, '2026-07-04'],
        ],
        { hardware: 'b200', precision: Precision.FP4 },
      ),
    ]);

    expect(statusOf(summary, 'b300')?.primary.evidenceDate).toEqual({
      from: '2026-07-10',
      to: '2026-07-10',
    });
    expect(statusOf(summary, 'b200')?.primary.evidenceDate).toEqual({
      from: '2026-06-24',
      to: '2026-07-04',
    });
  });

  it('ignores a hidden slower config even when it is newer', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...datedFrontier(
        [
          [40, 1100, '2026-07-10'],
          [60, 900, '2026-07-10'],
        ],
        { hardware: 'b300', precision: Precision.FP4, framework: 'sglang' },
      ),
      // Slower same-hardware config, newer runs — never backs the visible read.
      ...datedFrontier(
        [
          [40, 700, '2026-07-20'],
          [60, 500, '2026-07-20'],
        ],
        { hardware: 'b300', precision: Precision.FP4, framework: 'dynamo-trt' },
      ),
    ]);

    expect(statusOf(summary, 'b300')?.primary.evidenceDate).toEqual({
      from: '2026-07-10',
      to: '2026-07-10',
    });
  });

  it('dates @50 and @100 from their own bracketing knots', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...datedFrontier(
        [
          [40, 1200, '2026-07-01'],
          [60, 1000, '2026-07-01'],
          [90, 700, '2026-07-15'],
          [110, 500, '2026-07-15'],
        ],
        { hardware: 'b300', precision: Precision.FP4 },
      ),
    ]);
    const status = statusOf(summary, 'b300');

    expect(status?.primary.evidenceDate).toEqual({ from: '2026-07-01', to: '2026-07-01' });
    expect(status?.high.evidenceDate).toEqual({ from: '2026-07-15', to: '2026-07-15' });
  });
});

describe('overview hardware coverage', () => {
  it('holds hardware order fixed against input order and performance changes', () => {
    const expected = ['gb300', 'gb200', 'b300', 'b200', 'mi355x'];
    const build = (throughputs: number[], hardware: string[]) => {
      const rows = hardware.flatMap((hw, index) =>
        frontier(
          [
            throughputs[index] + 200,
            throughputs[index],
            throughputs[index] - 200,
            throughputs[index] - 400,
          ],
          { hardware: hw },
        ),
      );
      return buildOverviewModelSummary(Model.Qwen3_5, rows, buildOverviewHardwareOrder(rows));
    };

    // Same throughputs, hardware fed in the opposite order: the fastest platform
    // swaps from mi355x to gb300 while the display order must not move.
    const mi355xLeads = build([600, 700, 800, 900, 1000], expected);
    const gb300Leads = build([600, 700, 800, 900, 1000], [...expected].toReversed());

    expect(mi355xLeads.hardwareStatuses.map(({ hardware }) => hardware)).toEqual(expected);
    expect(gb300Leads.hardwareStatuses.map(({ hardware }) => hardware)).toEqual(expected);
    expect(primaryLeaderOf(mi355xLeads)).toMatchObject({ hardware: 'mi355x' });
    expect(primaryLeaderOf(gb300Leads)).toMatchObject({ hardware: 'gb300' });
    expect(gb300Leads.comparisonGroups[0].hardwareStatuses.map(({ hardware }) => hardware)).toEqual(
      expected,
    );
  });

  it('separates unsupported-precision coverage from hardware this model never ran', () => {
    // Kimi shape: FP4 standard decode on B200, INT4 only on H200. H200 and
    // MI355X reach the page order only because another model measured them.
    const kimi = [
      ...frontier([1200, 1000, 800, 600], {
        model: 'kimik2.5',
        hardware: 'b200',
        precision: Precision.FP4,
        spec_method: 'none',
      }),
      ...frontier([900, 800, 700, 600], {
        model: 'kimik2.5',
        hardware: 'h200',
        precision: Precision.INT4,
        spec_method: 'none',
      }),
    ];
    const otherModel = [
      ...frontier([900, 800, 700, 600], { hardware: 'mi355x', precision: Precision.FP4 }),
      ...frontier([700, 600, 500, 400], { hardware: 'h200', precision: Precision.FP8 }),
    ];
    const order = buildOverviewHardwareOrder([...kimi, ...otherModel]);
    const summary = buildOverviewModelSummary(Model.Kimi_K2_5, kimi, order);

    expect(order.map(({ hardware }) => hardware)).toEqual(['b200', 'mi355x', 'h200']);
    expect(summary.hardwareStatuses.map(({ hardware }) => hardware)).toEqual([
      'b200',
      'mi355x',
      'h200',
    ]);
    expect(statusOf(summary, 'b200')?.coverage.kind).toBe('standard_only');
    expect(statusOf(summary, 'h200')?.coverage).toMatchObject({
      kind: 'unsupported_precision_only',
      availablePrecisions: [Precision.INT4],
    });
    expect(statusOf(summary, 'mi355x')?.coverage).toMatchObject({
      kind: 'no_workload_data',
      availablePrecisions: [],
    });
  });
});

// Drift guard for the synthetic overview e2e fixture: if the assembler contract
// changes, the hand-built rows in overview-rows.json must be regenerated, and
// this fails loudly instead of the e2e stranding empty data. Every expectation
// is derived by running this same assembler over the fixture — never eyeballed —
// so it locks the exact 8.7 states overview.cy.ts renders against.
describe('assembleOverviewPageData over the overview-rows fixture', () => {
  it('serves every 8.7 precision, coverage and evidence-date state through the real builder', () => {
    const page = assembleOverviewPageData(
      overviewRowsFixture as unknown as Record<string, BenchmarkRow[]>,
    );

    expect(page.models).toHaveLength(DEFAULT_MODELS.size);
    expect(page.datasetThroughDate).toBe('2026-07-18');
    expect(page.hardwareOrder.map((entry) => entry.hardware)).toEqual([
      'gb300',
      'gb200',
      'b300',
      'b200',
      'mi355x',
      'h200',
      'mi325x',
      'h100',
    ]);

    // DeepSeek: FP4 primary ranks B300 over B200; FP8 stays visible as one
    // coverage line (single measured hardware, not a second table); every other
    // page hardware carries exactly one not-ranked reason, including BOTH clamp
    // directions; and the leader's @50 read spans two calendar days — the only
    // cross-day evidence range in the fixture, so the e2e can exercise the range
    // label the current live dataset never produces.
    const deepseek = page.models.find((m) => m.model === Model.DeepSeek_V4_Pro);
    expect(deepseek?.selectedPrecision).toBe(Precision.FP4);
    const dsCohort = deepseek?.comparisonGroups[0];
    expect(dsCohort?.primaryRanking.state).toBe('comparable');
    expect(dsCohort?.primaryRanking.leader?.hardware).toBe('b300');
    expect(dsCohort?.highRanking.leader?.hardware).toBe('b200');
    expect(
      dsCohort?.hardwareStatuses.find((s) => s.hardware === 'b300')?.primary.evidenceDate,
    ).toEqual({ from: '2026-06-24', to: '2026-07-04' });
    expect(deepseek?.secondary?.state).toBe('coverage');
    expect(deepseek?.secondary?.precision).toBe(Precision.FP8);
    expect(deepseek?.secondary?.measuredHardware).toEqual(['GB200 NVL72']);
    expect(
      Object.fromEntries(
        (deepseek?.notRanked ?? []).map((entry) => [entry.hardware, entry.reason]),
      ),
    ).toMatchObject({
      gb300: 'cannot_reach_at50',
      mi355x: 'no_exact_at50',
      h100: 'standard_decode_only',
      gb200: 'other_precision_only',
      h200: 'no_8k1k_data',
    });

    // MiniMax: the wider exact-@50 FP8 coverage flips the primary precision to
    // FP8 (the coverage rule), dropping FP4 to a single-hardware coverage line.
    const minimax = page.models.find((m) => m.model === Model.MiniMax_M3);
    expect(minimax?.selectedPrecision).toBe(Precision.FP8);
    expect(minimax?.comparisonGroups[0]?.primaryRanking.leader?.hardware).toBe('h200');
    expect(minimax?.secondary?.state).toBe('coverage');
    expect(minimax?.secondary?.precision).toBe(Precision.FP4);
    expect(minimax?.secondary?.measuredHardware).toEqual(['H200']);

    // Qwen: FP4 primary, and FP8 secondary earns a FULL ranked block — it ranks a
    // comparable pair AND adds MI355X, hardware FP4 has no exact @50 read for.
    const qwen = page.models.find((m) => m.model === Model.Qwen3_5);
    expect(qwen?.selectedPrecision).toBe(Precision.FP4);
    expect(qwen?.secondary?.state).toBe('ranked');
    expect(qwen?.secondary?.precision).toBe(Precision.FP8);
    const qwenSecondaryCohort = qwen?.secondary?.comparisonGroups[0];
    expect(qwenSecondaryCohort?.primaryRanking.state).toBe('comparable');
    expect(qwenSecondaryCohort?.primaryRanking.leader?.hardware).toBe('b200');
    expect(qwen?.secondary?.measuredHardware).toEqual(['B200', 'MI355X']);
  });
});
