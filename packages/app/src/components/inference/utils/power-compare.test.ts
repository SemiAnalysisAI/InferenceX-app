import { describe, expect, it } from 'vitest';

import type {
  InferenceData,
  PowerBasis,
  PowerRole,
  PowerVariant,
} from '@/components/inference/types';

import {
  expandPowerCompareSeries,
  flatSeriesValue,
  formatWatts,
  inferPowerCompare,
  lineLabelHardwareKey,
  lineLabelSeriesId,
  metricPlotsWatts,
  parsePowerCompare,
  powerCompareAvailable,
  powerCompareBase,
  powerCompareVariants,
  powerLineLabel,
  powerLineLabelSuffix,
  powerSeriesLabel,
  powerVariantDash,
  powerVariantLabel,
  powerVariantShortLabel,
  powerVariantsInData,
} from './power-compare';

const metric = (y: number) => ({ y, roof: false });

function point(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    x: 50,
    y: 600,
    hwKey: 'b200_sglang',
    precision: 'fp8',
    tp: 8,
    conc: 64,
    disagg: true,
    measuredAvgPower: metric(600),
    measuredPrefillAvgPower: metric(400),
    measuredDecodeAvgPower: metric(700),
    gpuProvisionedWatts: metric(1000),
    utilityProvisionedWatts: metric(1710),
    measuredJPerOutputToken: metric(7.9),
    measuredDecodeJPerOutputToken: metric(6),
    reconstructedPrefillJPerOutputToken: metric(1.975),
    gpuProvisionedJPerOutputToken: metric(12),
    ...overrides,
  } as InferenceData;
}

describe('powerCompareVariants', () => {
  it('adds the other three boundaries on the whole-deployment average watts and J per output token', () => {
    expect(powerCompareVariants('y_measuredAvgPower', 'boundaries')).toEqual([
      { variant: { kind: 'basis', id: 'gpu-provisioned' }, field: 'gpuProvisionedWatts' },
      { variant: { kind: 'basis', id: 'utility-provisioned' }, field: 'utilityProvisionedWatts' },
      { variant: { kind: 'basis', id: 'utility-modeled' }, field: 'utilityModeledWatts' },
    ]);
    // Selecting a derived boundary makes GPU measured one of the siblings.
    expect(
      powerCompareVariants('y_utilityProvisionedJPerOutputToken', 'boundaries').map(
        (series) => series.field,
      ),
    ).toEqual([
      'measuredJPerOutputToken',
      'gpuProvisionedJPerOutputToken',
      'utilityModeledJPerOutputToken',
    ]);
    expect(powerCompareBase('y_gpuProvisionedWatts', 'boundaries')).toEqual({
      kind: 'basis',
      id: 'gpu-provisioned',
    });
  });

  it('adds the other worker roles, carrying prefill energy onto the output-token axis', () => {
    expect(powerCompareVariants('y_measuredAvgPower', 'roles')).toEqual([
      { variant: { kind: 'role', id: 'prefill' }, field: 'measuredPrefillAvgPower' },
      { variant: { kind: 'role', id: 'decode' }, field: 'measuredDecodeAvgPower' },
    ]);
    expect(powerCompareVariants('y_measuredDecodeAvgPower', 'roles')).toEqual([
      { variant: { kind: 'role', id: 'all' }, field: 'measuredAvgPower' },
      { variant: { kind: 'role', id: 'prefill' }, field: 'measuredPrefillAvgPower' },
    ]);
    expect(powerCompareVariants('y_measuredJPerOutputToken', 'roles')).toEqual([
      { variant: { kind: 'role', id: 'prefill' }, field: 'reconstructedPrefillJPerOutputToken' },
      { variant: { kind: 'role', id: 'decode' }, field: 'measuredDecodeJPerOutputToken' },
    ]);
    expect(powerCompareBase('y_measuredDecodeJPerOutputToken', 'roles')).toEqual({
      kind: 'role',
      id: 'decode',
    });
  });

  it('offers nothing where the metric has no common axis for the siblings', () => {
    for (const [key, mode] of [
      ['y_measuredP90Power', 'boundaries'],
      ['y_measuredPowerPercentTdp', 'boundaries'],
      ['y_measuredPowerTimeline', 'roles'],
      ['y_measuredJPerInputToken', 'boundaries'],
      ['y_measuredPrefillJPerInputToken', 'roles'],
      ['y_measuredJPerSuccessfulQuery', 'roles'],
      ['y_gpuProvisionedWatts', 'roles'],
      ['y_tpPerGpu', 'boundaries'],
    ] as const) {
      expect(powerCompareVariants(key, mode)).toEqual([]);
      expect(powerCompareBase(key, mode)).toBeNull();
      expect(powerCompareAvailable(key, mode)).toBe(false);
    }
    expect(powerCompareAvailable('y_measuredP90Power', 'none')).toBe(true);
    expect(powerCompareVariants('y_measuredAvgPower', 'none')).toEqual([]);
  });
});

describe('expandPowerCompareSeries', () => {
  it('clones each base point once per sibling that has a value and leaves the base untouched', () => {
    const base = point();
    const expanded = expandPowerCompareSeries([base], 'y_measuredAvgPower', 'boundaries');
    expect(expanded[0]).toBe(base);
    expect(expanded.slice(1).map((p) => [p.powerVariant?.id, p.y])).toEqual([
      ['gpu-provisioned', 1000],
      ['utility-provisioned', 1710],
    ]);
    // No modeled watts on this point → no utility-modeled clone, never a 0.
    expect(expanded.some((p) => p.powerVariant?.id === 'utility-modeled')).toBe(false);
    expect(expanded.slice(1).every((p) => p.hwKey === 'b200_sglang' && p.x === 50)).toBe(true);
  });

  it('stacks the reconstructed prefill energy against the decode pool on the energy axis', () => {
    const expanded = expandPowerCompareSeries(
      [point({ y: 7.9 })],
      'y_measuredJPerOutputToken',
      'roles',
    );
    expect(expanded.map((p) => [p.powerVariant?.id ?? 'base', p.y])).toEqual([
      ['base', 7.9],
      ['prefill', 1.975],
      ['decode', 6],
    ]);
    expect(inferPowerCompare(expanded)).toBe('roles');
    expect(powerVariantsInData(expanded, 'y_measuredJPerOutputToken')).toEqual([
      { kind: 'role', id: 'all' },
      { kind: 'role', id: 'prefill' },
      { kind: 'role', id: 'decode' },
    ]);
  });

  it('returns the points unchanged when the mode is off or inapplicable', () => {
    const base = point();
    expect(expandPowerCompareSeries([base], 'y_measuredAvgPower', 'none')).toEqual([base]);
    expect(expandPowerCompareSeries([base], 'y_measuredP90Power', 'boundaries')).toEqual([base]);
    expect(inferPowerCompare([base])).toBe('none');
    expect(powerVariantsInData([base], 'y_measuredAvgPower')).toEqual([]);
  });
});

describe('labels, dashes and URL values', () => {
  it('parses only the two comparison modes from the URL', () => {
    expect(parsePowerCompare('boundaries')).toBe('boundaries');
    expect(parsePowerCompare('roles')).toBe('roles');
    for (const value of ['', 'none', 'basis', null, undefined]) {
      expect(parsePowerCompare(value)).toBe('none');
    }
  });

  it('names series in both locales and keeps the base series solid', () => {
    expect(powerVariantLabel({ kind: 'basis', id: 'gpu-provisioned' }, 'en')).toBe(
      'GPU provisioned (TDP)',
    );
    expect(powerVariantLabel({ kind: 'role', id: 'prefill' }, 'zh')).toBe('预填充 GPU');
    expect(powerVariantDash(undefined)).toBe('');
    expect(powerVariantDash({ kind: 'role', id: 'all' })).toBe('');
    expect(powerVariantDash({ kind: 'basis', id: 'gpu-provisioned' })).not.toBe('');
    expect(powerVariantDash({ kind: 'role', id: 'decode' })).not.toBe(
      powerVariantDash({ kind: 'role', id: 'prefill' }),
    );
  });

  it('labels a base row by the selected metric and a clone by its variant', () => {
    expect(powerSeriesLabel({}, 'y_measuredAvgPower', 'boundaries', 'en')).toBe('GPU measured');
    expect(
      powerSeriesLabel(
        { powerVariant: { kind: 'basis', id: 'utility-modeled' } },
        'y_measuredAvgPower',
        'boundaries',
        'zh',
      ),
    ).toBe('数据中心建模（含 PUE）');
    expect(powerSeriesLabel({}, 'y_measuredAvgPower', 'none', 'en')).toBe('');
  });
});

const basis = (id: PowerBasis): PowerVariant => ({ kind: 'basis', id });
const role = (id: PowerRole): PowerVariant => ({ kind: 'role', id });

describe('line labels', () => {
  it('names every variant briefly in both locales', () => {
    const cases: [PowerVariant, string, string][] = [
      [basis('gpu-measured'), 'Measured', '实测'],
      [basis('gpu-provisioned'), 'TDP', 'TDP'],
      [basis('utility-provisioned'), 'All-in', '全站'],
      [basis('utility-modeled'), 'PUE modeled', 'PUE 建模'],
      [role('all'), 'All GPUs', '全部 GPU'],
      [role('prefill'), 'Prefill GPUs', '预填充 GPU'],
      [role('decode'), 'Decode GPUs', '解码 GPU'],
    ];
    for (const [variant, en, zh] of cases) {
      expect(powerVariantShortLabel(variant, 'en')).toBe(en);
      expect(powerVariantShortLabel(variant, 'zh')).toBe(zh);
    }
  });

  it('formats watts as integer W below 1 kW and trimmed two-decimal kW above', () => {
    expect(formatWatts(700)).toBe('700 W');
    expect(formatWatts(999.6)).toBe('1000 W');
    expect(formatWatts(1000)).toBe('1 kW');
    expect(formatWatts(1200)).toBe('1.2 kW');
    expect(formatWatts(1370)).toBe('1.37 kW');
    expect(formatWatts(1400)).toBe('1.4 kW');
    expect(formatWatts(1714.5)).toBe('1.71 kW');
    expect(formatWatts(19200)).toBe('19.2 kW');
    expect(formatWatts(100000)).toBe('100 kW');
  });

  it('leaves the base label alone and suffixes a sibling with its variant and flat watts', () => {
    const label = 'B300 (SGLang)';
    const tdp = basis('gpu-provisioned');
    expect(powerLineLabel(label, undefined, { isBase: true, locale: 'en' })).toBe(label);
    expect(powerLineLabel(label, null, { isBase: false, locale: 'en' })).toBe(label);
    // A variant that is itself the base series keeps the plain label.
    expect(powerLineLabel(label, tdp, { isBase: true, locale: 'en', flatWatts: 1200 })).toBe(label);
    expect(powerLineLabel(label, tdp, { isBase: false, locale: 'en' })).toBe('B300 (SGLang) · TDP');
    expect(powerLineLabel(label, tdp, { isBase: false, locale: 'en', flatWatts: 700 })).toBe(
      'B300 (SGLang) · TDP 700 W',
    );
    expect(powerLineLabel(label, tdp, { isBase: false, locale: 'en', flatWatts: 1370 })).toBe(
      'B300 (SGLang) · TDP 1.37 kW',
    );
    expect(
      powerLineLabel(label, basis('utility-provisioned'), {
        isBase: false,
        locale: 'zh',
        flatWatts: 19200,
      }),
    ).toBe('B300 (SGLang) · 全站 19.2 kW');
    // Non-finite or null watts drop the value, never print NaN.
    expect(powerLineLabel(label, tdp, { isBase: false, locale: 'en', flatWatts: null })).toBe(
      'B300 (SGLang) · TDP',
    );
    expect(powerLineLabel(label, tdp, { isBase: false, locale: 'en', flatWatts: NaN })).toBe(
      'B300 (SGLang) · TDP',
    );
    expect(powerLineLabel(label, role('decode'), { isBase: false, locale: 'en' })).toBe(
      'B300 (SGLang) · Decode GPUs',
    );
    // The suffix alone is what the renderer splits into its own text segment.
    expect(powerLineLabelSuffix(role('prefill'), { isBase: false, locale: 'zh' })).toBe(
      ' · 预填充 GPU',
    );
    expect(powerLineLabelSuffix(role('prefill'), { isBase: true, locale: 'zh' })).toBe('');
  });

  it('detects a flat series within the relative tolerance', () => {
    expect(flatSeriesValue([1200, 1200, 1200])).toBe(1200);
    expect(flatSeriesValue([1000, 1004, 996])).toBe(1000);
    expect(flatSeriesValue([1000, 1005])).toBe(1000);
    expect(flatSeriesValue([1000, 1005.01])).toBeNull();
    expect(flatSeriesValue([1000, 1005.01], 0.01)).toBe(1000);
    expect(flatSeriesValue([600, 640, 710])).toBeNull();
    expect(flatSeriesValue([])).toBeNull();
    expect(flatSeriesValue([NaN, Infinity])).toBeNull();
    expect(flatSeriesValue([NaN, 1200, 1200])).toBe(1200);
    expect(flatSeriesValue([1200])).toBe(1200);
  });

  it('keeps the hardware key as the base series id and recovers it from a sibling id', () => {
    const tdp = basis('gpu-provisioned');
    expect(lineLabelSeriesId('b200_sglang', undefined, true)).toBe('b200_sglang');
    expect(lineLabelSeriesId('b200_sglang', tdp, true)).toBe('b200_sglang');
    expect(lineLabelSeriesId('b200_sglang', tdp, false)).toBe('b200_sglang::gpu-provisioned');
    expect(lineLabelHardwareKey('b200_sglang::gpu-provisioned')).toBe('b200_sglang');
    expect(lineLabelHardwareKey('b200_sglang')).toBe('b200_sglang');
  });

  it('only lets a watts axis state a flat boundary value', () => {
    expect(metricPlotsWatts('y_measuredAvgPower')).toBe(true);
    expect(metricPlotsWatts('y_gpuProvisionedWatts')).toBe(true);
    expect(metricPlotsWatts('y_measuredDecodeAvgPower')).toBe(true);
    expect(metricPlotsWatts('y_measuredPowerPercentTdp')).toBe(false);
    expect(metricPlotsWatts('y_measuredJPerOutputToken')).toBe(false);
    expect(metricPlotsWatts('y_tpPerGpu')).toBe(false);
  });
});
