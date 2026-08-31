import { describe, expect, it } from 'vitest';

import {
  MEASURED_POWER_METRIC_KEY_LIST,
  MEASURED_POWER_METRIC_KEYS,
  METRIC_KEYS,
} from './metric-keys';

describe('MEASURED_POWER_METRIC_KEYS', () => {
  it('is a subset of METRIC_KEYS', () => {
    for (const key of MEASURED_POWER_METRIC_KEYS) {
      expect(METRIC_KEYS.has(key)).toBe(true);
    }
  });

  it('contains exactly the 13 measured power / energy / telemetry keys', () => {
    expect(new Set(MEASURED_POWER_METRIC_KEY_LIST)).toEqual(
      new Set([
        'avg_power_w',
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
      ]),
    );
    expect(MEASURED_POWER_METRIC_KEYS.size).toBe(13);
  });

  it('never contains the contract discriminators or invalid-verdict companion fields', () => {
    // These fields describe or explain withholding; they are not measurements.
    for (const key of [
      'power_valid',
      'power_metric_schema_version',
      'power_invalid_reasons',
      'power_audit',
    ]) {
      expect(MEASURED_POWER_METRIC_KEYS.has(key)).toBe(false);
    }
  });
});
