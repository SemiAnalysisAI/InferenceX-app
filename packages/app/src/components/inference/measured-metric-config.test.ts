import { describe, expect, it } from 'vitest';

import {
  MEASURED_ENERGY_METRIC_CONFIG_KEYS,
  METRIC_CONFIG_KEYS,
  POWER_BASIS_METRIC_CONFIG_KEYS,
  resolveMetricConfigKey,
} from './metric-registry';
import {
  changeMeasuredMetricConfig,
  getMeasuredMetricConfig,
  MEASURED_METRIC_DEFAULTS,
  measuredMetricBases,
} from './measured-metric-config';

describe('measured metric configuration', () => {
  it.each([
    'y_measuredAvgPower',
    'y_measuredPowerTimeline',
    'y_measuredJPerOutputToken',
    'y_measuredWhPerSuccessfulQuery',
  ] as const)('round-trips the existing share-link metric %s', (key) => {
    const config = getMeasuredMetricConfig(key);
    expect(config).toBeDefined();
    expect(changeMeasuredMetricConfig(key, {})).toBe(key);
    expect(changeMeasuredMetricConfig('y_tpPerGpu', config!)).toBe(key);
  });

  it('does not group unrelated metrics or unknown persisted values', () => {
    const grouped = METRIC_CONFIG_KEYS.filter((key) => getMeasuredMetricConfig(key));
    expect(grouped).toHaveLength(24);
    expect(new Set(grouped)).toEqual(
      new Set([...MEASURED_ENERGY_METRIC_CONFIG_KEYS, ...POWER_BASIS_METRIC_CONFIG_KEYS]),
    );
    for (const key of MEASURED_ENERGY_METRIC_CONFIG_KEYS) {
      expect(getMeasuredMetricConfig(key)?.basis, key).toBe('gpu-measured');
    }
    expect(getMeasuredMetricConfig('y_removedMetric')).toBeUndefined();
    expect(getMeasuredMetricConfig('')).toBeUndefined();
  });

  it('offers provisioned boundaries for energy only and lands old provisioned-watt links on measured power', () => {
    expect(measuredMetricBases('power')).toEqual(['gpu-measured', 'it-modeled', 'utility-modeled']);
    expect(measuredMetricBases('energy')).toEqual([
      'gpu-measured',
      'gpu-provisioned',
      'utility-provisioned',
      'it-modeled',
      'utility-modeled',
    ]);
    expect(getMeasuredMetricConfig('y_itModeledWatts')).toMatchObject({
      family: 'power',
      basis: 'it-modeled',
      display: 'watts',
    });
    expect(getMeasuredMetricConfig('y_itModeledJPerOutputToken')).toMatchObject({
      family: 'energy',
      basis: 'it-modeled',
      denominator: 'output',
    });
    expect(changeMeasuredMetricConfig('y_gpuProvisionedJPerOutputToken', { family: 'power' })).toBe(
      'y_measuredAvgPower',
    );
    expect(resolveMetricConfigKey('y_gpuProvisionedWatts')).toBe('y_measuredAvgPower');
    expect(resolveMetricConfigKey('y_utilityProvisionedWatts')).toBe('y_measuredAvgPower');
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

  it.each([
    ['gpu-provisioned', 'y_gpuProvisionedJPerOutputToken', 'y_gpuProvisionedJPerTotalToken'],
    [
      'utility-provisioned',
      'y_utilityProvisionedJPerOutputToken',
      'y_utilityProvisionedJPerTotalToken',
    ],
    ['utility-modeled', 'y_utilityModeledJPerOutputToken', 'y_utilityModeledJPerTotalToken'],
  ] as const)(
    'keeps the %s boundary across output and total tokens',
    (basis, perOutput, perTotal) => {
      expect(changeMeasuredMetricConfig(perOutput, { denominator: 'total' })).toBe(perTotal);
      expect(changeMeasuredMetricConfig(perTotal, { denominator: 'output' })).toBe(perOutput);
      expect(changeMeasuredMetricConfig('y_measuredJPerTotalToken', { basis })).toBe(perTotal);
      expect(changeMeasuredMetricConfig('y_measuredJPerInputToken', { basis })).toBe(perOutput);
      expect(changeMeasuredMetricConfig(perTotal, { denominator: 'input' })).toBe(
        'y_measuredJPerInputToken',
      );
      expect(changeMeasuredMetricConfig(perTotal, { denominator: 'query' })).toBe(
        'y_measuredJPerSuccessfulQuery',
      );
      expect(changeMeasuredMetricConfig(perOutput, { scope: 'decode' })).toBe(
        'y_measuredDecodeJPerOutputToken',
      );
    },
  );
});
