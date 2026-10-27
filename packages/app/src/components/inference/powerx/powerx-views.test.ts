import { describe, expect, it } from 'vitest';

import {
  energyPerFor,
  POWERX_DEFAULT_METRIC,
  powerXBoundaryFor,
  powerXChangedCount,
  powerXCountFor,
  powerXMetricFields,
  powerXRatedAvailable,
  powerXRatedOn,
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
    expect(powerXViewFor('y_measuredJPerOutputToken', 'provisioned')).toBe('energy');
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
    // The rated pair keeps the GPU-only base: Count reads GPU only.
    expect(powerXCountFor('y_measuredJPerOutputToken', 'provisioned')).toBe('gpu');
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

  it('draws only GPU measured and All in Provisioned with the Rated boundaries toggle', () => {
    // On: the GPU-only metric with the provisioned pair, whatever Count was before.
    const single = { metric: 'y_measuredJPerOutputToken', compare: 'none' as const };
    expect(selectPowerXRated(true, single)).toEqual({
      metric: 'y_measuredJPerOutputToken',
      compare: 'provisioned',
    });
    expect(
      selectPowerXRated(true, { metric: 'y_measuredJPerOutputToken', compare: 'boundaries' }),
    ).toEqual({ metric: 'y_measuredJPerOutputToken', compare: 'provisioned' });
    expect(
      selectPowerXRated(true, { metric: 'y_utilityModeledJPerOutputToken', compare: 'none' }),
    ).toEqual({ metric: 'y_measuredJPerOutputToken', compare: 'provisioned' });
    // Off: back to the single GPU-only series; a no-op when nothing rated is drawn.
    expect(selectPowerXRated(false, { ...single, compare: 'provisioned' })).toEqual(single);
    expect(selectPowerXRated(false, single)).toEqual(single);
    // The UI never sets the five-line `all`; a share link's `all` turned off keeps the measured three.
    expect(selectPowerXRated(false, { ...single, compare: 'all' })).toEqual({
      ...single,
      compare: 'boundaries',
    });
    expect(powerXRatedOn('provisioned')).toBe(true);
    expect(powerXRatedOn('all')).toBe(true);
    expect(powerXRatedOn('boundaries')).toBe(false);
    // Changing Count drops the rated pair rather than adding a third line to it.
    expect(selectPowerXCount('it', { ...single, compare: 'provisioned' })).toEqual({
      metric: 'y_itModeledJPerOutputToken',
      compare: 'none',
    });
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

describe('powerXChangedCount', () => {
  it('counts nothing on the default Energy and Power draw selections', () => {
    expect(powerXChangedCount({ metric: POWERX_DEFAULT_METRIC, compare: 'none' })).toBe(0);
    expect(powerXChangedCount({ metric: 'y_measuredAvgPower', compare: 'none' })).toBe(0);
  });

  it('counts each Energy control off its default: Count, Per, Scope and Rated boundaries', () => {
    expect(powerXChangedCount({ metric: 'y_itModeledJPerOutputToken', compare: 'none' })).toBe(1);
    expect(powerXChangedCount({ metric: 'y_measuredJPerInputToken', compare: 'none' })).toBe(1);
    expect(powerXChangedCount({ metric: 'y_measuredDecodeJPerOutputToken', compare: 'none' })).toBe(
      1,
    );
    expect(powerXChangedCount({ metric: 'y_measuredPrefillJPerInputToken', compare: 'none' })).toBe(
      2,
    );
    expect(powerXChangedCount({ metric: 'y_measuredJPerOutputToken', compare: 'boundaries' })).toBe(
      1,
    );
    // The rated pair is one change (Count stays GPU only); a share link's `all` is two.
    expect(
      powerXChangedCount({ metric: 'y_measuredJPerOutputToken', compare: 'provisioned' }),
    ).toBe(1);
    expect(powerXChangedCount({ metric: 'y_measuredJPerOutputToken', compare: 'all' })).toBe(2);
  });

  it('counts each Power draw control off its default: Count, Show as, Scope and statistic', () => {
    expect(powerXChangedCount({ metric: 'y_utilityModeledWatts', compare: 'none' })).toBe(1);
    expect(powerXChangedCount({ metric: 'y_measuredPowerPercentTdp', compare: 'none' })).toBe(1);
    expect(powerXChangedCount({ metric: 'y_measuredP90Power', compare: 'none' })).toBe(1);
    expect(powerXChangedCount({ metric: 'y_measuredPrefillAvgPower', compare: 'none' })).toBe(1);
    expect(powerXChangedCount({ metric: 'y_measuredAvgPower', compare: 'boundaries' })).toBe(1);
  });

  it('counts nothing on the Where and Over time views, whose controls sit in the card', () => {
    expect(powerXChangedCount({ metric: 'y_measuredAvgPower', compare: 'breakdown' })).toBe(0);
    expect(powerXChangedCount({ metric: 'y_measuredAvgPower', compare: 'roles' })).toBe(0);
    expect(powerXChangedCount({ metric: 'y_measuredPowerTimeline', compare: 'none' })).toBe(0);
  });
});
