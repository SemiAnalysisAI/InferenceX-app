import { describe, expect, it } from 'vitest';

import { MEASURED_ENERGY_METRIC_CONFIG_KEYS, METRIC_CONFIG_KEYS } from './metric-registry';
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

  it('does not group unrelated metrics or unknown persisted values', () => {
    const grouped = METRIC_CONFIG_KEYS.filter((key) => getMeasuredMetricConfig(key));
    expect(grouped).toHaveLength(13);
    expect(new Set(grouped)).toEqual(new Set(MEASURED_ENERGY_METRIC_CONFIG_KEYS));
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
});
