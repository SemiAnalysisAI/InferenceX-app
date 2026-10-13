import { describe, expect, it } from 'vitest';

import { NORMALIZED_TOKEN_REVENUE_PRICING } from '@/components/inference/token-revenue';
import type { BenchmarkRow } from '@/lib/api/api';
import { Percentile, Sequence } from '@/lib/catalog/data-mappings';

import { interpolateForGPU } from './interpolation';
import { estimateSkuProfit } from './profit-estimator';
import { buildGpuGroups } from './throughput-data';

const RUN = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/36734492117/attempts/1';
const SPECS = { powerKwPerGpu: 2, costPerGpuHour: 10 };
const ASSUMPTIONS = { utilizationPct: 60, labCutPct: 30, basis: 'chip-hour' as const };
const COMPLETE = {
  server_gpu_cache_hit_rate: 0.97161,
  server_cpu_cache_hit_rate: 0,
  server_external_cache_hit_rate: 0,
  server_cache_pricing_eligible: 1,
  server_cache_validity_code: 1,
};

function atomRow(
  conc: number,
  intvty: number,
  tput: number,
  metrics: Record<string, number>,
): BenchmarkRow {
  return {
    id: conc,
    hardware: 'mi355x',
    framework: 'atom-disagg',
    model: 'dsv4',
    precision: 'fp4',
    spec_method: 'none',
    disagg: true,
    is_multinode: true,
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
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    conc,
    offload_mode: 'none',
    image: 'rocm/atom-dev:nightly',
    metrics: {
      // benchmark-transform derives *_intvty as 1 / *_itl and drops it when itl is absent.
      p90_itl: 1 / intvty,
      median_itl: 1 / intvty,
      tput_per_gpu: tput,
      input_tput_per_gpu: tput * 0.99,
      output_tput_per_gpu: tput * 0.01,
      input_tput_tps: tput * 16 * 0.99,
      output_tput_tps: tput * 16 * 0.01,
      ...metrics,
    },
    date: '2026-09-30',
    run_url: RUN,
  } as BenchmarkRow;
}

function price(rows: BenchmarkRow[], target?: number) {
  const { grouped } = buildGpuGroups(rows, {
    sequence: Sequence.AgenticTraces,
    precisions: ['fp4'],
    percentile: Percentile.P90,
    classify: () => ({ key: 'curve', meta: { hwKey: 'curve' } }),
  });
  const points = grouped.curve ?? [];
  const at = target ?? points[0]!.interactivity;
  const result = interpolateForGPU(points, at, 'interactivity_to_throughput', 'costh')!;
  return {
    points,
    result,
    row: estimateSkuProfit(result, SPECS, NORMALIZED_TOKEN_REVENUE_PRICING, ASSUMPTIONS),
  };
}

describe('ATOM cache validity through buildGpuGroups, interpolateForGPU and estimateSkuProfit', () => {
  it('prices an eligible complete observation', () => {
    const { points, row } = price([atomRow(1, 190, 840, COMPLETE)]);
    expect(points[0]!.cacheHitRate).toBeCloseTo(0.97161, 12);
    expect(row).toHaveProperty('revenue');
  });

  it('keeps performance but refuses actual pricing for a partial observation', () => {
    const partial = {
      ...COMPLETE,
      server_cpu_cache_hit_rate: undefined,
      server_external_cache_hit_rate: undefined,
    };
    const { points, row } = price([atomRow(1, 190, 840, partial as Record<string, number>)]);
    expect(points[0]!.throughput).toBe(840);
    expect(points[0]!.cacheHitRateUnavailable).toBe('PARTIAL_COMPONENT');
    expect(row).toMatchObject({ reason: 'invalid-cache-observation' });
  });

  it('quarantines the known-bad legacy row and restores a re-derived one', () => {
    const legacy = {
      server_gpu_cache_hit_rate: 0.48352,
      server_cpu_cache_hit_rate: 0,
      server_external_cache_hit_rate: 0,
    };
    expect(price([atomRow(1, 190, 840, legacy)]).row).toMatchObject({
      reason: 'invalid-cache-observation',
    });
    expect(price([atomRow(1, 190, 840, COMPLETE)]).row).toHaveProperty('revenue');
  });

  it('does not restore a mixed curve whose frontier holds an unresolved point', () => {
    const unresolved = {
      ...COMPLETE,
      server_cache_pricing_eligible: 0,
      server_cache_validity_code: 14,
    };
    const valid = [atomRow(1, 190, 840, COMPLETE), atomRow(16, 120, 4_000, COMPLETE)];
    expect(price(valid, 150).row).toHaveProperty('revenue');
    const mixed = [...valid, atomRow(256, 40, 48_000, unresolved)];
    const { result, row } = price(mixed, 150);
    expect(result.cacheHitRateUnavailable).toBe('REQUEST_SCOPE_UNRESOLVED');
    expect(row).toMatchObject({ reason: 'invalid-cache-observation' });
  });

  it('takes the ATOM P/D token mix from client rates, not the doubled prompt_total', () => {
    const inconsistent = {
      ...COMPLETE,
      input_tput_per_gpu: 10,
      total_prompt_tokens: 2,
      total_generation_tokens: 1,
    };
    const { points } = price([atomRow(1, 190, 840, inconsistent)]);
    expect(points[0]!.inputTokenShare).toBeCloseTo(0.99, 12);
  });
});
