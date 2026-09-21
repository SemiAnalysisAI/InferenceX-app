import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { modelSystemPower } from '@/lib/modeled-system-power';
import { Percentile, Sequence } from '@/lib/data-mappings';
import { buildGpuGroups, interpolateForGPU } from './useThroughputData';
import { estimateProfitRows } from './profit-estimator';
import { estimateProfitByPower, modeledPowerAtTarget } from './profit-power';
import type { GPUDataPoint, InterpolatedResult } from './types';

// Power telemetry from MI355X Kimi K3 source row 441385; the target/rates below
// are controlled inputs so the test isolates a denominator change.
const source: BenchmarkRow = {
  id: 441385,
  model: 'kimik3',
  hardware: 'mi355x',
  framework: 'atom',
  precision: 'fp4',
  spec_method: 'mtp',
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
  conc: 16,
  offload_mode: 'off',
  image: 'test',
  date: '2026-09-10',
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34349642428/attempts/1',
  metrics: {
    power_valid: 1,
    power_metric_schema_version: 2,
    avg_power_w: 796.131,
    avg_total_gpu_power_w: 6369.045,
  },
};
const point: GPUDataPoint = {
  sourceRow: source,
  hwKey: 'mi355x_atom',
  interactivity: 45,
  throughput: 6000,
  inputThroughput: 5940,
  outputThroughput: 60,
  concurrency: 16,
  tp: 8,
  precision: 'fp4',
  costh: 1,
  costr: 2,
  costhi: 1,
  costri: 2,
  costhOutput: 1,
  costrOutput: 2,
  tpPerMw: 1,
  inputTpPerMw: 1,
  outputTpPerMw: 1,
};
const result: InterpolatedResult = {
  hwKey: point.hwKey,
  resultKey: point.hwKey,
  value: 6000,
  inputTputValue: 5940,
  outputTputValue: 60,
  inputTokenShare: 0.99,
  cacheHitRate: 0.9,
  cost: 1,
  costInput: 1,
  costOutput: 1,
  tpPerMw: 1,
  inputTpPerMw: 1,
  outputTpPerMw: 1,
  concurrency: 16,
  nearestPoints: [point],
};
const pricing = {
  source: 'normalized' as const,
  inputPerMillion: 3,
  cachedInputPerMillion: 0.3,
  outputPerMillion: 15,
};
const assumptions = { basis: 'gw-year' as const, utilizationPct: 60, labCutPct: 30 };
const specs = () => ({ powerKwPerGpu: 2.09, costPerGpuHour: 1.5 });
const labels = {
  provisioned: 'Provisioned',
  modeled: 'Measured + modeled',
  extrapolated: 'Full-chassis extrapolation',
};

describe('profit power basis preview', () => {
  it.each([8, 4, 2])(
    'keeps raw power attached through official and run-keyed %i-GPU frontiers',
    (gpus) => {
      const row = {
        ...source,
        prefill_tp: gpus,
        decode_tp: gpus,
        num_prefill_gpu: gpus,
        num_decode_gpu: gpus,
        metrics: {
          ...source.metrics,
          avg_total_gpu_power_w: source.metrics.avg_power_w * gpus,
          p90_itl: 1 / 45,
          tput_per_gpu: 6000,
          input_tput_per_gpu: 5940,
          output_tput_per_gpu: 60,
        },
      };
      for (const suffix of ['', '__run1']) {
        const { grouped } = buildGpuGroups([row], {
          sequence: Sequence.AgenticTraces,
          precisions: ['fp4'],
          percentile: Percentile.P90,
          classify: (hwKey) => ({ key: `${hwKey}${suffix}`, meta: { hwKey } }),
        });
        const points = Object.values(grouped)[0];
        expect(points[0].sourceRow).toBe(row);
        const interpolated = interpolateForGPU(points, 45, 'interactivity_to_throughput', 'costh');
        expect(interpolated).not.toBeNull();
        expect(modeledPowerAtTarget(interpolated!, 45)).toMatchObject({
          kwPerGpu: expect.closeTo(1.5976675, 5),
          extrapolated: gpus !== 8,
        });
      }
    },
  );

  it('distinguishes partial chassis from unsupported rack hardware with valid telemetry', () => {
    for (const hardware of ['gb200', 'gb300']) {
      expect(
        modeledPowerAtTarget(
          { ...result, nearestPoints: [{ ...point, sourceRow: { ...source, hardware } }] },
          45,
        ),
      ).toEqual({ reason: 'unsupported-power-hardware' });
    }
    const partial = {
      ...source,
      prefill_tp: 4,
      decode_tp: 4,
      metrics: { ...source.metrics, avg_power_w: 500, avg_total_gpu_power_w: 2000 },
    };
    expect(modelSystemPower(partial, undefined, true)).toMatchObject({
      status: 'supported',
      chassisBasis: 'extrapolated',
    });
    expect(
      modeledPowerAtTarget({ ...result, nearestPoints: [{ ...point, sourceRow: partial }] }, 45),
    ).toMatchObject({ extrapolated: true });
  });

  it('leaves the default estimator and default AgentX model gate unchanged', () => {
    expect(
      estimateProfitByPower([result], specs, pricing, assumptions, 'provisioned', 45, labels),
    ).toEqual(estimateProfitRows([result], specs, pricing, assumptions));
    expect(modelSystemPower(source)).toMatchObject({ status: 'unsupported', reason: 'workload' });
  });

  it.each([2, 4])(
    'prices a validated %i-GPU allocation as a labeled full-chassis extrapolation',
    (gpus) => {
      const partial = {
        ...source,
        prefill_tp: gpus,
        decode_tp: gpus,
        num_prefill_gpu: gpus,
        num_decode_gpu: gpus,
        metrics: { ...source.metrics, avg_power_w: 500, avg_total_gpu_power_w: 500 * gpus },
      };
      const partialResult = {
        ...result,
        nearestPoints: [{ ...point, tp: gpus, sourceRow: partial }],
      };
      const output = estimateProfitByPower(
        [partialResult],
        specs,
        pricing,
        assumptions,
        'modeled',
        45,
        labels,
      );
      expect(output.skipped).toEqual([]);
      expect(output.rows).toHaveLength(1);
      expect(output.rows[0].powerLabel).toContain('Full-chassis extrapolation');
      // Packing identical replicas must not charge all eight GPUs to each replica.
      const full = {
        ...source,
        metrics: { ...source.metrics, avg_power_w: 500, avg_total_gpu_power_w: 4000 },
      };
      const fullResult = { ...result, nearestPoints: [{ ...point, sourceRow: full }] };
      const fullOutput = estimateProfitByPower(
        [fullResult],
        specs,
        pricing,
        assumptions,
        'modeled',
        45,
        labels,
      );
      expect(output.rows[0].gpuHours).toBeCloseTo(fullOutput.rows[0].gpuHours, 5);
      expect(output.rows[0].revenuePerGpuHour).toBe(fullOutput.rows[0].revenuePerGpuHour);
      expect(fullOutput.rows[0].powerLabel).toBeUndefined();
      const paired = estimateProfitByPower(
        [partialResult],
        specs,
        pricing,
        assumptions,
        'compare',
        45,
        labels,
      );
      expect(paired.rows[0].powerLabel).toBe(labels.provisioned);
      expect(paired.rows[1].powerLabel).toBe(`${labels.modeled} · ${labels.extrapolated}`);
      expect(partial.metrics.avg_total_gpu_power_w).toBe(500 * gpus);
    },
  );

  it('only changes GPU-hours in the paired calculation, preserving unit economics and margin', () => {
    expect(modeledPowerAtTarget(result, 45)).toMatchObject({
      kwPerGpu: expect.closeTo(1.5976675, 8),
      extrapolated: false,
    });
    const output = estimateProfitByPower(
      [result],
      specs,
      pricing,
      assumptions,
      'compare',
      45,
      labels,
    );
    expect(output.skipped).toEqual([]);
    const [baseline, modeled] = output.rows;
    expect(modeled.revenuePerGpuHour).toBe(baseline.revenuePerGpuHour);
    const ratio = 2.09 / 1.5976675;
    for (const field of ['gpuHours', 'revenue', 'tco', 'labCut', 'profit'] as const) {
      expect(modeled[field] / baseline[field]).toBeCloseTo(ratio, 10);
    }
    expect(modeled.profit / modeled.revenue).toBeCloseTo(baseline.profit / baseline.revenue, 12);
    expect(new Set(output.rows.map((r) => r.resultKey)).size).toBe(2);
    expect(result.nearestPoints).toEqual([point]);
  });

  it('never fills a missing power knot with a different measurement or provisioned watts', () => {
    const missing = {
      ...point,
      interactivity: 60,
      sourceRow: { ...source, metrics: { ...source.metrics, power_valid: 0 } },
    };
    const bracket = { ...result, nearestPoints: [{ ...point, interactivity: 30 }, missing] };
    expect(modeledPowerAtTarget(bracket, 45)).toEqual({ reason: 'no-measured-power' });
    expect(
      estimateProfitByPower([bracket], specs, pricing, assumptions, 'compare', 45, labels),
    ).toMatchObject({ rows: [], skipped: [{ reason: 'no-measured-power' }] });
    expect(modeledPowerAtTarget({ ...result, nearestPoints: [point, missing] }, 45)).toMatchObject({
      kwPerGpu: expect.closeTo(1.5976675, 8),
      extrapolated: false,
    });
    expect(modeledPowerAtTarget({ ...result, clamped: true }, 45)).toEqual({
      reason: 'outside-measured-range',
    });
  });

  it('estimates power only inside the same valid bracket and scales losses too', () => {
    const bracket = {
      ...result,
      nearestPoints: [
        { ...point, interactivity: 30 },
        { ...point, interactivity: 60 },
      ],
    };
    expect(modeledPowerAtTarget(bracket, 45)).toMatchObject({
      kwPerGpu: expect.closeTo(1.5976675, 8),
      extrapolated: false,
    });
    expect(modeledPowerAtTarget(bracket, 75)).toEqual({ reason: 'outside-measured-range' });
    const [a, b] = estimateProfitByPower(
      [result],
      specs,
      pricing,
      { ...assumptions, utilizationPct: 0 },
      'compare',
      45,
      labels,
    ).rows;
    expect(a.revenue).toBe(0);
    expect(b.revenue).toBe(0);
    expect(b.profit).toBeLessThan(a.profit);
  });

  it('keeps the extrapolation label when only one interpolation knot is partial', () => {
    const left = { ...point, interactivity: 30 };
    const right = {
      ...point,
      interactivity: 60,
      sourceRow: {
        ...source,
        decode_tp: 4,
        prefill_tp: 4,
        metrics: { ...source.metrics, avg_power_w: 500, avg_total_gpu_power_w: 2000 },
      },
    };
    const bracket = { ...result, nearestPoints: [left, right] };
    const low = modeledPowerAtTarget(bracket, 30);
    const high = modeledPowerAtTarget(bracket, 60);
    if (!('kwPerGpu' in low) || !('kwPerGpu' in high))
      throw new Error('Expected valid power knots');
    expect(modeledPowerAtTarget(bracket, 40)).toEqual({
      kwPerGpu: low.kwPerGpu + (high.kwPerGpu - low.kwPerGpu) / 3,
      extrapolated: true,
    });
    expect(modeledPowerAtTarget(bracket, 30)).toMatchObject({ extrapolated: false });
  });

  it.each([
    [{ is_multinode: true }, 'unsupported-power-topology'],
    [
      {
        decode_tp: 3,
        prefill_tp: 3,
        metrics: { ...source.metrics, avg_power_w: 500, avg_total_gpu_power_w: 1500 },
      },
      'unsupported-power-topology',
    ],
    [
      { metrics: { ...source.metrics, avg_power_w: 500, avg_total_gpu_power_w: 2000 } },
      'no-measured-power',
    ],
    [
      { metrics: { power_valid: 1, avg_power_w: 796.131, avg_total_gpu_power_w: 6369.045 } },
      'no-measured-power',
    ],
    [
      { metrics: { ...source.metrics, avg_power_w: 10000, avg_total_gpu_power_w: 80000 } },
      'outside-power-model',
    ],
  ] as const)('reports why a configuration stays unavailable (%j)', (overrides, reason) => {
    const unsupported = {
      ...result,
      nearestPoints: [{ ...point, sourceRow: { ...source, ...overrides } }],
    };
    expect(
      estimateProfitByPower([unsupported], specs, pricing, assumptions, 'modeled', 45, labels),
    ).toMatchObject({ rows: [], skipped: [{ reason }] });
  });
});
