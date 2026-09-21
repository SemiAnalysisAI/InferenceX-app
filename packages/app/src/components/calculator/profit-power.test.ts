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
const labels = {
  provisioned: 'Provisioned',
  modeled: 'Measured + modeled',
  extrapolated: 'Full-chassis extrapolation',
};

// One GB200 NVL72 compute tray on the AgentX workload: four GPUs on one host, two
// Grace sockets, module sensor present. Watts are controlled inputs, not published
// constants; the CPU-side keys follow the producer contract (InferenceX docs/results-and-ingestion.md).
const GRACE = { avg_cpu_socket_power_w: 250.5, avg_total_cpu_power_w: 501 };
const traySource: BenchmarkRow = {
  ...source,
  hardware: 'gb200',
  framework: 'sglang',
  prefill_tp: 4,
  decode_tp: 4,
  num_prefill_gpu: 4,
  num_decode_gpu: 4,
  power_audit: { cpu: { sensor_kind: 'module', expected_sockets: 2, observed_sockets: 2 } },
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

  it('distinguishes partial chassis from NVL72 rows missing CPU telemetry', () => {
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
    expect(modelSystemPower(partial, undefined, true)).toMatchObject({
      status: 'supported',
      chassisBasis: 'extrapolated',
    });
    expect(
      modeledPowerAtTarget({ ...result, nearestPoints: [{ ...point, sourceRow: partial }] }, 45),
    ).toMatchObject({ extrapolated: true });
  });

  it('accepts fully measured NVL72 trays and records the measured basis behind the estimate', () => {
    // 1.1 × the tray's amortised facility watts per GPU from the pinned GB200 rack profile.
    const rack = estimateRackPower('gb200', { basis: 'module', moduleWattsPerTray: 4300.75 }, 1.1)!;
    const power = modeledPowerAtTarget(trayResult, 45);
    if (!('kwPerGpu' in power)) throw new Error(power.reason);
    const kw = power.kwPerGpu;
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
      power_audit: {
        cpu: { sensor_kind: 'grace_socket', expected_sockets: 4, observed_sockets: 4 },
      },
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
    ).toEqual({ reason: 'unsupported-power-topology' });

    const graceOnly: BenchmarkRow = {
      ...traySource,
      metrics: { ...traySource.metrics },
      power_audit: {
        cpu: { sensor_kind: 'grace_socket', expected_sockets: 2, observed_sockets: 2 },
      },
    };
    delete (graceOnly.metrics as Record<string, unknown>).avg_total_module_power_w;
    const mixed = withPoints(trayResult, [
      { ...trayPoint, interactivity: 30 },
      { ...trayPoint, interactivity: 60, sourceRow: graceOnly },
    ]);
    expect(modeledPowerAtTarget(mixed, 30)).toHaveProperty('kwPerGpu');
    expect(modeledPowerAtTarget(mixed, 60)).toHaveProperty('kwPerGpu');
    expect(modeledPowerAtTarget(mixed, 45)).toEqual({ reason: 'incompatible-power-basis' });
    const same = withPoints(trayResult, [
      { ...trayPoint, interactivity: 30 },
      { ...trayPoint, interactivity: 60 },
    ]);
    expect(modeledPowerAtTarget(same, 45)).toEqual(modeledPowerAtTarget(trayResult, 45));
  });

  it('plans aggregate multinode NVL72 rows without a worker array as inferred trays', () => {
    // Kimi K3 GB200 dynamo-vLLM TP16: sixteen GPUs on four trays, no per-worker array.
    const inferred: BenchmarkRow = {
      ...traySource,
      power_audit: { cpu: { sensor_kind: 'module', expected_sockets: 8, observed_sockets: 8 } },
      is_multinode: true,
      prefill_tp: 16,
      decode_tp: 0,
      num_prefill_gpu: 16,
      num_decode_gpu: 16,
      metrics: {
        ...traySource.metrics,
        avg_power_w: 441.741,
        avg_total_gpu_power_w: 7067.859,
        avg_total_cpu_power_w: 2004,
        avg_total_module_power_w: 9071.859,
      },
    };
    const rack = estimateRackPower(
      'gb200',
      { basis: 'module', moduleWattsPerTray: 9071.859 / 4 },
      1.1,
    )!;
    const inferredResult = withPoints(trayResult, [{ ...trayPoint, sourceRow: inferred }]);
    expect(modeledPowerAtTarget(inferredResult, 45)).toMatchObject({
      kwPerGpu: expect.closeTo((((rack.facilityWatts / 18) * 4) / 16 / 1000) * 1.1, 8),
    });
    const rows = estimateProfitByPower(
      [inferredResult],
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
      measuredBasis: 'module',
      sensorKind: 'module',
      pue: 1.1,
    });
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
    ).toMatchObject({
      kwPerGpu: expect.closeTo(((perChassis.facilityWatts * 2) / 16 / 1000) * 1.1, 8),
    });
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
    ).toEqual({ reason: 'unsupported-power-topology' });
  });

  it('retains provisioned capacity in compare mode when measured power is unavailable', () => {
    const missing = {
      ...result,
      nearestPoints: [
        {
          ...point,
          sourceRow: {
            ...source,
            metrics: { ...source.metrics, power_valid: 0 },
          },
        },
      ],
    };
    const output = estimateProfitByPower(
      [missing],
      specs,
      pricing,
      assumptions,
      'compare',
      45,
      labels,
    );
    expect(output.rows).toHaveLength(1);
    expect(output.rows[0]).toMatchObject({
      powerLabel: labels.provisioned,
    });
    expect(output.skipped).toMatchObject([{ reason: 'no-measured-power' }]);
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
    ).toMatchObject({
      rows: [{ powerLabel: labels.provisioned }],
      skipped: [{ reason: 'no-measured-power' }],
    });
    expect(
      estimateProfitByPower([bracket], specs, pricing, assumptions, 'modeled', 45, labels),
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
