/**
 * Consumer contract for the producer's cache-validity core, end to end: a v3
 * artifact goes through the real ETL mapper, becomes an API row, and is priced
 * by the calculator, revenue, trend and series paths. Producer payloads come
 * from `packages/db/src/etl/fixtures/cache-validity-producer.json` (synthetic
 * inputs run through the producer itself; not historical results).
 */
import { describe, expect, it } from 'vitest';
import { mapBenchmarkRow } from '@semianalysisai/inferencex-db/etl/benchmark-mapper';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';

import { interpolateForGPU } from '@/components/calculator/interpolation';
import {
  applyCacheHitMode,
  estimateSkuProfit,
  isProfitEstimatorRow,
  type ProfitEstimatorAssumptions,
} from '@/components/calculator/profit-estimator';
import { buildGpuGroups } from '@/components/calculator/throughput-data';
import {
  interpolateMetricAtInteractivity,
  rowToLightweightPoint,
} from '@/components/inference/hooks/interpolated-trend-core';
import { applyTokenRevenuePricing } from '@/components/inference/token-revenue';
import type { TokenRevenuePricing } from '@/components/inference/types';
import type { BenchmarkRow } from '@/lib/api/api';
import { DEFAULT_TCO_BASIS } from '@/lib/catalog/constants';
import { Percentile, Sequence } from '@/lib/catalog/data-mappings';

import producer from '../../../../db/src/etl/fixtures/cache-validity-producer.json';
import {
  type CacheRatePolicy,
  DEFAULT_CACHE_RATE_POLICY,
  measuredCacheHitRate,
  selectPricingCacheBasis,
} from './cache-pricing';

type CaseName = keyof typeof producer.cases;

const PRICING: TokenRevenuePricing = {
  source: 'openrouter',
  inputPerMillion: 2,
  cachedInputPerMillion: 0.2,
  outputPerMillion: 10,
};
/** A price list where the cache hit rate cannot move revenue. */
const FLAT_CACHE_PRICING: TokenRevenuePricing = { ...PRICING, cachedInputPerMillion: 2 };
const SPECS = { powerKwPerGpu: 1.5, costPerGpuHour: 2 };
const ASSUMPTIONS: ProfitEstimatorAssumptions = {
  basis: 'chip-hour',
  utilizationPct: 100,
  labCutPct: 0,
};
const CORE_POLICIES: CacheRatePolicy[] = ['enforce-when-present', 'strict'];

/** Cache metrics exactly as the real ETL mapper stores them for one producer case. */
function etlCacheMetrics(name: CaseName): Record<string, number> {
  const mapped = mapBenchmarkRow(
    {
      infmax_model_prefix: 'dsv4',
      hw: 'cluster:b300-nv',
      framework: 'vllm',
      precision: 'fp4',
      spec_decoding: 'none',
      disagg: false,
      scenario_type: 'agentic-coding',
      is_multinode: false,
      tp: 4,
      ep: 1,
      dp_attention: 'false',
      conc: 16,
      image: 'vllm/vllm-openai:v0.23.0',
      kv_offloading: 'none',
      num_requests_total: 100,
      num_requests_successful: 100,
      request_metrics: { throughput: { per_gpu: { total_tput_tps: 1000 } } },
      server_metrics: { present: true, ...producer.cases[name] },
    },
    createSkipTracker(),
  );
  if (!mapped) throw new Error(`mapper dropped ${name}`);
  return Object.fromEntries(
    Object.entries(mapped.metrics).filter(([key]) => key.includes('cache')),
  );
}

/** API row (the shape the benchmarks API returns) carrying the given metrics. */
function apiRow(
  metrics: Record<string, number>,
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow {
  return {
    id: 1,
    hardware: 'b300',
    framework: 'sglang',
    model: 'dsv4',
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 8,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 8,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 8,
    offload_mode: 'off',
    image: 'sglang:test',
    date: '2026-10-16',
    run_url: null,
    ...overrides,
    metrics: {
      // The calculator derives agentic interactivity as 1 / itl; trends read median_intvty.
      median_intvty: 40,
      p90_itl: 1 / 40,
      tput_per_gpu: 1000,
      input_tput_per_gpu: 800,
      output_tput_per_gpu: 200,
      ...metrics,
    },
  };
}

/** Two operating points of one config, so interpolation runs the spline path. */
function frontier(first: Record<string, number>, second = first): BenchmarkRow[] {
  const faster = {
    median_intvty: 20,
    p90_itl: 1 / 20,
    tput_per_gpu: 1600,
    input_tput_per_gpu: 1280,
    output_tput_per_gpu: 320,
  };
  return [apiRow(first, { conc: 8 }), apiRow({ ...second, ...faster }, { conc: 16 })];
}

/** The chart and trend paths only price registered GPUs; reuse their test config. */
const chartRow = (row: BenchmarkRow): BenchmarkRow => ({
  ...row,
  hardware: 'h200',
  framework: 'trt',
  model: 'dsr1',
});

const basis = (row: BenchmarkRow, policy: CacheRatePolicy) =>
  selectPricingCacheBasis(
    { ...row.metrics, hw: row.hardware, benchmark_type: row.benchmark_type },
    policy,
  );

/** Series and inference-chart path: `applyTokenRevenuePricing` on a chart point. */
function chartRevenue(row: BenchmarkRow, policy: CacheRatePolicy, pricing = PRICING) {
  const point = rowToLightweightPoint(chartRow(row), ['tpPerGpu'], null, DEFAULT_TCO_BASIS, policy);
  return applyTokenRevenuePricing([point!], pricing, policy)[0]!.tokenRevenuePerGpuHour?.y ?? null;
}

/** Fleet Lifecycle path: group, interpolate, apply the cache mode, price one SKU. */
function calculatorEstimate(
  rows: BenchmarkRow[],
  policy: CacheRatePolicy,
  mode: 'actual' | 'theoretical' = 'actual',
  pricing = PRICING,
) {
  const { grouped } = buildGpuGroups(rows, {
    sequence: Sequence.AgenticTraces,
    precisions: ['fp4'],
    percentile: Percentile.P90,
    cacheRatePolicy: policy,
    classify: (hwKey) => ({ key: hwKey, meta: { hwKey } }),
  });
  const points = Object.values(grouped)[0]!;
  const interpolated = interpolateForGPU(points, 30, 'interactivity_to_throughput', 'costh')!;
  const [result] = applyCacheHitMode([interpolated], mode);
  return {
    points,
    result: result!,
    estimate: estimateSkuProfit(result!, SPECS, pricing, ASSUMPTIONS),
  };
}

/** Historical Trends path: lightweight points, then the cache-aware revenue spline. */
function trendRevenue(rows: BenchmarkRow[], policy: CacheRatePolicy, pricing = PRICING) {
  const points = rows.map((row) =>
    rowToLightweightPoint(
      chartRow(row),
      ['tokenRevenuePerGpuHour', 'tpPerGpu'],
      pricing,
      DEFAULT_TCO_BASIS,
      policy,
    )!,
  );
  return interpolateMetricAtInteractivity(points, 30, 'tokenRevenuePerGpuHour', pricing, policy);
}

describe('producer cases through ETL → API row → pricing', () => {
  // [case, pre-core rate, rate under a core policy (null = unavailable), unavailable reason]
  const table: [CaseName, number | null, number | null, string | undefined][] = [
    ['atom_complete', 0.7, 0.7, undefined],
    ['atom_zero', 0, 0, undefined],
    ['atom_partial_component', 0.6, null, 'not-eligible:PARTIAL'],
    ['atom_request_scope_unresolved', 0.7, null, 'not-eligible:UNRESOLVED'],
    ['trt_conditional_interval', null, null, 'not-eligible:VALID_INTERVAL'],
    ['trt_rejected_cached_exceeds_prompt', null, null, 'not-eligible:INVALID'],
    ['sglang_three_tiers', 0.9, null, 'not-eligible:NOT_EVALUATED'],
    ['dynamo_frontend', null, null, 'not-eligible:NOT_EVALUATED'],
    ['dynamo_router_estimate', null, null, 'not-eligible:NOT_EVALUATED'],
    ['vllm_decode_only', 1, null, 'not-eligible:NOT_EVALUATED'],
    ['vllm_conditional_denominator', 1, null, 'not-eligible:NOT_EVALUATED'],
  ];

  it.each(table)('%s', (name, legacyRate, coreRate, reason) => {
    const row = apiRow(etlCacheMetrics(name));

    const legacy = basis(row, 'legacy');
    if (legacyRate === null) {
      expect(legacy).toEqual({ rate: null, source: 'none' });
    } else {
      expect(legacy.source).toBe('legacy-measured');
      expect(legacy.rate).toBeCloseTo(legacyRate, 10);
    }

    for (const policy of CORE_POLICIES) {
      const selected = basis(row, policy);
      const { estimate } = calculatorEstimate(frontier(row.metrics), policy);
      if (coreRate === null) {
        expect(selected).toEqual({ rate: null, source: 'unavailable', reason });
        expect(chartRevenue(row, policy)).toBeNull();
        expect(estimate).toMatchObject({ reason: 'cache-hit-unavailable' });
        expect(trendRevenue(frontier(row.metrics), policy)).toBeNull();
      } else {
        expect(selected.source).toBe('measured');
        expect(selected.rate).toBeCloseTo(coreRate, 10);
        expect(chartRevenue(row, policy)).toBeCloseTo(chartRevenue(row, 'legacy')!, 10);
        expect(isProfitEstimatorRow(estimate)).toBe(true);
        expect(trendRevenue(frontier(row.metrics), policy)).not.toBeNull();
      }
    }
  });

  it('prices a real zero, which is not the same as an unproven rate', () => {
    const uncached = chartRevenue(apiRow({}), 'legacy');
    expect(chartRevenue(apiRow(etlCacheMetrics('atom_zero')), 'strict')).toBeCloseTo(uncached!, 10);
    expect(chartRevenue(apiRow(etlCacheMetrics('atom_partial_component')), 'strict')).toBeNull();
  });

  it('keeps the TRT diagnostic 1.0476 out of every pricing path', () => {
    const diagnostic =
      producer.cases.trt_rejected_cached_exceeds_prompt.validity.cache_rate.raw_rate;
    const row = apiRow(etlCacheMetrics('trt_rejected_cached_exceeds_prompt'));
    expect(diagnostic).toBeCloseTo(1.0476, 10);
    expect(Object.values(row.metrics)).not.toContain(diagnostic);
    for (const policy of ['legacy', ...CORE_POLICIES] as const) {
      expect(basis(row, policy).rate).toBeNull();
    }
  });
});

describe('the exact-pricing contract on synthetic core rows', () => {
  const eligibleTiers = {
    server_cache_core_schema_version: 1,
    server_cache_status_class_code: 1,
    server_cache_pricing_eligible: 1,
    server_cache_published: 1,
    server_cache_basis_code: 1,
    server_gpu_cache_hit_rate: 0.5,
    server_external_cache_hit_rate: 0.2,
    server_overall_cache_hit_rate: 0.7,
  };
  const eligibleCombined = {
    server_cache_core_schema_version: 1,
    server_cache_status_class_code: 1,
    server_cache_pricing_eligible: 1,
    server_cache_published: 1,
    server_cache_basis_code: 2,
    server_overall_cache_hit_rate: 0.8,
    server_cache_overall_source_code: 1,
  };
  const select = (
    base: Record<string, number>,
    override: Record<string, number | undefined> = {},
  ) => {
    const merged = Object.entries({ ...base, ...override }).filter(([, v]) => v !== undefined);
    return basis(apiRow(Object.fromEntries(merged) as Record<string, number>), 'strict');
  };

  it('treats tiers as GPU plus external, never all three', () => {
    // SGLang device 600 / host 200 / storage 100 of 1000 prompt tokens.
    const sglang = {
      server_gpu_cache_hit_rate: 0.6,
      server_cpu_cache_hit_rate: 0.2,
      server_external_cache_hit_rate: 0.3,
      server_overall_cache_hit_rate: 0.9,
    };
    expect(select(eligibleTiers, sglang).rate).toBeCloseTo(0.9, 10);
    expect(select(eligibleTiers)).toEqual({ rate: 0.7, source: 'measured' });
  });

  it('accepts a combined rate only from counters or the frontend', () => {
    expect(select(eligibleCombined)).toEqual({ rate: 0.8, source: 'measured' });
    expect(select(eligibleCombined, { server_cache_overall_source_code: 2 }).rate).toBe(0.8);
  });

  it.each<[string, Record<string, number | undefined>, string]>([
    [
      'an eligible partial status',
      { server_cache_status_class_code: 4 },
      'conflict:eligible-with-PARTIAL',
    ],
    [
      'an eligible unrecognised status',
      { server_cache_status_class_code: 0 },
      'conflict:eligible-with-unknown-status',
    ],
    ['explicit ineligibility', { server_cache_pricing_eligible: 0 }, 'not-eligible:VALID_COMPLETE'],
    [
      'eligibility dropped at ETL',
      { server_cache_pricing_eligible: undefined },
      'not-eligible:VALID_COMPLETE',
    ],
    ['no published rate', { server_cache_published: 0 }, 'conflict:eligible-without-rate'],
    [
      'tiers above one',
      {
        server_gpu_cache_hit_rate: 0.8,
        server_external_cache_hit_rate: 0.5,
        server_overall_cache_hit_rate: undefined,
      },
      'invalid:tier-sum-above-one',
    ],
    [
      'tiers disagreeing with overall',
      { server_overall_cache_hit_rate: 0.9 },
      'conflict:tiers-disagree-with-overall',
    ],
    ['a NaN tier', { server_gpu_cache_hit_rate: Number.NaN }, 'invalid:tier-rate-out-of-range'],
    [
      'an infinite tier',
      { server_external_cache_hit_rate: Infinity },
      'invalid:tier-rate-out-of-range',
    ],
    ['a negative tier', { server_gpu_cache_hit_rate: -0.1 }, 'invalid:tier-rate-out-of-range'],
    ['no basis', { server_cache_basis_code: undefined }, 'no-basis'],
    ['an unrecognised basis', { server_cache_basis_code: 0 }, 'no-basis'],
    ['a newer core', { server_cache_core_schema_version: 2 }, 'unsupported-core-schema'],
    ['an unrecognised core', { server_cache_core_schema_version: 0 }, 'unsupported-core-schema'],
    [
      'a valid zero with hits',
      { server_cache_status_class_code: 2 },
      'conflict:valid-zero-with-hits',
    ],
  ])('refuses a tiers row with %s', (_label, override, reason) => {
    expect(select(eligibleTiers, override)).toEqual({ rate: null, source: 'unavailable', reason });
  });

  it.each<[string, Record<string, number | undefined>, string]>([
    ['a router estimate', { server_cache_overall_source_code: 3 }, 'router-estimate'],
    ['no source', { server_cache_overall_source_code: undefined }, 'combined-without-source'],
    ['an unrecognised source', { server_cache_overall_source_code: 0 }, 'combined-without-source'],
    [
      'the TRT diagnostic as overall',
      { server_overall_cache_hit_rate: 1.0476 },
      'invalid:overall-out-of-range',
    ],
    [
      'no overall',
      { server_overall_cache_hit_rate: undefined },
      'conflict:combined-without-overall',
    ],
    [
      'tier rates written later',
      { server_gpu_cache_hit_rate: 0.5 },
      'conflict:combined-with-tier-rates',
    ],
  ])('refuses a combined row with %s', (_label, override, reason) => {
    expect(select(eligibleCombined, override)).toEqual({
      rate: null,
      source: 'unavailable',
      reason,
    });
  });
});

describe('policies, theoretical mode, fallbacks and donors', () => {
  const legacyMeasured = { server_gpu_cache_hit_rate: 0.5, server_external_cache_hit_rate: 0.3 };

  it('defaults to the pre-core rule for every row', () => {
    expect(DEFAULT_CACHE_RATE_POLICY).toBe('legacy');
    const names = Object.keys(producer.cases) as CaseName[];
    for (const metrics of [...names.map(etlCacheMetrics), legacyMeasured, {}]) {
      const row = apiRow(metrics);
      expect(basis(row, DEFAULT_CACHE_RATE_POLICY).rate).toBe(measuredCacheHitRate(row.metrics));
    }
  });

  it('keeps donor-borrowed rates out of strict actual pricing', () => {
    // `run-overrides` writes GB200 rates into GB300 rows without a marker; the
    // missing core is what tells them apart.
    const donor = apiRow(legacyMeasured, { hardware: 'gb300' });
    expect(basis(donor, 'legacy')).toEqual({ rate: 0.8, source: 'legacy-measured' });
    expect(basis(donor, 'enforce-when-present')).toEqual({ rate: 0.8, source: 'legacy-measured' });
    expect(basis(donor, 'strict')).toEqual({
      rate: null,
      source: 'unavailable',
      reason: 'no-validity-core',
    });
  });

  it('labels the GB300 theoretical fallback and never uses it for a core row', () => {
    const legacyGb300 = apiRow({ theoretical_cache_hit_rate: 0.97 }, { hardware: 'gb300' });
    expect(basis(legacyGb300, 'enforce-when-present')).toEqual({
      rate: 0.97,
      source: 'theoretical-fallback',
    });
    expect(basis(legacyGb300, 'strict').source).toBe('unavailable');

    const coreGb300 = apiRow(
      { ...etlCacheMetrics('trt_conditional_interval'), theoretical_cache_hit_rate: 0.97 },
      { hardware: 'gb300' },
    );
    expect(basis(coreGb300, 'legacy')).toEqual({ rate: 0.97, source: 'theoretical-fallback' });
    expect(basis(coreGb300, 'enforce-when-present').source).toBe('unavailable');
  });

  it('prices explicit theoretical mode when the theoretical rate exists, and only then', () => {
    const sglang = etlCacheMetrics('sglang_three_tiers');
    const withTheory = calculatorEstimate(
      frontier({ ...sglang, theoretical_cache_hit_rate: 0.95 }),
      'strict',
      'theoretical',
    );
    expect(withTheory.result.cacheHitRate).toBeCloseTo(0.95, 10);
    expect(withTheory.result.cacheHitUnavailable).toBeUndefined();
    expect(isProfitEstimatorRow(withTheory.estimate)).toBe(true);

    const withoutTheory = calculatorEstimate(frontier(sglang), 'strict', 'theoretical');
    expect(withoutTheory.estimate).toMatchObject({ reason: 'cache-hit-unavailable' });
  });

  it('does not block revenue when the price list gives no cache discount', () => {
    const row = apiRow(etlCacheMetrics('sglang_three_tiers'));
    const strict = chartRevenue(row, 'strict', FLAT_CACHE_PRICING);
    expect(strict).toBeCloseTo(chartRevenue(row, 'legacy', FLAT_CACHE_PRICING)!, 10);
    const calc = calculatorEstimate(frontier(row.metrics), 'strict', 'actual', FLAT_CACHE_PRICING);
    expect(isProfitEstimatorRow(calc.estimate)).toBe(true);
  });

  it('leaves fixed-sequence rows unchanged under every policy', () => {
    const fixed = apiRow({}, { benchmark_type: 'single_turn', isl: 1024, osl: 1024 });
    const legacyRevenue = chartRevenue(fixed, 'legacy');
    for (const policy of CORE_POLICIES) {
      expect(basis(fixed, policy)).toEqual({ rate: null, source: 'none' });
      expect(chartRevenue(fixed, policy)).toBeCloseTo(legacyRevenue!, 10);
    }
  });
});

describe('mixed frontiers', () => {
  it('lets one unproven knot make the operating point unavailable, not zero-hit', () => {
    const rows = frontier(etlCacheMetrics('atom_complete'), etlCacheMetrics('sglang_three_tiers'));
    const calc = calculatorEstimate(rows, 'enforce-when-present');
    expect(calc.points.map((p) => p.cacheHitUnavailable ?? false)).toEqual([false, true]);
    expect(calc.result.cacheHitRate).toBeUndefined();
    expect(calc.estimate).toMatchObject({ reason: 'cache-hit-unavailable' });
    expect(trendRevenue(rows, 'enforce-when-present')).toBeNull();
  });

  it('keeps the legacy spline between the two measured rates by default', () => {
    const rows = frontier(etlCacheMetrics('atom_complete'), etlCacheMetrics('sglang_three_tiers'));
    const { result, estimate } = calculatorEstimate(rows, 'legacy');
    expect(result.cacheHitRate).toBeGreaterThan(0.7);
    expect(result.cacheHitRate).toBeLessThan(0.9);
    expect(isProfitEstimatorRow(estimate)).toBe(true);
    expect(trendRevenue(rows, 'legacy')).not.toBeNull();
  });

  it('prices old and new points together only while old rows are allowed', () => {
    const rows = frontier(
      { server_gpu_cache_hit_rate: 0.5, server_external_cache_hit_rate: 0.2 },
      etlCacheMetrics('atom_complete'),
    );
    expect(isProfitEstimatorRow(calculatorEstimate(rows, 'enforce-when-present').estimate)).toBe(
      true,
    );
    expect(calculatorEstimate(rows, 'strict').estimate).toMatchObject({
      reason: 'cache-hit-unavailable',
    });
  });
});
