import { describe, expect, it } from 'vitest';

import { reconstructedRoleEnergy } from './role-energy';

// A disaggregated 8K/1K run: the deployment's energy over the window divided
// by 8× more input than output tokens, so J/out ÷ J/in = 7.9 = the served ratio.
const entry = {
  disagg: true,
  power_valid: 1,
  power_metric_schema_version: 2,
  joules_per_input_token: 1,
  joules_per_output_token: 7.9,
  prefill_joules_per_input_token: 0.25,
  decode_joules_per_output_token: 6,
};

describe('reconstructedRoleEnergy', () => {
  it('expresses prefill energy per output token with the served token ratio and sums the roles', () => {
    expect(reconstructedRoleEnergy(entry)).toEqual({
      prefill: 1.975,
      decode: 6,
      total: 7.975,
      prefillShare: (100 * 1.975) / 7.975,
    });
  });

  it('returns nothing unless the row is validated schema-2 disaggregated telemetry with every role figure', () => {
    for (const overrides of [
      { disagg: false },
      { power_valid: 0 },
      { power_valid: undefined },
      { power_metric_schema_version: 1 },
      { joules_per_input_token: 0 },
      { joules_per_output_token: Number.NaN },
      { prefill_joules_per_input_token: undefined },
      { decode_joules_per_output_token: -1 },
    ]) {
      expect(reconstructedRoleEnergy({ ...entry, ...overrides })).toBeUndefined();
    }
  });
});
