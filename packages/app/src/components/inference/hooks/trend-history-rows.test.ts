import { describe, expect, it } from 'vitest';

import { METRIC_CONFIG_KEYS, resolveMetricConfigKey } from '@/components/inference/metric-registry';
import { NORMALIZED_TOKEN_REVENUE_PRICING } from '@/components/inference/token-revenue';
import type { TokenRevenuePricing, YAxisMetricKey } from '@/components/inference/types';
import type { BenchmarkRow } from '@/lib/api/api';
import type { TcoBasis } from '@/lib/catalog/constants';

import historyFixture from '../../../../cypress/fixtures/api/benchmarks-history.json';
import {
  buildTrendCurves,
  evaluateTrendCurves,
  groupTrendRows,
  prepareTrendRows,
  trendMetricDependencies,
  type TrendLinesResult,
  type TrendRow,
} from './interpolated-trend-core';
import { compactTrendHistory, expandTrendHistory } from './trend-history-rows';

const fixtureRows = historyFixture as unknown as BenchmarkRow[];

async function overWire(rows: readonly BenchmarkRow[]): Promise<BenchmarkRow[]> {
  return expandTrendHistory(await Response.json(compactTrendHistory(rows)).json());
}

const TARGETS = [5, 10, 20, 35, 50, 100, 200];

function trendOutputs(
  preparedRows: readonly TrendRow[],
  metric: string,
  selectedPrecisions: readonly string[],
  tcoBasis: TcoBasis,
  tokenRevenuePricing: TokenRevenuePricing | null,
): TrendLinesResult[] {
  const trendMetricKey = resolveMetricConfigKey(metric).slice(2) as YAxisMetricKey;
  const grouped = groupTrendRows(preparedRows, {
    selectedPrecisions,
    selectedYAxisMetric: metric,
    requestedMetrics: trendMetricDependencies(trendMetricKey),
    tokenRevenuePricing,
    tcoBasis,
  });
  const curves = buildTrendCurves(grouped, { trendMetricKey, tokenRevenuePricing });
  return TARGETS.map((targetInteractivity) =>
    evaluateTrendCurves(curves, { targetInteractivity, extendToDate: '2026-11-03' }),
  );
}

const base: BenchmarkRow = {
  id: 1,
  hardware: 'b200',
  framework: 'sglang',
  model: 'dsr1',
  precision: 'fp8',
  spec_method: 'none',
  disagg: false,
  is_multinode: false,
  prefill_tp: 8,
  prefill_ep: 1,
  prefill_dp_attention: false,
  prefill_num_workers: 0,
  decode_tp: 8,
  decode_ep: 1,
  decode_dp_attention: false,
  decode_num_workers: 0,
  num_prefill_gpu: 8,
  num_decode_gpu: 8,
  benchmark_type: 'agentic_traces',
  isl: null,
  osl: null,
  conc: 1,
  offload_mode: 'off',
  image: 'lmsysorg/sglang:v0.5.9',
  recipe_fingerprint: null,
  metrics: {},
  date: '2026-03-01',
  workflow_run_id: 11,
  run_started_at: '2026-03-01T00:00:00Z',
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/11',
};

const curve = (date: string, run: number, itl: (conc: number) => Record<string, number>) =>
  [1, 2, 4, 8].map((conc) => ({
    ...base,
    id: run * 100 + conc,
    conc,
    date,
    workflow_run_id: run,
    run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${run}`,
    metrics: { tput_per_gpu: 300 * conc, output_tput_per_gpu: 100 * conc, ...itl(conc) },
  }));

describe('compactTrendHistory', () => {
  it('restores every row column and the run provenance exactly as present', async () => {
    const audit = {
      sensor_kind: 'grace_socket' as const,
      expected_sockets: 2,
      observed_sockets: 2,
    };
    const workers = [{ role: 'agg', worker_idx: 0, hosts: ['h0'], num_gpus: 8, avg_power_w: 700 }];
    const { run_started_at: _absent, ...withoutStart } = base;
    const audited: BenchmarkRow = {
      ...base,
      metrics: { tput_per_gpu: 100, p90_full_response_itl: 0.02, p99_ttft: 3 },
      workers,
    };
    const nullStart: BenchmarkRow = { ...base, id: 2, conc: 2, run_started_at: null };
    const fixed: BenchmarkRow = {
      ...base,
      id: 3,
      benchmark_type: 'single_turn',
      isl: 1024,
      osl: 1024,
      recipe_fingerprint: 'abc',
      metrics: { tput_per_gpu: 50, median_intvty: 40, p90_itl: 0.03, avg_power_w: 600 },
      curve_date: '2026-03-02',
      curve_workflow_run_id: 12,
      curve_run_started_at: null,
    };
    const noStart: BenchmarkRow = { ...withoutStart, id: 4, conc: 4 };
    const rows = [
      {
        ...audited,
        power_audit: { window_start_unix: 1, cpu: audit },
        power_invalid_reasons: ['gap'],
      },
      { ...nullStart, power_audit: { sample_count: 3 } },
      fixed,
      noStart,
    ];

    expect(await overWire(rows)).toStrictEqual([
      {
        ...audited,
        metrics: { tput_per_gpu: 100, p90_full_response_itl: 0.02 },
        power_audit: { cpu: audit },
      },
      nullStart,
      { ...fixed, metrics: { tput_per_gpu: 50, avg_power_w: 600, median_intvty: 40 } },
      noStart,
    ]);
  });

  it('draws the same trend lines as the published rows for every metric', async () => {
    const preparedRaw = prepareTrendRows(fixtureRows);
    const preparedExpanded = prepareTrendRows(await overWire(fixtureRows));
    const openRouter: TokenRevenuePricing = {
      source: 'openrouter',
      inputPerMillion: 0.6,
      cachedInputPerMillion: 0.15,
      outputPerMillion: 2.4,
    };
    let lines = 0;
    for (const metric of METRIC_CONFIG_KEYS) {
      const pricings =
        metric === 'y_tokenRevenuePerGpuHour'
          ? [NORMALIZED_TOKEN_REVENUE_PRICING, openRouter, null]
          : [NORMALIZED_TOKEN_REVENUE_PRICING];
      for (const precisions of [['fp4'], ['fp8'], ['fp4', 'fp8']]) {
        for (const tcoBasis of ['internal', 'external'] as const) {
          for (const pricing of pricings) {
            const raw = trendOutputs(preparedRaw, metric, precisions, tcoBasis, pricing);
            expect(trendOutputs(preparedExpanded, metric, precisions, tcoBasis, pricing)).toEqual(
              raw,
            );
            for (const { trendLines } of raw) lines += trendLines.size;
          }
        }
      }
    }
    expect(lines).toBeGreaterThan(0);
  });

  it('keeps the inputs that decide agentic interactivity', async () => {
    const rows = [
      ...curve('2026-03-01', 1, (conc) => ({ p90_full_response_itl: 0.01 * conc, p90_itl: 1 })),
      ...curve('2026-03-02', 2, (conc) => ({ p90_itl: 0.012 * conc })),
      ...curve('2026-03-03', 3, (conc) => ({
        median_full_response_itl: 0.01,
        p90_itl: 0.01 * conc,
      })),
    ];
    const raw = trendOutputs(prepareTrendRows(rows), 'y_tpPerGpu', ['fp8'], 'internal', null);
    const dates = raw.flatMap(({ trendLines }) =>
      [...trendLines.values()].flat().flatMap((point) => (point.synthetic ? [] : [point.date])),
    );
    expect(new Set(dates)).toEqual(new Set(['2026-03-01', '2026-03-02']));
    expect(
      trendOutputs(prepareTrendRows(await overWire(rows)), 'y_tpPerGpu', ['fp8'], 'internal', null),
    ).toEqual(raw);
  });
});
