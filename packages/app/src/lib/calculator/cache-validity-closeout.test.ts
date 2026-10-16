/**
 * Closeout cases from the X1-I independent review: incomplete or contradictory
 * tiers, mixed new/old frontiers, validity traces without a core schema, the
 * #3964 detail-only seam, and eligibility surviving a donor rewrite. Producer
 * payloads come from `packages/db/src/etl/fixtures/` (synthetic inputs run
 * through the producer itself; not historical results).
 */
import { describe, expect, it } from 'vitest';
import { mapBenchmarkRow } from '@semianalysisai/inferencex-db/etl/benchmark-mapper';
import { BENCHMARK_POINT_BACKFILLS } from '@semianalysisai/inferencex-db/etl/run-overrides';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';
import { planBenchmarkPointBackfill } from '@semianalysisai/inferencex-db/lib/benchmark-point-backfill';

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

import closeout from '../../../../db/src/etl/fixtures/cache-validity-producer-x1ir.json';
import producer from '../../../../db/src/etl/fixtures/cache-validity-producer.json';
import { type CacheRatePolicy, selectPricingCacheBasis } from './cache-pricing';

const PRICING: TokenRevenuePricing = {
  source: 'openrouter',
  inputPerMillion: 2,
  cachedInputPerMillion: 0.2,
  outputPerMillion: 10,
};
const FLAT_CACHE_PRICING: TokenRevenuePricing = { ...PRICING, cachedInputPerMillion: 2 };
const SPECS = { powerKwPerGpu: 1.5, costPerGpuHour: 2 };
const ASSUMPTIONS: ProfitEstimatorAssumptions = {
  basis: 'chip-hour',
  utilizationPct: 100,
  labCutPct: 0,
};
/** 1000 tok/s/GPU, 80% input, priced 2 / 0.2 / 10 $/M tok. */
const REVENUE_AT_H70 = 9.3312;
const REVENUE_AT_H0 = 12.96;

/** Cache metrics exactly as the real ETL mapper stores them for one producer payload. */
function etlCacheMetrics(serverMetrics: Record<string, unknown>): Record<string, number> {
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
      server_metrics: { present: true, ...serverMetrics },
    },
    createSkipTracker(),
  );
  if (!mapped) throw new Error('mapper dropped the row');
  return Object.fromEntries(
    Object.entries(mapped.metrics).filter(([key]) => key.includes('cache')),
  );
}

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
      median_intvty: 40,
      p90_itl: 1 / 40,
      tput_per_gpu: 1000,
      input_tput_per_gpu: 800,
      output_tput_per_gpu: 200,
      ...metrics,
    },
  };
}

/** One config at 40 and 20 tok/s/user (1000 and 1600 tok/s/GPU), plus optional faster points. */
function frontier(...caches: Record<string, number>[]): BenchmarkRow[] {
  return caches.map((cache, i) => {
    const interactivity = 40 - 20 * i;
    const throughput = 1000 + 600 * i;
    return apiRow(
      {
        ...cache,
        median_intvty: interactivity,
        p90_itl: 1 / interactivity,
        tput_per_gpu: throughput,
        input_tput_per_gpu: throughput * 0.8,
        output_tput_per_gpu: throughput * 0.2,
      },
      { conc: 8 * 2 ** i },
    );
  });
}

const select = (metrics: Record<string, number>, policy: CacheRatePolicy) =>
  selectPricingCacheBasis({ ...metrics, hw: 'b300', benchmark_type: 'agentic_traces' }, policy);

function calculator(rows: BenchmarkRow[], policy: CacheRatePolicy, target = 30, pricing = PRICING) {
  const { grouped } = buildGpuGroups(rows, {
    sequence: Sequence.AgenticTraces,
    precisions: ['fp4'],
    percentile: Percentile.P90,
    cacheRatePolicy: policy,
    classify: (hwKey) => ({ key: hwKey, meta: { hwKey } }),
  });
  const points = Object.values(grouped)[0]!;
  const interpolated = interpolateForGPU(points, target, 'interactivity_to_throughput', 'costh')!;
  const [result] = applyCacheHitMode([interpolated], 'actual');
  return {
    points,
    result: result!,
    estimate: estimateSkuProfit(result!, SPECS, pricing, ASSUMPTIONS),
  };
}

function trend(rows: BenchmarkRow[], policy: CacheRatePolicy, target = 30, pricing = PRICING) {
  const points = rows.map((row) =>
    rowToLightweightPoint(
      { ...row, hardware: 'h200', framework: 'trt', model: 'dsr1' },
      ['tokenRevenuePerGpuHour', 'tpPerGpu'],
      pricing,
      DEFAULT_TCO_BASIS,
      policy,
    )!,
  );
  return interpolateMetricAtInteractivity(
    points,
    target,
    'tokenRevenuePerGpuHour',
    pricing,
    policy,
  );
}

function chartRevenue(metrics: Record<string, number>, policy: CacheRatePolicy) {
  const row = apiRow(metrics, { hardware: 'h200', framework: 'trt', model: 'dsr1' });
  const point = rowToLightweightPoint(row, ['tpPerGpu'], null, DEFAULT_TCO_BASIS, policy);
  return applyTokenRevenuePricing([point!], PRICING, policy)[0]!.tokenRevenuePerGpuHour?.y ?? null;
}

const CORE = {
  server_cache_core_schema_version: 1,
  server_cache_status_class_code: 1,
  server_cache_published: 1,
  server_cache_pricing_eligible: 1,
  server_cache_basis_code: 1,
};
const COMPLETE = {
  ...CORE,
  server_gpu_cache_hit_rate: 0.6,
  server_cpu_cache_hit_rate: 0.1,
  server_external_cache_hit_rate: 0.1,
  server_overall_cache_hit_rate: 0.7,
};

describe('R1: strict tiers need complete, consistent components', () => {
  it.each<[string, Record<string, number>]>([
    ['GPU only', { ...CORE, server_gpu_cache_hit_rate: 0.6 }],
    ['CPU only', { ...CORE, server_cpu_cache_hit_rate: 0.1 }],
    [
      'CPU above external',
      {
        ...CORE,
        server_gpu_cache_hit_rate: 0.6,
        server_cpu_cache_hit_rate: 0.3,
        server_external_cache_hit_rate: 0.2,
        server_overall_cache_hit_rate: 0.8,
      },
    ],
    ['overall 0.004 off the tiers', { ...COMPLETE, server_overall_cache_hit_rate: 0.704 }],
    [
      'a router estimate as the overall source',
      { ...COMPLETE, server_cache_overall_source_code: 3 },
    ],
    [
      'rates rewritten under unchanged metadata',
      {
        ...CORE,
        server_gpu_cache_hit_rate: 0.2,
        server_cpu_cache_hit_rate: 0.5,
        server_overall_cache_hit_rate: 0.7,
      },
    ],
  ])('refuses %s', (_label, metrics) => {
    const basis = select(metrics, 'strict');
    expect(basis.source).toBe('unavailable');
    expect(basis.rate).toBeNull();
  });

  it('does not turn boolean rates into a priced zero through the real ETL', () => {
    const coerced = etlCacheMetrics({
      cache: {
        gpu_cache_hit_rate: false,
        cpu_cache_hit_rate: false,
        external_cache_hit_rate: false,
        overall_cache_hit_rate: 'invalid',
      },
      cache_validity: producer.cases.atom_complete.cache_validity,
    });
    expect(select(coerced, 'strict').source).toBe('unavailable');
  });

  it('keeps complete, explicit-zero and 5-decimal producer values priceable', () => {
    expect(select(COMPLETE, 'strict')).toEqual({ rate: 0.7, source: 'measured' });
    const noCpuTier = etlCacheMetrics(closeout.cases.atom_no_cpu_tier);
    expect(select(noCpuTier, 'strict')).toEqual({ rate: 0.6, source: 'measured' });
    const zero = etlCacheMetrics(producer.cases.atom_zero);
    expect(select(zero, 'strict')).toEqual({ rate: 0, source: 'measured' });
    // round_floats(5): three independently rounded values may differ by 1.5e-5.
    const rounded = {
      ...CORE,
      server_gpu_cache_hit_rate: 0.33333,
      server_cpu_cache_hit_rate: 0.33333,
      server_external_cache_hit_rate: 0.33333,
      server_overall_cache_hit_rate: 0.66667,
    };
    expect(select(rounded, 'strict').source).toBe('measured');
    expect(select(rounded, 'strict').rate).toBeCloseTo(0.66666, 10);
  });
});

describe('R2: a mixed frontier never falls back to zero-hit pricing', () => {
  const measured = () => etlCacheMetrics(producer.cases.atom_complete);
  const missing = {};

  it.each([40, 30])('withholds actual pricing at interactivity %d', (target) => {
    const rows = frontier(measured(), missing);
    const calc = calculator(rows, 'enforce-when-present', target);
    expect(calc.result.cacheHitUnavailable).toBe(true);
    expect(calc.estimate).toMatchObject({ reason: 'cache-hit-unavailable' });
    expect(trend(rows, 'enforce-when-present', target)).toBeNull();
  });

  it('withholds a three-point frontier with one old point missing its rate', () => {
    const rows = frontier(measured(), measured(), missing);
    expect(calculator(rows, 'enforce-when-present').estimate).toMatchObject({
      reason: 'cache-hit-unavailable',
    });
  });

  it('prices the all-valid frontier exactly at the node', () => {
    const calc = calculator(frontier(measured(), measured()), 'enforce-when-present', 40);
    expect(isProfitEstimatorRow(calc.estimate)).toBe(true);
    expect(isProfitEstimatorRow(calc.estimate) && calc.estimate.revenuePerGpuHour).toBeCloseTo(
      REVENUE_AT_H70,
      8,
    );
    expect(trend(frontier(measured(), measured()), 'enforce-when-present', 40)).toBeCloseTo(
      REVENUE_AT_H70,
      8,
    );
  });

  it('keeps the legacy-only behaviour as the compatibility control', () => {
    const calc = calculator(frontier(measured(), missing), 'legacy', 40);
    expect(isProfitEstimatorRow(calc.estimate) && calc.estimate.revenuePerGpuHour).toBeCloseTo(
      REVENUE_AT_H0,
      8,
    );
  });

  it('leaves an all-legacy frontier on the legacy rule', () => {
    const rated = { server_gpu_cache_hit_rate: 0.5, server_external_cache_hit_rate: 0.2 };
    expect(
      isProfitEstimatorRow(calculator(frontier(rated, rated), 'enforce-when-present').estimate),
    ).toBe(true);
    expect(
      isProfitEstimatorRow(calculator(frontier(missing, missing), 'enforce-when-present').estimate),
    ).toBe(true);
  });

  it('still prices a mixed frontier when the price list has no cache discount', () => {
    const calc = calculator(
      frontier(measured(), missing),
      'enforce-when-present',
      30,
      FLAT_CACHE_PRICING,
    );
    expect(isProfitEstimatorRow(calc.estimate)).toBe(true);
    expect(calc.result.cacheHitUnavailable).toBe(true);
  });

  it('keeps point and frontier provenance once the guard is on', () => {
    const calc = calculator(frontier(measured(), missing), 'enforce-when-present');
    expect(calc.points.map((p) => p.cacheHitSource)).toEqual(['measured', 'none']);
    expect(calc.result.cacheHitSources).toEqual(['measured', 'none']);
    expect(calc.result.cacheHitUnavailableReason).toBe('mixed-frontier-missing-rate');
    const legacy = calculator(frontier(measured(), missing), 'legacy');
    expect(legacy.points.every((p) => p.cacheHitSource === undefined)).toBe(true);
  });
});

describe('R3: validity traces without a core schema fail closed', () => {
  const rejected = producer.cases.trt_rejected_cached_exceeds_prompt;

  it('does not let a deleted core_schema undo an INVALID verdict', () => {
    const { core_schema: _dropped, ...withoutSchema } = rejected.cache_validity;
    const metrics = etlCacheMetrics({ ...rejected, cache_validity: withoutSchema });
    expect(select(metrics, 'enforce-when-present').source).toBe('unavailable');
    expect(chartRevenue(metrics, 'enforce-when-present')).toBeNull();
  });

  it('refuses a partial core that lost its schema', () => {
    const partial = {
      server_cache_status_class_code: 7,
      server_cache_published: 1,
      server_cache_pricing_eligible: 0,
      server_cache_basis_code: 1,
      server_overall_cache_hit_rate: 0.7,
    };
    expect(select(partial, 'enforce-when-present').source).toBe('unavailable');
  });

  it.each(['atom3964_complete', 'atom3964_zero', 'atom3964_partial_component'] as const)(
    'gates the #3964 detail-only %s until a common core is present',
    (name) => {
      const metrics = etlCacheMetrics(closeout.cases[name]);
      for (const policy of ['enforce-when-present', 'strict'] as const) {
        expect(select(metrics, policy).source).toBe('unavailable');
      }
      expect(select(metrics, 'legacy').source).not.toBe('unavailable');
    },
  );

  it('reads only a canonical core version', () => {
    for (const schema of [
      'infx-cache-validity-core/01',
      'infx-cache-validity-core/1.0',
      'infx-cache-validity-core/1e0',
    ]) {
      const metrics = etlCacheMetrics({
        ...producer.cases.atom_complete,
        cache_validity: { ...producer.cases.atom_complete.cache_validity, core_schema: schema },
      });
      expect(select(metrics, 'strict').source).toBe('unavailable');
    }
  });

  it('treats the real MISSING producer output as unavailable, not zero', () => {
    const metrics = etlCacheMetrics(closeout.cases.missing_server_metrics);
    expect(select(metrics, 'enforce-when-present').source).toBe('unavailable');
    expect(chartRevenue(metrics, 'enforce-when-present')).toBeNull();
  });
});

describe('eligibility does not survive a donor rewrite', () => {
  const donor = BENCHMARK_POINT_BACKFILLS.find(
    (backfill) => backfill.id.endsWith('-gb200-cache-hit-rate') && !backfill.set.offloadMode,
  )!;
  const row = (metrics: Record<string, number>) => ({
    offload_mode: donor.offloadMode,
    recipe_fingerprint: donor.recipeFingerprint ?? null,
    metrics,
  });

  it('refuses to write borrowed rates over a validated core', () => {
    const validated = etlCacheMetrics(producer.cases.atom_complete);
    expect(() => planBenchmarkPointBackfill(row(validated), donor)).toThrow(/validity/);
  });

  it('refuses a source-only rewrite that would turn a router estimate into an actual rate', () => {
    const combined = {
      ...CORE,
      server_cache_basis_code: 2,
      server_overall_cache_hit_rate: 0.9,
      server_cache_overall_source_code: 3,
    };
    expect(select(combined, 'strict').source).toBe('unavailable');
    // Synthetic rule on the donor's identity; the real donor list is unchanged.
    const sourceRule = {
      ...donor,
      id: 'synthetic-overall-source-rule',
      set: { metricsMerge: { server_cache_overall_source_code: 1 } },
    };
    expect(() => planBenchmarkPointBackfill(row(combined), sourceRule)).toThrow(
      /server_cache_overall_source_code/,
    );
  });

  it('still applies the donor to a pre-core row', () => {
    const merged = planBenchmarkPointBackfill(row({ server_gpu_cache_hit_rate: 0 }), donor);
    expect(merged?.server_gpu_cache_hit_rate).toBe(
      donor.set.metricsMerge?.server_gpu_cache_hit_rate,
    );
  });
});
