import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry, transformBenchmarkRows } from '@/lib/benchmark-transform';
import { buildDerivedChartFields, getHardwareKey } from '@/lib/chart-utils';
import { getGpuSpecs } from '@/lib/constants';
import {
  computePowerBasisFields,
  modeledFacilityWattsPerGpu,
  POWER_BASES,
  POWER_BASIS_FIELDS,
  POWER_BASIS_LABELS,
  powerBasisNormalization,
} from '@/lib/power-basis';

// Qwen3.5 B200 c1, run 34175132645: actual rounded telemetry, eight GPUs
// (same fixture as modeled-system-power.test.ts) plus an output rate.
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
      tput_per_gpu: 270,
      output_tput_per_gpu: 30,
      pp: 1,
      pcp_size: 1,
      median_intvty: 100,
    },
    ...overrides,
  };
}

/** Full official-path derivation for one row with real HW_REGISTRY specs. */
function derive(source: BenchmarkRow) {
  const entry = rowToAggDataEntry(source);
  const hwKey = getHardwareKey(entry);
  return { entry, hwKey, fields: buildDerivedChartFields(entry, hwKey) };
}

const y = (metric: { y: number } | undefined) => metric?.y;

describe('computePowerBasisFields', () => {
  // H200-like aggregate deployment: 8 GPUs at 50 output tok/s each.
  const h200 = {
    tdpWatts: 700,
    utilityWatts: 1370,
    allocatedGpus: 8,
    totalOutputTokPerSec: 400,
    measuredWatts: 350,
    measuredJPerOutputToken: 7,
    modeledFacilityWattsPerGpu: 650,
  };

  it('derives provisioned and modeled boundaries for an aggregate deployment', () => {
    const values = computePowerBasisFields(h200);
    expect(values).toMatchObject({
      gpuProvisionedWatts: 700,
      gpuProvisionedJPerOutputToken: 14,
      utilityProvisionedWatts: 1370,
      utilityModeledWatts: 650,
      utilityModeledJPerOutputToken: 13,
    });
    expect(values.utilityProvisionedJPerOutputToken).toBeCloseTo(27.4, 10);
  });

  it('charges the prefill pool to every output token of a 4P+4D deployment', () => {
    // GB200-like disaggregation: only 4 decode GPUs emit tokens (50 tok/s each),
    // but all 8 allocated GPUs are provisioned, so J/token doubles versus a
    // per-decode-GPU reading (1200 / 50 = 24).
    const values = computePowerBasisFields({
      tdpWatts: 1200,
      utilityWatts: 1870,
      allocatedGpus: 8,
      totalOutputTokPerSec: 200,
      measuredWatts: null,
      measuredJPerOutputToken: null,
      modeledFacilityWattsPerGpu: null,
    });
    expect(values.gpuProvisionedJPerOutputToken).toBe(48);
    expect(values.utilityProvisionedJPerOutputToken).toBeCloseTo(74.8, 10);
    expect(values.utilityModeledWatts).toBeNull();
    expect(values.utilityModeledJPerOutputToken).toBeNull();
  });

  it('nulls only the boundaries whose inputs are unavailable', () => {
    const noModel = computePowerBasisFields({ ...h200, modeledFacilityWattsPerGpu: null });
    expect(noModel.utilityModeledWatts).toBeNull();
    expect(noModel.utilityModeledJPerOutputToken).toBeNull();
    expect(noModel.gpuProvisionedJPerOutputToken).toBe(14);
    expect(noModel.utilityProvisionedJPerOutputToken).toBeCloseTo(27.4, 10);

    // B4 is anchored on B1: without measured watts neither modeled value exists,
    // even when a caller supplies a modeled W from elsewhere.
    const noMeasured = computePowerBasisFields({
      ...h200,
      measuredWatts: null,
      measuredJPerOutputToken: null,
    });
    expect(noMeasured.utilityModeledWatts).toBeNull();
    expect(noMeasured.utilityModeledJPerOutputToken).toBeNull();
    expect(noMeasured.gpuProvisionedWatts).toBe(700);
    expect(noMeasured.utilityProvisionedWatts).toBe(1370);

    const noMeasuredEnergy = computePowerBasisFields({ ...h200, measuredJPerOutputToken: null });
    expect(noMeasuredEnergy.utilityModeledWatts).toBe(650);
    expect(noMeasuredEnergy.utilityModeledJPerOutputToken).toBeNull();

    const noThroughput = computePowerBasisFields({ ...h200, totalOutputTokPerSec: null });
    expect(noThroughput.gpuProvisionedWatts).toBe(700);
    expect(noThroughput.gpuProvisionedJPerOutputToken).toBeNull();
    expect(noThroughput.utilityProvisionedJPerOutputToken).toBeNull();
    expect(noThroughput.utilityModeledJPerOutputToken).toBe(13);
  });

  it.each([0, -1, NaN, Infinity])('never turns %s into a plotted value', (bad) => {
    const values = computePowerBasisFields({
      tdpWatts: bad,
      utilityWatts: bad,
      allocatedGpus: bad,
      totalOutputTokPerSec: bad,
      measuredWatts: bad,
      measuredJPerOutputToken: bad,
      modeledFacilityWattsPerGpu: bad,
    });
    expect(Object.values(values).every((v) => v === null)).toBe(true);
  });
});

describe('powerBasisNormalization', () => {
  it('keeps aggregate rows on the per-GPU ratio because N_alloc cancels', () => {
    expect(
      powerBasisNormalization({
        output_tput_per_gpu: 50,
        disagg: false,
        benchmark_type: 'single_turn',
        num_prefill_gpu: 8,
        num_decode_gpu: 8,
      }),
    ).toEqual({ allocatedGpus: 1, totalOutputTokPerSec: 50 });
  });

  it('counts prefill GPUs and decode-only output for fixed-sequence disaggregation', () => {
    const disagg = {
      output_tput_per_gpu: 50,
      disagg: true,
      benchmark_type: 'single_turn',
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
    };
    expect(powerBasisNormalization(disagg)).toEqual({
      allocatedGpus: 8,
      totalOutputTokPerSec: 200,
    });
    expect(powerBasisNormalization({ ...disagg, num_prefill_gpu: 0 })).toEqual({
      allocatedGpus: null,
      totalOutputTokPerSec: null,
    });
    expect(powerBasisNormalization({ ...disagg, benchmark_type: 'agentic_traces' })).toEqual({
      allocatedGpus: null,
      totalOutputTokPerSec: null,
    });
    expect(powerBasisNormalization({ ...disagg, output_tput_per_gpu: 0 })).toEqual({
      allocatedGpus: null,
      totalOutputTokPerSec: null,
    });
  });
});

describe('power boundaries through the derived-field builder', () => {
  it('orders B3 ≥ B4 ≥ B1 and B2 ≥ B1 for watts and energy on real B200 telemetry', () => {
    const { entry, fields } = derive(row());
    const b1W = y(fields.measuredAvgPower)!;
    const b2W = y(fields.gpuProvisionedWatts)!;
    const b3W = y(fields.utilityProvisionedWatts)!;
    const b4W = y(fields.utilityModeledWatts)!;
    expect(b1W).toBe(349.859);
    expect(b2W).toBe(getGpuSpecs('b200').tdp);
    expect(b3W).toBe(getGpuSpecs('b200').power * 1000);
    expect(b4W).toBeCloseTo(6288.4 / 8, 6);
    expect(b3W).toBeGreaterThanOrEqual(b4W);
    expect(b4W).toBeGreaterThanOrEqual(b1W);
    expect(b2W).toBeGreaterThanOrEqual(b1W);

    const b1J = y(fields.measuredJPerOutputToken)!;
    const b2J = y(fields.gpuProvisionedJPerOutputToken)!;
    const b3J = y(fields.utilityProvisionedJPerOutputToken)!;
    const b4J = y(fields.utilityModeledJPerOutputToken)!;
    expect(b1J).toBe(12.937902);
    expect(b2J).toBeCloseTo(b2W / 30, 10);
    expect(b3J).toBeCloseTo(b3W / 30, 10);
    expect(b4J).toBeCloseTo((b1J * b4W) / b1W, 10);
    expect(b3J).toBeGreaterThanOrEqual(b4J);
    expect(b4J).toBeGreaterThanOrEqual(b1J);
    expect(b2J).toBeGreaterThanOrEqual(b1J);

    // B4 W ÷ B1 W is the facility-to-board ratio of the attached estimate.
    const model = entry.modeledSystemPower;
    expect(model?.status).toBe('supported');
    if (model?.status !== 'supported') return;
    expect(b4W / b1W).toBeCloseTo(model.deploymentFacilityWatts / (model.gpuCount * b1W), 10);
  });

  it('applies PUE exactly once: B4 W ÷ chassis AC per GPU equals the model PUE', () => {
    const { entry, fields } = derive(row());
    const model = entry.modeledSystemPower;
    if (model?.status !== 'supported') throw new Error('fixture must be supported');
    const chassisAcPerMeasuredGpu = model.chassisAcWatts / model.gpuCount;
    expect(y(fields.utilityModeledWatts)! / chassisAcPerMeasuredGpu).toBeCloseTo(model.pue, 4);
    expect(y(fields.utilityModeledWatts)! / y(fields.modeledChassisPowerPerGpu)!).toBeCloseTo(
      model.pue,
      4,
    );
  });

  it('normalizes a fixed-sequence 4P+4D row by all eight GPUs while jOutput stays per decode GPU', () => {
    const { entry, fields } = derive(
      row({
        hardware: 'gb200',
        disagg: true,
        prefill_tp: 4,
        decode_tp: 4,
        num_prefill_gpu: 4,
        num_decode_gpu: 4,
        metrics: { ...row().metrics, tput_per_gpu: 450, output_tput_per_gpu: 50 },
      }),
    );
    const specs = getGpuSpecs('gb200');
    expect(y(fields.gpuProvisionedJPerOutputToken)).toBeCloseTo((specs.tdp * 8) / (50 * 4), 10);
    expect(y(fields.utilityProvisionedJPerOutputToken)).toBeCloseTo(
      (specs.power * 1000 * 8) / (50 * 4),
      10,
    );
    // Legacy all-in energy divides one decode GPU's power by that GPU's output.
    expect(y(fields.jOutput)).toBeCloseTo((specs.power * 1000) / 50, 10);
    expect(y(fields.utilityProvisionedJPerOutputToken)).toBeCloseTo(2 * y(fields.jOutput)!, 10);
    // Telemetry is validated (B1 renders) but GB200 NVL72 has no chassis
    // model, so the modeled boundary alone is absent.
    expect(fields.measuredAvgPower).toBeDefined();
    expect(entry.modeledSystemPower).toMatchObject({ status: 'unsupported', reason: 'hardware' });
    expect(fields.utilityModeledWatts).toBeUndefined();
    expect(fields.utilityModeledJPerOutputToken).toBeUndefined();
  });

  it('divides B4 by the measured GPU count, not the modeled chassis count, on a 4P+8D H200 deployment', () => {
    // Two worker hosts, a half-filled prefill chassis and a full decode chassis:
    // the model evaluates 16 GPUs (two chassis) while twelve are measured.
    const { entry, fields } = derive(
      row({
        hardware: 'h200',
        disagg: true,
        is_multinode: true,
        prefill_tp: 4,
        decode_tp: 8,
        num_prefill_gpu: 4,
        num_decode_gpu: 8,
        workers: [
          {
            role: 'prefill',
            worker_idx: 0,
            num_gpus: 4,
            hosts: ['prefill-node'],
            avg_power_w: 400,
          },
          { role: 'decode', worker_idx: 0, num_gpus: 8, hosts: ['decode-node'], avg_power_w: 300 },
        ],
        metrics: {
          power_valid: 1,
          power_metric_schema_version: 2,
          avg_power_w: 4000 / 12,
          avg_total_gpu_power_w: 4000,
          prefill_avg_power_w: 400,
          decode_avg_power_w: 300,
          joules_per_output_token: 14,
          tput_per_gpu: 450,
          output_tput_per_gpu: 50,
        },
      }),
    );
    const model = entry.modeledSystemPower;
    expect(model?.status).toBe('supported');
    if (model?.status !== 'supported') return;
    expect(model.gpuCount).toBe(12);
    expect(model.modeledGpuCount).toBe(16);
    expect(model.chassisBasis).toBe('extrapolated');

    const b1W = y(fields.measuredAvgPower)!;
    const b3W = y(fields.utilityProvisionedWatts)!;
    const b4W = y(fields.utilityModeledWatts)!;
    expect(b1W).toBeCloseTo(4000 / 12, 10);
    expect(b4W).toBeCloseTo(model.deploymentFacilityWatts / model.gpuCount, 10);
    expect(b4W).not.toBeCloseTo(model.facilityWatts / model.modeledGpuCount, 6);
    expect(b4W).not.toBeCloseTo(model.facilityWatts / model.gpuCount, 6);
    expect(b4W).not.toBeCloseTo(model.deploymentFacilityWatts / model.modeledGpuCount, 6);

    const b1J = y(fields.measuredJPerOutputToken)!;
    const b3J = y(fields.utilityProvisionedJPerOutputToken)!;
    const b4J = y(fields.utilityModeledJPerOutputToken)!;
    expect(b1J).toBe(14);
    expect(b4J).toBeCloseTo((14 * b4W) / (4000 / 12), 10);
    expect(b3J).toBeCloseTo(1.5 * y(fields.jOutput)!, 10);
    expect(b3W).toBeGreaterThanOrEqual(b4W);
    expect(b4W).toBeGreaterThanOrEqual(b1W);
    expect(b3J).toBeGreaterThanOrEqual(b4J);
    expect(b4J).toBeGreaterThanOrEqual(b1J);
  });

  it('omits the modeled boundary off the 8k/1k workload but keeps provisioned ones', () => {
    const { fields } = derive(row({ isl: 1024, osl: 1024 }));
    expect(fields.measuredAvgPower).toBeDefined();
    expect(fields.utilityModeledWatts).toBeUndefined();
    expect(fields.utilityModeledJPerOutputToken).toBeUndefined();
    expect(y(fields.gpuProvisionedWatts)).toBe(getGpuSpecs('b200').tdp);
    expect(fields.utilityProvisionedJPerOutputToken).toBeDefined();
  });

  it('omits the modeled boundary with B1 when telemetry is invalid, keeps provisioned ones', () => {
    const invalid = derive(row({ metrics: { ...row().metrics, power_valid: 0 } })).fields;
    expect(invalid.measuredAvgPower).toBeUndefined();
    expect(invalid.utilityModeledWatts).toBeUndefined();
    expect(invalid.utilityModeledJPerOutputToken).toBeUndefined();
    expect(invalid.gpuProvisionedWatts).toBeDefined();
    expect(invalid.utilityProvisionedWatts).toBeDefined();
  });

  it('renders the modeled boundary wherever B1 renders, including validated unversioned single-node rows', () => {
    const { power_metric_schema_version: _schema, ...unversioned } = row().metrics;
    const legacy = derive(row({ metrics: unversioned }));
    const model = legacy.entry.modeledSystemPower;
    expect(model).toMatchObject({
      status: 'supported',
      telemetryBasis: 'validated-unversioned-single-node',
    });
    if (model?.status !== 'supported') return;
    expect(legacy.fields.measuredAvgPower).toBeDefined();
    expect(legacy.fields.measuredJPerOutputToken).toBeDefined();
    expect(
      y(legacy.fields.utilityModeledWatts)! / y(legacy.fields.modeledChassisPowerPerGpu)!,
    ).toBeCloseTo(model.pue, 4);
    expect(y(legacy.fields.utilityModeledJPerOutputToken)).toBeCloseTo(
      (y(legacy.fields.measuredJPerOutputToken)! * y(legacy.fields.utilityModeledWatts)!) /
        y(legacy.fields.measuredAvgPower)!,
      10,
    );
    // Same numbers as the versioned row: the schema marker changes admission, not the estimate.
    expect(legacy.fields.utilityModeledWatts).toEqual(derive(row()).fields.utilityModeledWatts);
  });

  it('omits provisioned boundaries for hardware without registry specs', () => {
    const { fields } = derive(row({ hardware: 'unlistedchip' }));
    expect(fields.gpuProvisionedWatts).toBeUndefined();
    expect(fields.gpuProvisionedJPerOutputToken).toBeUndefined();
    expect(fields.utilityProvisionedWatts).toBeUndefined();
    expect(fields.utilityProvisionedJPerOutputToken).toBeUndefined();
  });

  it('serves the same fields to ?unofficialrun= overlays through transformBenchmarkRows', () => {
    const { chartData } = transformBenchmarkRows([row()], 'median', 'external');
    const point = chartData[0][0];
    const official = derive(row()).fields;
    for (const basis of Object.values(POWER_BASIS_FIELDS)) {
      expect(point[basis.watts]).toEqual(official[basis.watts]);
      expect(point[basis.energy]).toEqual(official[basis.energy]);
      expect(point[basis.watts]?.roof).toBe(false);
    }
  });

  it('emits exactly the requested boundary fields for historical trends', () => {
    const { entry, hwKey } = derive(row());
    const requested = buildDerivedChartFields(entry, hwKey, [
      'utilityModeledWatts',
      'gpuProvisionedJPerOutputToken',
    ]);
    expect(Object.keys(requested).sort()).toEqual(
      ['gpuProvisionedJPerOutputToken', 'utilityModeledWatts'].sort(),
    );
    const unavailable = buildDerivedChartFields(
      rowToAggDataEntry(row({ hardware: 'gb200' })),
      'gb200',
      ['tpPerGpu', 'utilityModeledWatts'],
    );
    expect(Object.keys(unavailable)).toEqual(['tpPerGpu']);
  });
});

describe('modeledFacilityWattsPerGpu', () => {
  const supported = rowToAggDataEntry(row()).modeledSystemPower;

  it('divides the deployment facility share by the measured GPU count', () => {
    expect(modeledFacilityWattsPerGpu({ modeledSystemPower: supported })).toBeCloseTo(
      6288.4 / 8,
      6,
    );
  });

  it('returns null without a supported model', () => {
    expect(
      modeledFacilityWattsPerGpu({
        modeledSystemPower: { status: 'unsupported', reason: 'hardware', modelRevision: 'x' },
      }),
    ).toBeNull();
    expect(modeledFacilityWattsPerGpu({ modeledSystemPower: undefined })).toBeNull();
  });
});

describe('power basis registry', () => {
  it('labels every basis in both locales and maps every derived basis to two fields', () => {
    for (const basis of POWER_BASES) {
      expect(POWER_BASIS_LABELS[basis].en.length).toBeGreaterThan(0);
      expect(POWER_BASIS_LABELS[basis].zh.length).toBeGreaterThan(0);
    }
    const keys = Object.values(POWER_BASIS_FIELDS).flatMap((f) => [f.watts, f.energy]);
    expect(new Set(keys).size).toBe(6);
  });
});
