import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry, transformBenchmarkRows } from '@/lib/benchmark-transform';
import { modelSystemPower } from '@/lib/modeled-system-power';
import { estimateChassisPower, type SystemPowerHardware } from '@/lib/system-power-model';

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

  it.each(['gb200', 'gb300', 'rtx6000pro', 'tpuv7', 'b200-nvl'])(
    'does not substitute for %s',
    (hardware) => {
      expect(modelSystemPower(row({ hardware }))).toMatchObject({
        status: 'unsupported',
        reason: 'hardware',
      });
    },
  );

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
