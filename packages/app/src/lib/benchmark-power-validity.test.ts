import { describe, expect, it } from 'vitest';

import { filterByPowerValidity, parsePowerValidityFilter } from './benchmark-power-validity';

describe('parsePowerValidityFilter', () => {
  it('preserves an absent param as no filtering', () => {
    expect(parsePowerValidityFilter(null)).toBeNull();
  });

  it('accepts strictV2', () => {
    expect(parsePowerValidityFilter('strictV2')).toBe('strictV2');
  });

  it.each(['1', '0', 'any', 'certified', 'garbage', '', 'strictv2', 'strictV2 '])(
    'rejects unsupported value %j',
    (value) => {
      expect(parsePowerValidityFilter(value)).toBeUndefined();
    },
  );
});

describe('filterByPowerValidity', () => {
  const validatedV2 = { id: 1, metrics: { power_valid: 1, power_metric_schema_version: 2 } };
  const validatedUnversioned = { id: 2, metrics: { power_valid: 1 } };
  const invalidated = { id: 3, metrics: { power_valid: 0, power_metric_schema_version: 2 } };
  const legacy = { id: 4, metrics: { tput_per_gpu: 100 } };
  const noMetrics: { id: number; metrics?: Record<string, unknown> } = { id: 5 };
  const rows = [validatedV2, validatedUnversioned, invalidated, legacy, noMetrics];

  it('preserves all general benchmark rows when the parameter is omitted', () => {
    const result = filterByPowerValidity(rows, null);
    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
  });

  it('requires a validated verdict and schema version 2 for strictV2', () => {
    expect(filterByPowerValidity(rows, 'strictV2')).toEqual([validatedV2]);
  });

  it('excludes unsupported versions and malformed verdicts from strictV2', () => {
    const unsupported = [
      { metrics: { power_valid: 1, power_metric_schema_version: 1 } },
      { metrics: { power_valid: 1, power_metric_schema_version: 3 } },
      { metrics: { power_valid: '1', power_metric_schema_version: 2 } },
      { metrics: { power_valid: 1, power_metric_schema_version: '2' } },
      { metrics: { power_valid: true, power_metric_schema_version: 2 } },
    ];
    expect(filterByPowerValidity(unsupported, 'strictV2')).toEqual([]);
  });
});
