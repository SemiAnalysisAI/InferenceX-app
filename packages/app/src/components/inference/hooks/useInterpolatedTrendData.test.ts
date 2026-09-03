import { describe, it, expect } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import {
  gpuHoursPerGwYear,
  NORMALIZED_TOKEN_REVENUE_PRICING,
} from '@/components/inference/token-revenue';

import type { BenchmarkRow } from '@/lib/api';

import {
  interpolateMetricAtInteractivity,
  rowToLightweightPoint,
  rowSupportsTrendMetric,
  trendMetricDependencies,
} from './useInterpolatedTrendData';
import { SUPPLEMENTAL_BENCHMARK_ROWS } from '@/lib/supplemental-benchmarks';

// ─── Factory ───

function makePoint(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2025-06-15',
    x: 100,
    y: 500,
    tp: 8,
    conc: 64,
    hwKey: 'h100',
    precision: 'fp8',
    tpPerGpu: { y: 1000, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1.2, roof: false },
    costn: { y: 0.9, roof: false },
    costr: { y: 0.7, roof: false },
    costhi: { y: 0.5, roof: false },
    costni: { y: 0.4, roof: false },
    costri: { y: 0.3, roof: false },
    ...overrides,
  } as InferenceData;
}

function makeBenchmarkRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
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
    isl: 1024,
    osl: 1024,
    conc: 64,
    image: 'test',
    metrics: {
      tput_per_gpu: 400,
      median_intvty: 20,
    },
    date: '2026-03-01',
    run_url: null,
    ...overrides,
  };
}

describe('rowToLightweightPoint', () => {
  it('preserves legacy output-throughput trends when the explicit field is absent', () => {
    const point = rowToLightweightPoint(makeBenchmarkRow(), [
      'outputTputPerGpu',
      'costhOutput',
      'outputTokensPerDollarH',
    ]);

    expect(point?.outputTputPerGpu?.y).toBe(400);
    expect(point?.costhOutput?.y).toBeGreaterThan(0);
    expect(point?.outputTokensPerDollarH?.y).toBeGreaterThan(0);
  });

  it('applies OpenRouter input and output prices to historical points', () => {
    const point = rowToLightweightPoint(
      makeBenchmarkRow({
        metrics: {
          tput_per_gpu: 400,
          input_tput_per_gpu: 320,
          output_tput_per_gpu: 80,
          median_intvty: 20,
        },
      }),
      ['tokenRevenuePerGpuHour'],
      {
        source: 'openrouter',
        inputPerMillion: 1.122,
        outputPerMillion: 3.366,
        openRouterModelId: 'deepseek/deepseek-v4-pro-0813',
      },
    );

    expect(point?.tokenRevenuePerGpuHour?.y).toBeCloseTo(2.261952, 10);
  });

  it('prices the GW-year revenue and profit axes from the same OpenRouter revenue', () => {
    const pricing = {
      source: 'openrouter' as const,
      inputPerMillion: 1.122,
      outputPerMillion: 3.366,
      openRouterModelId: 'deepseek/deepseek-v4-pro-0813',
    };
    const point = rowToLightweightPoint(
      makeBenchmarkRow({
        metrics: {
          tput_per_gpu: 400,
          input_tput_per_gpu: 320,
          output_tput_per_gpu: 80,
          median_intvty: 20,
        },
      }),
      ['tokenRevenuePerGwYear', 'tokenProfitPerGwYearH', 'tokenProfitPerGwYearR'],
      pricing,
    );

    // H200: 1.37 kW all-in per GPU, TCO 1.22 (hyperscaler) and 2.05 (3-year rental) $/GPU/hr.
    const gpuHours = gpuHoursPerGwYear('h200')!;
    expect(gpuHours).toBeCloseTo((1_000_000 / 1.37) * 8_760, -2);
    expect(point?.tokenRevenuePerGwYear?.y).toBeCloseTo(2.261952 * gpuHours, -2);
    expect(point?.tokenProfitPerGwYearH?.y).toBeCloseTo((2.261952 - 1.22) * gpuHours, -2);
    expect(point?.tokenProfitPerGwYearR?.y).toBeCloseTo((2.261952 - 2.05) * gpuHours, -2);
    expect(point?.tokenProfitPerGwYearR?.y).toBeGreaterThan(0);
  });

  it('lets a GW-year profit axis go negative when sale prices sit below TCO', () => {
    const point = rowToLightweightPoint(
      makeBenchmarkRow({
        metrics: {
          tput_per_gpu: 100,
          input_tput_per_gpu: 80,
          output_tput_per_gpu: 20,
          median_intvty: 20,
        },
      }),
      ['tokenProfitPerGwYearR'],
      NORMALIZED_TOKEN_REVENUE_PRICING,
    );

    // 100 tok/s/GPU at $1/M is $0.36/GPU/hr, well under the $2.05 rental TCO.
    const gpuHours = gpuHoursPerGwYear('h200')!;
    expect(point?.tokenProfitPerGwYearR?.y).toBeCloseTo((0.36 - 2.05) * gpuHours, -2);
    expect(point?.tokenProfitPerGwYearR?.y).toBeLessThan(0);
  });

  it('applies measured cache hits and cache-read pricing to historical points', () => {
    const point = rowToLightweightPoint(
      makeBenchmarkRow({
        metrics: {
          tput_per_gpu: 1_000,
          input_tput_per_gpu: 800,
          output_tput_per_gpu: 200,
          median_intvty: 20,
          server_gpu_cache_hit_rate: 0.8,
          server_external_cache_hit_rate: 0.1,
          server_cpu_cache_hit_rate: 0.05,
        },
      }),
      ['tokenRevenuePerGpuHour'],
      {
        source: 'openrouter',
        inputPerMillion: 2,
        cachedInputPerMillion: 0.2,
        outputPerMillion: 10,
      },
    );

    expect(point?.tokenRevenuePerGpuHour?.y).toBeCloseTo(8.2944, 10);
  });

  it('derives infrastructure total tokens per dollar from throughput and hourly cost', () => {
    const point = rowToLightweightPoint(makeBenchmarkRow(), [
      'tokensPerDollarH',
      'tokensPerDollarN',
      'tokensPerDollarR',
      'costh',
      'costn',
      'costr',
    ]);

    expect(point!.tokensPerDollarH!.y * point!.costh!.y).toBeCloseTo(1_000_000, 8);
    expect(point!.tokensPerDollarN!.y * point!.costn!.y).toBeCloseTo(1_000_000, 8);
    expect(point!.tokensPerDollarR!.y * point!.costr!.y).toBeCloseTo(1_000_000, 8);
  });
});

describe('cache-aware token revenue interpolation', () => {
  const revenuePoint = (interactivity: number, throughput: number, cacheHitRate?: number) =>
    rowToLightweightPoint(
      makeBenchmarkRow({
        metrics: {
          tput_per_gpu: throughput,
          input_tput_per_gpu: throughput * 0.8,
          output_tput_per_gpu: throughput * 0.2,
          median_intvty: interactivity,
          ...(cacheHitRate === undefined ? {} : { server_gpu_cache_hit_rate: cacheHitRate }),
        },
      }),
      ['tokenRevenuePerGpuHour', 'tpPerGpu'],
    )!;

  it('interpolates throughput, token share, and cache hit before pricing dollars', () => {
    const cacheAware = [revenuePoint(20, 800, 0.8), revenuePoint(40, 600, 0.9)];
    const uncached = [revenuePoint(20, 800), revenuePoint(40, 600)];

    const cachedRevenue = interpolateMetricAtInteractivity(
      cacheAware,
      30,
      'tokenRevenuePerGpuHour',
      NORMALIZED_TOKEN_REVENUE_PRICING,
    );
    const uncachedRevenue = interpolateMetricAtInteractivity(
      uncached,
      30,
      'tokenRevenuePerGpuHour',
      NORMALIZED_TOKEN_REVENUE_PRICING,
    );

    expect(cachedRevenue).not.toBeNull();
    expect(uncachedRevenue).not.toBeNull();
    expect(cachedRevenue!).toBeLessThan(uncachedRevenue!);
    expect(cachedRevenue).toBeCloseTo(0.935015625, 10);
  });

  it('opts a partly measured cache frontier out of the discount', () => {
    const points = [revenuePoint(20, 800, 0.8), revenuePoint(40, 600)];
    const throughput = interpolateMetricAtInteractivity(points, 30, 'tpPerGpu');
    const revenue = interpolateMetricAtInteractivity(
      points,
      30,
      'tokenRevenuePerGpuHour',
      NORMALIZED_TOKEN_REVENUE_PRICING,
    );

    expect(revenue).toBeCloseTo(throughput! * 0.0036, 10);
  });
});

describe('rowSupportsTrendMetric', () => {
  it('limits the July Vera Rubin snapshot to output-token trend metrics', () => {
    const julyRubin = SUPPLEMENTAL_BENCHMARK_ROWS.find((row) => row.hardware === 'vr200')!;

    expect(rowSupportsTrendMetric(julyRubin, 'y_outputTputPerGpu')).toBe(true);
    expect(rowSupportsTrendMetric(julyRubin, 'y_tpPerGpu')).toBe(false);
    expect(rowSupportsTrendMetric(julyRubin, 'y_inputTputPerGpu')).toBe(false);
  });

  it('leaves a future Vera Rubin snapshot unrestricted without capability metadata', () => {
    const futureRubin = {
      ...SUPPLEMENTAL_BENCHMARK_ROWS.find((row) => row.hardware === 'vr200')!,
      date: '2026-09-01',
    };

    expect(rowSupportsTrendMetric(futureRubin, 'y_tpPerGpu')).toBe(true);
  });
});

// ─── Tests ───

describe('interpolateMetricAtInteractivity', () => {
  it('returns null for empty points', () => {
    expect(interpolateMetricAtInteractivity([], 100, 'tpPerGpu')).toBeNull();
  });

  it('returns null when target is below data range', () => {
    const points = [
      makePoint({ x: 50, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 100, tpPerGpu: { y: 400, roof: false } }),
    ];
    expect(interpolateMetricAtInteractivity(points, 30, 'tpPerGpu')).toBeNull();
  });

  it('returns null when target is above data range', () => {
    const points = [
      makePoint({ x: 50, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 100, tpPerGpu: { y: 400, roof: false } }),
    ];
    expect(interpolateMetricAtInteractivity(points, 150, 'tpPerGpu')).toBeNull();
  });

  it('interpolates throughput at a mid-range interactivity point', () => {
    const points = [
      makePoint({ x: 20, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 40, tpPerGpu: { y: 600, roof: false } }),
      makePoint({ x: 60, tpPerGpu: { y: 400, roof: false } }),
      makePoint({ x: 80, tpPerGpu: { y: 200, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 50, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(350);
    expect(result!).toBeLessThan(650);
  });

  it('returns exact value at a frontier knot point', () => {
    const points = [
      makePoint({ x: 20, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 40, tpPerGpu: { y: 600, roof: false } }),
      makePoint({ x: 60, tpPerGpu: { y: 400, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 40, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(600, 0);
  });

  it('clamps negative spline overshoots to zero', () => {
    const points = [
      makePoint({ x: 10, tpPerGpu: { y: 100, roof: false }, costh: { y: 0.1, roof: false } }),
      makePoint({ x: 20, tpPerGpu: { y: 50, roof: false }, costh: { y: 0.05, roof: false } }),
      makePoint({ x: 30, tpPerGpu: { y: 10, roof: false }, costh: { y: 0.01, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 25, 'costh');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
  });

  it('uses the matching output-throughput Pareto knots for output tokens per dollar', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 1000, roof: false },
        outputTputPerGpu: { y: 100, roof: false },
        outputTokensPerDollarH: { y: 100_000, roof: false },
      }),
      makePoint({
        x: 40,
        tpPerGpu: { y: 800, roof: false },
        outputTputPerGpu: { y: 700, roof: false },
        outputTokensPerDollarH: { y: 700_000, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 900, roof: false },
        outputTputPerGpu: { y: 500, roof: false },
        outputTokensPerDollarH: { y: 500_000, roof: false },
      }),
    ];

    // The total-throughput frontier drops x=40, while the output-throughput
    // frontier keeps x=40 and drops x=20. The midpoint must follow the latter.
    expect(interpolateMetricAtInteractivity(points, 50, 'outputTokensPerDollarH')).toBeCloseTo(
      581_250,
      0,
    );
  });

  it('uses the matching input-throughput Pareto knots for input tokens per dollar', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 1000, roof: false },
        inputTputPerGpu: { y: 100, roof: false },
        inputTokensPerDollarH: { y: 200_000, roof: false },
      }),
      makePoint({
        x: 40,
        tpPerGpu: { y: 800, roof: false },
        inputTputPerGpu: { y: 700, roof: false },
        inputTokensPerDollarH: { y: 1_400_000, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 900, roof: false },
        inputTputPerGpu: { y: 500, roof: false },
        inputTokensPerDollarH: { y: 1_000_000, roof: false },
      }),
    ];

    expect(interpolateMetricAtInteractivity(points, 50, 'inputTokensPerDollarH')).toBeCloseTo(
      1_162_500,
      0,
    );
  });

  it('keeps infrastructure total tokens per dollar proportional to total throughput', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 800, roof: false },
        tokensPerDollarN: { y: 2_000_000, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 400, roof: false },
        tokensPerDollarN: { y: 1_000_000, roof: false },
      }),
    ];

    const throughput = interpolateMetricAtInteractivity(points, 40, 'tpPerGpu');
    const purchasingPower = interpolateMetricAtInteractivity(points, 40, 'tokensPerDollarN');
    expect(purchasingPower).toBeCloseTo(throughput! * 2_500, 10);
  });

  it('filters dominated points via Pareto front', () => {
    const points = [
      makePoint({ x: 20, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 30, tpPerGpu: { y: 300, roof: false } }), // dominated
      makePoint({ x: 60, tpPerGpu: { y: 400, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 40, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(400);
    expect(result!).toBeLessThan(800);
  });

  it('handles single point matching target exactly', () => {
    const points = [makePoint({ x: 50, tpPerGpu: { y: 1000, roof: false } })];
    const result = interpolateMetricAtInteractivity(points, 50, 'tpPerGpu');
    expect(result).toBe(1000);
  });

  it('returns null for single point not matching target', () => {
    const points = [makePoint({ x: 50, tpPerGpu: { y: 1000, roof: false } })];
    expect(interpolateMetricAtInteractivity(points, 60, 'tpPerGpu')).toBeNull();
  });

  it('works with tpPerMw metric', () => {
    const points = [
      makePoint({ x: 20, tpPerGpu: { y: 800, roof: false }, tpPerMw: { y: 100, roof: false } }),
      makePoint({ x: 40, tpPerGpu: { y: 600, roof: false }, tpPerMw: { y: 80, roof: false } }),
      makePoint({ x: 60, tpPerGpu: { y: 400, roof: false }, tpPerMw: { y: 60, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 30, 'tpPerMw');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(70);
    expect(result!).toBeLessThan(100);
  });

  it('works with energy metric (jTotal)', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 800, roof: false },
        jTotal: { y: 2.5, roof: false },
      }),
      makePoint({
        x: 40,
        tpPerGpu: { y: 600, roof: false },
        jTotal: { y: 3, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 400, roof: false },
        jTotal: { y: 4, roof: false },
      }),
    ];
    const result = interpolateMetricAtInteractivity(points, 30, 'jTotal');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(2);
    expect(result!).toBeLessThan(3.5);
  });

  it.each([
    'measuredJPerSuccessfulQuery',
    'measuredWhPerSuccessfulQuery',
    'measuredPowerPercentTdp',
  ] as const)('interpolates the derived measured metric %s', (metricKey) => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 800, roof: false },
        [metricKey]: { y: 80, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 400, roof: false },
        [metricKey]: { y: 40, roof: false },
      }),
    ];

    const result = interpolateMetricAtInteractivity(points, 40, metricKey);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(40);
    expect(result!).toBeLessThan(80);
  });

  it('returns null when metric field is missing from data points', () => {
    const points = [
      makePoint({ x: 20, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 40, tpPerGpu: { y: 600, roof: false } }),
    ];
    // jOutput is not set on these points. Returning 0 would render a flat
    // zero-line that looks like real data (the bug F4 fixed); return null
    // so the trend chart can show a gap instead.
    const result = interpolateMetricAtInteractivity(points, 30, 'jOutput');
    expect(result).toBeNull();
  });

  it('handles two frontier points at close x values', () => {
    const points = [
      makePoint({ x: 50, tpPerGpu: { y: 900, roof: false } }),
      makePoint({ x: 50.001, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 100, tpPerGpu: { y: 400, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 75, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(300);
    expect(result!).toBeLessThan(900);
  });

  it('works with outputTputPerGpu metric', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 800, roof: false },
        outputTputPerGpu: { y: 700, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 400, roof: false },
        outputTputPerGpu: { y: 350, roof: false },
      }),
    ];
    const result = interpolateMetricAtInteractivity(points, 40, 'outputTputPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(300);
    expect(result!).toBeLessThan(700);
  });

  it('keeps token revenue proportional to the interpolated total throughput', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 800, roof: false },
        tokenRevenuePerGpuHour: { y: 2.88, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 400, roof: false },
        tokenRevenuePerGpuHour: { y: 1.44, roof: false },
      }),
    ];

    const throughput = interpolateMetricAtInteractivity(points, 40, 'tpPerGpu');
    const revenue = interpolateMetricAtInteractivity(points, 40, 'tokenRevenuePerGpuHour');
    expect(revenue).toBeCloseTo(throughput! * 0.0036, 10);
  });

  it('interpolates GW-year revenue and profit through the priced $/GPU/hr path', () => {
    const gpuHours = gpuHoursPerGwYear('h100')!;
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 800, roof: false },
        input_tput_per_gpu: 640,
        output_tput_per_gpu: 160,
        tokenRevenuePerGwYear: { y: 2.88 * gpuHours, roof: false },
        tokenProfitPerGwYearH: { y: (2.88 - 1.17) * gpuHours, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 400, roof: false },
        input_tput_per_gpu: 320,
        output_tput_per_gpu: 80,
        tokenRevenuePerGwYear: { y: 1.44 * gpuHours, roof: false },
        tokenProfitPerGwYearH: { y: (1.44 - 1.17) * gpuHours, roof: false },
      }),
    ];

    const throughput = interpolateMetricAtInteractivity(
      points,
      40,
      'tpPerGpu',
      NORMALIZED_TOKEN_REVENUE_PRICING,
    );
    const revenue = interpolateMetricAtInteractivity(
      points,
      40,
      'tokenRevenuePerGwYear',
      NORMALIZED_TOKEN_REVENUE_PRICING,
    );
    const profit = interpolateMetricAtInteractivity(
      points,
      40,
      'tokenProfitPerGwYearH',
      NORMALIZED_TOKEN_REVENUE_PRICING,
    );
    // H100 hyperscaler TCO is $1.17/GPU/hr; revenue at $1/M is throughput × 0.0036.
    const revenuePerGpuHour = throughput! * 0.0036;
    expect(revenue).toBeCloseTo(revenuePerGpuHour * gpuHours, -2);
    expect(profit).toBeCloseTo((revenuePerGpuHour - 1.17) * gpuHours, -2);
  });

  it('returns exact boundary value at the lowest frontier x', () => {
    const points = [
      makePoint({ x: 10, tpPerGpu: { y: 1000, roof: false } }),
      makePoint({ x: 50, tpPerGpu: { y: 500, roof: false } }),
      makePoint({ x: 100, tpPerGpu: { y: 200, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 10, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(1000, 0);
  });

  it('returns exact boundary value at the highest frontier x', () => {
    const points = [
      makePoint({ x: 10, tpPerGpu: { y: 1000, roof: false } }),
      makePoint({ x: 50, tpPerGpu: { y: 500, roof: false } }),
      makePoint({ x: 100, tpPerGpu: { y: 200, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 100, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(200, 0);
  });
});

describe('trendMetricDependencies', () => {
  it('selects only the metric and matching throughput needed by reciprocal formulas', () => {
    expect(trendMetricDependencies('costhOutput')).toEqual([
      'tpPerGpu',
      'costhOutput',
      'outputTputPerGpu',
    ]);
  });

  it('loads total throughput with infrastructure purchasing power', () => {
    expect(trendMetricDependencies('tokensPerDollarN')).toEqual(['tpPerGpu', 'tokensPerDollarN']);
  });

  it('does not route custom user metrics through benchmark-derived history fields', () => {
    expect(trendMetricDependencies('costUser')).toEqual(['tpPerGpu']);
  });
});
