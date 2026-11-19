import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import {
  parsePowerCompare,
  powerCompareAvailable,
  powerCompareVariants,
  powerSeriesLabel,
} from './power-compare';

const ids = (metric: string, mode: 'boundaries' | 'provisioned' | 'all') =>
  powerCompareVariants(metric, mode).map((series) => series.variant.id);

describe('power comparison on J per total token', () => {
  it('draws the measured boundaries and the rated bound on total-token fields', () => {
    expect(powerCompareVariants('y_measuredJPerTotalToken', 'boundaries')).toEqual([
      { variant: { kind: 'basis', id: 'it-modeled' }, field: 'itModeledJPerTotalToken' },
      { variant: { kind: 'basis', id: 'utility-modeled' }, field: 'utilityModeledJPerTotalToken' },
    ]);
    expect(
      powerCompareVariants('y_measuredJPerTotalToken', 'provisioned').map(({ field }) => field),
    ).toEqual(['utilityProvisionedJPerTotalToken']);
    expect(
      powerCompareVariants('y_utilityModeledJPerTotalToken', 'all').map(({ field }) => field),
    ).toEqual([
      'measuredJPerTotalToken',
      'gpuProvisionedJPerTotalToken',
      'utilityProvisionedJPerTotalToken',
      'itModeledJPerTotalToken',
    ]);
  });

  it('offers no role comparison, which is defined on output tokens only', () => {
    expect(powerCompareVariants('y_measuredJPerTotalToken', 'roles')).toEqual([]);
    expect(powerCompareAvailable('y_measuredJPerTotalToken', 'roles')).toBe(false);
  });
});

describe('powerCompareVariants boundaries', () => {
  it('draws GPU only, IT (no PUE) and Facility for the boundary compare', () => {
    expect(ids('y_measuredJPerOutputToken', 'boundaries')).toEqual([
      'it-modeled',
      'utility-modeled',
    ]);
    expect(ids('y_measuredAvgPower', 'boundaries')).toEqual(['it-modeled', 'utility-modeled']);
    expect(ids('y_itModeledWatts', 'boundaries')).toEqual(['gpu-measured', 'utility-modeled']);
    expect(
      powerCompareVariants('y_measuredAvgPower', 'boundaries').map((series) => series.field),
    ).toEqual(['itModeledWatts', 'utilityModeledWatts']);
    // A share link's `all` adds the rated provisioned bounds.
    expect(ids('y_measuredJPerOutputToken', 'all')).toEqual(
      expect.arrayContaining(['utility-modeled', 'gpu-provisioned', 'utility-provisioned']),
    );
  });

  it('pairs measured GPU power with the all-in provisioned bound only, for the Rated boundaries toggle', () => {
    expect(ids('y_measuredJPerOutputToken', 'provisioned')).toEqual(['utility-provisioned']);
    expect(
      powerCompareVariants('y_measuredJPerOutputToken', 'provisioned').map(
        (series) => series.field,
      ),
    ).toEqual(['utilityProvisionedJPerOutputToken']);
    // No GPU-level TDP line, no IT, no Facility.
    expect(ids('y_measuredJPerOutputToken', 'provisioned')).not.toContain('gpu-provisioned');
    // The rated bounds are per-token energy series only.
    expect(ids('y_measuredAvgPower', 'provisioned')).toEqual([]);
    expect(parsePowerCompare('provisioned')).toBe('provisioned');
  });
});

describe('power variant labels on PowerX', () => {
  const system = { kind: 'basis', id: 'utility-modeled' } as const;
  const itBasis = { kind: 'basis', id: 'it-modeled' } as const;

  it('labels table series the same way as the legend', () => {
    const point = { powerVariant: system } as Pick<InferenceData, 'powerVariant'>;
    const base = {} as Pick<InferenceData, 'powerVariant'>;
    expect(powerSeriesLabel(point, 'y_measuredAvgPower', 'boundaries', 'en', 'count')).toBe(
      'Facility',
    );
    const itPoint = { powerVariant: itBasis } as Pick<InferenceData, 'powerVariant'>;
    expect(powerSeriesLabel(itPoint, 'y_measuredAvgPower', 'boundaries', 'en', 'count')).toBe(
      'IT (no PUE)',
    );
    expect(powerSeriesLabel(itPoint, 'y_measuredAvgPower', 'boundaries', 'en')).toBe(
      'All in Measured IT (no PUE)',
    );
    expect(powerSeriesLabel(base, 'y_measuredAvgPower', 'boundaries', 'en', 'count')).toBe(
      'GPU only',
    );
    expect(powerSeriesLabel(base, 'y_measuredAvgPower', 'boundaries', 'en')).toBe(
      'GPU Level Measured',
    );
  });
});
