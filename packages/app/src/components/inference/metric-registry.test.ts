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
    expect(interactivity.y_tokenRevenuePerGpuHour_roofline).toBe('upper_left');
    expect(e2e.y_tokenRevenuePerGpuHour_roofline).toBe('upper_right');
    expect(interactivity.y_tokensPerDollarN_roofline).toBe('upper_left');
    expect(e2e.y_tokensPerDollarN_roofline).toBe('upper_right');
    expect(interactivity.y_costh_roofline).toBe('lower_right');
    expect(e2e.y_costh_roofline).toBe('lower_left');
    expect(interactivity.y_measuredPowerPercentTdp_roofline).toBeUndefined();
    expect(e2e.y_measuredPowerPercentTdp_roofline).toBeUndefined();
  });

  it('preserves metric-specific x overrides and bilingual labels', () => {
    const interactivity = chartDefinitions[0];

    expect(interactivity.x_label).toBe('Interactivity (tok/s/user)');
    expect(interactivity.x_labelZh).toBe('交互性 (tok/s/user)');
    expect(interactivity.y_inputTputPerGpu_x).toBe('p90_ttft');
    expect(interactivity.y_inputTputPerGpu_heading).toBe('vs. P90 Time To First Token');
    expect(interactivity.y_inputTputPerGpu_x_label).toBe('P90 Time To First Token (s)');
    expect(interactivity.y_inputTputPerGpu_x_labelZh).toBe('P90 首 token 延迟 (s)');
    expect(interactivity.y_inputTputPerGpu_labelZh).toBe(METRIC_REGISTRY.inputTputPerGpu.labelZh);
  });

  it('provides a Chinese sibling for every registered x-axis label', () => {
    for (const chartDefinition of chartDefinitions) {
      const definition = chartDefinition as Record<string, unknown>;
      const xLabelKeys = Object.keys(definition).filter(
        (key) => key === 'x_label' || key.endsWith('_x_label'),
      );
      for (const key of xLabelKeys) {
        const zhKey = `${key}Zh`;
        expect(definition[zhKey], `${chartDefinition.chartType}.${zhKey}`).toBeTypeOf('string');
        expect(definition[zhKey], `${chartDefinition.chartType}.${zhKey}`).not.toBe('');
      }
    }
  });

  it('lists every canonical metric exactly once across controls', () => {
    const controlMetrics = METRIC_CONTROL_GROUPS.flatMap((group) => group.metrics);

    expect(new Set(controlMetrics).size).toBe(controlMetrics.length);
    expect(controlMetrics.toSorted()).toEqual(METRIC_CONFIG_KEYS.toSorted());
  });

  it('labels every infrastructure purchasing-power metric as TCO', () => {
    const metricKeys = [
      'tokensPerDollarH',
      'tokensPerDollarN',
      'tokensPerDollarR',
      'outputTokensPerDollarH',
      'outputTokensPerDollarN',
      'outputTokensPerDollarR',
      'inputTokensPerDollarH',
      'inputTokensPerDollarN',
      'inputTokensPerDollarR',
      'tokensPerRmbH',
      'tokensPerRmbN',
      'tokensPerRmbR',
      'outputTokensPerRmbH',
      'outputTokensPerRmbN',
      'outputTokensPerRmbR',
      'inputTokensPerRmbH',
      'inputTokensPerRmbN',
      'inputTokensPerRmbR',
      'tokensPerDollarUser',
    ] as const;

    for (const metricKey of metricKeys) {
      expect(METRIC_REGISTRY[metricKey].label, metricKey).toContain(' TCO ');
      expect(METRIC_REGISTRY[metricKey].labelZh, metricKey).toContain(' TCO ');
      expect(METRIC_REGISTRY[metricKey].title, metricKey).toContain(' TCO ');
      expect(METRIC_REGISTRY[metricKey].titleZh, metricKey).toContain(' TCO ');
    }

    const tcoGroups = METRIC_CONTROL_GROUPS.filter((group) =>
      group.metrics.some(
        (metric) =>
          metric !== 'y_tokensPerDollarUser' &&
          metricKeys.includes(metric.slice(2) as (typeof metricKeys)[number]),
      ),
    );
    expect(tcoGroups).toHaveLength(6);
    for (const group of tcoGroups) {
      expect(group.label).toContain(' TCO');
      expect(group.labelZh).toContain(' TCO ');
    }
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

  it('maps links for the removed API-price metric to Neocloud infrastructure cost', () => {
    expect(resolveMetricConfigKey('y_tokensPerDollar')).toBe('y_tokensPerDollarN');
  });

  it('preserves valid benchmark, derived, and custom metric identities', () => {
    expect(resolveMetricConfigKey('y_tpPerGpu')).toBe('y_tpPerGpu');
    expect(resolveMetricConfigKey('y_measuredJPerSuccessfulQuery')).toBe(
      'y_measuredJPerSuccessfulQuery',
    );
    expect(resolveMetricConfigKey('y_costUser')).toBe('y_costUser');
    expect(isBenchmarkMetricKey('tpPerGpu')).toBe(true);
    expect(isBenchmarkMetricKey('tokenRevenuePerGpuHour')).toBe(true);
    expect(isBenchmarkMetricKey('tokensPerDollarN')).toBe(true);
    expect(isBenchmarkMetricKey('measuredJPerSuccessfulQuery')).toBe(true);
    expect(isBenchmarkMetricKey('costUser')).toBe(false);
  });

  it('classifies output, input, and total token metric options', () => {
    expect(tokenMetricTypeForConfigKey('y_outputTputPerGpu')).toBe('output');
    expect(tokenMetricTypeForConfigKey('y_jOutput')).toBe('output');
    expect(tokenMetricTypeForConfigKey('y_costhi')).toBe('input');
    expect(tokenMetricTypeForConfigKey('y_tpPerGpu')).toBe('total');
    expect(tokenMetricTypeForConfigKey('y_tokenRevenuePerGpuHour')).toBe('total');
    expect(tokenMetricTypeForConfigKey('y_tokensPerDollarN')).toBe('total');
    expect(tokenMetricTypeForConfigKey('y_measuredAvgPower')).toBe('total');
  });
});
