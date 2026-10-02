import { describe, expect, it } from 'vitest';

import {
  CPU_SIDE_POWER_METRIC_KEY_LIST,
  CPU_SIDE_POWER_METRIC_KEYS,
  MEASURED_POWER_METRIC_KEY_LIST,
  MEASURED_POWER_METRIC_KEYS,
  METRIC_KEYS,
  POWER_METRIC_KEYS,
} from './metric-keys';

describe('CPU_SIDE_POWER_METRIC_KEYS', () => {
  it('names exactly the NVL72 Grace-side and compute-module keys, all of them measured keys', () => {
    expect(new Set(CPU_SIDE_POWER_METRIC_KEY_LIST)).toEqual(
      new Set([
        'avg_cpu_socket_power_w',
        'avg_total_cpu_power_w',
        'total_cpu_energy_j',
        'avg_total_module_power_w',
        'total_module_energy_j',
      ]),
    );
    expect(CPU_SIDE_POWER_METRIC_KEYS.size).toBe(5);
    for (const key of CPU_SIDE_POWER_METRIC_KEYS) {
      expect(MEASURED_POWER_METRIC_KEYS.has(key)).toBe(true);
    }
    // The verdict itself is a discriminator, not a measurement.
    expect(CPU_SIDE_POWER_METRIC_KEYS.has('cpu_power_valid')).toBe(false);
  });
});

describe('MEASURED_POWER_METRIC_KEYS', () => {
  it('is a subset of METRIC_KEYS', () => {
    for (const key of MEASURED_POWER_METRIC_KEYS) {
      expect(METRIC_KEYS.has(key)).toBe(true);
    }
  });

  it('contains the published measured power / energy / telemetry keys', () => {
    expect(new Set(MEASURED_POWER_METRIC_KEY_LIST)).toEqual(
      new Set([
        'avg_power_w',
        'avg_total_gpu_power_w',
        'total_gpu_energy_j',
        'p75_power_w',
        'p75_total_gpu_power_w',
        'p90_power_w',
        'p90_total_gpu_power_w',
        'joules_per_successful_query',
        'joules_per_output_token',
        'joules_per_total_token',
        'prefill_avg_power_w',
        'decode_avg_power_w',
        'joules_per_input_token',
        'prefill_joules_per_input_token',
        'decode_joules_per_output_token',
        'avg_temp_c',
        'peak_temp_c',
        'avg_util_pct',
        'avg_mem_used_mb',
        // NVL72 Grace-side and compute-module measurements (same window as GPU energy).
        'avg_cpu_socket_power_w',
        'avg_total_cpu_power_w',
        'total_cpu_energy_j',
        'avg_total_module_power_w',
        'total_module_energy_j',
      ]),
    );
    expect(MEASURED_POWER_METRIC_KEYS.size).toBe(24);
  });

  it('never contains the contract discriminators or invalid-verdict companion fields', () => {
    // These fields describe or explain withholding; they are not measurements.
    for (const key of [
      'power_valid',
      'power_metric_schema_version',
      'cpu_power_valid',
      'power_invalid_reasons',
      'power_audit',
    ]) {
      expect(MEASURED_POWER_METRIC_KEYS.has(key)).toBe(false);
    }
  });
});

describe('POWER_METRIC_KEYS', () => {
  it('is a subset of METRIC_KEYS', () => {
    for (const key of POWER_METRIC_KEYS) {
      expect(METRIC_KEYS.has(key)).toBe(true);
    }
  });

  it('has no duplicate keys', () => {
    expect(new Set(POWER_METRIC_KEYS).size).toBe(POWER_METRIC_KEYS.length);
  });

  it('contains exactly the contract discriminators plus the measured keys', () => {
    // The public API documentation types every one of these keys on
    // BenchmarkRow.metrics, so membership changes are contract changes.
    expect(new Set(POWER_METRIC_KEYS)).toEqual(
      new Set([
        'power_valid',
        'power_metric_schema_version',
        'cpu_power_valid',
        ...MEASURED_POWER_METRIC_KEY_LIST,
      ]),
    );
    expect(POWER_METRIC_KEYS).toHaveLength(27);
  });
});
