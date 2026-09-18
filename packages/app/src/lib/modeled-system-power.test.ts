import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry, transformBenchmarkRows } from '@/lib/benchmark-transform';
import { modelSystemPower } from '@/lib/modeled-system-power';
import { estimateChassisPower, estimateRackPower } from '@/lib/system-power-model';

// Qwen3.5 B200 c1, run 34175132645: actual rounded telemetry, eight GPUs.
function row(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 441192,
    model: 'qwen3.5',
    hardware: 'b200',
    framework: 'sglang',
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
    isl: 8192,
    osl: 1024,
    conc: 1,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:v0.5.19-cu130',
    date: '2026-09-08',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34175132645/attempts/1',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 349.859,
      avg_total_gpu_power_w: 2798.868,
      total_gpu_energy_j: 120361.299,
      joules_per_output_token: 12.937902,
      pp: 1,
      pcp_size: 1,
      median_intvty: 100,
    },
    ...overrides,
  };
}

// One GB200 NVL72 compute tray: four GPUs on one host, two Grace sockets. The
// CPU-side keys follow the ticket-01 contract (sums over every socket, same window).
// Watts are controlled inputs, not published constants.
const GRACE = { avg_cpu_socket_power_w: 250.5, avg_total_cpu_power_w: 501 };
function nvl72Row(
  metrics: Record<string, number | undefined> = {},
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow {
  return row({
    hardware: 'gb200',
    framework: 'dynamo-trt',
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
      pp: 1,
      pcp_size: 1,
      ...(metrics as Record<string, number>),
    },
    ...overrides,
  });
}

describe('modeled system power admission and accounting', () => {
  it('defaults air-cooled chassis to PUE 1.3 and preserves explicit facility overrides', () => {
    // Pinned Python b200_chassis_power, fixed README utilization inputs.
    expect(modelSystemPower(row())).toMatchObject({
      pue: 1.3,
      chassisAcWatts: 4837.2,
      facilityWatts: 6288.4,
      measuredGpuWattsPerGpu: 349.859,
    });
    expect(modelSystemPower(row(), 1.1)).toMatchObject({
      pue: 1.1,
      chassisAcWatts: 4837.2,
      facilityWatts: 5320.9,
      measuredGpuWattsPerGpu: 349.859,
    });
  });

  it('uses the validated physical count without summing aggregate aliases or multiplying by EP', () => {
    const source = row({ num_prefill_gpu: 64, num_decode_gpu: 64, prefill_ep: 8, decode_ep: 8 });
    const result = modelSystemPower(source);
    expect(result.status).toBe('supported');
    if (result.status !== 'supported') throw new Error(result.reason);
    const reference = estimateChassisPower('b200', 2798.868, 1.3)!;
    expect(result).toMatchObject({
      gpuCount: 8,
      chassisCount: 1,
      measuredGpuWattsPerGpu: 349.859,
      chassisAcWatts: reference.chassisAcWatts,
      chassisAcWattsPerGpu: reference.chassisAcWatts / 8,
      facilityWatts: reference.facilityWatts,
      modeledGpuCount: 8,
      deploymentAcWatts: reference.chassisAcWatts,
      deploymentFacilityWatts: reference.facilityWatts,
      topologyBasis: 'single-node',
      chassisBasis: 'full',
    });
    expect(source.metrics.joules_per_output_token).toBe(12.937902);
  });

  it.each(['rtx6000pro', 'tpuv7', 'b200-nvl'])('does not substitute for %s', (hardware) => {
    expect(modelSystemPower(row({ hardware }))).toMatchObject({
      status: 'unsupported',
      reason: 'hardware',
    });
  });

  it.each(['gb200', 'gb300'])(
    'never models the Grace side of %s from GPU-only telemetry',
    (hardware) => {
      expect(modelSystemPower(row({ hardware }))).toMatchObject({
        status: 'unsupported',
        reason: 'cpu-telemetry',
      });
    },
  );

  it('ignores CPU-side keys on x86 chassis rows', () => {
    const source = row();
    Object.assign(source.metrics, GRACE, { cpu_power_valid: 1, avg_total_module_power_w: 4300 });
    expect(modelSystemPower(source)).toEqual(modelSystemPower(row()));
  });

  it.each([{ benchmark_type: 'agentic_traces' }, { isl: 1024 }, { osl: 8192 }, { isl: null }])(
    'keeps non-8k1k workloads unavailable: %j',
    (overrides) => {
      expect(modelSystemPower(row(overrides))).toMatchObject({
        status: 'unsupported',
        reason: 'workload',
      });
    },
  );

  it.each([
    { power_valid: 0 },
    { power_valid: undefined },
    { power_valid: '1' },
    { power_valid: true },
    { power_metric_schema_version: 1 },
    { power_metric_schema_version: 3 },
    { avg_power_w: undefined },
    { avg_power_w: 0 },
    { avg_power_w: -1 },
    { avg_power_w: Infinity },
    { avg_power_w: NaN },
    { avg_power_w: '349.859' },
    { avg_total_gpu_power_w: undefined },
    { avg_total_gpu_power_w: -1 },
  ])('rejects invalid measured inputs: %j', (overrides) => {
    const source = row();
    Object.assign(source.metrics, overrides);
    expect(modelSystemPower(source)).toMatchObject({ status: 'unsupported', reason: 'telemetry' });
  });

  it('rejects inconsistent telemetry, missing topology, and more than one chassis per host', () => {
    const inconsistent = row();
    inconsistent.metrics.avg_total_gpu_power_w = 2700;
    expect(modelSystemPower(inconsistent)).toMatchObject({ reason: 'gpu-count' });
    expect(modelSystemPower(row({ is_multinode: true }))).toMatchObject({ reason: 'topology' });
    expect(modelSystemPower(row({ decode_tp: 4 }))).toMatchObject({ reason: 'gpu-count' });
    const twoHosts = row({ prefill_tp: 16, decode_tp: 16 });
    twoHosts.metrics.avg_total_gpu_power_w = twoHosts.metrics.avg_power_w * 16;
    expect(modelSystemPower(twoHosts)).toMatchObject({ reason: 'topology' });
    expect(modelSystemPower(row(), 0.9)).toMatchObject({ reason: 'model-domain' });
  });

  it('extrapolates a partially allocated single-node chassis at the measured per-GPU power', () => {
    const partial = row({ prefill_tp: 4, decode_tp: 4, num_prefill_gpu: 4, num_decode_gpu: 4 });
    partial.metrics.avg_total_gpu_power_w = 1399.436; // 4 × 349.859
    const result = modelSystemPower(partial);
    expect(result.status).toBe('supported');
    if (result.status !== 'supported') throw new Error(result.reason);
    // The source sweep's input for the whole chassis: n_gpu × W/GPU.
    const reference = estimateChassisPower('b200', 349.859 * 8, 1.3)!;
    expect(result).toMatchObject({
      gpuCount: 4,
      chassisCount: 1,
      modeledGpuCount: 8,
      measuredGpuWattsPerGpu: 349.859,
      chassisAcWatts: reference.chassisAcWatts,
      chassisAcWattsPerGpu: reference.chassisAcWatts / 8,
      facilityWatts: reference.facilityWatts,
      deploymentAcWatts: reference.chassisAcWatts / 2,
      deploymentFacilityWatts: reference.facilityWatts / 2,
      topologyBasis: 'single-node',
      chassisBasis: 'extrapolated',
    });
    // The same per-GPU telemetry on a full chassis plots the same per-GPU value.
    const full = row();
    full.metrics.avg_total_gpu_power_w = 349.859 * 8;
    const fullResult = modelSystemPower(full);
    expect(fullResult).toMatchObject({
      chassisBasis: 'full',
      deploymentAcWatts: reference.chassisAcWatts,
    });
    expect(fullResult.status === 'supported' && fullResult.chassisAcWattsPerGpu).toBe(
      result.chassisAcWattsPerGpu,
    );
    // Four measured GPUs cannot establish a TP8 width.
    partial.prefill_tp = 8;
    partial.decode_tp = 8;
    expect(modelSystemPower(partial)).toMatchObject({ reason: 'gpu-count' });
  });

  it('extrapolates partially allocated worker chassis and attributes only their measured share', () => {
    const source = row({
      disagg: true,
      is_multinode: true,
      num_prefill_gpu: 4,
      num_decode_gpu: 8,
      workers: [
        { role: 'prefill', worker_idx: 0, num_gpus: 4, hosts: ['prefill-node'], avg_power_w: 300 },
        { role: 'decode', worker_idx: 0, num_gpus: 8, hosts: ['decode-node'], avg_power_w: 700 },
      ],
      metrics: {
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_power_w: (300 * 4 + 700 * 8) / 12,
        avg_total_gpu_power_w: 300 * 4 + 700 * 8,
        prefill_avg_power_w: 300,
        decode_avg_power_w: 700,
      },
    });
    const prefill = estimateChassisPower('b200', 2400, 1.3)!;
    const decode = estimateChassisPower('b200', 5600, 1.3)!;
    expect(modelSystemPower(source)).toMatchObject({
      status: 'supported',
      gpuCount: 12,
      chassisCount: 2,
      modeledGpuCount: 16,
      chassisAcWatts: prefill.chassisAcWatts + decode.chassisAcWatts,
      chassisAcWattsPerGpu: (prefill.chassisAcWatts + decode.chassisAcWatts) / 16,
      deploymentAcWatts: prefill.chassisAcWatts / 2 + decode.chassisAcWatts,
      deploymentFacilityWatts: prefill.facilityWatts / 2 + decode.facilityWatts,
      topologyBasis: 'worker-hosts',
      chassisBasis: 'extrapolated',
    });
    // A worker cannot span hosts or occupy nothing; only 1–8 GPUs fit one chassis.
    for (const num_gpus of [0, 9, 16, 0.5, undefined]) {
      Object.assign(source.workers![0], { num_gpus });
      expect(modelSystemPower(source)).toMatchObject({ reason: 'topology' });
    }
    source.workers![0].num_gpus = 4;
    source.num_prefill_gpu = 8;
    expect(modelSystemPower(source)).toMatchObject({ reason: 'role-power' });
  });

  it('preserves meaningful aggregate PP and PCP aliases before checking physical width', () => {
    for (const widths of [
      { decode_pp: 1, prefill_pp: 2 },
      { decode_pp: 2, prefill_pp: 1 },
      { decode_pcp_size: 1, prefill_pcp_size: 2 },
    ]) {
      const source = row({ prefill_tp: 4, decode_tp: 4 });
      Object.assign(source.metrics, widths);
      expect(modelSystemPower(source)).toMatchObject({
        status: 'supported',
        gpuCount: 8,
        chassisCount: 1,
      });
      // Eight measured GPUs cannot establish complete occupancy of TP8 * PP2/PCP2.
      source.prefill_tp = 8;
      source.decode_tp = 8;
      expect(modelSystemPower(source)).toMatchObject({
        status: 'unsupported',
        reason: 'gpu-count',
      });
    }
    for (const invalidWidth of [0, -1, 1.5, NaN, Infinity, null, '2']) {
      const source = row();
      Object.assign(source.metrics, { prefill_pp: invalidWidth });
      expect(modelSystemPower(source)).toMatchObject({
        status: 'unsupported',
        reason: 'gpu-count',
      });
    }
  });

  it('rejects missing or invalid hardware and topology flags even with complete worker telemetry', () => {
    for (const hardware of [undefined, null, 42, false]) {
      const source = row();
      Object.assign(source, { hardware });
      expect(modelSystemPower(source)).toMatchObject({
        status: 'unsupported',
        reason: 'hardware',
      });
    }
    for (const field of ['disagg', 'is_multinode']) {
      for (const value of [undefined, null, 0, 1, 'false', 'true']) {
        const source = row({
          is_multinode: true,
          workers: [
            { role: 'agg', worker_idx: 0, num_gpus: 8, hosts: ['node0'], avg_power_w: 349.859 },
          ],
        });
        expect(modelSystemPower(source)).toMatchObject({ status: 'supported' });
        Object.assign(source, { [field]: value });
        expect(modelSystemPower(source)).toMatchObject({
          status: 'unsupported',
          reason: 'topology',
        });
      }
    }
  });

  it('distinguishes audited unversioned single-node telemetry from schema-v2 telemetry', () => {
    const source = row();
    const versioned = modelSystemPower(source);
    expect(versioned).toMatchObject({ status: 'supported', telemetryBasis: 'validated-v2' });
    delete source.metrics.power_metric_schema_version;
    const legacy = modelSystemPower(source);
    expect(legacy).toMatchObject({
      status: 'supported',
      telemetryBasis: 'validated-unversioned-single-node',
    });
    if (legacy.status !== 'supported' || versioned.status !== 'supported') {
      throw new Error('Expected both validated single-node producers to be supported');
    }
    expect(legacy.chassisAcWatts).toBe(versioned.chassisAcWatts);
    expect(legacy.measuredGpuWattsPerGpu).toBe(versioned.measuredGpuWattsPerGpu);
    delete source.metrics.power_valid;
    expect(modelSystemPower(source)).toMatchObject({
      status: 'unsupported',
      reason: 'telemetry',
    });
  });

  it.each([false, true])('requires schema-v2 for workers across hosts (disagg=%s)', (disagg) => {
    const source = row({
      disagg,
      is_multinode: true,
      workers: [
        {
          role: disagg ? 'prefill' : 'agg',
          worker_idx: 0,
          num_gpus: 8,
          hosts: ['node0'],
          avg_power_w: 300,
        },
        {
          role: disagg ? 'decode' : 'agg',
          worker_idx: 1,
          num_gpus: 8,
          hosts: ['node1'],
          avg_power_w: 700,
        },
      ],
      metrics: {
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_power_w: 500,
        avg_total_gpu_power_w: 8000,
        prefill_avg_power_w: 300,
        decode_avg_power_w: 700,
      },
    });
    expect(modelSystemPower(source)).toMatchObject({ status: 'supported' });
    delete source.metrics.power_metric_schema_version;
    expect(modelSystemPower(source)).toMatchObject({
      status: 'unsupported',
      reason: 'telemetry',
    });
  });

  it('rejects deployment overflow even when every chassis result remains finite', () => {
    const source = row({
      hardware: 'h100',
      is_multinode: true,
      workers: [0, 1, 2].map((index) => ({
        role: 'agg',
        worker_idx: index,
        num_gpus: 8,
        hosts: [`node${index}`],
        avg_power_w: 500,
      })),
      metrics: {
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_power_w: 500,
        avg_total_gpu_power_w: 12000,
      },
    });
    expect(modelSystemPower(source)).toMatchObject({ status: 'supported', chassisCount: 3 });
    const oneChassis = estimateChassisPower('h100', 4000, 1e304);
    expect(oneChassis).not.toBeNull();
    expect(Number.isFinite(oneChassis!.facilityWatts)).toBe(true);
    expect(modelSystemPower(source, 1e304)).toMatchObject({
      status: 'unsupported',
      reason: 'model-domain',
    });
  });

  it('models distinct prefill/decode chassis separately before summing the deployment', () => {
    const source = row({
      disagg: true,
      is_multinode: true,
      workers: [
        { role: 'prefill', worker_idx: 0, num_gpus: 8, hosts: ['prefill-node'], avg_power_w: 300 },
        { role: 'decode', worker_idx: 0, num_gpus: 8, hosts: ['decode-node'], avg_power_w: 700 },
      ],
      metrics: {
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_power_w: 500,
        avg_total_gpu_power_w: 8000,
        prefill_avg_power_w: 300,
        decode_avg_power_w: 700,
      },
    });
    const result = modelSystemPower(source);
    const prefill = estimateChassisPower('b200', 2400, 1.3)!;
    const decode = estimateChassisPower('b200', 5600, 1.3)!;
    expect(result).toMatchObject({
      status: 'supported',
      gpuCount: 16,
      chassisCount: 2,
      chassisAcWatts: prefill.chassisAcWatts + decode.chassisAcWatts,
      facilityWatts: prefill.facilityWatts + decode.facilityWatts,
    });
    const noPue = modelSystemPower(source, 1);
    expect(noPue.status === 'supported' && noPue.facilityWatts).toBe(
      prefill.chassisAcWatts + decode.chassisAcWatts,
    );
    expect(noPue.status === 'supported' && noPue.chassisAcWatts).toBe(
      prefill.chassisAcWatts + decode.chassisAcWatts,
    );
    source.workers![1].hosts = ['prefill-node'];
    expect(modelSystemPower(source)).toMatchObject({ reason: 'topology' });
    source.workers![1].hosts = ['decode-node'];
    source.workers![1].avg_power_w = 500;
    expect(modelSystemPower(source)).toMatchObject({ reason: 'role-power' });
    source.workers = undefined;
    expect(modelSystemPower(source)).toMatchObject({ reason: 'topology' });
  });

  it('excludes only CPU-only frontend workers from the GPU-chassis accounting', () => {
    const source = row({
      disagg: true,
      is_multinode: true,
      workers: [
        { role: 'prefill', worker_idx: 0, num_gpus: 8, hosts: ['prefill-node'], avg_power_w: 300 },
        { role: 'decode', worker_idx: 0, num_gpus: 8, hosts: ['decode-node'], avg_power_w: 700 },
      ],
      metrics: {
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_power_w: 500,
        avg_total_gpu_power_w: 8000,
        prefill_avg_power_w: 300,
        decode_avg_power_w: 700,
      },
    });
    const gpuOnly = modelSystemPower(source);
    expect(gpuOnly).toMatchObject({
      status: 'supported',
      gpuCount: 16,
      chassisCount: 2,
      measuredGpuWattsPerGpu: 500,
    });
    // Existing worker payloads retain a frontend entry, including generic CPU power.
    const frontend = {
      role: 'frontend',
      worker_idx: 0,
      num_gpus: 0,
      hosts: ['frontend-node'],
      avg_power_w: 120,
    };
    source.workers!.unshift(frontend);
    expect(modelSystemPower(source)).toEqual(gpuOnly);
    expect(source.workers).toHaveLength(3);

    // A frontend with GPUs or an unknown count cannot be silently dropped.
    for (const num_gpus of [8, 1, -1, 0.5, undefined, null, '0', NaN]) {
      Object.assign(frontend, { num_gpus });
      expect(modelSystemPower(source)).toMatchObject({ status: 'unsupported' });
    }
    Object.assign(frontend, { role: 'other', num_gpus: 0 });
    expect(modelSystemPower(source)).toMatchObject({ status: 'unsupported' });
  });

  it('shares official/overlay transforms without changing measured metrics or inventing modeled zeros', () => {
    const source = row();
    const entry = rowToAggDataEntry(source);
    expect(entry.avg_power_w).toBe(source.metrics.avg_power_w);
    expect(entry.joules_per_output_token).toBe(source.metrics.joules_per_output_token);
    const { chartData } = transformBenchmarkRows([source]);
    for (const points of chartData) {
      expect(points[0].modeledChassisPowerPerGpu?.y).toBeGreaterThan(source.metrics.avg_power_w);
    }
    const unsupported = transformBenchmarkRows([row({ hardware: 'gb200' })]);
    for (const points of unsupported.chartData) {
      expect(points[0].modeledChassisPowerPerGpu).toBeUndefined();
      expect(points[0].measuredAvgPower?.y).toBe(source.metrics.avg_power_w);
    }
  });
});

describe('NVL72 trays with measured compute-module power', () => {
  const MODULE = { avg_total_module_power_w: 4300.75 };

  it('models a full GB200 tray on the module basis with the DLC PUE applied once', () => {
    const result = modelSystemPower(nvl72Row(MODULE));
    const rack = estimateRackPower('gb200', { basis: 'module', moduleWattsPerTray: 4300.75 }, 1.1)!;
    expect(result).toMatchObject({
      status: 'supported',
      hardware: 'gb200',
      modelPath: rack.modelPath,
      gpuCount: 4,
      chassisCount: 1,
      modeledGpuCount: 4,
      measuredGpuWattsPerGpu: 900.25,
      chassisAcWatts: rack.rackAcWatts / 18,
      chassisAcWattsPerGpu: rack.rackAcWatts / 18 / 4,
      facilityWatts: rack.facilityWatts / 18,
      deploymentAcWatts: rack.rackAcWatts / 18,
      deploymentFacilityWatts: rack.facilityWatts / 18,
      pue: 1.1,
      telemetryBasis: 'validated-v2',
      topologyBasis: 'nvl72-trays',
      chassisBasis: 'full',
      measuredBasis: 'module',
      sensorKind: 'module',
    });
    const noPue = modelSystemPower(nvl72Row(MODULE), 1);
    expect(noPue).toMatchObject({ pue: 1, chassisAcWatts: rack.rackAcWatts / 18 });
    expect(noPue.status === 'supported' && noPue.facilityWatts).toBe(rack.rackAcWatts / 18);
    expect(modelSystemPower(nvl72Row(MODULE), 1.3)).toMatchObject({ pue: 1.3 });
    // The measured compute module is the input; the rack residual is added on top.
    expect(result.status === 'supported' && result.deploymentAcWatts).toBeGreaterThan(4300.75);
  });

  it('falls back to GPU board plus Grace socket for GB300 trays without module keys', () => {
    const source = nvl72Row(
      {
        avg_power_w: 900,
        avg_total_gpu_power_w: 7200,
        prefill_avg_power_w: 950,
        decode_avg_power_w: 850,
        avg_cpu_socket_power_w: 260,
        avg_total_cpu_power_w: 1040,
      },
      {
        hardware: 'gb300',
        disagg: true,
        is_multinode: true,
        workers: [
          { role: 'prefill', worker_idx: 0, num_gpus: 4, hosts: ['tray-a'], avg_power_w: 950 },
          { role: 'decode', worker_idx: 0, num_gpus: 4, hosts: ['tray-b'], avg_power_w: 850 },
        ],
      },
    );
    // Grace-side watts are a deployment total; each tray receives the two-socket mean.
    const prefill = estimateRackPower(
      'gb300',
      { basis: 'gpu-plus-grace', gpuBoardWattsPerTray: 3800, graceSocketWattsPerTray: 520 },
      1.1,
    )!;
    const decode = estimateRackPower(
      'gb300',
      { basis: 'gpu-plus-grace', gpuBoardWattsPerTray: 3400, graceSocketWattsPerTray: 520 },
      1.1,
    )!;
    expect(modelSystemPower(source)).toMatchObject({
      status: 'supported',
      hardware: 'gb300',
      gpuCount: 8,
      chassisCount: 2,
      modeledGpuCount: 8,
      chassisAcWatts: prefill.rackAcWatts / 18 + decode.rackAcWatts / 18,
      facilityWatts: prefill.facilityWatts / 18 + decode.facilityWatts / 18,
      deploymentAcWatts: prefill.rackAcWatts / 18 + decode.rackAcWatts / 18,
      pue: 1.1,
      topologyBasis: 'nvl72-trays',
      chassisBasis: 'full',
      measuredBasis: 'gpu-plus-grace',
      sensorKind: 'grace-socket',
    });
    // Two hosts carry four Grace sockets; any other socket count is not a tray topology.
    source.metrics.avg_total_cpu_power_w = 260 * 3;
    expect(modelSystemPower(source)).toMatchObject({ reason: 'cpu-telemetry' });
    source.metrics.avg_total_cpu_power_w = 1040;
    source.workers![1].num_gpus = 5;
    expect(modelSystemPower(source)).toMatchObject({ reason: 'topology' });
    source.workers![1].num_gpus = 4;
    source.workers![1].hosts = ['tray-b', 'tray-c'];
    expect(modelSystemPower(source)).toMatchObject({ reason: 'topology' });
  });

  it('extrapolates a partially measured tray on the GPU-board share and keeps the measured share', () => {
    const partial = nvl72Row(
      { avg_total_gpu_power_w: 2700.75 },
      { prefill_tp: 3, decode_tp: 3, num_prefill_gpu: 3, num_decode_gpu: 3 },
    );
    // Both Grace sockets are measured regardless of allocation; only the GPU board
    // share is the tray's per-GPU mean × 4, mirroring the partial-chassis rule.
    const rack = estimateRackPower(
      'gb200',
      { basis: 'gpu-plus-grace', gpuBoardWattsPerTray: 900.25 * 4, graceSocketWattsPerTray: 501 },
      1.1,
    )!;
    expect(modelSystemPower(partial)).toMatchObject({
      status: 'supported',
      gpuCount: 3,
      chassisCount: 1,
      modeledGpuCount: 4,
      measuredGpuWattsPerGpu: 900.25,
      chassisAcWatts: rack.rackAcWatts / 18,
      chassisAcWattsPerGpu: rack.rackAcWatts / 18 / 4,
      deploymentAcWatts: ((rack.rackAcWatts / 18) * 3) / 4,
      deploymentFacilityWatts: ((rack.facilityWatts / 18) * 3) / 4,
      topologyBasis: 'nvl72-trays',
      chassisBasis: 'extrapolated',
      measuredBasis: 'gpu-plus-grace',
    });
    // Module sensors cover the whole tray, idle GPUs included, so that reading is
    // never scaled; the label still records the modeled-versus-measured count.
    const partialModule = nvl72Row(
      { avg_total_gpu_power_w: 2700.75, ...MODULE },
      { prefill_tp: 3, decode_tp: 3, num_prefill_gpu: 3, num_decode_gpu: 3 },
    );
    const moduleRack = estimateRackPower(
      'gb200',
      { basis: 'module', moduleWattsPerTray: 4300.75 },
      1.1,
    )!;
    expect(modelSystemPower(partialModule)).toMatchObject({
      gpuCount: 3,
      modeledGpuCount: 4,
      chassisAcWatts: moduleRack.rackAcWatts / 18,
      deploymentAcWatts: ((moduleRack.rackAcWatts / 18) * 3) / 4,
      chassisBasis: 'extrapolated',
      measuredBasis: 'module',
    });
    // Four measured GPUs cannot establish a TP8 width; eight cannot sit on one tray.
    partial.prefill_tp = 8;
    partial.decode_tp = 8;
    expect(modelSystemPower(partial)).toMatchObject({ reason: 'gpu-count' });
    const twoTrays = nvl72Row(
      { avg_total_gpu_power_w: 7202, avg_total_cpu_power_w: 1002 },
      { prefill_tp: 8, decode_tp: 8, num_prefill_gpu: 8, num_decode_gpu: 8 },
    );
    expect(modelSystemPower(twoTrays)).toMatchObject({ reason: 'topology' });
  });

  it.each([
    { cpu_power_valid: undefined },
    { cpu_power_valid: 0 },
    { cpu_power_valid: '1' },
    { avg_total_cpu_power_w: undefined },
    { avg_total_cpu_power_w: 0 },
    { avg_total_cpu_power_w: -1 },
    { avg_cpu_socket_power_w: undefined },
    { avg_cpu_socket_power_w: 0 },
    { avg_total_module_power_w: 0 },
    { avg_total_module_power_w: -1 },
    { avg_total_module_power_w: NaN },
    { avg_total_module_power_w: '4300' },
  ])('keeps NVL72 rows without valid CPU-side telemetry unavailable: %j', (overrides) => {
    const source = nvl72Row(MODULE);
    Object.assign(source.metrics, overrides);
    expect(modelSystemPower(source)).toMatchObject({
      status: 'unsupported',
      reason: 'cpu-telemetry',
    });
  });

  it('requires schema-v2 GPU telemetry and stays within the shelf and facility domain', () => {
    const legacy = nvl72Row({ ...MODULE, power_metric_schema_version: undefined });
    expect(modelSystemPower(legacy)).toMatchObject({ status: 'unsupported', reason: 'telemetry' });
    expect(
      modelSystemPower(nvl72Row({ avg_total_module_power_w: Number.MAX_VALUE })),
    ).toMatchObject({
      reason: 'model-domain',
    });
    expect(modelSystemPower(nvl72Row(MODULE), 1e304)).toMatchObject({ reason: 'model-domain' });
    expect(modelSystemPower(nvl72Row(MODULE), 0.9)).toMatchObject({ reason: 'model-domain' });
  });

  it('plots the amortised rack AC per GPU through the shared transform', () => {
    const source = nvl72Row(MODULE);
    const rack = estimateRackPower('gb200', { basis: 'module', moduleWattsPerTray: 4300.75 }, 1.1)!;
    const { chartData } = transformBenchmarkRows([source]);
    expect(chartData.length).toBeGreaterThan(0);
    for (const points of chartData) {
      expect(points[0].modeledChassisPowerPerGpu?.y).toBe(rack.rackAcWatts / 18 / 4);
      expect(points[0].measuredAvgPower?.y).toBe(900.25);
    }
  });
});
