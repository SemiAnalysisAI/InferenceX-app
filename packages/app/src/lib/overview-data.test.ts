import { describe, expect, it } from 'vitest';

import overviewRowsFixture from '../../cypress/fixtures/api/overview-rows.json';

import { dedupeRowsToLatestPerConfig } from '@/components/inference/hooks/useChartData';

import type { BenchmarkRow } from './api';
import {
  DEFAULT_MODELS,
  DEPRECATED_MODELS,
  MAINTENANCE_MODELS,
  Model,
  Precision,
} from './data-mappings';
import {
  assembleOverviewHistoricalPageData,
  assembleOverviewPageData,
  buildOverviewModelSummary,
  overviewCostPerMtok,
  overviewHistoricalWindow,
  overviewScenarioForModel,
  overviewSnapshotDate,
  overviewTierEvidenceDate,
  resolveOverviewComparisonMode,
  resolveOverviewEngineScope,
  resolveOverviewModelScope,
  resolveOverviewReferenceHardware,
  resolveOverviewTier,
  type OverviewModelSummary,
  type OverviewPageData,
} from './overview-data';

let nextId = 1;

const JULY_2026_HYPERSCALER_TCO = {
  b200: 1.73,
  gb200: 1.86,
  gb300: 2.31,
  mi355x: 1.5,
} as const;

// `output_tput_per_gpu` is deliberately a constant decoy on most rows: the
// overview's cost basis is TOTAL tokens (`tput_per_gpu`), so any expectation
// below would collapse to the 123 decoy if the code read output tokens.
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
    metrics: { median_intvty: 50, tput_per_gpu: 8700, output_tput_per_gpu: 123 },
    date: '2026-07-20',
    run_url: null,
    ...overrides,
  };
}

/** One frontier point per tier for a single configuration (total tok/s/GPU). */
function frontier(
  totals: [number, number, number, number],
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow[] {
  return [30, 50, 75, 100].map((tier, index) =>
    row({
      conc: index + 1,
      metrics: { median_intvty: tier, tput_per_gpu: totals[index], output_tput_per_gpu: 123 },
      ...overrides,
    }),
  );
}

/** Frontier at explicit [interactivity, total tput] knots — for clamped/unreachable tiers. */
function frontierAt(
  points: [number, number][],
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow[] {
  return points.map(([intvty, tput], index) =>
    row({
      conc: index + 1,
      metrics: { median_intvty: intvty, tput_per_gpu: tput, output_tput_per_gpu: 123 },
      ...overrides,
    }),
  );
}

/** AgentX trace-replay row: tier axis is P90 interactivity (1/p90_itl). */
function agenticRow(
  p90Interactivity: number,
  p90E2eLatency: number,
  totalTput: number,
  outputTput: number,
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow {
  return row({
    model: 'glm5.2',
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    precision: Precision.FP4,
    metrics: {
      p90_itl: 1 / p90Interactivity,
      p90_ttlt: p90E2eLatency,
      tput_per_gpu: totalTput,
      output_tput_per_gpu: outputTput,
    },
    ...overrides,
  });
}

function headlinePairOf(summary: OverviewModelSummary, id: string) {
  const candidateHardware = id.replace('-vs-b200', '');
  const candidate = summary.platforms.find((platform) => platform.hardware === candidateHardware);
  const baseline = summary.platforms.find((platform) => platform.hardware === 'b200');
  return candidate === undefined || baseline === undefined ? undefined : { candidate, baseline };
}

function platformFor(
  page: OverviewPageData,
  model: Model,
  scenario: OverviewModelSummary['scenario'],
  hardware: string,
) {
  return page.models
    .find((summary) => summary.model === model && summary.scenario === scenario)
    ?.platforms.find((platform) => platform.hardware === hardware);
}

describe('overview engine scope and scenario selection', () => {
  it('accepts only supported hardware references and defaults invalid input to B200', () => {
    expect(resolveOverviewReferenceHardware('b300')).toBe('b300');
    expect(resolveOverviewReferenceHardware(['mi355x', 'b200'])).toBe('mi355x');
    expect(resolveOverviewReferenceHardware('not-a-gpu')).toBe('b200');
    expect(resolveOverviewReferenceHardware(undefined)).toBe('b200');
  });

  it.each([
    [undefined, 'hardware'],
    ['hardware', 'hardware'],
    ['7d', '7d'],
    ['30d', '30d'],
    ['60d', '60d'],
    ['90d', '90d'],
    [['30d'], '30d'],
    ['unknown', 'hardware'],
  ] as const)('resolves comparison mode %j to %s', (raw, expected) => {
    expect(resolveOverviewComparisonMode(raw)).toBe(expected);
  });

  it('assigns each active model to its configured scenario', () => {
    expect(overviewScenarioForModel(Model.Kimi_K3)).toBe('agentx');
    expect(overviewScenarioForModel(Model.GLM_5_2)).toBe('agentx');
    expect(overviewScenarioForModel(Model.DeepSeek_V4_Pro)).toBe('single_turn_8k1k');
    expect(overviewScenarioForModel(Model.Kimi_K2_5)).toBe('single_turn_8k1k');
    expect(overviewScenarioForModel(Model.MiniMax_M3)).toBe('single_turn_8k1k');
    expect(overviewScenarioForModel(Model.Qwen3_5)).toBe('single_turn_8k1k');
  });

  it('prefers single-turn 8K/1K rows and otherwise falls back to AgentX', () => {
    const singleTurn = frontier([10800, 9000, 7200, 5400], {
      model: 'glm5.2',
      hardware: 'b200',
    });
    const agentx = [agenticRow(50, 25, 7650, 850, { hardware: 'b200' })];

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

  it('prices from HW_REGISTRY costh — not the retail costr tier', () => {
    // b200: costh 1.73 vs costr 2.60 — the two tiers disagree, so a costr
    // regression cannot pass this assertion.
    expect(overviewCostPerMtok('b200', 7200)).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.b200 * 1e6) / (7200 * 3600),
      9,
    );
    expect(overviewCostPerMtok('b200', 7200)).not.toBeCloseTo(2_600_000 / (7200 * 3600), 9);
    expect(overviewCostPerMtok('mi355x', 9000)).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.mi355x * 1e6) / (9000 * 3600),
      9,
    );
    expect(overviewCostPerMtok('b200', null)).toBeNull();
    expect(overviewCostPerMtok('b200', 0)).toBeNull();
    expect(overviewCostPerMtok('b200', -100)).toBeNull();
  });

  it('derives cost per Mtok from hyperscaler $/GPU/hr over total tokens and compares against B200', () => {
    const rows = [
      ...frontier([10800, 7200, 6300, 5400], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([12600, 9000, 8100, 7200], { hardware: 'mi355x', precision: Precision.FP4 }),
      ...frontier([11700, 8100, 7200, 6300], { hardware: 'gb300', precision: Precision.FP4 }),
    ];
    const summary = buildOverviewModelSummary(Model.Qwen3_5, rows, 50, 'community');
    const byHardware = Object.fromEntries(summary.platforms.map((p) => [p.hardware, p]));

    // Expected $/GPU/hr from HW_REGISTRY costh — b200 1.73, mi355x 1.50,
    // gb300 2.31.
    expect(byHardware.b200.costPerMtok).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.b200 * 1e6) / (7200 * 3600),
      6,
    );
    expect(byHardware.b200.costVsReferencePct).toBeNull();
    expect(byHardware.mi355x.costPerMtok).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.mi355x * 1e6) / (9000 * 3600),
      6,
    );
    expect(byHardware.mi355x.costVsReferencePct).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.mi355x * 1e6) /
        (9000 * 3600) /
        ((JULY_2026_HYPERSCALER_TCO.b200 * 1e6) / (7200 * 3600)) -
        1,
      6,
    );
    expect(byHardware.mi355x.costVsReferencePct).toBeLessThan(0);
    expect(byHardware.gb300.costVsReferencePct).toBeGreaterThan(0);
    expect(byHardware.b300.costPerMtok).toBeNull();
    expect(byHardware.b300.costVsReferencePct).toBeNull();
  });

  it('computes hardware deltas against the selected reference instead of always using B200', () => {
    const rows = [
      ...frontier([10800, 7200, 6300, 5400], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
      ...frontier([11700, 8100, 7200, 6300], {
        hardware: 'b300',
        precision: Precision.FP4,
      }),
      ...frontier([12600, 9000, 8100, 7200], {
        hardware: 'mi355x',
        precision: Precision.FP4,
      }),
    ];
    const summary = buildOverviewModelSummary(
      Model.Qwen3_5,
      rows,
      50,
      'community',
      'single_turn_8k1k',
      'b300',
    );
    const byHardware = Object.fromEntries(
      summary.platforms.map((platform) => [platform.hardware, platform]),
    );
    const b200Cost = byHardware.b200.costPerMtok!;
    const b300Cost = byHardware.b300.costPerMtok!;
    const mi355xCost = byHardware.mi355x.costPerMtok!;

    expect(byHardware.b300.costVsReferencePct).toBeNull();
    expect(byHardware.b200.costVsReferencePct).toBeCloseTo(b200Cost / b300Cost - 1, 6);
    expect(byHardware.mi355x.costVsReferencePct).toBeCloseTo(mi355xCost / b300Cost - 1, 6);
  });

  it('keeps a platform cost without a B200 baseline so the UI can badge it ∞', () => {
    const summary = buildOverviewModelSummary(
      Model.Qwen3_5,
      frontier([12600, 9000, 8100, 7200], { hardware: 'gb300', precision: Precision.FP4 }),
      50,
      'community',
    );
    const gb300 = summary.platforms.find((p) => p.hardware === 'gb300')!;

    expect(gb300.costPerMtok).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.gb300 * 1e6) / (9000 * 3600),
      6,
    );
    expect(gb300.costVsReferencePct).toBeNull();
    expect(summary.platforms.find((p) => p.hardware === 'b200')?.costPerMtok).toBeNull();
  });

  it('includes vLLM and SGLang wrapper families in community scope and excludes ATOM/TRTLLM', () => {
    const rows = [
      ...frontier([10800, 9000, 7200, 5400], {
        hardware: 'mi355x',
        framework: 'dynamo-vllm',
        precision: Precision.FP4,
      }),
      ...frontier([9900, 8100, 6300, 4500], {
        hardware: 'b200',
        framework: 'llmd-vllm',
        precision: Precision.FP4,
      }),
      ...frontier([10350, 8550, 6750, 4950], {
        hardware: 'gb300',
        framework: 'dynamo-sglang',
        precision: Precision.FP4,
      }),
      ...frontier([9450, 7650, 5850, 4050], {
        hardware: 'b200',
        framework: 'mori-sglang',
        precision: Precision.FP4,
      }),
      ...frontier([13500, 11700, 9900, 8100], {
        hardware: 'mi355x',
        framework: 'atom',
        precision: Precision.FP4,
      }),
      ...frontier([12600, 10800, 9000, 7200], {
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

  it('stamps community scope without a dataset date field', () => {
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
    expect(page).not.toHaveProperty('datasetThroughDate');
  });

  it('keeps the tier interpolation input off the wire', () => {
    const page = assembleOverviewPageData(
      {
        [Model.Qwen3_5]: [
          row({ framework: 'dynamo-vllm', date: '2026-07-20' }),
          row({ framework: 'atom', date: '2026-07-21' }),
        ],
      },
      50,
    );

    // The reads that back the matrix must exist, or the assertion below passes
    // vacuously on an empty payload.
    expect(page.models.some((model) => model.platforms.some((p) => p.read.config !== null))).toBe(
      true,
    );
    expect(JSON.stringify(page)).not.toContain('tierValues');
  });

  it('ranks same-bucket configs by total throughput even when output ranking disagrees', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      row({
        hardware: 'b200',
        framework: 'dynamo-vllm',
        precision: Precision.FP4,
        metrics: { median_intvty: 50, tput_per_gpu: 8000, output_tput_per_gpu: 2000 },
      }),
      row({
        hardware: 'b200',
        framework: 'llmd-vllm',
        precision: Precision.FP4,
        metrics: { median_intvty: 50, tput_per_gpu: 9900, output_tput_per_gpu: 900 },
      }),
    ]);
    const b200 = summary.platforms.find((p) => p.hardware === 'b200')!;

    expect(b200.read.config?.framework).toBe('llmd-vllm');
    expect(b200.read.value).toBe(9900);
    expect(b200.costPerMtok).toBeCloseTo((JULY_2026_HYPERSCALER_TCO.b200 * 1e6) / (9900 * 3600), 6);
  });

  it('builds one serving-series frontier across topology variants', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      row({
        hardware: 'gb300',
        precision: Precision.FP4,
        decode_tp: 4,
        decode_num_workers: 1,
        num_decode_gpu: 4,
        metrics: { median_intvty: 40, tput_per_gpu: 10800, output_tput_per_gpu: 123 },
      }),
      row({
        hardware: 'gb300',
        precision: Precision.FP4,
        decode_tp: 16,
        decode_num_workers: 2,
        num_decode_gpu: 16,
        metrics: { median_intvty: 60, tput_per_gpu: 7200, output_tput_per_gpu: 123 },
      }),
      ...frontier([9900, 8100, 6300, 4500], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      value: 8662.5,
      boundary: 'interpolated',
      estimated: true,
    });
  });

  it('marks a target tier backed by an observed frontier knot as exact', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([10800, 9000, 7200, 5400], {
        hardware: 'gb300',
        precision: Precision.FP4,
      }),
      ...frontier([9900, 8100, 6300, 4500], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      value: 9000,
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
        metrics: { median_intvty: 40, tput_per_gpu: 16200, output_tput_per_gpu: 123 },
      }),
      row({
        hardware: 'gb300',
        precision: Precision.FP4,
        disagg: true,
        is_multinode: true,
        num_prefill_gpu: 4,
        num_decode_gpu: 8,
        metrics: { median_intvty: 60, tput_per_gpu: 10800, output_tput_per_gpu: 123 },
      }),
      ...frontier([9900, 8100, 6300, 4500], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      estimated: true,
      evidenceTopologies: ['4P+8D'],
    });
  });

  it('normalizes disaggregated total throughput by all deployed GPUs before interpolation', () => {
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
          tput_per_gpu: 5169.251003712194,
          output_tput_per_gpu: 123,
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
          tput_per_gpu: 3248.972986719746,
          output_tput_per_gpu: 123,
        },
      }),
      ...frontier([9450, 8100, 6300, 4500], {
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
      ...frontier([10800, 9000, 7200, 5400], {
        hardware: 'gb300',
        precision: Precision.FP4,
        disagg: false,
        is_multinode: true,
        num_prefill_gpu: 8,
        num_decode_gpu: 8,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      value: 9000,
      evidenceTopologies: [],
    });
  });

  it('normalizes disaggregated rows even when they run on one node', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([16200, 13500, 10800, 8100], {
        hardware: 'gb300',
        precision: Precision.FP4,
        disagg: true,
        is_multinode: false,
        num_prefill_gpu: 4,
        num_decode_gpu: 8,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read).toMatchObject({
      value: 9000,
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
      metrics: { median_intvty: 40, tput_per_gpu: 10800, output_tput_per_gpu: 123 },
    });
    const newerTopology = row({
      hardware: 'gb300',
      precision: Precision.FP4,
      date: '2026-07-20',
      decode_tp: 16,
      num_decode_gpu: 16,
      metrics: { median_intvty: 60, tput_per_gpu: 7200, output_tput_per_gpu: 123 },
    });

    expect(dedupeRowsToLatestPerConfig([olderTopology, newerTopology])).toEqual([newerTopology]);

    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      olderTopology,
      newerTopology,
      ...frontier([9900, 8100, 6300, 4500], {
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
        metrics: { median_intvty: 40, tput_per_gpu: 10800, output_tput_per_gpu: 123 },
      }),
      row({
        hardware: 'gb300',
        precision: Precision.FP4,
        metrics: { median_intvty: 60, tput_per_gpu: 7200, output_tput_per_gpu: 123 },
        ...secondOverrides,
      }),
      ...frontier([9900, 8100, 6300, 4500], {
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'gb300-vs-b200')?.candidate.read.value).toBeNull();
  });

  it('uses speculative FP4, speculative FP8, standard FP4, then standard FP8', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([8100, 6300, 4500, 2700], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([12600, 10800, 9000, 7200], {
        hardware: 'b200',
        precision: Precision.FP4,
        spec_method: 'none',
      }),
      ...frontier([9900, 8100, 6300, 4500], { hardware: 'mi355x', precision: Precision.FP8 }),
      ...frontier([13500, 11700, 9900, 8100], {
        hardware: 'mi355x',
        precision: Precision.FP4,
        spec_method: 'none',
      }),
      ...frontier([11700, 9900, 8100, 6300], {
        hardware: 'b300',
        precision: Precision.FP4,
        spec_method: 'none',
      }),
      ...frontier([13500, 11700, 9900, 8100], {
        hardware: 'b300',
        precision: Precision.FP8,
        spec_method: 'none',
      }),
      ...frontier([10800, 9000, 7200, 5400], {
        hardware: 'gb200',
        precision: Precision.FP8,
        spec_method: 'none',
      }),
      ...frontier([9900, 8100, 6300, 4500], {
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
      { hardware: 'b200', precision: Precision.FP4, value: 6300 },
      { hardware: 'mi355x', precision: Precision.FP8, value: 8100 },
      { hardware: 'b300', precision: Precision.FP4, value: 9900 },
      { hardware: 'gb200', precision: Precision.FP8, value: 9000 },
      { hardware: 'gb300', precision: Precision.FP4, value: 8100 },
    ]);
  });
});

describe('overview historical window', () => {
  it('anchors the target and floor to the latest database evidence date', () => {
    expect(overviewHistoricalWindow('2026-08-03')).toEqual({
      key: '30d',
      snapshotDate: '2026-08-03',
      targetDate: '2026-07-04',
      earliestDate: '2026-06-04',
    });
  });

  it.each([
    ['7d', '2026-07-27', '2026-07-20'],
    ['60d', '2026-06-04', '2026-04-05'],
    ['90d', '2026-05-05', '2026-02-04'],
  ] as const)(
    'sizes the %s window to its day count with a window-wide floor',
    (key, target, earliest) => {
      expect(overviewHistoricalWindow('2026-08-03', key)).toEqual({
        key,
        snapshotDate: '2026-08-03',
        targetDate: target,
        earliestDate: earliest,
      });
    },
  );

  it('returns the latest date across model buckets', () => {
    expect(
      overviewSnapshotDate({
        a: [row({ date: '2026-07-30' })],
        b: [row({ date: '2026-08-03' })],
      }),
    ).toBe('2026-08-03');
  });

  it('ignores newer rows that cannot appear in the overview', () => {
    expect(
      overviewSnapshotDate({
        qwen: [
          row({ date: '2026-07-30' }),
          row({ date: '2026-08-03', hardware: 'h200' }),
          row({ date: '2026-08-02', isl: 1024, osl: 1024 }),
        ],
      }),
    ).toBe('2026-07-30');
  });

  it('ignores newer rows from scenarios excluded by the curated model layout', () => {
    expect(
      overviewSnapshotDate({
        [Model.Kimi_K2_5]: [
          row({ model: 'kimik2.5', date: '2026-07-30' }),
          agenticRow(50, 25, 7650, 850, {
            model: 'kimik2.5',
            date: '2026-08-03',
          }),
        ],
      }),
    ).toBe('2026-07-30');
  });

  it('anchors the snapshot date to rows visible in the active engine scope', () => {
    const rows = {
      [Model.Qwen3_5]: [
        row({ date: '2026-07-30', framework: 'sglang' }),
        row({ date: '2026-08-03', framework: 'atom' }),
      ],
    };

    expect(overviewSnapshotDate(rows, 'community')).toBe('2026-07-30');
    expect(overviewSnapshotDate(rows, 'all')).toBe('2026-08-03');
  });

  it('returns null when every model bucket is empty', () => {
    expect(overviewSnapshotDate({ a: [], b: [] })).toBeNull();
  });

  it('uses the selected tier evidence date instead of the config latest date', () => {
    const read = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontier([12000, 10000, 8000, 6000], { date: '2026-08-01' }),
    ]).platforms[0].read;

    expect(
      overviewTierEvidenceDate({
        ...read,
        evidenceDate: { from: '2026-07-03', to: '2026-07-04' },
      }),
    ).toBe('2026-07-04');
    expect(overviewTierEvidenceDate({ ...read, evidenceDate: null })).toBe('2026-08-01');
  });
});

describe('assembleOverviewHistoricalPageData', () => {
  const window = {
    key: '30d',
    snapshotDate: '2026-08-03',
    targetDate: '2026-07-04',
    earliestDate: '2026-06-04',
  } as const;
  const currentRows = {
    [Model.Qwen3_5]: [
      ...frontier([12000, 10000, 8000, 6000], {
        hardware: 'mi355x',
        framework: 'sglang',
        date: '2026-08-01',
        precision: Precision.FP4,
      }),
      ...frontier([9600, 8000, 6400, 4800], {
        hardware: 'b300',
        framework: 'sglang',
        date: '2026-08-02',
        precision: Precision.FP4,
      }),
      ...frontier([8400, 7000, 5600, 4200], {
        hardware: 'gb200',
        framework: 'sglang',
        date: '2026-07-04',
        precision: Precision.FP4,
      }),
    ],
  };
  const baselineRows = {
    [Model.Qwen3_5]: [
      ...frontier([9600, 8000, 6400, 4800], {
        hardware: 'mi355x',
        framework: 'vllm',
        date: '2026-06-20',
        precision: Precision.FP4,
      }),
      ...frontier([8400, 7000, 5600, 4200], {
        hardware: 'gb200',
        framework: 'sglang',
        date: '2026-06-20',
        precision: Precision.FP4,
      }),
    ],
  };

  it('compares each current platform envelope with the same historical platform', () => {
    const page = assembleOverviewHistoricalPageData(
      currentRows,
      baselineRows,
      window,
      50,
      'community',
    );
    const platform = platformFor(page, Model.Qwen3_5, 'single_turn_8k1k', 'mi355x');

    expect(page.comparisonMode).toBe('30d');
    expect(page.historicalWindow).toEqual(window);
    expect(platform?.historicalComparison?.status).toBe('comparable');
    expect(platform?.historicalComparison?.costDeltaPct).toBeCloseTo(-0.2, 9);
    expect(platform?.historicalComparison?.baselineDate).toBe('2026-06-20');
  });

  it('marks a priced current cell without a baseline as no_baseline', () => {
    const page = assembleOverviewHistoricalPageData(
      currentRows,
      baselineRows,
      window,
      50,
      'community',
    );
    const comparison = platformFor(
      page,
      Model.Qwen3_5,
      'single_turn_8k1k',
      'b300',
    )?.historicalComparison;

    expect(comparison).toEqual({
      status: 'no_baseline',
      baselineCostPerMtok: null,
      costDeltaPct: null,
      baselineDate: null,
      baselineConfig: null,
    });
  });

  it('does not report zero improvement when current evidence is not newer than the cutoff', () => {
    const page = assembleOverviewHistoricalPageData(
      currentRows,
      baselineRows,
      window,
      50,
      'community',
    );
    const comparison = platformFor(
      page,
      Model.Qwen3_5,
      'single_turn_8k1k',
      'gb200',
    )?.historicalComparison;

    expect(comparison?.status).toBe('no_newer_result');
    expect(comparison?.costDeltaPct).toBeNull();
  });

  it('allows the winning engine to change between snapshots', () => {
    const page = assembleOverviewHistoricalPageData(
      currentRows,
      baselineRows,
      window,
      50,
      'community',
    );
    const current = platformFor(page, Model.Qwen3_5, 'single_turn_8k1k', 'mi355x');
    const baseline = buildOverviewModelSummary(
      Model.Qwen3_5,
      baselineRows[Model.Qwen3_5],
      50,
      'community',
      'single_turn_8k1k',
    ).platforms.find((platform) => platform.hardware === 'mi355x');

    expect(current?.read.config?.framework).toBe('sglang');
    expect(baseline?.read.config?.framework).toBe('vllm');
    expect(current?.historicalComparison?.status).toBe('comparable');
    expect(current?.historicalComparison?.baselineConfig?.framework).toBe('vllm');
    expect(current?.historicalComparison?.baselineConfig?.key).toBe(baseline?.read.config?.key);
  });
});

describe('overview platform selection', () => {
  it('keeps FP4 platform boundaries when neither side has an exact read', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      ...frontierAt(
        [
          [60, 8100],
          [70, 7200],
          [80, 6300],
          [90, 5400],
        ],
        { hardware: 'mi355x', precision: Precision.FP4 },
      ),
      ...frontierAt(
        [
          [20, 4500],
          [30, 4050],
          [40, 3600],
          [45, 3150],
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
      ...frontier([10800, 9000, 7200, 5400], {
        hardware: 'mi355x',
        precision: Precision.FP4,
      }),
      ...frontierAt(
        [
          [20, 4500],
          [30, 4050],
          [40, 3600],
          [45, 3150],
        ],
        { hardware: 'b200', precision: Precision.FP4 },
      ),
    ]);

    const pair = headlinePairOf(summary, 'mi355x-vs-b200');
    expect(pair?.candidate.read).toMatchObject({ value: 9000, boundary: 'interpolated' });
    expect(pair?.baseline.read).toMatchObject({ value: null, boundary: 'unreachable' });
    expect(pair?.baseline.missingReason).toBe('cannot_reach_at_tier');
  });

  it('shows each platform’s independently selected release', () => {
    const summary = buildOverviewModelSummary(Model.Kimi_K2_5, [
      ...frontier([10800, 9000, 7200, 5400], {
        model: 'kimik2.5',
        hardware: 'b200',
        precision: Precision.FP4,
        date: '2026-07-10',
      }),
      ...frontier([9900, 8100, 6300, 4500], {
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
      ...frontier([10800, 9000, 7200, 5400], {
        model: 'qwen3.5-a',
        hardware: 'mi355x',
        precision: Precision.FP4,
      }),
      ...frontier([6300, 4500, 3600, 2700], {
        model: 'qwen3.5-a',
        hardware: 'b200',
        precision: Precision.FP4,
      }),
      ...frontier([9900, 8100, 6300, 4500], {
        model: 'qwen3.5-b',
        hardware: 'mi355x',
        precision: Precision.FP4,
      }),
      ...frontier([9900, 8100, 6300, 4500], {
        model: 'qwen3.5-b',
        hardware: 'b200',
        precision: Precision.FP4,
      }),
    ]);

    expect(headlinePairOf(summary, 'mi355x-vs-b200')).toMatchObject({
      candidate: { read: { value: 9000, config: { dbModel: 'qwen3.5-a' } } },
      baseline: { read: { value: 8100, config: { dbModel: 'qwen3.5-b' } } },
    });
  });

  it('claims cannot-reach only when every speculative bucket is unreachable', () => {
    const unreachable: [number, number][] = [
      [20, 4500],
      [30, 4050],
      [40, 3600],
      [45, 3150],
    ];
    const underSwept: [number, number][] = [
      [60, 8100],
      [70, 7200],
      [80, 6300],
      [90, 5400],
    ];
    const baseline = frontier([10800, 9000, 7200, 5400], {
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
      ...frontier([10800, 9000, 7200, 5400], { hardware: 'b200', precision: Precision.FP4 }),
      ...frontier([9900, 8100, 6300, 4500], {
        hardware: 'mi355x',
        precision: Precision.FP8,
        spec_method: 'none',
      }),
      row({ hardware: 'b300', precision: Precision.INT4 }),
    ]);

    expect(headlinePairOf(summary, 'mi355x-vs-b200')?.candidate).toMatchObject({
      missingReason: null,
      precision: Precision.FP8,
      read: { value: 8100, config: { specMethod: 'none' } },
    });
    expect(headlinePairOf(summary, 'b300-vs-b200')?.candidate.missingReason).toBe('int4_bf16_only');
  });

  it('drops single-turn rows without a total-throughput metric instead of pricing them', () => {
    const summary = buildOverviewModelSummary(Model.Qwen3_5, [
      row({
        hardware: 'b200',
        precision: Precision.FP4,
        metrics: { median_intvty: 50, output_tput_per_gpu: 1000 },
      }),
    ]);

    expect(summary.platforms.find(({ hardware }) => hardware === 'b200')).toMatchObject({
      read: { value: null },
      costPerMtok: null,
      missingReason: 'no_scenario_data',
    });
  });

  it('falls back to standard decode for AgentX when no speculative result exists', () => {
    const agentxRows = [0, 1, 2].map((index) =>
      agenticRow(40 + index * 10, 30 - index * 5, 9000 - index * 900, 1000 - index * 100, {
        hardware: 'b300',
        spec_method: 'none',
        conc: index + 1,
      }),
    );

    const summary = buildOverviewModelSummary(Model.GLM_5_2, agentxRows);
    expect(summary.scenario).toBe('agentx');
    expect(summary.platforms.find(({ hardware }) => hardware === 'b300')).toMatchObject({
      missingReason: null,
      precision: Precision.FP4,
      read: { value: 8100, config: { specMethod: 'none' } },
    });
  });

  it('reads AgentX at the chart-default P90 contract and prices total tokens', () => {
    const summary = buildOverviewModelSummary(Model.GLM_5_2, [
      agenticRow(40, 30, 12600, 1200, { hardware: 'b200', conc: 8 }),
      agenticRow(50, 25, 10800, 850, { hardware: 'b200', conc: 12 }),
      agenticRow(60, 20, 9000, 800, { hardware: 'b200', conc: 16 }),
    ]);

    expect(summary.scenario).toBe('agentx');
    const b200 = summary.platforms.find(({ hardware }) => hardware === 'b200')!;
    expect(b200.read).toMatchObject({
      value: 10800,
      boundary: 'interpolated',
      estimated: false,
    });
    expect(b200.costPerMtok).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.b200 * 1e6) / (10800 * 3600),
      6,
    );
  });

  it('builds one AgentX frontier from mixed standard and MTP points', () => {
    const summary = buildOverviewModelSummary(Model.GLM_5_2, [
      agenticRow(40, 30, 12600, 1200, {
        hardware: 'b200',
        conc: 8,
        spec_method: 'none',
      }),
      agenticRow(50, 25, 10800, 850, {
        hardware: 'b200',
        conc: 12,
        spec_method: 'mtp',
      }),
      agenticRow(60, 20, 9000, 800, {
        hardware: 'b200',
        conc: 16,
        spec_method: 'none',
      }),
    ]);

    const config = summary.platforms.find(({ hardware }) => hardware === 'b200')?.read.config;
    expect(config).toMatchObject({
      specMethod: 'mixed',
      specLabel: 'STP + MTP',
      hwKey: 'b200_sglang',
    });
  });

  it('restricts AgentX points to the E2E frontier on total throughput', () => {
    // The slower-E2E point wins on output tokens but loses on total tokens, so
    // the total-token frontier drops it and the tier read becomes unreachable.
    const summary = buildOverviewModelSummary(Model.GLM_5_2, [
      agenticRow(40, 20, 9000, 500, { hardware: 'b200', conc: 8 }),
      agenticRow(50, 25, 8100, 900, { hardware: 'b200', conc: 12 }),
    ]);

    const b200 = summary.platforms.find(({ hardware }) => hardware === 'b200')!;
    expect(b200.read.value).toBeNull();
    expect(b200.missingReason).toBe('cannot_reach_at_tier');
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
          tput_per_gpu: 10800,
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
          ...frontier([9000, 7200, 5400, 3600], { hardware: 'mi355x', precision: Precision.FP4 }),
          ...frontier([10800, 9000, 7200, 5400], { hardware: 'b200', precision: Precision.FP4 }),
        ],
      },
      100,
    );

    const pair = headlinePairOf(
      page.models.find((m) => m.model === Model.Qwen3_5)!,
      'mi355x-vs-b200',
    );
    expect(pair?.candidate.read).toMatchObject({ tier: 100, value: 3600 });
    expect(pair?.baseline.read).toMatchObject({ tier: 100, value: 5400 });
  });

  it('turns an unreachable @50 side into an exact read on the 30 view', () => {
    const rows = [
      ...frontier([10800, 9000, 7200, 5400], { hardware: 'mi355x', precision: Precision.FP4 }),
      ...frontierAt(
        [
          [20, 4500],
          [30, 4050],
          [40, 3600],
          [45, 3150],
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
    expect(at30?.baseline.read).toMatchObject({ tier: 30, value: 4050 });
    expect(at30?.baseline.missingReason).toBeNull();
  });

  it('re-selects each platform independently at the displayed tier', () => {
    const page = (tier?: 30 | 50 | 75 | 100) =>
      assembleOverviewPageData(
        {
          [Model.Qwen3_5]: [
            ...frontier([10800, 9000, 7200, 3600], {
              hardware: 'mi355x',
              precision: Precision.FP4,
            }),
            ...frontier([9900, 8100, 7650, 6300], { hardware: 'mi355x', precision: Precision.FP8 }),
            ...frontier([10800, 9000, 7200, 5400], { hardware: 'b200', precision: Precision.FP8 }),
          ],
        },
        tier,
      ).models.find((m) => m.model === Model.Qwen3_5)!;

    const at50 = headlinePairOf(page(), 'mi355x-vs-b200');
    expect(at50?.candidate.precision).toBe(Precision.FP4);
    expect(at50?.candidate.read.value).toBe(9000);
    expect(at50?.baseline.precision).toBe(Precision.FP8);
    expect(at50?.baseline.read.value).toBe(9000);

    const at100 = headlinePairOf(page(100), 'mi355x-vs-b200');
    expect(at100?.candidate.precision).toBe(Precision.FP4);
    expect(at100?.candidate.read.value).toBe(3600);
    expect(at100?.baseline.precision).toBe(Precision.FP8);
    expect(at100?.baseline.read.value).toBe(5400);
  });
});

// Drift guard: runs the real assembler over the e2e fixture; expectations are
// engine-derived, never eyeballed. Contract drift fails here, not in overview.cy.ts.
describe('assembleOverviewPageData over the overview-rows fixture', () => {
  it('serves every matrix cell state through the real builder', () => {
    const page = assembleOverviewPageData(
      overviewRowsFixture as unknown as Record<string, BenchmarkRow[]>,
    );

    // Curated scenarios: DeepSeek, MiniMax and Qwen each get both rows, Kimi
    // K3 and GLM are AgentX-only. Kimi K2.5 is absent — deprecated models are
    // not default models, and the matrix is built from DEFAULT_MODELS.
    expect(page.models.map((m) => `${m.model}/${m.scenario}`)).toEqual([
      `${Model.DeepSeek_V4_Pro}/single_turn_8k1k`,
      `${Model.DeepSeek_V4_Pro}/agentx`,
      `${Model.Kimi_K3}/agentx`,
      `${Model.MiniMax_M3}/single_turn_8k1k`,
      `${Model.MiniMax_M3}/agentx`,
      `${Model.GLM_5_2}/agentx`,
      `${Model.Qwen3_5}/single_turn_8k1k`,
      `${Model.Qwen3_5}/agentx`,
    ]);
    expect(page.models.length).toBeGreaterThan(DEFAULT_MODELS.size);
    expect(page).not.toHaveProperty('datasetThroughDate');
    expect(page.tier).toBe(50);

    // DeepSeek: only each series' latest-date sweep survives. B300 and MI355X
    // therefore have no exact @50 read; GB200's independent FP8 remains visible.
    // GB300's points are single-node and multi-node aggregate deployments, so
    // they must not be interpolated into one synthetic serving curve.
    const deepseek = page.models.find((m) => m.model === Model.DeepSeek_V4_Pro)!;
    const dsB300 = headlinePairOf(deepseek, 'b300-vs-b200')!;
    expect(dsB300.baseline.read.value).toBeCloseTo(8101.968);
    expect(dsB300.baseline.costPerMtok).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.b200 * 1e6) / (8101.968 * 3600),
      6,
    );
    expect(dsB300.candidate.read.value).toBeNull();
    expect(dsB300.candidate.costPerMtok).toBeNull();
    expect(dsB300.candidate.missingReason).toBe('no_exact_at_tier');
    const dsGb200 = headlinePairOf(deepseek, 'gb200-vs-b200')!;
    expect(dsGb200.candidate.precision).toBe(Precision.FP8);
    expect(dsGb200.candidate.read.value).toBe(5100);
    expect(dsGb200.candidate.costPerMtok).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.gb200 * 1e6) / (5100 * 3600),
      6,
    );
    expect(headlinePairOf(deepseek, 'mi355x-vs-b200')?.candidate.missingReason).toBe(
      'no_exact_at_tier',
    );
    const dsGb300 = headlinePairOf(deepseek, 'gb300-vs-b200')!;
    expect(dsGb300.candidate.read.value).toBeNull();
    expect(dsGb300.candidate.read.evidenceTopologies).toEqual([]);
    expect(dsGb300.candidate.missingReason).toBe('no_exact_at_tier');

    // DeepSeek's AgentX row is priced from its agentic-trace rows alone — the
    // single-turn sweeps never leak into it, so only the two benchmarked
    // platforms carry a read.
    const deepseekAgentx = page.models.find(
      (m) => m.model === Model.DeepSeek_V4_Pro && m.scenario === 'agentx',
    )!;
    const dsxB200 = deepseekAgentx.platforms.find((p) => p.hardware === 'b200')!;
    expect(dsxB200.read.value).toBe(7500);
    expect(dsxB200.costPerMtok).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.b200 * 1e6) / (7500 * 3600),
      6,
    );
    // Distinct from this model's single-turn B200 read (8101.968), so a
    // regression that fed single-turn rows into this row would land there.
    expect(dsxB200.read.value).not.toBeCloseTo(8101.968, 3);
    const dsxMi355x = deepseekAgentx.platforms.find((p) => p.hardware === 'mi355x')!;
    expect(dsxMi355x.read.value).toBe(6000);
    expect(dsxMi355x.costVsReferencePct).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.mi355x * 1e6) /
        6000 /
        ((JULY_2026_HYPERSCALER_TCO.b200 * 1e6) / 7500) -
        1,
      6,
    );
    expect(
      deepseekAgentx.platforms
        .filter((p) => ['b300', 'gb200', 'gb300'].includes(p.hardware))
        .map((p) => p.missingReason),
    ).toEqual(['no_scenario_data', 'no_scenario_data', 'no_scenario_data']);

    // MiniMax: the platform result remains visible when B200 has no 8K/1K data
    // — priced, but with no percentage baseline (the UI's ∞ badge state).
    const minimax = page.models.find((m) => m.model === Model.MiniMax_M3)!;
    const mmGb300 = headlinePairOf(minimax, 'gb300-vs-b200')!;
    expect(mmGb300.baseline.missingReason).toBe('no_scenario_data');
    expect(mmGb300.candidate.read.value).toBe(6510);
    expect(mmGb300.candidate.costPerMtok).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.gb300 * 1e6) / (6510 * 3600),
      6,
    );
    expect(mmGb300.candidate.costVsReferencePct).toBeNull();

    // Qwen: MI355X independently falls back to FP8 while B200 and B300 use FP4.
    const qwen = page.models.find((m) => m.model === Model.Qwen3_5)!;
    const qwenMi = headlinePairOf(qwen, 'mi355x-vs-b200')!;
    expect(qwenMi.candidate.precision).toBe(Precision.FP8);
    expect(qwenMi.candidate.read.value).toBe(6688);
    expect(qwenMi.candidate.costPerMtok).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.mi355x * 1e6) / (6688 * 3600),
      6,
    );
    expect(qwenMi.baseline.precision).toBe(Precision.FP4);
    expect(qwenMi.baseline.read.value).toBeCloseTo(6602.344);
    expect(qwenMi.candidate.costVsReferencePct).toBeCloseTo(
      (JULY_2026_HYPERSCALER_TCO.mi355x * 1e6) /
        (6688 * 3600) /
        ((JULY_2026_HYPERSCALER_TCO.b200 * 1e6) / (6602.344 * 3600)) -
        1,
      6,
    );
    const qwenB300 = headlinePairOf(qwen, 'b300-vs-b200')!;
    expect(qwenB300.candidate.precision).toBe(Precision.FP4);
    expect(qwenB300.candidate.read.value).toBeCloseTo(10585.75);
    expect(qwenB300.baseline.precision).toBe(Precision.FP4);
    expect(qwenB300.baseline.read.value).toBeCloseTo(6602.344);

    // Standard-decode-only rows remain visible as explicitly labelled
    // fallbacks: Qwen's GB300 slice has no speculative read, so the platform
    // resolves to its STP row rather than reporting missing data. Each platform
    // is selected independently, so the B200 baseline still picks its own
    // best (speculative) read.
    const qwenGb300 = headlinePairOf(qwen, 'gb300-vs-b200')!;
    expect(qwenGb300.candidate.precision).toBe(Precision.FP8);
    expect(qwenGb300.candidate.read).toMatchObject({
      value: 8460,
      config: { specMethod: 'none' },
    });
    expect(qwenGb300.candidate.missingReason).toBeNull();

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

describe('overview model scope', () => {
  it('resolves valid model scopes and defaults invalid values to default', () => {
    expect(resolveOverviewModelScope('all')).toBe('all');
    expect(resolveOverviewModelScope(['all', 'default'])).toBe('all');
    expect(resolveOverviewModelScope('default')).toBe('default');
    expect(resolveOverviewModelScope('deprecated')).toBe('default');
    expect(resolveOverviewModelScope('')).toBe('default');
    expect(resolveOverviewModelScope(undefined)).toBe('default');
  });

  it('renders only default-category models under the default scope', () => {
    const page = assembleOverviewPageData({});
    expect(new Set(page.models.map((m) => m.model))).toEqual(new Set(DEFAULT_MODELS));
    expect(page.modelScope).toBe('default');
  });

  it("appends maintenance then deprecated rows after defaults under scope 'all'", () => {
    const page = assembleOverviewPageData({}, 50, 'community', 'b200', 'all');
    const orderedUniqueModels = [...new Set(page.models.map((m) => m.model))];
    expect(orderedUniqueModels).toEqual([
      ...DEFAULT_MODELS,
      ...MAINTENANCE_MODELS,
      ...DEPRECATED_MODELS,
    ]);
    expect(page.modelScope).toBe('all');
  });

  it('stamps each model summary with its category', () => {
    const page = assembleOverviewPageData({}, 50, 'community', 'b200', 'all');
    const categoryOf = (model: Model) => page.models.find((m) => m.model === model)?.category;
    expect(categoryOf(Model.DeepSeek_V4_Pro)).toBe('default');
    expect(categoryOf(Model.DeepSeek_R1)).toBe('maintenance');
    expect(categoryOf(Model.GLM_5)).toBe('deprecated');
    expect(categoryOf(Model.GptOss)).toBe('deprecated');
  });

  it('forwards the model scope through the historical assembler', () => {
    const window = overviewHistoricalWindow('2026-07-20');
    const page = assembleOverviewHistoricalPageData({}, {}, window, 50, 'community', 'b200', 'all');
    const orderedUniqueModels = [...new Set(page.models.map((m) => m.model))];
    expect(orderedUniqueModels).toEqual([
      ...DEFAULT_MODELS,
      ...MAINTENANCE_MODELS,
      ...DEPRECATED_MODELS,
    ]);
    expect(page.modelScope).toBe('all');
  });
});
