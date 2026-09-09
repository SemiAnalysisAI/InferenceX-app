import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry, transformBenchmarkRows } from '@/lib/benchmark-transform';
import { modelSystemPower } from '@/lib/modeled-system-power';
import { estimateChassisPower } from '@/lib/system-power-model';

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
    const reference = estimateChassisPower('b200', 2798.868)!;
    expect(result).toMatchObject({
      gpuCount: 8,
      chassisCount: 1,
      measuredGpuWattsPerGpu: 349.859,
      measuredTotalGpuWatts: 2798.868,
      chassisAcWatts: reference.chassisAcWatts,
      chassisAcWattsPerGpu: reference.chassisAcWatts / 8,
      facilityWatts: reference.facilityWatts,
      topologyBasis: 'single-node-eight-gpu',
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

  it('rejects partial chassis, inconsistent telemetry and missing topology', () => {
    const partial = row();
    partial.metrics.avg_total_gpu_power_w = partial.metrics.avg_power_w * 4;
    expect(modelSystemPower(partial)).toMatchObject({ reason: 'partial-chassis' });
    const inconsistent = row();
    inconsistent.metrics.avg_total_gpu_power_w = 2700;
    expect(modelSystemPower(inconsistent)).toMatchObject({ reason: 'gpu-count' });
    expect(modelSystemPower(row({ is_multinode: true }))).toMatchObject({ reason: 'topology' });
    expect(modelSystemPower(row({ decode_tp: 4 }))).toMatchObject({ reason: 'gpu-count' });
    expect(modelSystemPower(row(), 0.9)).toMatchObject({ reason: 'model-domain' });
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
    expect(legacy.measuredTotalGpuWatts).toBe(versioned.measuredTotalGpuWatts);
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
    const prefill = estimateChassisPower('b200', 2400)!;
    const decode = estimateChassisPower('b200', 5600)!;
    expect(result).toMatchObject({
      status: 'supported',
      gpuCount: 16,
      chassisCount: 2,
      chassisAcWatts: prefill.chassisAcWatts + decode.chassisAcWatts,
      facilityWatts: prefill.facilityWatts + decode.facilityWatts,
      roles: [
        { role: 'prefill', gpuCount: 8, chassisAcWatts: prefill.chassisAcWatts },
        { role: 'decode', gpuCount: 8, chassisAcWatts: decode.chassisAcWatts },
      ],
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
