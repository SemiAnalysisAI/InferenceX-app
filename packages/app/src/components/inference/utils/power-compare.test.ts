import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import {
  parsePowerCompare,
  powerCompareVariants,
  powerLineLabelSuffix,
  powerSeriesLabel,
  powerVariantLabel,
  powerVariantShortLabel,
} from './power-compare';

const ids = (metric: string, mode: 'boundaries' | 'provisioned' | 'all') =>
  powerCompareVariants(metric, mode).map((series) => series.variant.id);

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
    // The rated bounds are J per output token series only.
    expect(ids('y_measuredAvgPower', 'provisioned')).toEqual([]);
    expect(parsePowerCompare('provisioned')).toBe('provisioned');
  });

  it('adds the rated provisioned bounds when comparing all boundaries (share links only)', () => {
    const all = ids('y_measuredJPerOutputToken', 'all');
    expect(all).toEqual(
      expect.arrayContaining(['utility-modeled', 'gpu-provisioned', 'utility-provisioned']),
    );
    expect(all.length).toBeGreaterThan(ids('y_measuredJPerOutputToken', 'boundaries').length);
  });
});

describe('power variant labels on PowerX', () => {
  const gpu = { kind: 'basis', id: 'gpu-measured' } as const;
  const system = { kind: 'basis', id: 'utility-modeled' } as const;
  const itBasis = { kind: 'basis', id: 'it-modeled' } as const;
  const tdp = { kind: 'basis', id: 'gpu-provisioned' } as const;
  const decode = { kind: 'role', id: 'decode' } as const;

  it('keeps the registry names by default', () => {
    expect(powerVariantLabel(gpu, 'en')).toBe('GPU Level Measured');
    expect(powerVariantLabel(system, 'en')).toBe('All in Measured');
    expect(powerVariantLabel(system, 'zh')).toBe('整体实测功耗');
    expect(powerVariantLabel(itBasis, 'en')).toBe('All in Measured IT (no PUE)');
    expect(powerVariantLabel(itBasis, 'zh')).toBe('整体实测 IT 功耗（不含 PUE）');
  });

  it('uses the Count vocabulary for the three measured boundaries only', () => {
    expect(powerVariantLabel(gpu, 'en', 'count')).toBe('GPU only');
    expect(powerVariantLabel(itBasis, 'en', 'count')).toBe('IT (no PUE)');
    expect(powerVariantLabel(system, 'en', 'count')).toBe('Facility');
    expect(powerVariantLabel(gpu, 'zh', 'count')).toBe('仅 GPU');
    expect(powerVariantLabel(itBasis, 'zh', 'count')).toBe('IT（不含 PUE）');
    expect(powerVariantLabel(system, 'zh', 'count')).toBe('数据中心（含 PUE）');
    expect(powerVariantLabel(tdp, 'en', 'count')).toBe('GPU Level Provisioned (TDP)');
    expect(powerVariantLabel(decode, 'en', 'count')).toBe('Decode GPUs');
  });

  it('abbreviates TDP in line labels in either vocabulary', () => {
    expect(powerVariantShortLabel(tdp, 'en')).toBe('TDP');
    expect(powerVariantShortLabel(tdp, 'en', 'count')).toBe('TDP');
    expect(powerVariantShortLabel(system, 'en', 'count')).toBe('Facility');
    expect(powerLineLabelSuffix(system, { isBase: false, locale: 'en', labelStyle: 'count' })).toBe(
      ' · Facility',
    );
    expect(
      powerLineLabelSuffix(itBasis, { isBase: false, locale: 'en', labelStyle: 'count' }),
    ).toBe(' · IT (no PUE)');
    expect(powerLineLabelSuffix(system, { isBase: false, locale: 'en' })).toBe(
      ' · All in Measured',
    );
  });

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
