import { describe, expect, it } from 'vitest';

import {
  MEASURED_ENERGY_METRIC_CONFIG_KEYS,
  METRIC_CONFIG_KEYS,
  POWER_BASIS_METRIC_CONFIG_KEYS,
} from './metric-registry';
import { POWER_BASES } from '@/lib/power-basis';
import {
  changeMeasuredMetricConfig,
  getMeasuredMetricConfig,
  MEASURED_METRIC_DEFAULTS,
} from './measured-metric-config';

describe('measured metric configuration', () => {
  it.each(MEASURED_ENERGY_METRIC_CONFIG_KEYS)(
    'round-trips the existing share-link metric %s',
    (key) => {
      const config = getMeasuredMetricConfig(key);
      expect(config).toBeDefined();
      expect(changeMeasuredMetricConfig(key, {})).toBe(key);
      expect(changeMeasuredMetricConfig('y_tpPerGpu', config!)).toBe(key);
    },
  );

  it.each(POWER_BASIS_METRIC_CONFIG_KEYS)('round-trips the power-boundary metric %s', (key) => {
    const config = getMeasuredMetricConfig(key);
    expect(config).toBeDefined();
    expect(config?.basis).not.toBe('gpu-measured');
    expect(changeMeasuredMetricConfig(key, {})).toBe(key);
    expect(changeMeasuredMetricConfig('y_tpPerGpu', config!)).toBe(key);
  });

  it('does not group unrelated metrics or unknown persisted values', () => {
    const grouped = METRIC_CONFIG_KEYS.filter((key) => getMeasuredMetricConfig(key));
    expect(grouped).toHaveLength(20);
    expect(new Set(grouped)).toEqual(
      new Set([...MEASURED_ENERGY_METRIC_CONFIG_KEYS, ...POWER_BASIS_METRIC_CONFIG_KEYS]),
    );
    for (const key of MEASURED_ENERGY_METRIC_CONFIG_KEYS) {
      expect(getMeasuredMetricConfig(key)?.basis, key).toBe('gpu-measured');
    }
    expect(getMeasuredMetricConfig('y_modeledChassisPowerPerGpu')).toBeUndefined();
    expect(getMeasuredMetricConfig('y_removedMetric')).toBeUndefined();
    expect(getMeasuredMetricConfig('')).toBeUndefined();
  });

  it('starts newly selected families at whole-deployment average power or output energy', () => {
    expect(changeMeasuredMetricConfig('y_tokensPerDollarH', { family: 'power' })).toBe(
      MEASURED_METRIC_DEFAULTS.power,
    );
    expect(changeMeasuredMetricConfig('y_measuredP90Power', { family: 'energy' })).toBe(
      'y_measuredJPerOutputToken',
    );
    expect(changeMeasuredMetricConfig('y_measuredWhPerSuccessfulQuery', { family: 'power' })).toBe(
      'y_measuredAvgPower',
    );
  });

  it('keeps fleet percentiles, role averages and TDP normalization distinct', () => {
    expect(getMeasuredMetricConfig('y_measuredP90Power')).toEqual({
      family: 'power',
      basis: 'gpu-measured',
      scope: 'all',
      statistic: 'p90',
      display: 'watts',
    });
    expect(changeMeasuredMetricConfig('y_measuredAvgPower', { statistic: 'p75' })).toBe(
      'y_measuredP75Power',
    );
    expect(changeMeasuredMetricConfig('y_measuredP75Power', { statistic: 'p90' })).toBe(
      'y_measuredP90Power',
    );
    expect(changeMeasuredMetricConfig('y_measuredAvgPower', { display: 'tdp' })).toBe(
      'y_measuredPowerPercentTdp',
    );
    expect(changeMeasuredMetricConfig('y_measuredP90Power', { scope: 'prefill' })).toBe(
      'y_measuredPrefillAvgPower',
    );
    expect(changeMeasuredMetricConfig('y_measuredPowerPercentTdp', { scope: 'decode' })).toBe(
      'y_measuredDecodeAvgPower',
    );
    expect(changeMeasuredMetricConfig('y_measuredPowerPercentTdp', { statistic: 'p90' })).toBe(
      'y_measuredP90Power',
    );
    expect(
      changeMeasuredMetricConfig('y_measuredDecodeAvgPower', { statistic: 'p75', display: 'tdp' }),
    ).toBe('y_measuredDecodeAvgPower');
  });

  it('offers the telemetry timeline only for the whole-deployment average', () => {
    expect(getMeasuredMetricConfig('y_measuredPowerTimeline')).toEqual({
      family: 'power',
      basis: 'gpu-measured',
      scope: 'all',
      statistic: 'average',
      display: 'timeline',
    });
    expect(changeMeasuredMetricConfig('y_measuredAvgPower', { display: 'timeline' })).toBe(
      'y_measuredPowerTimeline',
    );
    expect(changeMeasuredMetricConfig('y_measuredPowerPercentTdp', { display: 'timeline' })).toBe(
      'y_measuredPowerTimeline',
    );
    // Percentiles and role scopes have no per-second trace; they fall back to watts.
    expect(changeMeasuredMetricConfig('y_measuredPowerTimeline', { statistic: 'p90' })).toBe(
      'y_measuredP90Power',
    );
    expect(changeMeasuredMetricConfig('y_measuredPowerTimeline', { scope: 'prefill' })).toBe(
      'y_measuredPrefillAvgPower',
    );
    expect(changeMeasuredMetricConfig('y_measuredP75Power', { display: 'timeline' })).toBe(
      'y_measuredP75Power',
    );
    // Leaving the timeline for energy and coming back lands on the family default.
    expect(changeMeasuredMetricConfig('y_measuredPowerTimeline', { family: 'energy' })).toBe(
      'y_measuredJPerOutputToken',
    );
  });

  it('changes the energy denominator without silently attributing whole-run energy to a role', () => {
    expect(changeMeasuredMetricConfig('y_measuredJPerOutputToken', { denominator: 'input' })).toBe(
      'y_measuredJPerInputToken',
    );
    expect(changeMeasuredMetricConfig('y_measuredJPerInputToken', { scope: 'prefill' })).toBe(
      'y_measuredPrefillJPerInputToken',
    );
    expect(getMeasuredMetricConfig('y_measuredPrefillJPerInputToken')).toEqual({
      family: 'energy',
      basis: 'gpu-measured',
      scope: 'prefill',
      denominator: 'input',
      unit: 'joules',
    });
    expect(
      changeMeasuredMetricConfig('y_measuredPrefillJPerInputToken', { denominator: 'output' }),
    ).toBe('y_measuredJPerOutputToken');
    expect(changeMeasuredMetricConfig('y_measuredJPerOutputToken', { scope: 'decode' })).toBe(
      'y_measuredDecodeJPerOutputToken',
    );
    expect(
      changeMeasuredMetricConfig('y_measuredDecodeJPerOutputToken', { denominator: 'total' }),
    ).toBe('y_measuredJPerTotalToken');
    expect(changeMeasuredMetricConfig('y_measuredJPerTotalToken', { scope: 'prefill' })).toBe(
      'y_measuredJPerTotalToken',
    );
  });

  it('allows watt-hours only per successful query and drops role attribution for queries', () => {
    expect(
      changeMeasuredMetricConfig('y_measuredDecodeJPerOutputToken', { denominator: 'query' }),
    ).toBe('y_measuredJPerSuccessfulQuery');
    expect(changeMeasuredMetricConfig('y_measuredJPerSuccessfulQuery', { unit: 'wattHours' })).toBe(
      'y_measuredWhPerSuccessfulQuery',
    );
    expect(
      changeMeasuredMetricConfig('y_measuredWhPerSuccessfulQuery', { denominator: 'output' }),
    ).toBe('y_measuredJPerOutputToken');
    expect(
      changeMeasuredMetricConfig('y_measuredPrefillJPerInputToken', { unit: 'wattHours' }),
    ).toBe('y_measuredPrefillJPerInputToken');
  });

  it('keeps the existing share-link defaults on the GPU-measured boundary', () => {
    expect(getMeasuredMetricConfig(MEASURED_METRIC_DEFAULTS.power)?.basis).toBe('gpu-measured');
    expect(getMeasuredMetricConfig(MEASURED_METRIC_DEFAULTS.energy)?.basis).toBe('gpu-measured');
    expect(POWER_BASES[0]).toBe('gpu-measured');
  });

  it('snaps a boundary change to that boundary’s canonical combination', () => {
    // The P90 statistic has no provisioned counterpart: choosing the boundary
    // moves to its whole-deployment average watts.
    expect(changeMeasuredMetricConfig('y_measuredP90Power', { basis: 'gpu-provisioned' })).toBe(
      'y_gpuProvisionedWatts',
    );
    expect(
      changeMeasuredMetricConfig('y_measuredPowerPercentTdp', { basis: 'utility-provisioned' }),
    ).toBe('y_utilityProvisionedWatts');
    expect(
      changeMeasuredMetricConfig('y_measuredDecodeAvgPower', { basis: 'utility-modeled' }),
    ).toBe('y_utilityModeledWatts');
    // Role- and query-scoped energy snap to joules per output token.
    expect(
      changeMeasuredMetricConfig('y_measuredPrefillJPerInputToken', { basis: 'utility-modeled' }),
    ).toBe('y_utilityModeledJPerOutputToken');
    expect(
      changeMeasuredMetricConfig('y_measuredWhPerSuccessfulQuery', { basis: 'gpu-provisioned' }),
    ).toBe('y_gpuProvisionedJPerOutputToken');
    // Boundary-to-boundary moves stay within the family.
    expect(
      changeMeasuredMetricConfig('y_gpuProvisionedWatts', { basis: 'utility-provisioned' }),
    ).toBe('y_utilityProvisionedWatts');
    expect(
      changeMeasuredMetricConfig('y_utilityModeledJPerOutputToken', { basis: 'gpu-provisioned' }),
    ).toBe('y_gpuProvisionedJPerOutputToken');
    // A boundary requested together with other dimensions wins over them.
    expect(
      changeMeasuredMetricConfig('y_measuredAvgPower', {
        basis: 'utility-modeled',
        statistic: 'p90',
      }),
    ).toBe('y_utilityModeledWatts');
  });

  it('returns to GPU-measured telemetry from a boundary', () => {
    expect(changeMeasuredMetricConfig('y_gpuProvisionedWatts', { basis: 'gpu-measured' })).toBe(
      'y_measuredAvgPower',
    );
    expect(
      changeMeasuredMetricConfig('y_utilityProvisionedJPerOutputToken', { basis: 'gpu-measured' }),
    ).toBe('y_measuredJPerOutputToken');
    // Every other dimension exists only for telemetry, so changing one from a
    // boundary lands on the nearest GPU-measured key rather than a dead end.
    expect(changeMeasuredMetricConfig('y_utilityModeledWatts', { statistic: 'p75' })).toBe(
      'y_measuredP75Power',
    );
    expect(changeMeasuredMetricConfig('y_gpuProvisionedWatts', { scope: 'decode' })).toBe(
      'y_measuredDecodeAvgPower',
    );
    expect(changeMeasuredMetricConfig('y_utilityProvisionedWatts', { display: 'tdp' })).toBe(
      'y_measuredPowerPercentTdp',
    );
    expect(
      changeMeasuredMetricConfig('y_utilityModeledJPerOutputToken', { denominator: 'query' }),
    ).toBe('y_measuredJPerSuccessfulQuery');
    expect(changeMeasuredMetricConfig('y_gpuProvisionedJPerOutputToken', { scope: 'decode' })).toBe(
      'y_measuredDecodeJPerOutputToken',
    );
    // Re-selecting the canonical value is still a dimension change and leaves the boundary.
    expect(changeMeasuredMetricConfig('y_utilityModeledWatts', { statistic: 'average' })).toBe(
      'y_measuredAvgPower',
    );
    expect(changeMeasuredMetricConfig('y_gpuProvisionedJPerOutputToken', { unit: 'joules' })).toBe(
      'y_measuredJPerOutputToken',
    );
  });

  it('keeps the boundary across a family switch', () => {
    expect(changeMeasuredMetricConfig('y_utilityProvisionedWatts', { family: 'energy' })).toBe(
      'y_utilityProvisionedJPerOutputToken',
    );
    expect(changeMeasuredMetricConfig('y_gpuProvisionedJPerOutputToken', { family: 'power' })).toBe(
      'y_gpuProvisionedWatts',
    );
    expect(
      changeMeasuredMetricConfig('y_tokensPerDollarH', {
        family: 'energy',
        basis: 'utility-modeled',
      }),
    ).toBe('y_utilityModeledJPerOutputToken');
  });
});
