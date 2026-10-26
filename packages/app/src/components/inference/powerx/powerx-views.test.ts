import { describe, expect, it } from 'vitest';

import {
  energyPerFor,
  POWERX_DEFAULT_METRIC,
  powerXBoundaryFor,
  powerXCountFor,
  powerXMetricFields,
  powerXProvenanceText,
  powerXRatedAvailable,
  powerXShowAsFor,
  powerXShowsHeadroom,
  powerXViewFor,
  selectPowerXCount,
  selectPowerXPer,
  selectPowerXRated,
  selectPowerXShowAs,
  selectPowerXView,
} from './powerx-views';

describe('powerXViewFor', () => {
  it('maps every measured metric to a view so the tabs never disappear', () => {
    expect(powerXViewFor('y_measuredAvgPower', 'none')).toBe('draw');
    expect(powerXViewFor('y_measuredP90Power', 'none')).toBe('draw');
    expect(powerXViewFor('y_measuredPowerPercentTdp', 'none')).toBe('draw');
    expect(powerXViewFor('y_measuredWhPerSuccessfulQuery', 'none')).toBe('energy');
    expect(powerXViewFor(POWERX_DEFAULT_METRIC, 'none')).toBe('energy');
    expect(powerXViewFor('y_measuredPowerTimeline', 'none')).toBe('time');
    expect(powerXViewFor('y_notAPowerMetric', 'none')).toBeNull();
  });

  it('keeps a boundary overlay on its own view and sends the breakdown and role splits to Where', () => {
    expect(powerXViewFor('y_measuredJPerOutputToken', 'boundaries')).toBe('energy');
    expect(powerXViewFor('y_measuredJPerOutputToken', 'all')).toBe('energy');
    // Count: All on Power draw draws GPU only, IT and Facility on the one scatter.
    expect(powerXViewFor('y_measuredAvgPower', 'boundaries')).toBe('draw');
    expect(powerXViewFor('y_measuredAvgPower', 'all')).toBe('draw');
    expect(powerXViewFor('y_measuredAvgPower', 'breakdown')).toBe('where');
    expect(powerXViewFor('y_measuredAvgPower', 'roles')).toBe('where');
  });
});

describe('selectPowerXView', () => {
  it('switches views through metric + compare only, keeping the chosen boundary', () => {
    const energy = { metric: 'y_utilityModeledJPerOutputToken', compare: 'none' as const };
    expect(selectPowerXView('draw', energy)).toEqual({
      metric: 'y_utilityModeledWatts',
      compare: 'none',
    });
    expect(selectPowerXView('where', energy)).toEqual({
      metric: 'y_measuredAvgPower',
      compare: 'breakdown',
    });
    expect(selectPowerXView('time', energy)).toEqual({
      metric: 'y_measuredPowerTimeline',
      compare: 'none',
    });
  });

  it('returns to GPU-only energy from the Where and Over time views', () => {
    const where = { metric: 'y_measuredAvgPower', compare: 'breakdown' as const };
    expect(selectPowerXView('energy', where)).toEqual({
      metric: 'y_measuredJPerOutputToken',
      compare: 'none',
    });
    const time = { metric: 'y_measuredPowerTimeline', compare: 'none' as const };
    expect(selectPowerXView('draw', time)).toEqual({
      metric: 'y_measuredAvgPower',
      compare: 'none',
    });
  });

  it('is a no-op for the current view', () => {
    const current = { metric: 'y_measuredP75Power', compare: 'none' as const };
    expect(selectPowerXView('draw', current)).toBe(current);
  });
});

describe('Count, Per and Show as', () => {
  it('reads Count from the metric basis and the compare mode', () => {
    expect(powerXCountFor('y_measuredJPerOutputToken', 'none')).toBe('gpu');
    expect(powerXCountFor('y_itModeledWatts', 'none')).toBe('it');
    expect(powerXCountFor('y_itModeledJPerOutputToken', 'none')).toBe('it');
    expect(powerXCountFor('y_utilityModeledWatts', 'none')).toBe('system');
    expect(powerXCountFor('y_measuredJPerOutputToken', 'boundaries')).toBe('both');
    expect(powerXCountFor('y_measuredAvgPower', 'boundaries')).toBe('both');
    expect(powerXCountFor('y_measuredAvgPower', 'all')).toBe('both');
    expect(powerXBoundaryFor('y_gpuProvisionedJPerOutputToken')).toBe('system');
  });

  it('maps the IT (no PUE) Count onto the IT metrics of each view', () => {
    const draw = { metric: 'y_measuredAvgPower', compare: 'none' as const };
    expect(selectPowerXCount('it', draw)).toEqual({ metric: 'y_itModeledWatts', compare: 'none' });
    const energy = { metric: 'y_measuredJPerOutputToken', compare: 'none' as const };
    expect(selectPowerXCount('it', energy)).toEqual({
      metric: 'y_itModeledJPerOutputToken',
      compare: 'none',
    });
    // Per keeps the IT boundary on output tokens and returns to GPU for other units.
    const itEnergy = { metric: 'y_itModeledJPerOutputToken', compare: 'none' as const };
    expect(selectPowerXPer('input', itEnergy)).toEqual({
      metric: 'y_measuredJPerInputToken',
      compare: 'none',
    });
    expect(
      selectPowerXPer('output', { metric: 'y_measuredJPerInputToken', compare: 'none' }),
    ).toEqual({ metric: 'y_measuredJPerOutputToken', compare: 'none' });
    expect(powerXViewFor('y_itModeledWatts', 'none')).toBe('draw');
    expect(powerXViewFor('y_itModeledJPerOutputToken', 'none')).toBe('energy');
    expect(selectPowerXView('energy', { metric: 'y_itModeledWatts', compare: 'none' })).toEqual({
      metric: 'y_itModeledJPerOutputToken',
      compare: 'none',
    });
  });

  it('shows headroom only on Power draw as % of TDP without a comparison', () => {
    expect(powerXShowsHeadroom('y_measuredPowerPercentTdp', 'none')).toBe(true);
    expect(powerXShowsHeadroom('y_measuredPowerPercentTdp', 'boundaries')).toBe(false);
    expect(powerXShowsHeadroom('y_measuredAvgPower', 'none')).toBe(false);
  });

  it('switches boundary on the current view and overlays all three on output-token energy', () => {
    const energy = { metric: 'y_measuredJPerInputToken', compare: 'none' as const };
    expect(selectPowerXCount('system', energy)).toEqual({
      metric: 'y_utilityModeledJPerOutputToken',
      compare: 'none',
    });
    expect(selectPowerXCount('both', energy)).toEqual({
      metric: 'y_measuredJPerOutputToken',
      compare: 'boundaries',
    });
    const draw = { metric: 'y_utilityModeledWatts', compare: 'none' as const };
    expect(selectPowerXCount('gpu', draw)).toEqual({
      metric: 'y_measuredAvgPower',
      compare: 'none',
    });
  });

  it('overlays all three measured boundaries on the Power draw scatter and back', () => {
    const draw = { metric: 'y_itModeledWatts', compare: 'none' as const };
    expect(selectPowerXCount('both', draw)).toEqual({
      metric: 'y_measuredAvgPower',
      compare: 'boundaries',
    });
    const all = { metric: 'y_measuredAvgPower', compare: 'boundaries' as const };
    expect(powerXViewFor(all.metric, all.compare)).toBe('draw');
    expect(selectPowerXCount('system', all)).toEqual({
      metric: 'y_utilityModeledWatts',
      compare: 'none',
    });
  });

  it('offers the rated lines for J per output token only', () => {
    expect(powerXRatedAvailable('y_measuredJPerOutputToken')).toBe(true);
    expect(powerXRatedAvailable('y_itModeledJPerOutputToken')).toBe(true);
    // The rated bases have no W per chip series: All already draws every boundary there.
    expect(powerXRatedAvailable('y_measuredAvgPower')).toBe(false);
    expect(powerXRatedAvailable('y_measuredPowerPercentTdp')).toBe(false);
    expect(powerXRatedAvailable('y_measuredPowerTimeline')).toBe(false);
  });

  it('adds and removes only the rated lines with the Rated boundaries toggle', () => {
    const three = { metric: 'y_measuredAvgPower', compare: 'boundaries' as const };
    expect(selectPowerXRated(true, three)).toEqual({
      metric: 'y_measuredAvgPower',
      compare: 'all',
    });
    expect(selectPowerXRated(false, { ...three, compare: 'all' })).toEqual(three);
    // From a single boundary the rated lines imply the comparison; off is a no-op.
    const single = { metric: 'y_measuredAvgPower', compare: 'none' as const };
    expect(selectPowerXRated(true, single)).toEqual({
      metric: 'y_measuredAvgPower',
      compare: 'all',
    });
    expect(selectPowerXRated(false, single)).toEqual(single);
    // On the Energy view the rated lines exist per output token only.
    expect(
      selectPowerXRated(true, { metric: 'y_utilityModeledJPerOutputToken', compare: 'none' }),
    ).toEqual({ metric: 'y_measuredJPerOutputToken', compare: 'all' });
  });

  it('reads the unit from the metric, whatever its boundary or role', () => {
    expect(energyPerFor('y_measuredJPerOutputToken')).toBe('output');
    expect(energyPerFor('y_utilityModeledJPerOutputToken')).toBe('output');
    expect(energyPerFor('y_measuredPrefillJPerInputToken')).toBe('input');
    expect(energyPerFor('y_measuredJPerTotalToken')).toBe('total');
    expect(energyPerFor('y_measuredWhPerSuccessfulQuery')).toBe('query');
  });

  it('drops a boundary overlay when the unit has no whole-system basis', () => {
    const both = { metric: 'y_measuredJPerOutputToken', compare: 'boundaries' as const };
    expect(selectPowerXPer('query', both)).toEqual({
      metric: 'y_measuredWhPerSuccessfulQuery',
      compare: 'none',
    });
    const system = { metric: 'y_utilityModeledJPerOutputToken', compare: 'none' as const };
    expect(selectPowerXPer('input', system)).toEqual({
      metric: 'y_measuredJPerInputToken',
      compare: 'none',
    });
    expect(
      selectPowerXPer('output', { metric: 'y_measuredJPerInputToken', compare: 'none' }),
    ).toEqual({ metric: 'y_measuredJPerOutputToken', compare: 'none' });
  });

  it('maps Show as between W per chip and % of TDP', () => {
    expect(powerXShowAsFor('y_measuredAvgPower')).toBe('watts');
    expect(powerXShowAsFor('y_measuredPowerPercentTdp')).toBe('tdp');
    expect(selectPowerXShowAs('tdp')).toBe('y_measuredPowerPercentTdp');
    expect(selectPowerXShowAs('watts')).toBe('y_measuredAvgPower');
  });
});

describe('powerXMetricFields', () => {
  it('keeps Scope and Power statistic for GPU-only power draw', () => {
    expect(powerXMetricFields('y_measuredAvgPower', 'none')).toEqual(['scope', 'statistic']);
    expect(powerXMetricFields('y_measuredP90Power', 'none')).toEqual(['scope', 'statistic']);
    expect(powerXMetricFields('y_measuredPrefillAvgPower', 'none')).toEqual(['scope', 'statistic']);
  });

  it('keeps Scope for per-token energy, where a role has its own denominator', () => {
    expect(powerXMetricFields('y_measuredJPerOutputToken', 'none')).toEqual(['scope']);
    expect(powerXMetricFields('y_measuredJPerInputToken', 'none')).toEqual(['scope']);
    expect(powerXMetricFields('y_measuredDecodeJPerOutputToken', 'none')).toEqual(['scope']);
    expect(powerXMetricFields('y_measuredJPerTotalToken', 'none')).toEqual([]);
    expect(powerXMetricFields('y_measuredWhPerSuccessfulQuery', 'none')).toEqual([]);
  });

  it('offers nothing for comparisons, the modeled whole system and the timeline', () => {
    expect(powerXMetricFields('y_measuredAvgPower', 'boundaries')).toEqual([]);
    expect(powerXMetricFields('y_measuredAvgPower', 'breakdown')).toEqual([]);
    expect(powerXMetricFields('y_measuredAvgPower', 'roles')).toEqual([]);
    expect(powerXMetricFields('y_utilityModeledWatts', 'none')).toEqual([]);
    expect(powerXMetricFields('y_utilityModeledJPerOutputToken', 'none')).toEqual([]);
    expect(powerXMetricFields('y_measuredPowerTimeline', 'none')).toEqual([]);
  });
});

describe('powerXProvenanceText', () => {
  const revision = 'abcdef0123456789';

  it('lists points, windows, revision and PUE, in that order', () => {
    expect(
      powerXProvenanceText({ measuredPoints: 1234, powerModelRevision: revision, pue: 1.3 }),
    ).toBe(
      '1,234 measured points · validated serving windows only · power model rev abcdef0 · PUE 1.3',
    );
  });

  it('adds the sample count only when a timeline supplied one, and omits a missing PUE', () => {
    expect(
      powerXProvenanceText({
        measuredPoints: 1,
        samplesPerPoint: 6019,
        powerModelRevision: revision,
        pue: null,
      }),
    ).toBe(
      '1 measured point · ~6k 1-second GPU samples per point · validated serving windows only · power model rev abcdef0',
    );
    expect(
      powerXProvenanceText({
        measuredPoints: 2,
        samplesPerPoint: 1500,
        powerModelRevision: revision,
      }),
    ).toContain('~1.5k 1-second GPU samples per point');
    expect(
      powerXProvenanceText({ measuredPoints: 2, samplesPerPoint: 0, powerModelRevision: revision }),
    ).not.toContain('samples');
  });

  it('has a Chinese rendering', () => {
    expect(
      powerXProvenanceText(
        { measuredPoints: 12, samplesPerPoint: 420, powerModelRevision: revision, pue: 1.3 },
        'zh',
      ),
    ).toBe(
      '12 个实测数据点 · 每点约 420 个 1 秒 GPU 采样 · 仅统计通过验证的服务窗口 · 功耗模型版本 abcdef0 · PUE 1.3',
    );
  });
});
