import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import {
  powerCompareVariants,
  powerLineLabelSuffix,
  powerSeriesLabel,
  powerVariantLabel,
  powerVariantShortLabel,
} from './power-compare';

const ids = (metric: string, mode: 'boundaries' | 'all') =>
  powerCompareVariants(metric, mode).map((series) => series.variant.id);

describe('powerCompareVariants boundaries', () => {
  it('pairs GPU only with Whole system for the boundary compare', () => {
    expect(ids('y_measuredJPerOutputToken', 'boundaries')).toEqual(['utility-modeled']);
    expect(ids('y_measuredAvgPower', 'boundaries')).toEqual(['utility-modeled']);
  });

  it('adds the rated provisioned bounds when comparing all boundaries', () => {
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
  const tdp = { kind: 'basis', id: 'gpu-provisioned' } as const;
  const decode = { kind: 'role', id: 'decode' } as const;

  it('keeps the registry names by default', () => {
    expect(powerVariantLabel(gpu, 'en')).toBe('GPU Level Measured');
    expect(powerVariantLabel(system, 'en')).toBe('All in Measured');
    expect(powerVariantLabel(system, 'zh')).toBe('整体实测功耗');
  });

  it('uses the Count vocabulary for the two measured boundaries only', () => {
    expect(powerVariantLabel(gpu, 'en', 'count')).toBe('GPU only');
    expect(powerVariantLabel(system, 'en', 'count')).toBe('Whole system');
    expect(powerVariantLabel(gpu, 'zh', 'count')).toBe('仅 GPU');
    expect(powerVariantLabel(system, 'zh', 'count')).toBe('整体系统');
    expect(powerVariantLabel(tdp, 'en', 'count')).toBe('GPU Level Provisioned (TDP)');
    expect(powerVariantLabel(decode, 'en', 'count')).toBe('Decode GPUs');
  });

  it('abbreviates TDP in line labels in either vocabulary', () => {
    expect(powerVariantShortLabel(tdp, 'en')).toBe('TDP');
    expect(powerVariantShortLabel(tdp, 'en', 'count')).toBe('TDP');
    expect(powerVariantShortLabel(system, 'en', 'count')).toBe('Whole system');
    expect(powerLineLabelSuffix(system, { isBase: false, locale: 'en', labelStyle: 'count' })).toBe(
      ' · Whole system',
    );
    expect(powerLineLabelSuffix(system, { isBase: false, locale: 'en' })).toBe(
      ' · All in Measured',
    );
  });

  it('labels table series the same way as the legend', () => {
    const point = { powerVariant: system } as Pick<InferenceData, 'powerVariant'>;
    const base = {} as Pick<InferenceData, 'powerVariant'>;
    expect(powerSeriesLabel(point, 'y_measuredAvgPower', 'boundaries', 'en', 'count')).toBe(
      'Whole system',
    );
    expect(powerSeriesLabel(base, 'y_measuredAvgPower', 'boundaries', 'en', 'count')).toBe(
      'GPU only',
    );
    expect(powerSeriesLabel(base, 'y_measuredAvgPower', 'boundaries', 'en')).toBe(
      'GPU Level Measured',
    );
  });
});
