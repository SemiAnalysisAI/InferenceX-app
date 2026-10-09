import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { modelSystemPower } from '@/lib/modeled-system-power';
import {
  gb300AggregateRow,
  gb300DisaggRow,
  upstreamRackWattsPerGpu,
} from '@/lib/nvl72-power.fixture';
import { SYSTEM_POWER_MODEL_REVISION } from '@/lib/system-power-model';
import { Percentile, Sequence } from '@/lib/data-mappings';
import { buildGpuGroups, interpolateForGPU } from './useThroughputData';
import { estimateProfitRows } from './profit-estimator';
import {
  estimateProfitByPower,
  interpolateProfitForGPU,
  modeledPowerAtTarget,
} from './profit-power';
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
// python -m power_model --gpu-level-power-per-gpu=796.130625 --system=mi355 --workload=agentic:
// All-in W/GPU × the estimator's 1.1 planning margin, in kW.
const MODELED_KW_PER_GPU = 1.4900494869888934;
const point: GPUDataPoint = {
  sourceRow: source,
  hwKey: 'mi355x_atom',
  interactivity: 45,
  throughput: 6000,
  inputThroughput: 5940,
  outputThroughput: 60,
  inputTokenShare: 0.99,
  cacheHitRate: 0.9,
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

const traySource = gb300DisaggRow();
const trayPoint: GPUDataPoint = { ...point, sourceRow: traySource, hwKey: 'gb300_dynamo-sglang' };

describe('profit power basis preview', () => {
  it('retains the existing Steffen result for the Kimi K3 MI355X valid knots at 45', () => {
    const knots = [
      { ...point, interactivity: 14.39677512237259, throughput: 12090.08106 },
      { ...point, interactivity: 53.85029617662897, throughput: 7227.86065 },
    ];
    expect(
      interpolateProfitForGPU(knots, 45, 'interactivity_to_throughput', 'costh', 'modeled')?.value,
    ).toBeCloseTo(8059.609379677125, 8);
  });

  it('selects power-valid raw knots before the frontier at the unchanged target', () => {
    const low = {
      ...point,
      interactivity: 14.396775,
      throughput: 8000,
      sourceRow: { ...source, id: 443687, conc: 48 },
    };
    const high = {
      ...point,
      interactivity: 53.850296,
      throughput: 4000,
      sourceRow: { ...source, id: 443686, conc: 14 },
    };
    const invalid = {
      ...point,
      interactivity: 15.951507,
      throughput: 9000,
      sourceRow: {
        ...source,
        id: 443692,
        conc: 44,
        metrics: { ...source.metrics, power_valid: 0 },
      },
    };
    const points = [low, invalid, high];
    const original = interpolateForGPU(points, 45, 'interactivity_to_throughput', 'costh')!;
    expect(original.nearestPoints.map((p) => p.sourceRow?.id)).toEqual([443692, 443686]);
    expect(modeledPowerAtTarget(original, 45)).toEqual({ reason: 'no-measured-power' });
    const eligible = interpolateForGPU([low, high], 45, 'interactivity_to_throughput', 'costh')!;
    for (const basis of ['modeled', 'compare'] as const) {
      const selected = interpolateProfitForGPU(
        points,
        45,
        'interactivity_to_throughput',
        'costh',
        basis,
      )!;
      expect(selected).toEqual(eligible);
      expect(modeledPowerAtTarget(selected, 45)).toHaveProperty('kwPerGpu');
      const output = estimateProfitByPower(
        [selected],
        specs,
        pricing,
        assumptions,
        basis,
        45,
        labels,
      );
      expect(output.skipped).toEqual([]);
      expect(output.rows).toHaveLength(basis === 'compare' ? 2 : 1);
      if (basis === 'compare') {
        expect(output.rows[0].revenue / output.rows[0].gpuHours).toBeCloseTo(
          output.rows[1].revenue / output.rows[1].gpuHours,
          10,
        );
      }
    }
    expect(
      interpolateProfitForGPU(points, 45, 'interactivity_to_throughput', 'costh', 'provisioned'),
    ).toEqual(original);
  });

  it('keeps inherited producer rows in the selected logical curve', () => {
    const points = [20, 60].map((interactivity, i) => ({
      ...point,
      interactivity,
      throughput: 8000 - i * 4000,
      sourceRow: {
        ...source,
        date: `2026-09-${10 + i}`,
        workflow_run_id: 100 + i,
        run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${100 + i}`,
        curve_date: '2026-09-12',
        curve_workflow_run_id: 102,
      },
    }));
    const selected = interpolateProfitForGPU(
      points,
      45,
      'interactivity_to_throughput',
      'costh',
      'modeled',
    )!;
    expect(selected.clamped).toBe(false);
    expect(selected.nearestPoints).toEqual(points);
    expect(modeledPowerAtTarget(selected, 45)).toHaveProperty('kwPerGpu');
  });

  it('accepts an exact valid point and preserves provisioned fallback outside the valid range', () => {
    const exact = interpolateProfitForGPU(
      [point],
      45,
      'interactivity_to_throughput',
      'costh',
      'modeled',
    )!;
    expect(modeledPowerAtTarget(exact, 45)).toHaveProperty('kwPerGpu');
    const invalid = {
      ...point,
      interactivity: 60,
      throughput: 3000,
      sourceRow: { ...source, metrics: { ...source.metrics, power_valid: 0 } },
    };
    const points = [{ ...point, interactivity: 20 }, invalid];
    const original = interpolateForGPU(points, 45, 'interactivity_to_throughput', 'costh')!;
    const fallback = interpolateProfitForGPU(
      points,
      45,
      'interactivity_to_throughput',
      'costh',
      'compare',
    )!;
    expect(fallback).toEqual(original);
    const estimate = estimateProfitByPower(
      [fallback],
      specs,
      pricing,
      assumptions,
      'compare',
      45,
      labels,
    );
    expect(estimate.rows).toHaveLength(1);
    expect(estimate.rows[0].powerLabel).toBe(labels.provisioned);
    expect(estimate.skipped[0].reason).toBe('no-measured-power');
    const clamped = interpolateProfitForGPU(
      [{ ...point, interactivity: 38 }],
      45,
      'interactivity_to_throughput',
      'costh',
      'modeled',
    )!;
    expect(modeledPowerAtTarget(clamped, 45)).toEqual({ reason: 'outside-measured-range' });
    const missingCpu = {
      ...trayPoint,
      sourceRow: { ...traySource, metrics: { ...traySource.metrics, cpu_power_valid: 0 } },
    };
    const excluded = interpolateProfitForGPU(
      [missingCpu],
      45,
      'interactivity_to_throughput',
      'costh',
      'modeled',
    )!;
    expect(modeledPowerAtTarget(excluded, 45)).toEqual({ reason: 'no-cpu-power' });
  });

  it.each([8])(
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
          kwPerGpu: expect.closeTo(MODELED_KW_PER_GPU, 5),
          extrapolated: gpus !== 8,
        });
      }
    },
  );

  it('prices NVL72 trays on the measured-Grace rack model and refuses rows without Grace power', () => {
    for (const [sourceRow, scaleOut] of [
      [traySource, true],
      [gb300AggregateRow(), false],
    ] as const) {
      expect(
        modeledPowerAtTarget({ ...result, nearestPoints: [{ ...trayPoint, sourceRow }] }, 45),
      ).toEqual({
        kwPerGpu: expect.closeTo(
          (upstreamRackWattsPerGpu('gb300', 594.191, 98.066, scaleOut) / 1000) * 1.1,
          9,
        ),
        extrapolated: false,
        source: { topology: 'nvl72-tray', pue: 1.1, modelRevision: SYSTEM_POWER_MODEL_REVISION },
      });
    }
    for (const hardware of ['gb200', 'gb300']) {
      expect(
        modeledPowerAtTarget(
          { ...result, nearestPoints: [{ ...point, sourceRow: { ...source, hardware } }] },
          45,
        ),
      ).toEqual({ reason: 'no-cpu-power' });
    }
    const partial = {
      ...source,
      prefill_tp: 4,
      decode_tp: 4,
      metrics: { ...source.metrics, avg_power_w: 500, avg_total_gpu_power_w: 2000 },
    };
    expect(modelSystemPower(partial)).toMatchObject({
      status: 'supported',
      chassisBasis: 'extrapolated',
    });
    expect(
      modeledPowerAtTarget({ ...result, nearestPoints: [{ ...point, sourceRow: partial }] }, 45),
    ).toMatchObject({ extrapolated: true });
  });

  it('leaves the default provisioned estimator unchanged', () => {
    expect(
      estimateProfitByPower([result], specs, pricing, assumptions, 'provisioned', 45, labels),
    ).toEqual(estimateProfitRows([result], specs, pricing, assumptions));
  });

  it.each([2])(
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
      kwPerGpu: expect.closeTo(MODELED_KW_PER_GPU, 8),
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
    expect(baseline.powerSource).toBeUndefined();
    expect(modeled.powerSource).toEqual({
      topology: 'chassis',
      pue: 1.3,
      modelRevision: SYSTEM_POWER_MODEL_REVISION,
    });
    expect(modeled.revenuePerGpuHour).toBe(baseline.revenuePerGpuHour);
    const ratio = 2.09 / MODELED_KW_PER_GPU;
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
    ).toMatchObject({
      rows: [{ powerLabel: labels.provisioned }],
      skipped: [{ reason: 'no-measured-power' }],
    });
    expect(
      estimateProfitByPower([bracket], specs, pricing, assumptions, 'modeled', 45, labels),
    ).toMatchObject({ rows: [], skipped: [{ reason: 'no-measured-power' }] });
    expect(modeledPowerAtTarget({ ...result, nearestPoints: [point, missing] }, 45)).toMatchObject({
      kwPerGpu: expect.closeTo(MODELED_KW_PER_GPU, 8),
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
      kwPerGpu: expect.closeTo(MODELED_KW_PER_GPU, 8),
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
    expect(modeledPowerAtTarget(bracket, 40)).toMatchObject({
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
