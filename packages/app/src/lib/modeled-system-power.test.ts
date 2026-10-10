import { describe, expect, it, vi } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry, transformBenchmarkRows } from '@/lib/benchmark-transform';
import { modelSystemPower } from '@/lib/modeled-system-power';
import {
  gb300AggregateRow,
  gb300DisaggRow,
  upstreamRackWattsPerGpu,
} from '@/lib/nvl72-power.fixture';
import {
  estimateChassisPower,
  estimateRackPower,
  type SystemPowerHardware,
} from '@/lib/system-power-model';
import profileData from '@/lib/system-power-model.profiles.json';

const chassis = (hardware: SystemPowerHardware, gpuWatts: number, scaleOut = false) =>
  estimateChassisPower(hardware, gpuWatts, { workload: 'fixed-seq-len', scaleOut })!;

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
// CPU-side keys follow the producer contract (sums over every socket, same window).
// Watts are controlled inputs, not published constants.
const GRACE = { avg_cpu_socket_power_w: 250.5, avg_total_cpu_power_w: 501 };
function nvl72Row(
  metrics: Record<string, number | undefined> = {},
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow {
  const sockets = Math.round(
    (metrics.avg_total_cpu_power_w ?? 501) / (metrics.avg_cpu_socket_power_w ?? 250.5),
  );
  return row({
    hardware: 'gb200',
    framework: 'dynamo-trt',
    prefill_tp: 4,
    decode_tp: 4,
    num_prefill_gpu: 4,
    num_decode_gpu: 4,
    power_audit: {
      cpu: { sensor_kind: 'grace_socket', expected_sockets: sockets, observed_sockets: sockets },
    },
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
  it('uses the validated physical count without summing aggregate aliases or multiplying by EP', () => {
    const source = row({ num_prefill_gpu: 64, num_decode_gpu: 64, prefill_ep: 8, decode_ep: 8 });
    const result = modelSystemPower(source);
    expect(result.status).toBe('supported');
    if (result.status !== 'supported') throw new Error(result.reason);
    const reference = chassis('b200', 2798.868);
    expect(result).toMatchObject({
      gpuCount: 8,
      chassisCount: 1,
      measuredGpuWattsPerGpu: 349.859,
      itWatts: reference.itWatts,
      itWattsPerGpu: reference.itWatts / 8,
      facilityWatts: reference.facilityWatts,
      modeledGpuCount: 8,
      deploymentItWatts: reference.itWatts,
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

  it('ignores CPU-side keys on x86 chassis rows', () => {
    const source = row();
    Object.assign(source.metrics, GRACE, { cpu_power_valid: 1 });
    expect(modelSystemPower(source)).toEqual(modelSystemPower(row()));
  });

  it('models every single_turn sequence and leaves other benchmark types unavailable', () => {
    expect(modelSystemPower(row({ isl: 1024, osl: 1024 }))).toMatchObject({
      status: 'supported',
      operatingState: { workload: 'fixed-seq-len', scaleOut: false },
    });
    expect(modelSystemPower(row({ benchmark_type: 'multi_turn' }))).toMatchObject({
      status: 'unsupported',
      reason: 'workload',
    });
  });

  it('models AgentX rows in the agentic state, with KV offload and Mooncake raising host power', () => {
    const agentic = row({ benchmark_type: 'agentic_traces', isl: null, osl: null });
    const plain = modelSystemPower(agentic);
    expect(plain).toMatchObject({
      status: 'supported',
      operatingState: { workload: 'agentic', scaleOut: false },
    });
    Object.assign(agentic.metrics, { kv_offloading: 'dram' });
    const offload = modelSystemPower(agentic);
    expect(offload).toMatchObject({
      status: 'supported',
      operatingState: { workload: 'agentic-cpu-offloading', scaleOut: false },
    });
    Object.assign(agentic.metrics, { kv_offload_backend: 'mooncake' });
    const mooncake = modelSystemPower(agentic);
    expect(mooncake).toMatchObject({
      operatingState: { workload: 'agentic-cpu-offloading', scaleOut: true },
    });
    if (
      plain.status !== 'supported' ||
      offload.status !== 'supported' ||
      mooncake.status !== 'supported'
    ) {
      throw new Error('Expected every AgentX state to be supported');
    }
    expect(offload.deploymentFacilityWatts).toBeGreaterThan(plain.deploymentFacilityWatts);
    expect(mooncake.deploymentFacilityWatts).toBeGreaterThan(offload.deploymentFacilityWatts);
  });

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
    const overload = row();
    Object.assign(overload.metrics, { avg_power_w: 1800, avg_total_gpu_power_w: 14_400 });
    expect(modelSystemPower(overload)).toMatchObject({ reason: 'model-domain' });
  });

  it('extrapolates a partially allocated single-node chassis at the measured per-GPU power', () => {
    const partial = row({ prefill_tp: 4, decode_tp: 4, num_prefill_gpu: 4, num_decode_gpu: 4 });
    partial.metrics.avg_total_gpu_power_w = 1399.436; // 4 × 349.859
    const result = modelSystemPower(partial);
    expect(result.status).toBe('supported');
    if (result.status !== 'supported') throw new Error(result.reason);
    // The source sweep's input for the whole chassis: n_gpu × W/GPU.
    const reference = chassis('b200', 349.859 * 8);
    expect(result).toMatchObject({
      gpuCount: 4,
      chassisCount: 1,
      modeledGpuCount: 8,
      measuredGpuWattsPerGpu: 349.859,
      itWatts: reference.itWatts,
      itWattsPerGpu: reference.itWatts / 8,
      facilityWatts: reference.facilityWatts,
      deploymentItWatts: reference.itWatts / 2,
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
      deploymentItWatts: reference.itWatts,
    });
    expect(fullResult.status === 'supported' && fullResult.itWattsPerGpu).toBe(
      result.itWattsPerGpu,
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
    const prefill = chassis('b200', 2400, true);
    const decode = chassis('b200', 5600, true);
    expect(modelSystemPower(source)).toMatchObject({
      status: 'supported',
      gpuCount: 12,
      chassisCount: 2,
      modeledGpuCount: 16,
      itWatts: prefill.itWatts + decode.itWatts,
      itWattsPerGpu: (prefill.itWatts + decode.itWatts) / 16,
      deploymentItWatts: prefill.itWatts / 2 + decode.itWatts,
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

  it('models an aggregate multinode deployment without worker telemetry at the deployment mean', () => {
    // Kimi K3 B200 dynamo-vLLM TP8/PP2 (prod rows, 2026-09-17): two eight-GPU hosts,
    // aggregate producer, no per-worker array. The K3 H200 vLLM row below is
    // TP16 × 2 DP replicas across four hosts.
    const b200 = row({
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
    });
    const perChassis = chassis('b200', 11441.513 / 2, true);
    const estimate = modelSystemPower(b200);
    expect(estimate).toMatchObject({
      status: 'supported',
      topologyBasis: 'uniform-hosts',
      chassisBasis: 'full',
      gpuCount: 16,
      chassisCount: 2,
      modeledGpuCount: 16,
    });
    if (estimate.status !== 'supported') throw new Error('unreachable');
    expect(estimate.itWatts).toBeCloseTo(perChassis.itWatts * 2, 6);
    expect(estimate.deploymentFacilityWatts).toBe(estimate.facilityWatts);
    expect(estimate.itWattsPerGpu).toBeCloseTo(perChassis.itWatts / 8, 6);

    const h200 = row({
      hardware: 'h200',
      is_multinode: true,
      prefill_tp: 16,
      decode_tp: 16,
      decode_ep: 32,
      decode_dp_attention: true,
      decode_num_workers: 2,
      num_prefill_gpu: 32,
      num_decode_gpu: 32,
      metrics: {
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_power_w: 167.357,
        avg_total_gpu_power_w: 5355.413,
        decode_pp: 1,
      },
    });
    expect(modelSystemPower(h200)).toMatchObject({
      status: 'supported',
      topologyBasis: 'uniform-hosts',
      chassisCount: 4,
      gpuCount: 32,
    });

    // A replica count that does not explain the telemetry width is not guessed around.
    expect(modelSystemPower({ ...h200, decode_num_workers: 1 })).toMatchObject({
      reason: 'gpu-count',
    });
    // Twelve GPUs cannot fill whole eight-GPU hosts; placement is unknown.
    const twelve = row({ is_multinode: true, decode_tp: 12, prefill_tp: 12 });
    twelve.metrics.avg_total_gpu_power_w = twelve.metrics.avg_power_w * 12;
    expect(modelSystemPower(twelve)).toMatchObject({ reason: 'topology' });
    // Per-worker telemetry, when present, keeps the more exact worker path.
    const withWorkers = {
      ...b200,
      workers: ['host-a', 'host-b'].map((host, worker_idx) => ({
        role: 'agg',
        worker_idx,
        hosts: [host],
        num_gpus: 8,
        avg_power_w: 715.095,
      })),
    };
    expect(modelSystemPower(withWorkers)).toMatchObject({
      status: 'supported',
      topologyBasis: 'worker-hosts',
      chassisCount: 2,
    });
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
    expect(legacy.itWatts).toBe(versioned.itWatts);
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
    const prefill = chassis('b200', 2400, true);
    const decode = chassis('b200', 5600, true);
    expect(result).toMatchObject({
      status: 'supported',
      operatingState: { workload: 'fixed-seq-len', scaleOut: true },
      gpuCount: 16,
      chassisCount: 2,
      itWatts: prefill.itWatts + decode.itWatts,
      facilityWatts: prefill.facilityWatts + decode.facilityWatts,
    });
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
      expect(points[0].utilityModeledWatts?.y).toBeGreaterThan(source.metrics.avg_power_w);
    }
    // Unofficial-run overlays reuse this transform with these arguments (unofficial-run-provider).
    const overlay = transformBenchmarkRows(
      [row({ benchmark_type: 'agentic_traces', isl: null, osl: null })],
      'median',
      'external',
    );
    for (const points of overlay.chartData) {
      expect(points[0].utilityModeledWatts?.y).toBeGreaterThan(source.metrics.avg_power_w);
    }
    const unsupported = transformBenchmarkRows([row({ hardware: 'gb200' })]);
    for (const points of unsupported.chartData) {
      expect(points[0].utilityModeledWatts).toBeUndefined();
      expect(points[0].measuredAvgPower?.y).toBe(source.metrics.avg_power_w);
    }
  });
});

describe('NVL72 Grace-socket telemetry gate', () => {
  it.each([
    [
      'GPU-only telemetry',
      nvl72Row({ cpu_power_valid: undefined, avg_total_cpu_power_w: undefined }),
    ],
    ['an invalid CPU verdict', nvl72Row({ cpu_power_valid: 0 })],
    ['a missing CPU audit', nvl72Row({}, { power_audit: undefined })],
    [
      'a CPU rail mislabeled as Grace power',
      nvl72Row(
        {},
        {
          power_audit: {
            cpu: { sensor_kind: 'dcgm_cpu_rail', expected_sockets: 2, observed_sockets: 2 },
          },
        },
      ),
    ],
    [
      'the module sensor',
      nvl72Row(
        {},
        {
          power_audit: { cpu: { sensor_kind: 'module', expected_sockets: 2, observed_sockets: 2 } },
        },
      ),
    ],
    [
      'incomplete socket coverage',
      nvl72Row(
        {},
        {
          power_audit: {
            cpu: { sensor_kind: 'grace_socket', expected_sockets: 2, observed_sockets: 1 },
          },
        },
      ),
    ],
    [
      'a socket total that disagrees with the per-socket mean',
      nvl72Row({ avg_total_cpu_power_w: 600 }),
    ],
  ])('keeps NVL72 rows with %s unavailable', (_name, source) => {
    expect(modelSystemPower(source)).toMatchObject({
      status: 'unsupported',
      reason: 'cpu-telemetry',
    });
  });

  it('requires schema-v2 GPU telemetry before reading the Grace side', () => {
    const legacy = nvl72Row({ power_metric_schema_version: undefined });
    expect(modelSystemPower(legacy)).toMatchObject({ reason: 'telemetry' });
  });

  it('requires two Grace sockets per four-GPU compute tray', () => {
    const disagg = nvl72Row(
      {
        avg_power_w: 500,
        avg_total_gpu_power_w: 4000,
        prefill_avg_power_w: 250,
        decode_avg_power_w: 750,
        avg_cpu_socket_power_w: 260,
        avg_total_cpu_power_w: 1040,
      },
      {
        hardware: 'gb300',
        disagg: true,
        is_multinode: true,
        workers: [
          { role: 'prefill', worker_idx: 0, num_gpus: 4, hosts: ['tray-a'], avg_power_w: 250 },
          { role: 'decode', worker_idx: 0, num_gpus: 4, hosts: ['tray-b'], avg_power_w: 750 },
        ],
      },
    );
    expect(modelSystemPower(disagg)).toMatchObject({ status: 'supported', chassisCount: 2 });
    const threeSockets = {
      ...disagg,
      metrics: { ...disagg.metrics, avg_total_cpu_power_w: 260 * 3 },
      power_audit: {
        cpu: { sensor_kind: 'grace_socket' as const, expected_sockets: 3, observed_sockets: 3 },
      },
    };
    expect(modelSystemPower(threeSockets)).toMatchObject({ reason: 'cpu-telemetry' });
    disagg.workers![1].num_gpus = 5;
    expect(modelSystemPower(disagg)).toMatchObject({ reason: 'topology' });

    // Aggregate multinode rows without workers infer GPU count ÷ 4 trays.
    const aggregate = nvl72Row(
      { avg_power_w: 441.741, avg_total_gpu_power_w: 7067.859, avg_total_cpu_power_w: 2004 },
      { is_multinode: true, prefill_tp: 16, decode_tp: 0, num_prefill_gpu: 16, num_decode_gpu: 16 },
    );
    expect(modelSystemPower(aggregate)).toMatchObject({ status: 'supported', chassisCount: 4 });
    expect(
      modelSystemPower({
        ...aggregate,
        metrics: { ...aggregate.metrics, avg_total_cpu_power_w: 250.5 * 6 },
        power_audit: {
          cpu: { sensor_kind: 'grace_socket', expected_sockets: 6, observed_sockets: 6 },
        },
      }),
    ).toMatchObject({ reason: 'cpu-telemetry' });
    expect(
      modelSystemPower({
        ...aggregate,
        prefill_tp: 18,
        metrics: { ...aggregate.metrics, avg_total_gpu_power_w: 441.741 * 18 },
      }),
    ).toMatchObject({ reason: 'gpu-count' });

    // Eight GPUs cannot sit on one tray.
    const twoTraysOneHost = nvl72Row(
      { avg_total_gpu_power_w: 7202, avg_total_cpu_power_w: 1002 },
      { prefill_tp: 8, decode_tp: 8, num_prefill_gpu: 8, num_decode_gpu: 8 },
    );
    expect(modelSystemPower(twoTraysOneHost)).toMatchObject({ reason: 'topology' });
  });
});

describe('NVL72 rack estimate from measured GPU boards and Grace sockets', () => {
  it('models a disaggregated GB300 replay as two trays sharing one rack, exactly as upstream', () => {
    const result = modelSystemPower(gb300DisaggRow());
    expect(result).toMatchObject({
      status: 'supported',
      unit: 'nvl72-tray',
      hardware: 'gb300',
      gpuCount: 8,
      chassisCount: 2,
      modeledGpuCount: 8,
      measuredGpuWattsPerGpu: 594.191,
      measuredGraceSocketWatts: 98.066,
      operatingState: { workload: 'fixed-seq-len', scaleOut: true },
      topologyBasis: 'worker-hosts',
      chassisBasis: 'full',
      pue: 1.1,
    });
    if (result.status !== 'supported') throw new Error(result.reason);
    // Prefill and decode trays fold into one rack at their mean, 594.191 W/GPU,
    // with no allowance on top of the measured GPU and Grace-socket inputs.
    const perGpu = upstreamRackWattsPerGpu('gb300', 594.191, 98.066, true);
    expect(result.deploymentFacilityWatts / result.gpuCount / perGpu - 1).toBeCloseTo(0, 12);
    expect(result.facilityWatts).toBeCloseTo(result.deploymentFacilityWatts, 9);
    expect(result.itWatts * 1.1).toBeCloseTo(result.facilityWatts, 9);
  });

  it('models an aggregate deployment without workers at the mean, inside one rack without scale-out', () => {
    const result = modelSystemPower(gb300AggregateRow());
    expect(result).toMatchObject({
      status: 'supported',
      unit: 'nvl72-tray',
      gpuCount: 16,
      chassisCount: 4,
      topologyBasis: 'uniform-hosts',
      operatingState: { workload: 'fixed-seq-len', scaleOut: false },
    });
    if (result.status !== 'supported') throw new Error(result.reason);
    // 1013.83 W/GPU: the upstream CLI's GB300 figure for these inputs.
    const perGpu = upstreamRackWattsPerGpu('gb300', 594.191, 98.066, false);
    expect(result.deploymentFacilityWatts / result.gpuCount / perGpu - 1).toBeCloseTo(0, 12);
    expect(perGpu).toBeCloseTo(1013.828, 3);
    // Twenty trays span two racks, so the deployment needs the scale-out fabric.
    expect(modelSystemPower(gb300AggregateRow(20))).toMatchObject({
      chassisCount: 20,
      operatingState: { scaleOut: true },
    });
  });

  it('shares a partially measured tray’s rack estimate by its measured GPUs', () => {
    const source = gb300DisaggRow();
    source.workers![1] = { ...source.workers![1], num_gpus: 2 };
    Object.assign(source, { num_prefill_gpu: 2, prefill_tp: 2 });
    Object.assign(source.metrics, {
      avg_total_gpu_power_w: 691.906 * 4 + 496.476 * 2,
      avg_power_w: (691.906 * 4 + 496.476 * 2) / 6,
    });
    const result = modelSystemPower(source);
    expect(result).toMatchObject({
      status: 'supported',
      gpuCount: 6,
      modeledGpuCount: 8,
      chassisBasis: 'extrapolated',
    });
    if (result.status !== 'supported') throw new Error(result.reason);
    const rack = estimateRackPower('gb300', (691.906 + 496.476) / 2, 98.066, {
      workload: 'fixed-seq-len',
      scaleOut: true,
    })!;
    expect(result.deploymentFacilityWatts).toBeCloseTo((rack.facilityWatts / 72) * 6, 9);
    expect(result.itWattsPerGpu).toBeCloseTo(rack.itWatts / 72, 9);
  });

  it('keeps GB200 trays on their own rack profile and outside the model domain unavailable', () => {
    const gb200 = modelSystemPower(gb300DisaggRow({ hardware: 'gb200' }));
    expect(gb200).toMatchObject({ status: 'supported', unit: 'nvl72-tray', hardware: 'gb200' });
    if (gb200.status !== 'supported') throw new Error(gb200.reason);
    const gb300 = modelSystemPower(gb300DisaggRow());
    if (gb300.status !== 'supported') throw new Error(gb300.reason);
    expect(gb200.itWattsPerGpu).toBeLessThan(gb300.itWattsPerGpu);

    // Beyond the redundant power-shelf capacity upstream refuses the rack.
    const overloaded = gb300AggregateRow();
    Object.assign(overloaded.metrics, { avg_power_w: 1700, avg_total_gpu_power_w: 1700 * 16 });
    expect(modelSystemPower(overloaded)).toMatchObject({ reason: 'model-domain' });
  });

  type RackProfile = (typeof profileData.rackProfiles)['gb300'];
  it.each([
    ['tray converter', (rack: RackProfile) => rack.trayConverter.lossCurve.splice(3)],
    ['power-shelf PSU', (rack: RackProfile) => rack.powerShelves.psuEfficiencyCurve.splice(3)],
  ])('reports a rack load past the last %s curve knot as model-domain', async (_, truncate) => {
    const profiles = structuredClone(profileData);
    // The pinned curves end at full load; ending one at 20% puts this fixture's load past it.
    truncate(profiles.rackProfiles.gb300);
    vi.resetModules();
    vi.doMock('@/lib/system-power-model.profiles.json', () => ({ default: profiles }));
    try {
      const { modelSystemPower: truncatedModel } = await import('@/lib/modeled-system-power');
      expect(truncatedModel(gb300AggregateRow())).toMatchObject({
        status: 'unsupported',
        reason: 'model-domain',
      });
    } finally {
      vi.doUnmock('@/lib/system-power-model.profiles.json');
    }
  });
});
