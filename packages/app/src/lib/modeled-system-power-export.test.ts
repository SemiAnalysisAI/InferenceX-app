import { describe, expect, it } from 'vitest';

import {
  buildComparison,
  csv,
  type ComparisonInput,
} from '../../scripts/export-modeled-system-power';
import { estimateChassisPower } from '@/lib/system-power-model';

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
    const reference = estimateChassisPower('h200', entry.benchmark.metrics.avg_power_w * 8)!;
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

  it('retains unsupported hardware and missing values, and escapes CSV text', () => {
    const source = input();
    source.rows[0].benchmark.hardware = 'H200';
    expect(buildComparison(source).rows[0]).toMatchObject({
      assumptions: { u_cpu: 0.2 },
      model_path: 'human_verified/hgx_h200_chassis/h200_chassis_power_model.py',
    });
    source.rows[0].benchmark.hardware = 'gb200';
    expect(buildComparison(source).rows[0].modeled).toMatchObject({
      status: 'unsupported',
      reason: 'hardware',
    });
    expect(csv([{ a: null, b: 0, c: 'a,"b"\nc' }])).toBe('"a","b","c"\r\n,"0","a,""b""\nc"\r\n');
    expect(() => buildComparison({ ...source, rows: [source.rows[0], source.rows[0]] })).toThrow(
      'duplicate id',
    );
  });
});
