import { describe, expect, it } from 'vitest';

import {
  buildAppliedCustomGpuValues,
  buildDefaultCustomGpuValues,
  didCustomGpuPanelFiltersChange,
  validateCustomGpuValueInput,
  type CustomGpuPanelFilters,
} from '@/components/inference/ui/custom-gpu-value-panel-utils';

const baseFilters: CustomGpuPanelFilters = {
  model: 'llama-3-1-8b',
  sequence: '128-128',
  precisions: ['fp8'],
  yAxisMetric: 'tok/sec',
};

describe('validateCustomGpuValueInput', () => {
  it('accepts blank and zero values, and rejects invalid or negative values', () => {
    expect(validateCustomGpuValueInput('')).toBe('');
    expect(validateCustomGpuValueInput('   ')).toBe('');
    expect(validateCustomGpuValueInput('0')).toBe('');
    expect(validateCustomGpuValueInput('wat')).toBe('Must be a valid number');
    expect(validateCustomGpuValueInput('-1')).toBe('Must be a non-negative number');
  });
});

describe('didCustomGpuPanelFiltersChange', () => {
  it('returns false when filter values are unchanged', () => {
    expect(didCustomGpuPanelFiltersChange(baseFilters, { ...baseFilters })).toBe(false);
  });

  it('returns true when a filter dimension changes', () => {
    expect(
      didCustomGpuPanelFiltersChange(baseFilters, {
        ...baseFilters,
        sequence: '2048-2048',
      }),
    ).toBe(true);
  });
});

describe('buildDefaultCustomGpuValues', () => {
  it('builds numeric and string defaults from the selected GPU metric', () => {
    expect(
      buildDefaultCustomGpuValues(
        [
          { base: 'h100', specs: { power: 0.73 } },
          { base: 'b200', specs: { power: 1.2 } },
        ],
        (specs) => specs.power,
      ),
    ).toEqual({
      defaultValues: { h100: '0.73', b200: '1.2' },
      numericDefaults: { h100: 0.73, b200: 1.2 },
    });
  });
});

describe('buildAppliedCustomGpuValues', () => {
  it('keeps zero values and omits blank entries only', () => {
    expect(
      buildAppliedCustomGpuValues([{ base: 'h100' }, { base: 'b200' }, { base: 'gb200' }], {
        h100: '',
        b200: '0',
        gb200: 2.5,
      }),
    ).toEqual({
      b200: 0,
      gb200: 2.5,
    });
  });
});
