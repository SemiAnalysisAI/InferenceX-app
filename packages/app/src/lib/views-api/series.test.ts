import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import { Sequence } from '@/lib/data-mappings';

import { buildInferenceSeries, type InferenceSeriesOptions } from './series';

let nextId = 1;

function makeRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: nextId++,
    hardware: 'h200',
    framework: 'trt',
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
    benchmark_type: 'single_turn',
    offload_mode: 'off',
    isl: 8192,
    osl: 1024,
    conc: 64,
    image: 'nvcr.io/nvidia/tritonserver:25.01',
    metrics: {
      tput_per_gpu: 450.5,
      output_tput_per_gpu: 400.2,
      input_tput_per_gpu: 50.3,
      median_ttft: 0.15,
      p90_ttft: 0.3,
      p99_ttft: 0.35,
      median_tpot: 0.012,
      p99_tpot: 0.018,
      median_intvty: 12.5,
      p99_intvty: 18.2,
      median_itl: 0.011,
      p99_itl: 0.016,
      median_e2el: 2.3,
      p99_e2el: 3.1,
    },
    date: '2026-03-01',
    run_url: 'https://github.com/org/repo/actions/runs/12345',
    ...overrides,
  } as BenchmarkRow;
}

function metrics(overrides: Record<string, number> = {}) {
  return { ...makeRow().metrics, ...overrides };
}

const BASE_OPTIONS: InferenceSeriesOptions = {
  sequence: Sequence.EightK_OneK,
  percentile: 'p90',
  precisions: ['fp8'],
  metricConfigKey: 'y_tpPerGpu',
  xmode: 'interactivity',
  xmetric: 'p90_ttft',
  gpus: [],
  quickFilters: { vendors: [], frameworks: [], deployment: [], spec: [], power: [] },
  optimal: false,
  best: false,
};

/** Two-hardware fixture: an NVIDIA H200/TRT curve and an AMD MI300X/vLLM curve. */
function fixtureRows(): BenchmarkRow[] {
  return [
    makeRow({ conc: 16, metrics: metrics({ median_intvty: 40, tput_per_gpu: 200 }) }),
    makeRow({ conc: 64, metrics: metrics({ median_intvty: 12.5, tput_per_gpu: 450.5 }) }),
    makeRow({
      hardware: 'mi300x',
      framework: 'vllm',
      conc: 32,
      metrics: metrics({ median_intvty: 25, tput_per_gpu: 300 }),
    }),
  ];
}

function powerSweepRows(): BenchmarkRow[] {
  // The H100-style sweep retained in powerCurves.test.ts: the upper boundary
  // keeps conc=1/2/128 while the minimum-power Pareto frontier keeps only 1.
  return [
    [1, 172.49, 252.22],
    [2, 149.32, 291.38],
    [128, 25.69, 502.54],
    [64, 20.51, 344.95],
    [256, 4.65, 372.9],
  ].map(([conc, interactivity, watts]) =>
    makeRow({
      conc,
      metrics: metrics({
        median_intvty: interactivity,
        median_e2el: 1024 / interactivity,
        avg_power_w: watts,
        prefill_avg_power_w: watts * 0.9,
        decode_avg_power_w: watts * 1.1,
        p75_power_w: watts * 1.2,
        p90_power_w: watts * 1.3,
        power_valid: 1,
        power_metric_schema_version: 2,
        joules_per_output_token: watts / 100,
      }),
    }),
  );
}

describe('buildInferenceSeries', () => {
  it.each([
    ['interactivity', 'mean_tpot_intvty', 20],
    ['ttft', 'mean_ttft', 0.6],
    ['e2e', 'mean_e2el', 5],
  ] as const)('uses recorded means without median fallback for %s', (xmode, field, expected) => {
    const rows = [
      makeRow({
        conc: 1,
        metrics: metrics({ mean_tpot: 0.05, mean_intvty: 77, mean_ttft: 0.6, mean_e2el: 5 }),
      }),
      makeRow({ conc: 2 }),
    ];
    const result = buildInferenceSeries(rows, {
      ...BASE_OPTIONS,
      xmode,
      fixedSequenceStatistic: 'mean',
    });
    expect(result.xAxis).toMatchObject({ field, statistic: 'mean' });
    expect(result.series.flatMap((entry) => entry.points).map((point) => point.x)).toEqual([
      expected,
    ]);
  });

  it('assembles one series per hardware config with x-sorted points', () => {
    const result = buildInferenceSeries(fixtureRows(), BASE_OPTIONS);

    expect(result.series).toHaveLength(2);
    expect(result.count).toBe(3);
    const gpus = result.series.map((entry) => entry.gpu).toSorted();
    expect(gpus).toEqual(['h200', 'mi300x']);

    const h200 = result.series.find((entry) => entry.gpu === 'h200')!;
    expect(h200.points).toHaveLength(2);
    // Points sorted by x ascending (median interactivity).
    expect(h200.points[0].x).toBeLessThan(h200.points[1].x);
    expect(h200.points.map((point) => point.concurrency).toSorted((a, b) => a - b)).toEqual([
      16, 64,
    ]);
    expect(h200.framework).toBe('trt');
    expect(h200.vendor).toBe('NVIDIA');
    expect(h200.deployment).toBe('single-node');
    // GitHub run id parsed from run_url.
    expect(h200.points[0].runId).toBe(12345);
  });

  it('matches the dashboard transform for the selected metric (no duplicated math)', () => {
    const rows = fixtureRows();
    const result = buildInferenceSeries(rows, BASE_OPTIONS);

    // Same pipeline the chart runs: transformBenchmarkRows chart 0 (interactivity).
    const { chartData } = transformBenchmarkRows(rows, 'p90');
    const expected = new Map(
      chartData[0].map((d) => [
        `${String(d.hwKey)}|${d.conc}`,
        (d as unknown as { tpPerGpu?: { y: number } }).tpPerGpu?.y,
      ]),
    );

    for (const entry of result.series) {
      for (const point of entry.points) {
        expect(point.y).toBe(expected.get(`${entry.hwKey}|${point.concurrency}`));
        expect(point.metrics.tpPerGpu).toBe(point.y);
      }
    }
  });

  it('filters by sequence, precision and vendor quick-filter', () => {
    const rows = [
      ...fixtureRows(),
      // Different sequence — excluded.
      makeRow({ isl: 1024, osl: 1024, conc: 8 }),
      // Non-selected precision — excluded.
      makeRow({ precision: 'bf16', conc: 128 }),
    ];

    const all = buildInferenceSeries(rows, BASE_OPTIONS);
    expect(all.count).toBe(3);

    const amdOnly = buildInferenceSeries(rows, {
      ...BASE_OPTIONS,
      quickFilters: { ...BASE_OPTIONS.quickFilters, vendors: ['AMD'] },
    });
    expect(amdOnly.series).toHaveLength(1);
    expect(amdOnly.series[0].gpu).toBe('mi300x');

    const bf16 = buildInferenceSeries(rows, { ...BASE_OPTIONS, precisions: ['bf16'] });
    expect(bf16.count).toBe(1);
    expect(bf16.series[0].points[0].concurrency).toBe(128);
  });

  it('accepts base registry keys and full hardware keys in the gpus filter', () => {
    const rows = fixtureRows();

    // Base registry key expands to every hardware key for that GPU.
    const baseKey = buildInferenceSeries(rows, { ...BASE_OPTIONS, gpus: ['h200'] });
    expect(baseKey.series.map((s) => s.gpu)).toEqual(['h200']);

    // Full hardware key (as shown in dashboard legends) matches exactly.
    const fullKey = buildInferenceSeries(rows, { ...BASE_OPTIONS, gpus: ['mi300x_vllm'] });
    expect(fullKey.series.map((s) => s.hwKey)).toEqual(['mi300x_vllm']);

    // Unknown key selects nothing rather than everything.
    const unknown = buildInferenceSeries(rows, { ...BASE_OPTIONS, gpus: ['tpu-v7'] });
    expect(unknown.series).toHaveLength(0);
  });

  it('keeps only Pareto-frontier points when optimal=true', () => {
    // Second h200 point dominated: lower x AND lower y than conc=16 point.
    const rows = [
      makeRow({ conc: 16, metrics: metrics({ median_intvty: 40, tput_per_gpu: 200 }) }),
      makeRow({ conc: 8, metrics: metrics({ median_intvty: 30, tput_per_gpu: 100 }) }),
    ];
    const all = buildInferenceSeries(rows, BASE_OPTIONS);
    const frontierFlags = all.series[0].points.map((point) => point.frontier);
    expect(frontierFlags).toContain(false);

    const optimal = buildInferenceSeries(rows, { ...BASE_OPTIONS, optimal: true });
    expect(optimal.count).toBe(all.series[0].points.filter((point) => point.frontier).length);
    expect(optimal.series.flatMap((entry) => entry.points).every((point) => point.frontier)).toBe(
      true,
    );
  });

  describe.each(['interactivity', 'e2e'] as const)('measured power on %s', (xmode) => {
    it.each([
      'y_measuredAvgPower',
      'y_measuredPrefillAvgPower',
      'y_measuredDecodeAvgPower',
      'y_measuredP75Power',
      'y_measuredP90Power',
      'y_measuredPowerPercentTdp',
    ] as const)('keeps the upper power boundary for %s', (metricConfigKey) => {
      const rows = powerSweepRows();
      const options = { ...BASE_OPTIONS, metricConfigKey, xmode };
      const all = buildInferenceSeries(rows, options);
      const optimal = buildInferenceSeries(rows, { ...options, optimal: true });
      const expectedConcurrencies = xmode === 'interactivity' ? [128, 2, 1] : [1, 2, 128];

      expect(all.count).toBe(5);
      expect(
        all.series[0].points.filter((point) => point.frontier).map((point) => point.concurrency),
      ).toEqual(expectedConcurrencies);
      expect(optimal.series[0].points.map((point) => point.concurrency)).toEqual(
        expectedConcurrencies,
      );
      expect(optimal.series[0].points).toEqual(
        all.series[0].points.filter((point) => point.frontier),
      );
      expect(optimal.frontier.points).toBe(3);
      expect(optimal.frontier.direction).toBe(
        xmode === 'interactivity' ? 'upper_right' : 'upper_left',
      );
      // The power-demand boundary does not change the registry's efficiency
      // polarity or the direction used by Best per SKU.
      expect(optimal.metric.polarity).toBe('lower');
      expect(optimal.metric.direction).toBe(
        xmode === 'interactivity' ? 'lower_right' : 'lower_left',
      );
    });

    it('preserves the minimum-energy Pareto frontier', () => {
      const optimal = buildInferenceSeries(powerSweepRows(), {
        ...BASE_OPTIONS,
        xmode,
        metricConfigKey: 'y_measuredJPerOutputToken',
        optimal: true,
      });

      expect(optimal.series[0].points.map((point) => point.concurrency)).toEqual([1]);
      expect(optimal.series[0].points[0].y).toBe(252.22 / 100);
      expect(optimal.frontier.direction).toBe(
        xmode === 'interactivity' ? 'lower_right' : 'lower_left',
      );
    });
  });

  it('keeps only the best series per GPU SKU when best=true', () => {
    // Two h200 series (trt vs vllm); vllm strictly better.
    const rows = [
      makeRow({ conc: 16, metrics: metrics({ median_intvty: 20, tput_per_gpu: 200 }) }),
      makeRow({
        framework: 'vllm',
        conc: 16,
        metrics: metrics({ median_intvty: 25, tput_per_gpu: 400 }),
      }),
    ];
    const all = buildInferenceSeries(rows, BASE_OPTIONS);
    expect(all.series).toHaveLength(2);

    const best = buildInferenceSeries(rows, { ...BASE_OPTIONS, best: true });
    expect(best.series).toHaveLength(1);
    expect(best.series[0].framework).toBe('vllm');
    expect(best.series[0].bestPerSku).toBe(true);
  });

  it.each(['y_measuredAvgPower', 'y_measuredJPerOutputToken'] as const)(
    'retains all observed loads for %s without optimal/best ranking',
    (metricConfigKey) => {
      const rows = powerSweepRows();
      const result = buildInferenceSeries(rows, {
        ...BASE_OPTIONS,
        xmode: 'concurrency',
        metricConfigKey,
        optimal: true,
        best: true,
      });
      expect(result.xAxis).toEqual({
        mode: 'concurrency',
        field: 'conc',
        label: 'Concurrency',
        statistic: null,
      });
      expect(result.count).toBe(rows.length);
      const points = result.series.flatMap((series) => series.points);
      expect(points.map((point) => point.x)).toEqual(
        rows.map((row) => row.conc).toSorted((a, b) => a - b),
      );
      expect(points.every((point) => !point.frontier && !point.bestPerSku)).toBe(true);
      expect(result.frontier).toEqual({ direction: null, points: 0 });
      expect(result.metric.direction).toBeNull();
    },
  );

  it('exports reusable topology keys and preserves every load within the chosen topology', () => {
    const rows = [
      makeRow({ conc: 1 }),
      makeRow({ conc: 4 }),
      makeRow({ conc: 4, prefill_tp: 4, decode_tp: 4, num_prefill_gpu: 4, num_decode_gpu: 4 }),
    ];
    const all = buildInferenceSeries(rows, { ...BASE_OPTIONS, xmode: 'concurrency' });
    const points = all.series.flatMap((series) => series.points);
    expect(new Set(points.map((point) => point.topologyKey)).size).toBe(2);
    const topology = points.find((point) => point.concurrency === 1)!.topologyKey;
    const filtered = buildInferenceSeries(rows, {
      ...BASE_OPTIONS,
      xmode: 'concurrency',
      quickFilters: { ...BASE_OPTIONS.quickFilters, topologies: [topology] },
    });
    expect(filtered.series.flatMap((series) => series.points).map((point) => point.x)).toEqual([
      1, 4,
    ]);
    expect(
      filtered.series
        .flatMap((series) => series.points)
        .every((point) => point.topologyKey === topology),
    ).toBe(true);
  });

  it('switches x axis per xmode', () => {
    const rows = fixtureRows();

    const interactivity = buildInferenceSeries(rows, BASE_OPTIONS);
    expect(interactivity.xAxis.mode).toBe('interactivity');
    expect(interactivity.xAxis.field).toBe('median_intvty');
    const h200 = interactivity.series.find((entry) => entry.gpu === 'h200')!;
    expect(h200.points.map((point) => point.x).toSorted((a, b) => a - b)).toEqual([12.5, 40]);

    const e2e = buildInferenceSeries(rows, { ...BASE_OPTIONS, xmode: 'e2e' });
    expect(e2e.xAxis.mode).toBe('e2e');
    expect(e2e.xAxis.field).toBe('median_e2el');
    expect(
      e2e.series.find((entry) => entry.gpu === 'h200')!.points.every((point) => point.x === 2.3),
    ).toBe(true);

    const ttft = buildInferenceSeries(rows, { ...BASE_OPTIONS, xmode: 'ttft' });
    expect(ttft.xAxis.field).toBe('median_ttft');
    expect(ttft.series.find((entry) => entry.gpu === 'h200')!.points[0].x).toBe(0.15);
  });

  it('dedupes to the latest run per config and reports metric metadata', () => {
    const rows = [
      makeRow({ conc: 64, date: '2026-02-01', metrics: metrics({ tput_per_gpu: 100 }) }),
      makeRow({ conc: 64, date: '2026-03-01', metrics: metrics({ tput_per_gpu: 450.5 }) }),
    ];
    const result = buildInferenceSeries(rows, BASE_OPTIONS);
    expect(result.count).toBe(1);
    expect(result.series[0].points[0].y).toBe(450.5);

    expect(result.metric.key).toBe('tpPerGpu');
    expect(result.metric.configKey).toBe('y_tpPerGpu');
    expect(result.metric.label.length).toBeGreaterThan(0);
    expect(result.metric.labelZh.length).toBeGreaterThan(0);
    expect(result.metric.polarity).toBe('higher');
  });
});
