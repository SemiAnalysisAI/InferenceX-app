import { describe, expect, it } from 'bun:test';

import {
  energyPerFor,
  POWERX_DEFAULT_METRIC,
  powerXBoundaryFor,
  powerXChangedCount,
  powerXCountFor,
  powerXMetricFields,
  powerXRatedOn,
  powerXViewFor,
  selectPowerXCount,
  selectPowerXPer,
  selectPowerXRated,
  selectPowerXView,
} from './powerx-views';

describe('powerXViewFor', () => {
  it('maps every measured metric to a view so the tabs never disappear', () => {
    expect(powerXViewFor('y_measuredAvgPower', 'none')).toBe('power');
    expect(powerXViewFor('y_measuredP90Power', 'none')).toBe('power');
    expect(powerXViewFor('y_measuredPowerPercentTdp', 'none')).toBe('power');
    expect(powerXViewFor('y_measuredWhPerSuccessfulQuery', 'none')).toBe('energy');
    expect(powerXViewFor(POWERX_DEFAULT_METRIC, 'none')).toBe('energy');
    expect(powerXViewFor('y_measuredPowerTimeline', 'none')).toBe('time');
    expect(powerXViewFor('y_notAPowerMetric', 'none')).toBeNull();
  });
});

describe('selectPowerXView', () => {
  it('switches views through metric + compare only, keeping the chosen boundary', () => {
    const energy = { metric: 'y_utilityModeledJPerOutputToken', compare: 'none' as const };
    expect(selectPowerXView('power', energy)).toEqual({
      metric: 'y_utilityModeledWatts',
      compare: 'none',
    });
    expect(selectPowerXView('breakdown', energy)).toEqual({
      metric: 'y_measuredAvgPower',
      compare: 'breakdown',
    });
    expect(selectPowerXView('time', energy)).toEqual({
      metric: 'y_measuredPowerTimeline',
      compare: 'none',
    });
  });

  it('opens the Energy view on J per total token, on the boundary the chart already shows', () => {
    expect(POWERX_DEFAULT_METRIC).toBe('y_measuredJPerTotalToken');
    expect(selectPowerXView('energy', { metric: 'y_itModeledWatts', compare: 'none' })).toEqual({
      metric: 'y_itModeledJPerTotalToken',
      compare: 'none',
    });
    expect(selectPowerXView('energy', { metric: 'y_measuredAvgPower', compare: 'none' })).toEqual({
      metric: 'y_measuredJPerTotalToken',
      compare: 'none',
    });
  });
});

describe('Boundary, Energy per and Show as', () => {
  it('reads Boundary from the metric basis and the compare mode', () => {
    expect(powerXCountFor('y_measuredJPerOutputToken', 'none')).toBe('gpu');
    expect(powerXCountFor('y_itModeledWatts', 'none')).toBe('it');
    expect(powerXCountFor('y_itModeledJPerOutputToken', 'none')).toBe('it');
    expect(powerXCountFor('y_utilityModeledWatts', 'none')).toBe('system');
    expect(powerXCountFor('y_measuredJPerOutputToken', 'boundaries')).toBe('both');
    expect(powerXCountFor('y_measuredAvgPower', 'boundaries')).toBe('both');
    expect(powerXCountFor('y_measuredAvgPower', 'all')).toBe('both');
    // The rated pair keeps the GPU-only base: Boundary reads GPU only.
    expect(powerXCountFor('y_measuredJPerOutputToken', 'provisioned')).toBe('gpu');
    expect(powerXBoundaryFor('y_gpuProvisionedJPerOutputToken')).toBe('system');
  });

  it('switches boundary on the current view and overlays all three on the per-token unit', () => {
    const energy = { metric: 'y_measuredJPerInputToken', compare: 'none' as const };
    expect(selectPowerXCount('system', energy)).toEqual({
      metric: 'y_utilityModeledJPerTotalToken',
      compare: 'none',
    });
    expect(selectPowerXCount('both', energy)).toEqual({
      metric: 'y_measuredJPerTotalToken',
      compare: 'boundaries',
    });
    const output = { metric: 'y_measuredJPerOutputToken', compare: 'none' as const };
    expect(selectPowerXCount('it', output)).toEqual({
      metric: 'y_itModeledJPerOutputToken',
      compare: 'none',
    });
    expect(selectPowerXCount('both', output)).toEqual({
      metric: 'y_measuredJPerOutputToken',
      compare: 'boundaries',
    });
    expect(
      selectPowerXCount('gpu', { metric: 'y_utilityModeledJPerTotalToken', compare: 'none' }),
    ).toEqual({ metric: 'y_measuredJPerTotalToken', compare: 'none' });
    const draw = { metric: 'y_utilityModeledWatts', compare: 'none' as const };
    expect(selectPowerXCount('gpu', draw)).toEqual({
      metric: 'y_measuredAvgPower',
      compare: 'none',
    });
  });

  it('draws only GPU measured and All in Provisioned with the Provisioned bound toggle', () => {
    // On: the GPU-only metric with the provisioned pair, whatever Boundary was before.
    const single = { metric: 'y_measuredJPerTotalToken', compare: 'none' as const };
    expect(selectPowerXRated(true, single)).toEqual({
      metric: 'y_measuredJPerTotalToken',
      compare: 'provisioned',
    });
    expect(
      selectPowerXRated(true, { metric: 'y_measuredJPerTotalToken', compare: 'boundaries' }),
    ).toEqual({ metric: 'y_measuredJPerTotalToken', compare: 'provisioned' });
    expect(
      selectPowerXRated(true, { metric: 'y_utilityModeledJPerOutputToken', compare: 'none' }),
    ).toEqual({ metric: 'y_measuredJPerOutputToken', compare: 'provisioned' });
    expect(
      selectPowerXRated(true, { metric: 'y_measuredWhPerSuccessfulQuery', compare: 'none' }),
    ).toEqual({ metric: 'y_measuredJPerTotalToken', compare: 'provisioned' });
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
    // Changing Boundary drops the rated pair rather than adding a third line to it.
    expect(selectPowerXCount('it', { ...single, compare: 'provisioned' })).toEqual({
      metric: 'y_itModeledJPerTotalToken',
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

  it('keeps the boundary and the overlay between all tokens and output tokens', () => {
    expect(
      selectPowerXPer('output', { metric: 'y_utilityModeledJPerTotalToken', compare: 'none' }),
    ).toEqual({ metric: 'y_utilityModeledJPerOutputToken', compare: 'none' });
    expect(
      selectPowerXPer('total', { metric: 'y_itModeledJPerOutputToken', compare: 'none' }),
    ).toEqual({ metric: 'y_itModeledJPerTotalToken', compare: 'none' });
    expect(
      selectPowerXPer('total', { metric: 'y_measuredJPerOutputToken', compare: 'boundaries' }),
    ).toEqual({ metric: 'y_measuredJPerTotalToken', compare: 'boundaries' });
    expect(
      selectPowerXPer('output', { metric: 'y_measuredJPerTotalToken', compare: 'provisioned' }),
    ).toEqual({ metric: 'y_measuredJPerOutputToken', compare: 'provisioned' });
  });
});

describe('powerXMetricFields', () => {
  it('drops Scope for per-token energy now that GPU role picks the pools', () => {
    expect(powerXMetricFields('y_measuredJPerOutputToken', 'none')).toEqual([]);
    expect(powerXMetricFields('y_measuredJPerInputToken', 'none')).toEqual([]);
    expect(powerXMetricFields('y_measuredJPerTotalToken', 'none')).toEqual([]);
    expect(powerXMetricFields('y_measuredWhPerSuccessfulQuery', 'none')).toEqual([]);
  });
});

describe('powerXChangedCount', () => {
  it('counts nothing on the default Energy and Power draw selections', () => {
    expect(powerXChangedCount({ metric: POWERX_DEFAULT_METRIC, compare: 'none' })).toBe(0);
    expect(powerXChangedCount({ metric: 'y_measuredAvgPower', compare: 'none' })).toBe(0);
  });

  it('counts each Energy control off its default: Boundary, Energy per, Scope and Provisioned bound', () => {
    expect(powerXChangedCount({ metric: 'y_itModeledJPerTotalToken', compare: 'none' })).toBe(1);
    expect(powerXChangedCount({ metric: 'y_measuredJPerOutputToken', compare: 'none' })).toBe(1);
    expect(powerXChangedCount({ metric: 'y_measuredJPerInputToken', compare: 'none' })).toBe(1);
    expect(powerXChangedCount({ metric: 'y_measuredDecodeJPerOutputToken', compare: 'none' })).toBe(
      2,
    );
    expect(powerXChangedCount({ metric: 'y_measuredPrefillJPerInputToken', compare: 'none' })).toBe(
      2,
    );
    expect(powerXChangedCount({ metric: 'y_measuredJPerTotalToken', compare: 'boundaries' })).toBe(
      1,
    );
    // The rated pair is one change (Boundary stays GPU only); a share link's `all` is two.
    expect(powerXChangedCount({ metric: 'y_measuredJPerTotalToken', compare: 'provisioned' })).toBe(
      1,
    );
    expect(powerXChangedCount({ metric: 'y_measuredJPerTotalToken', compare: 'all' })).toBe(2);
  });
});
