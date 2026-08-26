import { describe, expect, it } from 'vitest';

import {
  chartDefinitions,
  DEFAULT_METRIC_CONFIG_KEY,
  isBenchmarkMetricKey,
  METRIC_CONFIG_KEYS,
  METRIC_CONTROL_GROUPS,
  METRIC_REGISTRY,
  resolveMetricConfigKey,
  tokenMetricTypeForConfigKey,
} from './metric-registry';

describe('metric registry', () => {
  it('derives chart-specific roofline corners from one polarity owner', () => {
    const [interactivity, e2e] = chartDefinitions;
    expect(interactivity.chartType).toBe('interactivity');
    expect(e2e.chartType).toBe('e2e');
    expect(interactivity.y_tpPerGpu_roofline).toBe('upper_left');
    expect(e2e.y_tpPerGpu_roofline).toBe('upper_right');
    expect(interactivity.y_costh_roofline).toBe('lower_right');
    expect(e2e.y_costh_roofline).toBe('lower_left');
    expect(interactivity.y_measuredPowerPercentTdp_roofline).toBeUndefined();
    expect(e2e.y_measuredPowerPercentTdp_roofline).toBeUndefined();
  });

  it('preserves metric-specific x overrides and bilingual labels', () => {
    const interactivity = chartDefinitions[0];

    expect(interactivity.y_inputTputPerGpu_x).toBe('p90_ttft');
    expect(interactivity.y_inputTputPerGpu_heading).toBe('vs. P90 Time To First Token');
    expect(interactivity.y_inputTputPerGpu_labelZh).toBe(METRIC_REGISTRY.inputTputPerGpu.labelZh);
  });

  it('lists every canonical metric exactly once across controls', () => {
    const controlMetrics = METRIC_CONTROL_GROUPS.flatMap((group) => group.metrics);

    expect(new Set(controlMetrics).size).toBe(controlMetrics.length);
    expect(controlMetrics.toSorted()).toEqual(METRIC_CONFIG_KEYS.toSorted());
  });
});

describe('metric compatibility', () => {
  it('maps the legacy base y field to canonical throughput', () => {
    expect(resolveMetricConfigKey('y')).toBe('y_tpPerGpu');
  });

  it('keeps the legacy fallback independent from the dashboard default', () => {
    expect(resolveMetricConfigKey(undefined, 'y')).toBe('y_tpPerGpu');
    expect(DEFAULT_METRIC_CONFIG_KEY).toBe('y_tokensPerDollarN');
  });

  it('falls back safely for unknown persisted metric values', () => {
    expect(resolveMetricConfigKey('y_removedMetric')).toBe(DEFAULT_METRIC_CONFIG_KEY);
    expect(resolveMetricConfigKey('arbitrary')).toBe(DEFAULT_METRIC_CONFIG_KEY);
    expect(isBenchmarkMetricKey('removedMetric')).toBe(false);
  });

  it('preserves valid benchmark, derived, and custom metric identities', () => {
    expect(resolveMetricConfigKey('y_tpPerGpu')).toBe('y_tpPerGpu');
    expect(resolveMetricConfigKey('y_measuredJPerSuccessfulQuery')).toBe(
      'y_measuredJPerSuccessfulQuery',
    );
    expect(resolveMetricConfigKey('y_costUser')).toBe('y_costUser');
    expect(isBenchmarkMetricKey('tpPerGpu')).toBe(true);
    expect(isBenchmarkMetricKey('measuredJPerSuccessfulQuery')).toBe(true);
    expect(isBenchmarkMetricKey('costUser')).toBe(false);
  });

  it('classifies output, input, and total token metric options', () => {
    expect(tokenMetricTypeForConfigKey('y_outputTputPerGpu')).toBe('output');
    expect(tokenMetricTypeForConfigKey('y_jOutput')).toBe('output');
    expect(tokenMetricTypeForConfigKey('y_costhi')).toBe('input');
    expect(tokenMetricTypeForConfigKey('y_tpPerGpu')).toBe('total');
    expect(tokenMetricTypeForConfigKey('y_measuredAvgPower')).toBe('total');
  });
});
