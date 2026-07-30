import { describe, expect, it } from 'vitest';

import overviewRowsFixture from '../../cypress/fixtures/api/overview-rows.json';

import { dedupeRowsToLatestPerConfig } from '@/components/inference/hooks/useChartData';

import type { BenchmarkRow } from './api';
import { DEFAULT_MODELS, Model, Precision } from './data-mappings';
import {
  assembleOverviewPageData,
  buildOverviewModelSummary,
  overviewScenarioForModel,
  resolveOverviewEngineScope,
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
  const candidateHardware = id.replace('-vs-b200', '');
  const candidate = summary.platforms.find((platform) => platform.hardware === candidateHardware);
  const baseline = summary.platforms.find((platform) => platform.hardware === 'b200');
  return candidate === undefined || baseline === undefined ? undefined : { candidate, baseline };
}

describe('overview engine scope and scenario selection', () => {
  it('assigns each active model to its configured scenario', () => {
    expect(overviewScenarioForModel(Model.Kimi_K3)).toBe('agentx');
    expect(overviewScenarioForModel(Model.GLM_5_2)).toBe('agentx');
    expect(overviewScenarioForModel(Model.DeepSeek_V4_Pro)).toBe('single_turn_8k1k');
    expect(overviewScenarioForModel(Model.Kimi_K2_5)).toBe('single_turn_8k1k');
    expect(overviewScenarioForModel(Model.MiniMax_M3)).toBe('single_turn_8k1k');
    expect(overviewScenarioForModel(Model.Qwen3_5)).toBe('single_turn_8k1k');
  });

  it('prefers single-turn 8K/1K rows and otherwise falls back to AgentX', () => {
    const singleTurn = frontier([1200, 1000, 800, 600], {
      model: 'glm5.2',
      hardware: 'b200',
    });
    const agentx = [
      row({
        model: 'glm5.2',
        hardware: 'b200',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        metrics: {
          p90_itl: 1 / 50,
          p90_ttlt: 25,
          output_tput_per_gpu: 850,
        },
      }),
    ];

    expect(buildOverviewModelSummary(Model.GLM_5_2, [...agentx, ...singleTurn]).scenario).toBe(
      'single_turn_8k1k',
    );
    expect(
      buildOverviewModelSummary(
        Model.Qwen3_5,
        agentx.map((entry) => ({ ...entry, model: 'qwen3.5' })),
      ).scenario,
    ).toBe('agentx');
  });

  it('resolves valid engine scopes and defaults invalid values to community', () => {
    expect(resolveOverviewEngineScope('community')).toBe('community');
    expect(resolveOverviewEngineScope('all')).toBe('all');
    expect(resolveOverviewEngineScope(['all', 'community'])).toBe('all');
    expect(resolveOverviewEngineScope('trt')).toBe('community');
    expect(resolveOverviewEngineScope('')).toBe('community');
    expect(resolveOverviewEngineScope(undefined)).toBe('community');
  });

  it('derives cost per Mtok from retail rental $/GPU/hr and compares against B200', () => {
    const rows = [
      ...frontier([1200, 800, 700, 600], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([1400, 1000, 900, 800], { hardware: 'mi355x', precision: Precision.FP4 }),
      ...frontier([1300, 900, 800, 700], { hardware: 'gb300', precision: Precision.FP4 }),
    ];
    const summary = buildOverviewModelSummary(Model.Qwen3_5, rows, 50, 'community');
    const byHardware = Object.fromEntries(summary.platforms.map((p) => [p.hardware, p]));

    // Note (wenyao): expected $/GPU/hr from HW_REGISTRY costr — b200 2.90, mi355x 2.10, gb300 3.96.
    expect(byHardware.b200.costPerMtok).toBeCloseTo(2_900_000 / (800 * 3600), 6);
    expect(byHardware.b200.costVsB200Pct).toBeNull();
    expect(byHardware.mi355x.costPerMtok).toBeCloseTo(2_100_000 / (1000 * 3600), 6);
    expect(byHardware.mi355x.costVsB200Pct).toBeCloseTo(
      2_100_000 / (1000 * 3600) / (2_900_000 / (800 * 3600)) - 1,
      6,
    );
    expect(byHardware.mi355x.costVsB200Pct).toBeLessThan(0);
    expect(byHardware.gb300.costVsB200Pct).toBeGreaterThan(0);
    expect(byHardware.b300.costPerMtok).toBeNull();
    expect(byHardware.b300.costVsB200Pct).toBeNull();
  });

  it('includes vLLM and SGLang wrapper families in community scope and excludes ATOM/TRTLLM', () => {
    const rows = [
      ...frontier([1200, 1000, 800, 600], {
        hardware: 'mi355x',
        framework: 'dynamo-vllm',
        precision: Precision.FP4,
      }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'b200',
        framework: 'llmd-vllm',
        precision: Precision.FP4,
      }),
      ...frontier([1150, 950, 750, 550], {
        hardware: 'gb300',
        framework: 'dynamo-sglang',
        precision: Precision.FP4,
      }),
      ...frontier([1050, 850, 650, 450], {
        hardware: 'b200',
        framework: 'mori-sglang',
        precision: Precision.FP4,
      }),
      ...frontier([1500, 1300, 1100, 900], {
        hardware: 'mi355x',
        framework: 'atom',
        precision: Precision.FP4,
      }),
      ...frontier([1400, 1200, 1000, 800], {
        hardware: 'b200',
        framework: 'trtllm',
        precision: Precision.FP4,
      }),
    ];

    const all = buildOverviewModelSummary(Model.Qwen3_5, rows, 50, 'all');
    const community = buildOverviewModelSummary(Model.Qwen3_5, rows, 50, 'community');

    expect(headlinePairOf(all, 'mi355x-vs-b200')?.candidate.read.config?.framework).toBe('atom');
    expect(headlinePairOf(all, 'mi355x-vs-b200')?.baseline.read.config?.framework).toBe('trtllm');
    expect(headlinePairOf(community, 'mi355x-vs-b200')?.candidate.read.config?.framework).toBe(
      'dynamo-vllm',
    );
    expect(headlinePairOf(community, 'mi355x-vs-b200')?.baseline.read.config?.framework).toBe(
      'llmd-vllm',
    );
    expect(headlinePairOf(community, 'gb300-vs-b200')?.candidate.read.config?.framework).toBe(
      'dynamo-sglang',
    );
  });

  it('stamps community scope and dates the dataset from community rows only', () => {
    const page = assembleOverviewPageData(
      {
        [Model.Qwen3_5]: [
          row({ framework: 'dynamo-vllm', date: '2026-07-20' }),
          row({ framework: 'atom', date: '2026-07-21' }),
        ],
      },
      50,
      'community',
    );

    expect(page.engineScope).toBe('community');
    expect(page.datasetThroughDate).toBe('2026-07-20');
  });

  it('builds one serving-series frontier across topology variants', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      row({
        hardware: 'gb300',
        precision: Precision.FP4,
        decode_tp: 4,
        decode_num_workers: 1,
        num_decode_gpu: 4,
        metrics: { median_intvty: 40, output_tput_per_gpu: 1200 },
      }),
      row({
        hardware: 'gb300',
        precision: Precision.FP4,
        decode_tp: 16,
        decode_num_workers: 2,
        num_decode_gpu: 16,
        metrics: { median_intvty: 60, output_tput_per_gpu: 800 },
      }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      value: 962.5,
      boundary: 'interpolated',
      estimated: true,
    });
  });

  it('marks a target tier backed by an observed frontier knot as exact', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], {
        hardware: 'gb300',
        precision: Precision.FP4,
      }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      value: 1000,
      boundary: 'interpolated',
      estimated: false,
    });
  });

  it('marks interpolation as estimated even when both knots share one topology label', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      row({
        hardware: 'gb300',
        precision: Precision.FP4,
        disagg: true,
        is_multinode: true,
        num_prefill_gpu: 4,
        num_decode_gpu: 8,
        metrics: { median_intvty: 40, output_tput_per_gpu: 1800 },
      }),
      row({
        hardware: 'gb300',
        precision: Precision.FP4,
        disagg: true,
        is_multinode: true,
        num_prefill_gpu: 4,
        num_decode_gpu: 8,
        metrics: { median_intvty: 60, output_tput_per_gpu: 1200 },
      }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      estimated: true,
      evidenceTopologies: ['4P+8D'],
    });
  });

  it('normalizes disaggregated output throughput by all deployed GPUs before interpolation', () => {
    const summary = buildOverviewModelSummary(Model.DeepSeek_V4_Pro, [
      row({
        hardware: 'gb300',
        model: 'dsv4',
        framework: 'dynamo-sglang',
        precision: Precision.FP4,
        disagg: true,
        is_multinode: true,
        num_prefill_gpu: 24,
        num_decode_gpu: 8,
        metrics: {
          median_intvty: 44.117923723301274,
          output_tput_per_gpu: 5169.251003712194,
        },
      }),
      row({
        hardware: 'gb300',
        model: 'dsv4',
        framework: 'dynamo-sglang',
        precision: Precision.FP4,
        disagg: true,
        is_multinode: true,
        num_prefill_gpu: 16,
        num_decode_gpu: 8,
        metrics: {
          median_intvty: 68.267004773066,
          output_tput_per_gpu: 3248.972986719746,
        },
      }),
      ...frontier([1050, 900, 700, 500], {
        hardware: 'b200',
        model: 'dsv4',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      value: 1224.393,
      boundary: 'interpolated',
      evidenceTopologies: ['24P+8D', '16P+8D'],
    });
  });

  it('does not normalize aggregated multinode rows with duplicated P/D counts', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], {
        hardware: 'gb300',
        precision: Precision.FP4,
        disagg: false,
        is_multinode: true,
        num_prefill_gpu: 8,
        num_decode_gpu: 8,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      value: 1000,
      evidenceTopologies: [],
    });
  });

  it('normalizes disaggregated rows even when they run on one node', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1800, 1500, 1200, 900], {
        hardware: 'gb300',
        precision: Precision.FP4,
        disagg: true,
        is_multinode: false,
        num_prefill_gpu: 4,
        num_decode_gpu: 8,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      value: 1000,
      evidenceTopologies: ['4P+8D'],
    });
  });

  it('matches chart date dedupe before combining topology variants into a serving series', () => {
    const olderTopology = row({
      hardware: 'gb300',
      precision: Precision.FP4,
      date: '2026-07-19',
      decode_tp: 4,
      num_decode_gpu: 4,
      metrics: { median_intvty: 40, output_tput_per_gpu: 1200 },
    });
    const newerTopology = row({
      hardware: 'gb300',
      precision: Precision.FP4,
      date: '2026-07-20',
      decode_tp: 16,
      num_decode_gpu: 16,
      metrics: { median_intvty: 60, output_tput_per_gpu: 800 },
    });

    expect(dedupeRowsToLatestPerConfig([olderTopology, newerTopology])).toEqual([newerTopology]);

    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      olderTopology,
      newerTopology,
      ...frontier([1100, 900, 700, 500], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      value: null,
      boundary: 'clamped_low',
      config: { latestDate: '2026-07-20' },
    });
  });

  it.each([
    ['framework', { framework: 'vllm' }],
    ['spec method', { spec_method: 'eagle' }],
    ['precision', { precision: Precision.FP8 }],
    ['disaggregation mode', { disagg: true }],
    ['aggregate deployment mode', { is_multinode: true }],
    ['offload mode', { offload_mode: 'on' }],
    ['raw release', { model: 'qwen3.5-alt' }],
  ])('does not blend points across %s', (_label, secondOverrides) => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      row({
        hardware: 'gb300',
        precision: Precision.FP4,
        metrics: { median_intvty: 40, output_tput_per_gpu: 1200 },
      }),
      row({
        hardware: 'gb300',
        precision: Precision.FP4,
        metrics: { median_intvty: 60, output_tput_per_gpu: 800 },
        ...secondOverrides,
      }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read.value).toBeNull();
  });

  it('uses speculative FP4, speculative FP8, standard FP4, then standard FP8', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([900, 700, 500, 300], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([1400, 1200, 1000, 800], {
        hardware: 'b200',
        precision: Precision.FP4,
        spec_method: 'none',
      }),
      ...frontier([1100, 900, 700, 500], { hardware: 'mi355x', precision: Precision.FP8 }),
      ...frontier([1500, 1300, 1100, 900], {
        hardware: 'mi355x',
        precision: Precision.FP4,
        spec_method: 'none',
      }),
      ...frontier([1300, 1100, 900, 700], {
        hardware: 'b300',
        precision: Precision.FP4,
        spec_method: 'none',
      }),
      ...frontier([1500, 1300, 1100, 900], {
        hardware: 'b300',
        precision: Precision.FP8,
        spec_method: 'none',
      }),
      ...frontier([1200, 1000, 800, 600], {
        hardware: 'gb200',
        precision: Precision.FP8,
        spec_method: 'none',
      }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'gb300',
        precision: Precision.FP4,
        spec_method: '',
      }),
    ]);

    expect(
      summary.platforms.map(({ hardware, precision, read }) => ({
        hardware,
        precision,
        value: read.value,
      })),
    ).toEqual([
      { hardware: 'b200', precision: Precision.FP4, value: 700 },
      { hardware: 'mi355x', precision: Precision.FP8, value: 900 },
      { hardware: 'b300', precision: Precision.FP4, value: 1100 },
      { hardware: 'gb200', precision: Precision.FP8, value: 1000 },
      { hardware: 'gb300', precision: Precision.FP4, value: 900 },
    ]);
  });
});

describe('overview platform selection', () => {
  it('keeps FP4 platform boundaries when neither side has an exact read', () => {
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
    expect(pair?.candidate.precision).toBe(Precision.FP4);
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

  it('keeps an exact side and marks an unreachable side missing', () => {
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
  });

  it('shows each platform’s independently selected release', () => {
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
  });

  it('selects each platform’s best release independently', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], {
        model: 'qwen3.5-a',
        hardware: 'mi355x',
        precision: Precision.FP4,
      }),
      ...frontier([700, 500, 400, 300], {
        model: 'qwen3.5-a',
        hardware: 'b200',
        precision: Precision.FP4,
      }),
      ...frontier([1100, 900, 700, 500], {
        model: 'qwen3.5-b',
        hardware: 'mi355x',
        precision: Precision.FP4,
      }),
      ...frontier([1100, 900, 700, 500], {
        model: 'qwen3.5-b',
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'mi355x-vs-b200')).toMatchObject({
      candidate: { read: { value: 1000, config: { dbModel: 'qwen3.5-a' } } },
      baseline: { read: { value: 900, config: { dbModel: 'qwen3.5-b' } } },
    });
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

  it('falls back to standard decode and still flags unsupported precision coverage', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([1200, 1000, 800, 600], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([1100, 900, 700, 500], {
        hardware: 'mi355x',
        precision: Precision.FP8,
        spec_method: 'none',
      }),
      row({ hardware: 'b300', precision: Precision.INT4 }),
    ]);

    expect(headlinePairOf(summary, 'mi355x-vs-b200')?.candidate).toMatchObject({
      missingReason: null,
      precision: Precision.FP8,
      read: { value: 900, config: { specMethod: 'none' } },
    });
    expect(headlinePairOf(summary, 'b300-vs-b200')?.candidate.missingReason).toBe('int4_bf16_only');
  });

  it('falls back to standard decode for AgentX when no speculative result exists', () => {
    const agentxRows = [40, 50, 60].map((interactivity, index) =>
      row({
        model: 'glm5.2',
        hardware: 'b300',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        precision: Precision.FP4,
        spec_method: 'none',
        conc: index + 1,
        metrics: {
          p90_itl: 1 / interactivity,
          p90_ttlt: 30 - index * 5,
          output_tput_per_gpu: 1000 - index * 100,
        },
      }),
    );

    const summary = buildOverviewModelSummary(Model.GLM_5_2, agentxRows);
    expect(summary.scenario).toBe('agentx');
    expect(summary.platforms.find(({ hardware }) => hardware === 'b300')).toMatchObject({
      missingReason: null,
      precision: Precision.FP4,
      read: { value: 900, config: { specMethod: 'none' } },
    });
  });

  it('reads AgentX at the chart-default P90 contract without exposing P90 as the scenario', () => {
    const summary = buildOverviewModelSummary(Model.GLM_5_2, [
      row({
        model: 'glm5.2',
        hardware: 'b200',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        precision: Precision.FP4,
        spec_method: 'mtp',
        conc: 8,
        metrics: {
          p90_itl: 1 / 40,
          p90_ttlt: 30,
          tput_per_gpu: 1400,
          output_tput_per_gpu: 1200,
        },
      }),
      row({
        model: 'glm5.2',
        hardware: 'b200',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        precision: Precision.FP4,
        spec_method: 'mtp',
        conc: 12,
        metrics: {
          p90_itl: 1 / 50,
          p90_ttlt: 25,
          tput_per_gpu: 900,
          output_tput_per_gpu: 850,
        },
      }),
      row({
        model: 'glm5.2',
        hardware: 'b200',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        precision: Precision.FP4,
        spec_method: 'mtp',
        conc: 16,
        metrics: {
          p90_itl: 1 / 60,
          p90_ttlt: 20,
          tput_per_gpu: 1000,
          output_tput_per_gpu: 800,
        },
      }),
    ]);

    expect(summary.scenario).toBe('agentx');
    expect(summary.platforms.find(({ hardware }) => hardware === 'b200')?.read).toMatchObject({
      value: 850,
      boundary: 'interpolated',
      estimated: false,
    });
  });

  it('reports scenario-level missing coverage when AgentX rows lack usable P90 metrics', () => {
    const summary = buildOverviewModelSummary(Model.GLM_5_2, [
      row({
        model: 'glm5.2',
        hardware: 'b200',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        precision: Precision.FP4,
        spec_method: 'mtp',
        metrics: {
          output_tput_per_gpu: 1200,
        },
      }),
    ]);

    expect(summary.platforms.find(({ hardware }) => hardware === 'b200')).toMatchObject({
      read: { value: null },
      missingReason: 'no_scenario_data',
    });
  });

  it('returns all five platforms with coverage gaps for an empty model', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, []);

    expect(summary.platforms.map(({ hardware }) => hardware)).toEqual([
      'b200',
      'mi355x',
      'b300',
      'gb200',
      'gb300',
    ]);
    expect(summary.platforms.every(({ precision }) => precision === null)).toBe(true);
    expect(
      summary.platforms.every(({ missingReason }) => missingReason === 'no_scenario_data'),
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
    expect(page.models[0]?.platforms[0]?.read.tier).toBe(75);
  });

  it('reads every platform at the requested tier', () => {
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
  });

  it('re-selects each platform independently at the displayed tier', () => {
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
    expect(at50?.candidate.read.value).toBe(1000);
    expect(at50?.baseline.precision).toBe(Precision.FP8);
    expect(at50?.baseline.read.value).toBe(1000);

    const at100 = headlinePairOf(page(100), 'mi355x-vs-b200');
    expect(at100?.candidate.precision).toBe(Precision.FP4);
    expect(at100?.candidate.read.value).toBe(400);
    expect(at100?.baseline.precision).toBe(Precision.FP8);
    expect(at100?.baseline.read.value).toBe(600);
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

    // DeepSeek: only each series' latest-date sweep survives. B300 and MI355X
    // therefore have no exact @50 read; GB200's independent FP8 remains visible.
    // GB300's points are single-node and multi-node aggregate deployments, so
    // they must not be interpolated into one synthetic serving curve.
    const deepseek = page.models.find((m) => m.model === Model.DeepSeek_V4_Pro)!;
    const dsB300 = headlinePairOf(deepseek, 'b300-vs-b200')!;
    expect(dsB300.baseline.read.value).toBeCloseTo(900.219);
    expect(dsB300.candidate.read.value).toBeNull();
    expect(dsB300.candidate.missingReason).toBe('no_exact_at_tier');
    const dsGb200 = headlinePairOf(deepseek, 'gb200-vs-b200')!;
    expect(dsGb200.candidate.precision).toBe(Precision.FP8);
    expect(dsGb200.candidate.read.value).toBe(600);
    expect(headlinePairOf(deepseek, 'mi355x-vs-b200')?.candidate.missingReason).toBe(
      'no_exact_at_tier',
    );
    const dsGb300 = headlinePairOf(deepseek, 'gb300-vs-b200')!;
    expect(dsGb300.candidate.read.value).toBeNull();
    expect(dsGb300.candidate.read.evidenceTopologies).toEqual([]);
    expect(dsGb300.candidate.missingReason).toBe('no_exact_at_tier');

    // MiniMax: the platform result remains visible when B200 has no 8K/1K data.
    const minimax = page.models.find((m) => m.model === Model.MiniMax_M3)!;
    const mmGb300 = headlinePairOf(minimax, 'gb300-vs-b200')!;
    expect(mmGb300.baseline.missingReason).toBe('no_scenario_data');
    expect(mmGb300.candidate.read.value).toBe(700);

    // Qwen: MI355X independently falls back to FP8 while B200 and B300 use FP4.
    const qwen = page.models.find((m) => m.model === Model.Qwen3_5)!;
    const qwenMi = headlinePairOf(qwen, 'mi355x-vs-b200')!;
    expect(qwenMi.candidate.precision).toBe(Precision.FP8);
    expect(qwenMi.candidate.read.value).toBe(760);
    expect(qwenMi.baseline.precision).toBe(Precision.FP4);
    expect(qwenMi.baseline.read.value).toBeCloseTo(733.594);
    const qwenB300 = headlinePairOf(qwen, 'b300-vs-b200')!;
    expect(qwenB300.candidate.precision).toBe(Precision.FP4);
    expect(qwenB300.candidate.read.value).toBeCloseTo(1150.625);
    expect(qwenB300.baseline.precision).toBe(Precision.FP4);
    expect(qwenB300.baseline.read.value).toBeCloseTo(733.594);

    // Kimi: standard-only rows remain visible as explicitly labelled fallbacks.
    const kimi = page.models.find((m) => m.model === Model.Kimi_K2_5)!;
    const kimiMi = headlinePairOf(kimi, 'mi355x-vs-b200')!;
    expect(kimiMi.candidate.precision).toBe(Precision.FP4);
    expect(kimiMi.candidate.read).toMatchObject({
      value: 1000,
      config: { specMethod: 'none' },
    });
    expect(kimiMi.candidate.missingReason).toBeNull();
    expect(kimiMi.baseline.precision).toBe(Precision.FP4);
    expect(kimiMi.baseline.read).toMatchObject({
      value: 800,
      config: { specMethod: 'none' },
    });
    const kimiB300 = headlinePairOf(kimi, 'b300-vs-b200')!;
    expect(kimiB300.candidate.precision).toBe(Precision.FP8);
    expect(kimiB300.candidate.read).toMatchObject({
      value: 900,
      config: { specMethod: 'none' },
    });
    expect(kimiB300.candidate.missingReason).toBeNull();

    // GLM's AgentX fixture lacks valid P90 metrics, so it cannot produce a tier read.
    const glm = page.models.find((m) => m.model === Model.GLM_5_2)!;
    const glmB300 = headlinePairOf(glm, 'b300-vs-b200')!;
    expect(glmB300.candidate.read.value).toBeNull();
    expect(glmB300.candidate.missingReason).toBe('no_scenario_data');

    const communityPage = assembleOverviewPageData(
      overviewRowsFixture as unknown as Record<string, BenchmarkRow[]>,
      50,
      'community',
    );
    const communityGlm = communityPage.models.find((m) => m.model === Model.GLM_5_2)!;
    const communityGlmB300 = headlinePairOf(communityGlm, 'b300-vs-b200')!;
    expect(communityGlmB300.candidate.read.value).toBeNull();
    expect(communityGlmB300.candidate.missingReason).toBe('no_scenario_data');
  });
});
