import { describe, expect, it } from 'vitest';

import overviewRowsFixture from '../../cypress/fixtures/api/overview-rows.json';

import type { BenchmarkRow } from './api';
import { DEFAULT_MODELS, Model, Precision } from './data-mappings';
import {
  assembleOverviewPageData,
  buildOverviewModelSummary,
  resolveOverviewTier,
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

function headlinePairOf(summary: OverviewModelSummary, id: string) {
  return summary.headlinePairs.find((pair) => pair.id === id);
}

describe('overview headline pairs', () => {
  it('keeps each side on its own best precision and withholds the delta on a mismatch', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], {
        hardware: 'mi355x',
        precision: Precision.FP4,
      }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'mi355x',
        precision: Precision.FP8,
      }),
      ...frontier([1000, 800, 600, 400], {
        hardware: 'b200',
        precision: Precision.FP8,
      }),
    ]);

    const pair = headlinePairOf(summary, 'mi355x-vs-b200');
    expect(pair?.candidate.read.value).toBe(1000);
    expect(pair?.candidate.precision).toBe(Precision.FP4);
    expect(pair?.baseline.read.value).toBe(800);
    expect(pair?.baseline.precision).toBe(Precision.FP8);
    expect(pair?.precision).toBeNull();
    expect(pair?.directDeltaPercent).toBeNull();
    expect(pair?.deltaUnavailableReason).toBe('precision_mismatch');
    expect(pair?.highLeaderTransition).toBeNull();
  });

  it('breaks equal exact-read coverage toward FP4', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], {
        hardware: 'mi355x',
        precision: Precision.FP4,
      }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
      ...frontier([1000, 800, 600, 400], {
        hardware: 'mi355x',
        precision: Precision.FP8,
      }),
      ...frontier([900, 700, 500, 300], {
        hardware: 'b200',
        precision: Precision.FP8,
      }),
    ]);

    expect(headlinePairOf(summary, 'mi355x-vs-b200')?.precision).toBe(Precision.FP4);
  });

  it('keeps an FP4 bucket and member boundaries when neither side has an exact read', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontierAt(
        [
          [60, 900],
          [70, 800],
          [80, 700],
          [90, 600],
        ],
        { hardware: 'mi355x', precision: Precision.FP4 },
      ),
      ...frontierAt(
        [
          [20, 500],
          [30, 450],
          [40, 400],
          [45, 350],
        ],
        { hardware: 'b200', precision: Precision.FP4 },
      ),
    ]);

    const pair = headlinePairOf(summary, 'mi355x-vs-b200');
    expect(pair?.precision).toBeNull();
    expect(pair?.candidate.precision).toBe(Precision.FP4);
    expect(pair?.candidate.dbModel).toBe('qwen3.5');
    expect(pair?.baseline.precision).toBe(Precision.FP4);
    expect(pair?.candidate.read).toMatchObject({
      value: null,
      boundary: 'clamped_low',
      config: { hardware: 'mi355x' },
    });
    expect(pair?.baseline.read).toMatchObject({
      value: null,
      boundary: 'unreachable',
      config: { hardware: 'b200' },
    });
    expect(pair?.candidate.missingReason).toBe('no_exact_at_tier');
    expect(pair?.baseline.missingReason).toBe('cannot_reach_at_tier');
  });

  it('keeps an exact side and marks an unreachable side missing without a delta', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], {
        hardware: 'mi355x',
        precision: Precision.FP4,
      }),
      ...frontierAt(
        [
          [20, 500],
          [30, 450],
          [40, 400],
          [45, 350],
        ],
        { hardware: 'b200', precision: Precision.FP4 },
      ),
    ]);

    const pair = headlinePairOf(summary, 'mi355x-vs-b200');
    expect(pair?.candidate.read).toMatchObject({ value: 1000, boundary: 'interpolated' });
    expect(pair?.baseline.read).toMatchObject({ value: null, boundary: 'unreachable' });
    expect(pair?.baseline.missingReason).toBe('cannot_reach_at_tier');
    expect(pair?.directDeltaPercent).toBeNull();
  });

  it('selects member precisions independently and shares a pair precision only when they match', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], {
        hardware: 'mi355x',
        precision: Precision.FP8,
      }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'b200',
        precision: Precision.FP8,
      }),
      ...frontier([1300, 1100, 900, 700], {
        hardware: 'gb300',
        precision: Precision.FP4,
      }),
      ...frontier([1000, 800, 600, 400], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    const matched = headlinePairOf(summary, 'mi355x-vs-b200');
    expect(matched?.precision).toBe(Precision.FP8);
    expect(matched?.directDeltaPercent).not.toBeNull();

    const mismatched = headlinePairOf(summary, 'gb300-vs-b200');
    expect(mismatched?.candidate.precision).toBe(Precision.FP4);
    expect(mismatched?.baseline.precision).toBe(Precision.FP8);
    expect(mismatched?.precision).toBeNull();
    expect(mismatched?.deltaUnavailableReason).toBe('precision_mismatch');
  });

  it('shows each release’s own read but never deltas across releases', () => {
    const summary = buildOverviewModelSummary(Model.Kimi_K2_5, [
      ...frontier([1200, 1000, 800, 600], {
        model: 'kimik2.5',
        hardware: 'b200',
        precision: Precision.FP4,
        date: '2026-07-10',
      }),
      ...frontier([1100, 900, 700, 500], {
        model: 'kimik2.7-code',
        hardware: 'mi355x',
        precision: Precision.FP4,
        date: '2026-07-20',
      }),
    ]);

    const pair = headlinePairOf(summary, 'mi355x-vs-b200');
    expect(pair?.candidate.read.config?.dbModel).toBe('kimik2.7-code');
    expect(pair?.baseline.read.config?.dbModel).toBe('kimik2.5');
    expect(pair?.dbModel).toBeNull();
    expect(pair?.directDeltaPercent).toBeNull();
    expect(pair?.deltaUnavailableReason).toBe('version_mismatch');
    expect(pair?.highLeaderTransition).toBeNull();
  });

  it('computes signed candidate-relative-to-B200 deltas', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1000, 800, 600, 400], {
        hardware: 'mi355x',
        precision: Precision.FP4,
      }),
      ...frontier([1200, 1000, 800, 600], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
      ...frontier([1400, 1200, 1000, 800], {
        hardware: 'gb300',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'mi355x-vs-b200')?.directDeltaPercent).toBeCloseTo(-20);
    expect(headlinePairOf(summary, 'gb300-vs-b200')?.directDeltaPercent).toBeCloseTo(20);
  });

  it('reports a hardware leader flip at @100 using independently best configs', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1400, 1200, 800, 400], {
        hardware: 'mi355x',
        precision: Precision.FP4,
        framework: 'sglang',
      }),
      ...frontier([1000, 700, 650, 600], {
        hardware: 'mi355x',
        precision: Precision.FP4,
        framework: 'dynamo-trt',
      }),
      ...frontier([1200, 1000, 800, 650], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    const pair = headlinePairOf(summary, 'mi355x-vs-b200');
    expect(pair?.candidate.read.config?.framework).toBe('sglang');
    expect(pair?.candidate.highRead.config?.framework).toBe('dynamo-trt');
    expect(pair?.highLeaderTransition).toBe('changed_hardware');
  });

  it('suppresses the leader line when another precision wins the 100 view', () => {
    // Both sides are FP8-comparable @50, but the candidate's FP4 stack wins
    // @100 — the 100 view re-selects FP4 vs FP8 and refuses to compare.
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1100, 900, 700, 500], { hardware: 'mi355x', precision: Precision.FP8 }),
      ...frontier([1000, 800, 750, 700], { hardware: 'mi355x', precision: Precision.FP4 }),
      ...frontier([1050, 850, 720, 600], { hardware: 'b200', precision: Precision.FP8 }),
    ]);

    const pair = headlinePairOf(summary, 'mi355x-vs-b200');
    expect(pair?.directDeltaPercent).toBeCloseTo((900 / 850 - 1) * 100);
    expect(pair?.candidate.highRead.config?.precision).toBe(Precision.FP4);
    expect(pair?.highLeaderTransition).toBeNull();
  });

  it('claims cannot-reach only when every speculative bucket is unreachable', () => {
    const unreachable: [number, number][] = [
      [20, 500],
      [30, 450],
      [40, 400],
      [45, 350],
    ];
    const underSwept: [number, number][] = [
      [60, 900],
      [70, 800],
      [80, 700],
      [90, 600],
    ];
    const baseline = frontier([1200, 1000, 800, 600], {
      hardware: 'b200',
      precision: Precision.FP4,
    });

    const mixed = buildOverviewModelSummary(Model.Qwen3_5, [
      ...baseline,
      ...frontierAt(unreachable, { hardware: 'mi355x', precision: Precision.FP4 }),
      ...frontierAt(underSwept, { hardware: 'mi355x', precision: Precision.FP8 }),
    ]);
    expect(headlinePairOf(mixed, 'mi355x-vs-b200')?.candidate.missingReason).toBe(
      'no_exact_at_tier',
    );

    const allUnreachable = buildOverviewModelSummary(Model.Qwen3_5, [
      ...baseline,
      ...frontierAt(unreachable, { hardware: 'mi355x', precision: Precision.FP4 }),
      ...frontierAt(unreachable, { hardware: 'mi355x', precision: Precision.FP8 }),
    ]);
    expect(headlinePairOf(allUnreachable, 'mi355x-vs-b200')?.candidate.missingReason).toBe(
      'cannot_reach_at_tier',
    );
  });

  it('distinguishes standard-decode-only and unsupported-precision coverage per member', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { hardware: 'b200', precision: Precision.FP4 }),
      row({ hardware: 'mi355x', precision: Precision.FP8, spec_method: 'none' }),
      row({ hardware: 'b300', precision: Precision.INT4 }),
    ]);

    expect(headlinePairOf(summary, 'mi355x-vs-b200')?.candidate.missingReason).toBe(
      'standard_decode_only',
    );
    expect(headlinePairOf(summary, 'b300-vs-b200')?.candidate.missingReason).toBe('int4_bf16_only');
  });

  it('always returns all four fixed pairs for an empty model', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, []);

    expect(summary.headlinePairs.map(({ id }) => id)).toEqual([
      'mi355x-vs-b200',
      'b300-vs-b200',
      'gb200-vs-b200',
      'gb300-vs-b200',
    ]);
    expect(summary.headlinePairs.every(({ precision }) => precision === null)).toBe(true);
    expect(
      summary.headlinePairs.every(
        ({ candidate, baseline }) =>
          candidate.missingReason === 'no_8k1k_data' && baseline.missingReason === 'no_8k1k_data',
      ),
    ).toBe(true);
  });
});

describe('tier-parameterized overview', () => {
  it('resolves the tier query value and falls back to 50', () => {
    expect(resolveOverviewTier('100')).toBe(100);
    expect(resolveOverviewTier(['75', '30'])).toBe(75);
    expect(resolveOverviewTier('40')).toBe(50);
    expect(resolveOverviewTier('')).toBe(50);
    expect(resolveOverviewTier(undefined)).toBe(50);
  });

  it('stamps the displayed tier on the page and defaults to 50, down to empty models', () => {
    expect(assembleOverviewPageData({}).tier).toBe(50);
    const page = assembleOverviewPageData({}, 75);
    expect(page.tier).toBe(75);
    expect(page.models[0]?.headlinePairs[0]?.candidate.read.tier).toBe(75);
  });

  it('reads every pair member and its delta at the requested tier', () => {
    const page = assembleOverviewPageData(
      {
        [Model.Qwen3_5]: [
          ...frontier([1000, 800, 600, 400], { hardware: 'mi355x', precision: Precision.FP4 }),
          ...frontier([1200, 1000, 800, 600], { hardware: 'b200', precision: Precision.FP4 }),
        ],
      },
      100,
    );

    const pair = headlinePairOf(
      page.models.find((m) => m.model === Model.Qwen3_5)!,
      'mi355x-vs-b200',
    );
    expect(pair?.candidate.read).toMatchObject({ tier: 100, value: 400 });
    expect(pair?.baseline.read).toMatchObject({ tier: 100, value: 600 });
    expect(pair?.directDeltaPercent).toBeCloseTo((400 / 600 - 1) * 100);
  });

  it('turns an unreachable @50 side into an exact read on the 30 view', () => {
    const rows = [
      ...frontier([1200, 1000, 800, 600], { hardware: 'mi355x', precision: Precision.FP4 }),
      ...frontierAt(
        [
          [20, 500],
          [30, 450],
          [40, 400],
          [45, 350],
        ],
        { hardware: 'b200', precision: Precision.FP4 },
      ),
    ];

    const at50 = headlinePairOf(
      assembleOverviewPageData({ [Model.Qwen3_5]: rows }).models.find(
        (m) => m.model === Model.Qwen3_5,
      )!,
      'mi355x-vs-b200',
    );
    expect(at50?.baseline.missingReason).toBe('cannot_reach_at_tier');

    const at30 = headlinePairOf(
      assembleOverviewPageData({ [Model.Qwen3_5]: rows }, 30).models.find(
        (m) => m.model === Model.Qwen3_5,
      )!,
      'mi355x-vs-b200',
    );
    expect(at30?.baseline.read).toMatchObject({ tier: 30, value: 450 });
    expect(at30?.baseline.missingReason).toBeNull();
    expect(at30?.directDeltaPercent).toBeCloseTo((1200 / 450 - 1) * 100);
  });

  it('re-selects each platform’s best bucket at the displayed tier', () => {
    // FP4 wins @50 (1000 > 900) but tops out low; FP8 wins @100 (700 > 400).
    const page = (tier?: 30 | 50 | 75 | 100) =>
      assembleOverviewPageData(
        {
          [Model.Qwen3_5]: [
            ...frontier([1200, 1000, 800, 400], { hardware: 'mi355x', precision: Precision.FP4 }),
            ...frontier([1100, 900, 850, 700], { hardware: 'mi355x', precision: Precision.FP8 }),
            ...frontier([1200, 1000, 800, 600], { hardware: 'b200', precision: Precision.FP8 }),
          ],
        },
        tier,
      ).models.find((m) => m.model === Model.Qwen3_5)!;

    const at50 = headlinePairOf(page(), 'mi355x-vs-b200');
    expect(at50?.candidate.precision).toBe(Precision.FP4);
    expect(at50?.deltaUnavailableReason).toBe('precision_mismatch');

    const at100 = headlinePairOf(page(100), 'mi355x-vs-b200');
    expect(at100?.candidate.precision).toBe(Precision.FP8);
    expect(at100?.candidate.read.value).toBe(700);
    expect(at100?.directDeltaPercent).toBeCloseTo((700 / 600 - 1) * 100);
  });

  it('never reports a leader transition on the 100 view', () => {
    const rows = [
      ...frontier([1400, 1200, 800, 400], {
        hardware: 'mi355x',
        precision: Precision.FP4,
        framework: 'sglang',
      }),
      ...frontier([1000, 700, 650, 600], {
        hardware: 'mi355x',
        precision: Precision.FP4,
        framework: 'dynamo-trt',
      }),
      ...frontier([1200, 1000, 800, 650], { hardware: 'b200', precision: Precision.FP4 }),
    ];

    const summaryAt = (tier?: 30 | 50 | 75 | 100) =>
      assembleOverviewPageData({ [Model.Qwen3_5]: rows }, tier).models.find(
        (m) => m.model === Model.Qwen3_5,
      )!;
    expect(headlinePairOf(summaryAt(), 'mi355x-vs-b200')?.highLeaderTransition).toBe(
      'changed_hardware',
    );
    expect(headlinePairOf(summaryAt(100), 'mi355x-vs-b200')?.highLeaderTransition).toBeNull();
  });
});

// Drift guard: runs the real assembler over the e2e fixture; expectations are
// engine-derived, never eyeballed. Contract drift fails here, not in overview.cy.ts.
describe('assembleOverviewPageData over the overview-rows fixture', () => {
  it('serves every matrix cell state through the real builder', () => {
    const page = assembleOverviewPageData(
      overviewRowsFixture as unknown as Record<string, BenchmarkRow[]>,
    );

    expect(page.models).toHaveLength(DEFAULT_MODELS.size);
    expect(page.datasetThroughDate).toBe('2026-07-18');
    expect(page.tier).toBe(50);

    // DeepSeek: FP4 delta + cross-day range; GB200's FP8 best withholds its
    // delta; MI355X and GB300 miss in opposite clamp directions.
    const deepseek = page.models.find((m) => m.model === Model.DeepSeek_V4_Pro)!;
    const dsB300 = headlinePairOf(deepseek, 'b300-vs-b200')!;
    expect(dsB300.precision).toBe(Precision.FP4);
    expect(dsB300.baseline.read.value).toBeCloseTo(900.219);
    expect(dsB300.candidate.read.value).toBeCloseTo(1121.875);
    expect(dsB300.candidate.read.evidenceDate).toEqual({ from: '2026-06-24', to: '2026-07-04' });
    expect(dsB300.directDeltaPercent).toBeCloseTo(24.62, 1);
    const dsGb200 = headlinePairOf(deepseek, 'gb200-vs-b200')!;
    expect(dsGb200.candidate.precision).toBe(Precision.FP8);
    expect(dsGb200.candidate.read.value).toBe(600);
    expect(dsGb200.deltaUnavailableReason).toBe('precision_mismatch');
    expect(headlinePairOf(deepseek, 'mi355x-vs-b200')?.candidate.missingReason).toBe(
      'no_exact_at_tier',
    );
    expect(headlinePairOf(deepseek, 'gb300-vs-b200')?.candidate.missingReason).toBe(
      'cannot_reach_at_tier',
    );

    // MiniMax: a missing baseline yields neither delta nor mismatch note.
    const minimax = page.models.find((m) => m.model === Model.MiniMax_M3)!;
    const mmGb300 = headlinePairOf(minimax, 'gb300-vs-b200')!;
    expect(mmGb300.baseline.missingReason).toBe('no_8k1k_data');
    expect(mmGb300.candidate.read.value).toBe(700);
    expect(mmGb300.directDeltaPercent).toBeNull();
    expect(mmGb300.deltaUnavailableReason).toBeNull();

    // Qwen: FP8 delta −16% + leader flip at 100; B300's FP4 best withholds its delta.
    const qwen = page.models.find((m) => m.model === Model.Qwen3_5)!;
    const qwenMi = headlinePairOf(qwen, 'mi355x-vs-b200')!;
    expect(qwenMi.precision).toBe(Precision.FP8);
    expect(qwenMi.directDeltaPercent).toBeCloseTo(-15.56, 1);
    expect(qwenMi.highLeaderTransition).toBe('changed_hardware');
    const qwenB300 = headlinePairOf(qwen, 'b300-vs-b200')!;
    expect(qwenB300.candidate.precision).toBe(Precision.FP4);
    expect(qwenB300.candidate.read.value).toBeCloseTo(1150.625);
    expect(qwenB300.deltaUnavailableReason).toBe('precision_mismatch');

    // Kimi: no workload rows at all → every member of every pair says so.
    const kimi = page.models.find((m) => m.model === Model.Kimi_K2_5)!;
    expect(
      kimi.headlinePairs.every(
        ({ candidate, baseline }) =>
          candidate.missingReason === 'no_8k1k_data' && baseline.missingReason === 'no_8k1k_data',
      ),
    ).toBe(true);
  });
});
