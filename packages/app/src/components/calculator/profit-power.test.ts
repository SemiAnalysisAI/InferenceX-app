import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { modelSystemPower } from '@/lib/modeled-system-power';
import { estimateChassisPower, estimateRackPower } from '@/lib/system-power-model';
import { Percentile, Sequence } from '@/lib/data-mappings';
import { buildGpuGroups, interpolateForGPU } from './useThroughputData';
import { estimateProfitRows } from './profit-estimator';
import {
  estimateProfitByPower,
  modeledPowerAtTarget,
  type ProfitPowerSource,
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
const labels = { provisioned: 'Provisioned', modeled: 'Measured + modeled' };

// One GB200 NVL72 compute tray on the AgentX workload: four GPUs on one host, two
// Grace sockets, module sensor present. Watts are controlled inputs, not published
// constants; the CPU-side keys follow the ticket-01 contract.
const GRACE = { avg_cpu_socket_power_w: 250.5, avg_total_cpu_power_w: 501 };
const traySource: BenchmarkRow = {
  ...source,
  hardware: 'gb200',
  framework: 'sglang',
  prefill_tp: 4,
  decode_tp: 4,
  num_prefill_gpu: 4,
  num_decode_gpu: 4,
  metrics: {
    power_valid: 1,
    power_metric_schema_version: 2,
    cpu_power_valid: 1,
    avg_power_w: 900.25,
    avg_total_gpu_power_w: 3601,
    ...GRACE,
    avg_total_module_power_w: 4300.75,
  },
};
const trayPoint: GPUDataPoint = { ...point, sourceRow: traySource, hwKey: 'gb200_sglang', tp: 4 };
const trayResult: InterpolatedResult = {
  ...result,
  hwKey: trayPoint.hwKey,
  resultKey: trayPoint.hwKey,
  nearestPoints: [trayPoint],
};
const withPoints = (base: InterpolatedResult, points: GPUDataPoint[]): InterpolatedResult => ({
  ...base,
  nearestPoints: points,
});

describe('profit power basis preview', () => {
  it('keeps raw power attached through official and run-keyed frontier construction', () => {
    const row = {
      ...source,
      metrics: {
        ...source.metrics,
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
      expect(modeledPowerAtTarget(interpolated!, 45)).toBeCloseTo(1.5976675, 8);
    }
  });

  it('rejects partial chassis and NVL72 rows without CPU-side telemetry despite valid GPU telemetry', () => {
    for (const hardware of ['gb200', 'gb300']) {
      expect(
        modeledPowerAtTarget(
          { ...result, nearestPoints: [{ ...point, sourceRow: { ...source, hardware } }] },
          45,
        ),
      ).toBeNull();
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
    ).toBeNull();
  });

  it('accepts fully measured NVL72 trays and records the measured basis behind the estimate', () => {
    // 1.1 × the tray's amortised facility watts per GPU from the pinned GB200 rack profile.
    const rack = estimateRackPower('gb200', { basis: 'module', moduleWattsPerTray: 4300.75 }, 1.1)!;
    const kw = modeledPowerAtTarget(trayResult, 45)!;
    expect(kw).toBeCloseTo((rack.facilityWatts / rack.gpuCount / 1000) * 1.1, 8);
    expect(kw).toBeCloseTo(1.6077325, 7);
    const output = estimateProfitByPower(
      [trayResult],
      specs,
      pricing,
      assumptions,
      'compare',
      45,
      labels,
    );
    expect(output.skipped).toEqual([]);
    const [provisioned, modeled] = output.rows;
    expect(provisioned.powerSource).toBeUndefined();
    expect(modeled.powerSource).toEqual({
      topology: 'nvl72-trays',
      measuredBasis: 'module',
      sensorKind: 'module',
      pue: 1.1,
      modelPath: 'human_verified/gb200_nvl72_rack/gb200_nvl72_rack_power_model.py',
      modelRevision: rack.modelRevision,
      profileSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    } satisfies ProfitPowerSource);
    expect(modeled.gpuHours / provisioned.gpuHours).toBeCloseTo(2.09 / kw, 10);

    // Two fully measured GB300 trays on distinct hosts, Grace-socket basis.
    const twoTrays: BenchmarkRow = {
      ...traySource,
      hardware: 'gb300',
      disagg: true,
      is_multinode: true,
      prefill_tp: 4,
      decode_tp: 4,
      metrics: {
        ...traySource.metrics,
        avg_power_w: 900,
        avg_total_gpu_power_w: 7200,
        prefill_avg_power_w: 950,
        decode_avg_power_w: 850,
        avg_cpu_socket_power_w: 260,
        avg_total_cpu_power_w: 1040,
      },
      workers: [
        { role: 'prefill', worker_idx: 0, num_gpus: 4, hosts: ['tray-a'], avg_power_w: 950 },
        { role: 'decode', worker_idx: 0, num_gpus: 4, hosts: ['tray-b'], avg_power_w: 850 },
      ],
    };
    delete (twoTrays.metrics as Record<string, unknown>).avg_total_module_power_w;
    const estimate = modelSystemPower(twoTrays, undefined, true);
    expect(estimate).toMatchObject({ status: 'supported', chassisBasis: 'full', gpuCount: 8 });
    const rows = estimateProfitByPower(
      [withPoints(trayResult, [{ ...trayPoint, sourceRow: twoTrays }])],
      specs,
      pricing,
      assumptions,
      'modeled',
      45,
      labels,
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].powerSource).toMatchObject({
      topology: 'nvl72-trays',
      measuredBasis: 'gpu-plus-grace',
      sensorKind: 'grace-socket',
      pue: 1.1,
    });
  });

  it('rejects partially measured trays and never mixes measured bases between knots', () => {
    const partialTray: BenchmarkRow = {
      ...traySource,
      prefill_tp: 2,
      decode_tp: 2,
      metrics: {
        ...traySource.metrics,
        avg_total_gpu_power_w: 1800.5,
        avg_total_module_power_w: 4300.75,
      },
    };
    expect(modelSystemPower(partialTray, undefined, true)).toMatchObject({
      status: 'supported',
      chassisBasis: 'extrapolated',
    });
    expect(
      modeledPowerAtTarget(withPoints(trayResult, [{ ...trayPoint, sourceRow: partialTray }]), 45),
    ).toBeNull();

    const graceOnly: BenchmarkRow = { ...traySource, metrics: { ...traySource.metrics } };
    delete (graceOnly.metrics as Record<string, unknown>).avg_total_module_power_w;
    const mixed = withPoints(trayResult, [
      { ...trayPoint, interactivity: 30 },
      { ...trayPoint, interactivity: 60, sourceRow: graceOnly },
    ]);
    expect(modeledPowerAtTarget(mixed, 30)).not.toBeNull();
    expect(modeledPowerAtTarget(mixed, 60)).not.toBeNull();
    expect(modeledPowerAtTarget(mixed, 45)).toBeNull();
    const same = withPoints(trayResult, [
      { ...trayPoint, interactivity: 30 },
      { ...trayPoint, interactivity: 60 },
    ]);
    expect(modeledPowerAtTarget(same, 45)).toBeCloseTo(modeledPowerAtTarget(trayResult, 45)!, 10);
  });

  it('labels x86 chassis estimates with the air-cooled profile and leaves provisioned rows unlabeled', () => {
    const [provisioned, modeled] = estimateProfitByPower(
      [result],
      specs,
      pricing,
      assumptions,
      'compare',
      45,
      labels,
    ).rows;
    expect(provisioned.powerSource).toBeUndefined();
    expect(modeled.powerSource).toMatchObject({
      topology: 'chassis',
      pue: 1.3,
      modelPath: 'human_verified/mi355x_chassis/mi355x_chassis_power_model.py',
    });
    expect(
      estimateProfitByPower([result], specs, pricing, assumptions, 'provisioned', 45, labels)
        .rows[0].powerSource,
    ).toBeUndefined();
  });

  it('plans fully measured multi-chassis deployments at the same facility watts per GPU', () => {
    // Kimi K3 B200 dynamo-vLLM TP8/PP2: sixteen GPUs on two hosts, aggregate
    // producer without a per-worker array → uniform-hosts basis.
    const multinode: BenchmarkRow = {
      ...source,
      hardware: 'b200',
      framework: 'dynamo-vllm',
      is_multinode: true,
      num_prefill_gpu: 16,
      num_decode_gpu: 16,
      decode_num_workers: 1,
      metrics: {
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_power_w: 715.095,
        avg_total_gpu_power_w: 11441.513,
        decode_pp: 2,
      },
    };
    expect(modelSystemPower(multinode, undefined, true)).toMatchObject({
      status: 'supported',
      topologyBasis: 'uniform-hosts',
      chassisBasis: 'full',
    });
    const perChassis = estimateChassisPower('b200', 11441.513 / 2, 1.3)!;
    expect(
      modeledPowerAtTarget({ ...result, nearestPoints: [{ ...point, sourceRow: multinode }] }, 45),
    ).toBeCloseTo(((perChassis.facilityWatts * 2) / 16 / 1000) * 1.1, 8);
    // Every chassis-topology source is labeled alike, whatever the host count.
    const [modeled] = estimateProfitByPower(
      [withPoints(result, [{ ...point, sourceRow: multinode }])],
      specs,
      pricing,
      assumptions,
      'modeled',
      45,
      labels,
    ).rows;
    expect(modeled.powerSource).toMatchObject({ topology: 'chassis', pue: 1.3 });
    // Disaggregated multinode rows still need per-worker telemetry.
    expect(
      modeledPowerAtTarget(
        { ...result, nearestPoints: [{ ...point, sourceRow: { ...multinode, disagg: true } }] },
        45,
      ),
    ).toBeNull();
  });

  it('leaves the default estimator and default AgentX model gate unchanged', () => {
    expect(
      estimateProfitByPower([result], specs, pricing, assumptions, 'provisioned', 45, labels),
    ).toEqual(estimateProfitRows([result], specs, pricing, assumptions));
    expect(modelSystemPower(source)).toMatchObject({ status: 'unsupported', reason: 'workload' });
  });

  it('only changes GPU-hours in the paired calculation, preserving unit economics and margin', () => {
    expect(modeledPowerAtTarget(result, 45)).toBeCloseTo(1.5976675, 8);
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
    expect(modeledPowerAtTarget(bracket, 45)).toBeNull();
    expect(
      estimateProfitByPower([bracket], specs, pricing, assumptions, 'compare', 45, labels),
    ).toMatchObject({ rows: [], skipped: [{ reason: 'no-measured-power' }] });
    expect(modeledPowerAtTarget({ ...result, nearestPoints: [point, missing] }, 45)).toBeCloseTo(
      1.5976675,
      8,
    );
    expect(modeledPowerAtTarget({ ...result, clamped: true }, 45)).toBeNull();
  });

  it('estimates power only inside the same valid bracket and scales losses too', () => {
    const bracket = {
      ...result,
      nearestPoints: [
        { ...point, interactivity: 30 },
        { ...point, interactivity: 60 },
      ],
    };
    expect(modeledPowerAtTarget(bracket, 45)).toBeCloseTo(1.5976675, 8);
    expect(modeledPowerAtTarget(bracket, 75)).toBeNull();
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
});
