import { describe, expect, it } from 'vitest';

import {
  buildComparison,
  csv,
  type ComparisonInput,
} from '../../scripts/export-modeled-system-power';
import { estimateChassisPower, estimateRackPower } from '@/lib/system-power-model';

// Original H200 c1, run 31672765610, artifact 9171086754; schema marker was absent.
function input(): ComparisonInput {
  return {
    cohort: 'original-qwen',
    metadata: {},
    rows: [
      {
        id: 'h200:31672765610:c1',
        cell: 'h200:c1',
        benchmark: {
          id: 0,
          hardware: 'h200',
          model: 'qwen3.5',
          framework: 'sglang',
          precision: 'fp8',
          spec_method: 'none',
          disagg: false,
          is_multinode: false,
          prefill_tp: 8,
          prefill_ep: 8,
          prefill_dp_attention: false,
          prefill_num_workers: 0,
          decode_tp: 8,
          decode_ep: 8,
          decode_dp_attention: false,
          decode_num_workers: 0,
          num_prefill_gpu: 64,
          num_decode_gpu: 64,
          benchmark_type: 'single_turn',
          isl: 8192,
          osl: 1024,
          conc: 1,
          offload_mode: 'off',
          image: null,
          date: '2026-08-13',
          run_url:
            'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/31672765610/attempts/1',
          metrics: {
            pp: 1,
            pcp_size: 1,
            power_valid: 1,
            avg_power_w: 229.003,
            avg_total_gpu_power_w: 1832.023,
            total_gpu_energy_j: 118491.651,
            joules_per_output_token: 12.736929,
            joules_per_input_token: 1.601823,
            joules_per_total_token: 1.422879,
            joules_per_successful_query: 11849.165111,
          },
        },
        audit: {
          power_valid: true,
          reasons: [],
          expected_gpu_count: 8,
          observed_gpu_count: 8,
          benchmark_window: {
            start_time_unix: 1786603213.8557396,
            end_time_unix: 1786603278.53379,
            integration_duration_s: 64.67805051803589,
            completed: 10,
            total_input_tokens: 73973,
            total_output_tokens: 9303,
          },
          metrics: {
            avg_power_w: 229.002827,
            avg_total_gpu_power_w: 1832.022613,
            total_gpu_energy_j: 118491.651109,
          },
        },
      },
    ],
  };
}

describe('offline modeled PowerX comparisons', () => {
  it('uses exact audited tokens and duration, preserving measured GPU metrics and absent schema', () => {
    const source = input();
    const before = structuredClone(source);
    const result = buildComparison(source);
    expect(result.metadata.pue_override).toBeNull();
    expect(result.metadata.pue_defaults).toEqual({ air_cooled_chassis: 1.3, dlc_nvl72_rack: 1.1 });
    expect(result.metadata.model.assumptions.pue).toBe(1.2);
    expect(result.rows[0].pue).toBe(1.3);
    expect(result.rows[0].modeled).toMatchObject({ pue: 1.3 });
    expect(result.rows[0].assumptions).toMatchObject({ pue: 1.3 });
    expect(result.cells[0].pue).toBe(1.3);
    const overridden = buildComparison(source, 1.1);
    expect(overridden.metadata.pue_override).toBe(1.1);
    expect(overridden.rows[0]).toMatchObject({ pue: 1.1, modeled: { pue: 1.1 } });
    expect(result.rows[0].estimated_energy).toMatchObject({
      status: 'estimated',
      output_tokens: 9303,
      integration_seconds: 64.67805051803589,
      chassis_ac_j_per_output_token: 26.8855733804468,
    });
    expect(result.rows[0].measured_inputs?.gpu_j_per_output_token).toBe(12.736929);
    expect(result.rows[0].benchmark.metrics).not.toHaveProperty('power_metric_schema_version');
    expect(source).toEqual(before);
  });

  it('attributes extrapolated partial-chassis energy to the measured GPUs only', () => {
    const source = input();
    const entry = source.rows[0];
    const audit = entry.audit!;
    const perGpu = audit.metrics.avg_power_w;
    const total = perGpu * 4;
    const energy = total * audit.benchmark_window.integration_duration_s;
    const w = audit.benchmark_window;
    audit.expected_gpu_count = 4;
    audit.observed_gpu_count = 4;
    audit.metrics = {
      avg_power_w: perGpu,
      avg_total_gpu_power_w: total,
      total_gpu_energy_j: energy,
    };
    entry.benchmark.prefill_tp = 4;
    entry.benchmark.decode_tp = 4;
    Object.assign(entry.benchmark.metrics, {
      avg_total_gpu_power_w: Math.round(total * 1000) / 1000,
      total_gpu_energy_j: Math.round(energy * 1000) / 1000,
      joules_per_output_token: energy / w.total_output_tokens,
      joules_per_input_token: energy / w.total_input_tokens,
      joules_per_total_token: energy / (w.total_input_tokens + w.total_output_tokens),
      joules_per_successful_query: energy / w.completed,
    });
    const result = buildComparison(source);
    const row = result.rows[0];
    const reference = estimateChassisPower('h200', entry.benchmark.metrics.avg_power_w * 8, 1.3)!;
    expect(row.modeled).toMatchObject({
      status: 'supported',
      gpuCount: 4,
      modeledGpuCount: 8,
      chassisBasis: 'extrapolated',
      chassisAcWatts: reference.chassisAcWatts,
      deploymentAcWatts: reference.chassisAcWatts / 2,
    });
    expect(row.estimated_energy).toMatchObject({
      status: 'estimated',
      chassis_ac_j: (reference.chassisAcWatts / 2) * w.integration_duration_s,
      chassis_ac_j_per_output_token:
        ((reference.chassisAcWatts / 2) * w.integration_duration_s) / w.total_output_tokens,
    });
    expect(result.cells[0]).toMatchObject({
      modeled_chassis_ac_w_mean: reference.chassisAcWatts,
      modeled_chassis_ac_w_per_gpu_mean: reference.chassisAcWatts / 8,
      modeled_deployment_ac_w_mean: reference.chassisAcWatts / 2,
      modeled_deployment_facility_w_mean: reference.facilityWatts / 2,
      modeled_facility_w_mean: reference.facilityWatts,
    });
  });

  it.each([0, -1, Infinity, NaN, 1.5])(
    'withholds energy for invalid output denominator %s',
    (tokens) => {
      const source = input();
      source.rows[0].audit!.benchmark_window.total_output_tokens = tokens;
      expect(buildComparison(source).rows[0].estimated_energy).toEqual({
        status: 'unavailable',
        reason: 'audit-does-not-match-measured-input',
      });
    },
  );

  it('withholds energy for missing, mismatched, and invalid audit receipts', () => {
    for (const mutate of [
      (source: ComparisonInput) => {
        source.rows[0].audit = undefined;
      },
      (source: ComparisonInput) => {
        source.rows[0].audit!.power_valid = false;
      },
      (source: ComparisonInput) => {
        source.rows[0].audit!.observed_gpu_count = 4;
      },
      (source: ComparisonInput) => {
        source.rows[0].audit!.metrics.avg_total_gpu_power_w += 1;
      },
      (source: ComparisonInput) => {
        source.rows[0].audit!.benchmark_window.integration_duration_s = Infinity;
      },
      (source: ComparisonInput) => {
        source.rows[0].audit!.benchmark_window.end_time_unix += 1;
      },
      (source: ComparisonInput) => {
        source.rows[0].audit!.benchmark_window.total_output_tokens += 1;
      },
    ]) {
      const source = input();
      mutate(source);
      expect(buildComparison(source).rows[0].estimated_energy.status).toBe('unavailable');
    }
  });

  it('averages modeled replicates and leaves incomplete cell means unavailable', () => {
    const source = input();
    const second = structuredClone(source.rows[0]);
    second.id = 'second';
    second.audit = undefined;
    second.benchmark.metrics.avg_power_w = 231.009;
    second.benchmark.metrics.avg_total_gpu_power_w = 1848.074;
    source.rows.push(second);
    const result = buildComparison(source);
    expect(result.cells[0].modeled_chassis_ac_w_mean).toBe(3875.6499999999996);
    expect(result.cells[0].estimated_chassis_ac_j_per_output_token_mean).toBeNull();
    second.benchmark.metrics.power_valid = 0;
    const invalid = buildComparison(source);
    expect(invalid.rows).toHaveLength(2);
    expect(invalid.rows[1].measured_inputs).toBeNull();
    expect(invalid.rows[1].raw_input).toMatchObject({ metrics: { avg_power_w: 231.009 } });
    expect(invalid.cells[0].modeled_chassis_ac_w_mean).toBeNull();
    second.benchmark.hardware = 'b200';
    expect(() => buildComparison(source)).toThrow('different benchmark configurations');
  });

  it('routes GB200 NVL72 rows through the tray estimate with the DLC PUE and leaves x86 rows unchanged', () => {
    const source = input();
    const baseline = buildComparison(structuredClone(source));
    // One GB200 compute tray on the module basis, as the dashboard would receive it.
    const gb200 = structuredClone(source.rows[0]);
    gb200.id = 'gb200:tray';
    gb200.cell = 'gb200:c1';
    gb200.audit = undefined;
    Object.assign(gb200.benchmark, {
      hardware: 'gb200',
      framework: 'dynamo-trt',
      prefill_tp: 4,
      decode_tp: 4,
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
      metrics: {
        pp: 1,
        pcp_size: 1,
        power_valid: 1,
        power_metric_schema_version: 2,
        cpu_power_valid: 1,
        avg_power_w: 900.25,
        avg_total_gpu_power_w: 3601,
        avg_cpu_socket_power_w: 250.5,
        avg_total_cpu_power_w: 501,
        avg_total_module_power_w: 4300.75,
        total_module_energy_j: 258045,
      },
    });
    source.rows.push(gb200);
    const result = buildComparison(source);
    const rack = estimateRackPower('gb200', { basis: 'module', moduleWattsPerTray: 4300.75 }, 1.1)!;
    expect(result.rows[1]).toMatchObject({
      pue: 1.1,
      measured_basis: 'module',
      sensor_kind: 'module',
      model_path: 'human_verified/gb200_nvl72_rack/gb200_nvl72_rack_power_model.py',
      assumptions: { u_nvlink: 0.5, pue: 1.1 },
      measured_inputs: {
        avg_gpu_w: 900.25,
        cpu_power_valid: 1,
        total_grace_w: 501,
        total_module_w: 4300.75,
        total_module_j: 258045,
      },
      modeled: {
        status: 'supported',
        topologyBasis: 'nvl72-trays',
        pue: 1.1,
        chassisAcWatts: rack.rackAcWatts / 18,
        facilityWatts: rack.facilityWatts / 18,
      },
    });
    expect(result.rows[1].calculation_boundary).toContain('NVL72');
    expect(result.rows[1].extrapolation_note).toContain('tray');
    expect(result.cells[1]).toMatchObject({
      cell: 'gb200:c1',
      pue: 1.1,
      measured_bases: ['module'],
      modeled_chassis_ac_w_mean: rack.rackAcWatts / 18,
    });
    // The x86 row and its cell are byte-identical to an export without the NVL72 row.
    expect(result.rows[0]).toEqual(baseline.rows[0]);
    expect(result.cells[0]).toEqual(baseline.cells[0]);
    expect(result.rows[0].measured_inputs).not.toHaveProperty('total_module_w');
    expect(result.rows[0]).toMatchObject({ measured_basis: null, sensor_kind: null });
    // An explicit --pue still overrides every row, rack and chassis alike.
    const overridden = buildComparison(source, 1.3);
    expect(overridden.rows.map((row) => row.pue)).toEqual([1.3, 1.3]);
    expect(overridden.rows[1].modeled).toMatchObject({ pue: 1.3, topologyBasis: 'nvl72-trays' });
    // Without cpu_power_valid the row stays unavailable and reports no CPU-side inputs.
    delete gb200.benchmark.metrics.cpu_power_valid;
    const unavailable = buildComparison(source).rows[1];
    expect(unavailable.modeled).toMatchObject({ status: 'unsupported', reason: 'cpu-telemetry' });
    expect(unavailable.measured_inputs).toMatchObject({
      cpu_power_valid: null,
      total_module_w: null,
    });
  });

  it('retains unsupported hardware and missing values, and escapes CSV text', () => {
    const source = input();
    source.rows[0].benchmark.hardware = 'H200';
    expect(buildComparison(source).rows[0]).toMatchObject({
      assumptions: { u_cpu: 0.2 },
      model_path: 'human_verified/hgx_h200_chassis/h200_chassis_power_model.py',
    });
    // NVL72 rows need the schema-v2 contract; the unversioned exception is x86 single-node only.
    source.rows[0].benchmark.hardware = 'gb200';
    expect(buildComparison(source).rows[0].modeled).toMatchObject({
      status: 'unsupported',
      reason: 'telemetry',
    });
    expect(csv([{ a: null, b: 0, c: 'a,"b"\nc' }])).toBe('"a","b","c"\r\n,"0","a,""b""\nc"\r\n');
    expect(() => buildComparison({ ...source, rows: [source.rows[0], source.rows[0]] })).toThrow(
      'duplicate id',
    );
  });
});
