import { describe, expect, it } from 'vitest';
import type { BenchmarkRow } from '@/lib/api/api';
import type { TokenRevenuePricing } from '@/components/inference/types';
import { estimateRevenueCapacity, deploymentSize } from './revenue-capacity';
import type { GPUDataPoint, InterpolatedResult } from './types';

const pricing: TokenRevenuePricing = {
  source: 'normalized',
  inputPerMillion: 1,
  cachedInputPerMillion: 0.1,
  outputPerMillion: 1,
};
const sourceRow: BenchmarkRow = {
  id: 1,
  hardware: 'b200',
  framework: 'vllm',
  model: 'kimi-k3',
  precision: 'fp8',
  spec_method: 'none',
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
  benchmark_type: 'agentic_traces',
  isl: null,
  osl: null,
  conc: 8,
  image: 'vllm:test',
  offload_mode: 'off',
  metrics: {},
  date: '2026-10-29',
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
};
function result(overrides: Partial<InterpolatedResult> = {}): InterpolatedResult {
  const point: GPUDataPoint = {
    hwKey: 'b200_vllm',
    interactivity: 60,
    throughput: 1000,
    outputThroughput: 500,
    inputThroughput: 500,
    costh: 0,
    costr: 0,
    costhi: 0,
    costri: 0,
    costhOutput: 0,
    costrOutput: 0,
    tpPerMw: 0,
    outputTpPerMw: 0,
    inputTpPerMw: 0,
    concurrency: 8,
    tp: 8,
    dp: 1,
    ep: 1,
    dp_attention: false,
    disagg: false,
    precision: 'fp8',
    sourceRow,
  };
  return {
    hwKey: point.hwKey,
    resultKey: point.hwKey,
    value: 1000,
    outputTputValue: 500,
    inputTputValue: 500,
    cost: 0,
    costInput: 0,
    costOutput: 0,
    tpPerMw: 0,
    inputTpPerMw: 0,
    outputTpPerMw: 0,
    concurrency: 8,
    inputTokenShare: 0.5,
    cacheHitRate: 0,
    nearestPoints: [point],
    clamped: false,
    ...overrides,
  };
}

describe('estimateRevenueCapacity', () => {
  it('inverts gross revenue without a cost or power requirement and rounds complete deployments', () => {
    const row = estimateRevenueCapacity([result()], pricing, 10_000, 'month', 50).rows[0];
    expect(row.revenuePerGpuHour).toBeCloseTo(3.6);
    expect(row.realizedRevenuePerGpuHour).toBeCloseTo(1.8);
    expect(row.gpuEquivalents).toBeCloseTo(10_000 / 1314);
    expect(row.requiredGpus).toBe(8);
    expect(row.deployments).toBe(1);
    expect(row.projectedRevenue).toBeCloseTo(10_512);
    expect(row.sourceUrls).toEqual([sourceRow.run_url]);
  });
  it('uses equivalent month, quarter and year targets and scales utilization once', () => {
    const month = estimateRevenueCapacity([result()], pricing, 10_000, 'month', 50).rows[0];
    expect(
      estimateRevenueCapacity([result()], pricing, 30_000, 'quarter', 50).rows[0].gpuEquivalents,
    ).toBeCloseTo(month.gpuEquivalents);
    expect(
      estimateRevenueCapacity([result()], pricing, 120_000, 'year', 50).rows[0].gpuEquivalents,
    ).toBeCloseTo(month.gpuEquivalents);
    expect(
      estimateRevenueCapacity([result()], pricing, 10_000, 'month', 25).rows[0].gpuEquivalents,
    ).toBeCloseTo(month.gpuEquivalents * 2);
  });
  it('prices cached input separately from generated tokens', () => {
    const row = estimateRevenueCapacity(
      [result({ cacheHitRate: 0.8 })],
      pricing,
      10_000,
      'month',
      100,
    ).rows[0];
    expect(row.revenuePerGpuHour).toBeCloseTo(2.304);
  });
  it('returns explicit missing/range/zero reasons rather than infinities', () => {
    const items = [
      result({ clamped: true }),
      result({ inputTokenShare: undefined }),
      result({ value: 0 }),
    ];
    expect(
      estimateRevenueCapacity(
        items,
        { ...pricing, outputPerMillion: 2 },
        100,
        'month',
        50,
      ).skipped.map((s) => s.reason),
    ).toEqual(['outside-measured-range', 'no-token-mix', 'zero-revenue']);
    expect(estimateRevenueCapacity([result()], pricing, 100, 'month', 0).rows).toEqual([]);
    expect(
      estimateRevenueCapacity(
        [result()],
        { source: 'normalized', inputPerMillion: 0, outputPerMillion: 0 },
        100,
        'year',
        100,
      ).skipped[0].reason,
    ).toBe('zero-revenue');
  });
  it('allows an explicit zero target even at zero utilization', () => {
    expect(estimateRevenueCapacity([result()], pricing, 0, 'month', 0).rows[0]).toMatchObject({
      requiredGpus: 0,
      projectedRevenue: 0,
    });
  });
  it.each([-1, NaN, Infinity])('rejects invalid targets (%s)', (target) => {
    expect(() => estimateRevenueCapacity([result()], pricing, target, 'year', 50)).toThrow(
      RangeError,
    );
  });
  it.each([-1, 101, NaN])('rejects invalid utilization (%s)', (utilization) => {
    expect(() => estimateRevenueCapacity([result()], pricing, 10, 'year', utilization)).toThrow(
      RangeError,
    );
  });
  it('reports numerically unsafe fleet sizes', () => {
    expect(
      estimateRevenueCapacity([result()], pricing, Number.MAX_VALUE, 'month', 1).skipped[0].reason,
    ).toBe('unsafe-fleet-size');
  });
  it('preserves independent official and unofficial identities and sorts by capacity', () => {
    const rows = estimateRevenueCapacity(
      [
        result(),
        result({ resultKey: 'run:123:b200_vllm', value: 2000, isOverlay: true, runIndex: 1 }),
      ],
      pricing,
      100_000,
      'month',
      50,
    ).rows;
    expect(rows[0]).toMatchObject({
      resultKey: 'run:123:b200_vllm',
      isOverlay: true,
      runIndex: 1,
      requiredGpus: 40,
    });
    expect(rows[1].requiredGpus).toBe(80);
  });
});

describe('deploymentSize', () => {
  it('counts disaggregated prefill plus decode GPUs', () => {
    const item = result();
    item.nearestPoints[0].sourceRow = {
      ...sourceRow,
      disagg: true,
      num_prefill_gpu: 4,
      num_decode_gpu: 8,
    };
    expect(deploymentSize(item)).toBe(12);
  });
  it('does not invent topology across different endpoints or missing source rows', () => {
    const item = result();
    item.nearestPoints.push({
      ...item.nearestPoints[0],
      sourceRow: { ...sourceRow, decode_ep: 8 },
    });
    const row = estimateRevenueCapacity([item], pricing, 100, 'month', 50).rows[0];
    expect(row.deploymentGpus).toBeNull();
    expect(row.requiredGpus).toBe(1);
    expect(deploymentSize(result({ nearestPoints: [] }))).toBeNull();
  });
});
