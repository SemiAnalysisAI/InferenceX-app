import { describe, expect, it } from 'vitest';

import {
  filterByPowerValidity,
  parsePowerValidityFilter,
  POWER_VALIDITY_FILTERS,
} from './benchmark-power-validity';

describe('parsePowerValidityFilter', () => {
  it('treats an absent param as any', () => {
    expect(parsePowerValidityFilter(null)).toBe('any');
  });

  it('accepts every listed filter value', () => {
    for (const filter of POWER_VALIDITY_FILTERS) {
      expect(parsePowerValidityFilter(filter)).toBe(filter);
    }
  });

  it('rejects unknown values', () => {
    expect(parsePowerValidityFilter('garbage')).toBeUndefined();
    expect(parsePowerValidityFilter('')).toBeUndefined();
    // `certified` is a UI display tier, not an API filter value.
    expect(parsePowerValidityFilter('certified')).toBeUndefined();
  });

  it('is case-sensitive', () => {
    expect(parsePowerValidityFilter('ANY')).toBeUndefined();
    expect(parsePowerValidityFilter('strictv2')).toBeUndefined();
  });
});

describe('filterByPowerValidity', () => {
  const validatedV2 = { id: 1, metrics: { power_valid: 1, power_metric_schema_version: 2 } };
  const validatedUnversioned = { id: 2, metrics: { power_valid: 1 } };
  const invalidated = { id: 3, metrics: { power_valid: 0, power_metric_schema_version: 2 } };
  const legacy = { id: 4, metrics: { tput_per_gpu: 100 } };
  const noMetrics = { id: 5 } as { id: number; metrics?: Record<string, unknown> };
  const rows = [validatedV2, validatedUnversioned, invalidated, legacy, noMetrics];

  it('returns every row unchanged for any', () => {
    const result = filterByPowerValidity(rows, 'any');
    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
  });

  it('keeps only explicitly validated rows for 1', () => {
    expect(filterByPowerValidity(rows, '1')).toEqual([validatedV2, validatedUnversioned]);
  });

  it('keeps only explicitly invalidated rows for 0', () => {
    expect(filterByPowerValidity(rows, '0')).toEqual([invalidated]);
  });

  it('requires a validated verdict and schema version 2 for strictV2', () => {
    expect(filterByPowerValidity(rows, 'strictV2')).toEqual([validatedV2]);
  });

  it('excludes legacy and metric-less rows from every filter except any', () => {
    for (const filter of ['1', '0', 'strictV2'] as const) {
      const surviving = filterByPowerValidity([legacy, noMetrics], filter);
      expect(surviving).toEqual([]);
    }
  });
});
