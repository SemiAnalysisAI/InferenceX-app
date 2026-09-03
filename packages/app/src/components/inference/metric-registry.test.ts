import { describe, expect, it } from 'vitest';

import {
  chartDefinitions,
  costTierLabel,
  DEFAULT_METRIC_CONFIG_KEY,
  isBenchmarkMetricKey,
  isMeasuredEnergyConfigKey,
  MEASURED_ENERGY_METRIC_CONFIG_KEYS,
  METRIC_CONFIG_KEYS,
  METRIC_CONTROL_GROUPS,
  METRIC_REGISTRY,
  metricChartTitle,
  metricCostTier,
  metricOptionTitle,
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
      'tokensPerDollarUser',
    ] as const;

    for (const metricKey of metricKeys) {
      expect(METRIC_REGISTRY[metricKey].label, metricKey).toContain(' TCO ');
      expect(METRIC_REGISTRY[metricKey].labelZh, metricKey).toContain(' TCO ');
      // Chart titles end at the metric (the cost tier is no longer appended).
      expect(METRIC_REGISTRY[metricKey].title, metricKey).toMatch(/ TCO$/u);
      expect(METRIC_REGISTRY[metricKey].titleZh, metricKey).toContain(' TCO ');
    }

    const tcoGroups = METRIC_CONTROL_GROUPS.filter((group) =>
      group.metrics.some(
        (metric) =>
          metric !== 'y_tokensPerDollarUser' &&
          metricKeys.includes(metric.slice(2) as (typeof metricKeys)[number]),
      ),
    );
    expect(tcoGroups).toHaveLength(3);
    for (const group of tcoGroups) {
      expect(group.label).toContain(' TCO');
      expect(group.labelZh).toContain(' TCO ');
    }
  });

  it('does not offer any ¥-priced axis', () => {
    for (const key of Object.keys(METRIC_REGISTRY)) {
      expect(key).not.toMatch(/Rmb/u);
    }
    for (const group of METRIC_CONTROL_GROUPS) {
      expect(group.label).not.toContain('¥');
      expect(group.labelZh).not.toContain('人民币');
    }
    for (const metric of Object.values(METRIC_REGISTRY)) {
      expect(metric.label).not.toContain('¥');
      expect(metric.title).not.toContain('¥');
    }
  });

  it('keeps the cost tier out of the chart title and appends it to the option label', () => {
    expect(metricCostTier('tokensPerDollarH')).toBe('hyperscaler');
    expect(metricCostTier('costn')).toBe('neocloud');
    expect(metricCostTier('inputTokensPerDollarR')).toBe('rental');
    expect(metricCostTier('costUser')).toBe('custom');
    expect(metricCostTier('tpPerGpu')).toBeUndefined();
    expect(metricCostTier('powerUser')).toBeUndefined();

    expect(metricChartTitle('tokensPerDollarH', 'en')).toBe('Total Tokens per $1 TCO');
    expect(metricChartTitle('tokensPerDollarH', 'zh')).toBe('每 1 美元 TCO 对应的总 token 数');
    expect(metricOptionTitle('tokensPerDollarH', 'en')).toBe(
      'Total Tokens per $1 TCO (Owning - Hyperscaler)',
    );
    expect(metricOptionTitle('tokensPerDollarN', 'en')).toBe(
      'Total Tokens per $1 TCO (Owning - Neocloud Giant)',
    );
    expect(metricOptionTitle('costr', 'en')).toBe('Cost per Million Total Tokens (3 Year Rental)');
    expect(metricOptionTitle('costh', 'zh')).toBe('每百万总 token 成本（自有 - 超大规模）');
    expect(metricOptionTitle('tpPerGpu', 'en')).toBe('Token Throughput per Chip');

    expect(costTierLabel('hyperscaler', 'en')).toBe('Owning Hyperscaler');
    expect(costTierLabel('neocloud', 'en')).toBe('Owning Neocloud Giant');
    expect(costTierLabel('rental', 'en')).toBe('3 Year Rental');
    expect(costTierLabel('hyperscaler', 'zh')).toBe('自有（超大规模）');

    // Chart definitions carry both spellings so the selector and the heading
    // read from the same registry entry.
    const [interactivity] = chartDefinitions;
    expect(interactivity.y_tokensPerDollarH_title).toBe(
      'Total Tokens per $1 TCO (Owning - Hyperscaler)',
    );
    expect(interactivity.y_tokensPerDollarH_chartTitle).toBe('Total Tokens per $1 TCO');
    expect(interactivity.y_tokensPerDollarH_costTier).toBe('hyperscaler');
    expect(interactivity.y_tpPerGpu_costTier).toBeUndefined();
  });

  it('keeps the Measured Energy key list in lockstep with the registry', () => {
    // Every registry key starting `measured` must be in the exported list, so
    // a new telemetry metric cannot silently miss the tier decorations.
    const measuredRegistryKeys = Object.keys(METRIC_REGISTRY)
      .filter((key) => key.startsWith('measured'))
      .map((key) => `y_${key}`);
    expect([...MEASURED_ENERGY_METRIC_CONFIG_KEYS].toSorted()).toEqual(
      measuredRegistryKeys.toSorted(),
    );

    const measuredGroup = METRIC_CONTROL_GROUPS.find((group) => group.label === 'Measured Energy');
    expect(measuredGroup?.metrics).toBe(MEASURED_ENERGY_METRIC_CONFIG_KEYS);
  });

  it('classifies measured-energy config keys', () => {
    expect(isMeasuredEnergyConfigKey('y_measuredAvgPower')).toBe(true);
    expect(isMeasuredEnergyConfigKey('y_measuredWhPerSuccessfulQuery')).toBe(true);
    expect(isMeasuredEnergyConfigKey('y_tpPerGpu')).toBe(false);
    expect(isMeasuredEnergyConfigKey('y_jTotal')).toBe(false);
    expect(isMeasuredEnergyConfigKey('y')).toBe(false);
  });
});

describe('metric compatibility', () => {
  it('maps the legacy base y field to canonical throughput', () => {
    expect(resolveMetricConfigKey('y')).toBe('y_tpPerGpu');
  });

  it('keeps the legacy fallback independent from the dashboard default', () => {
    expect(resolveMetricConfigKey(undefined, 'y')).toBe('y_tpPerGpu');
    expect(DEFAULT_METRIC_CONFIG_KEY).toBe('y_tokensPerDollarH');
  });

  it('falls back safely for unknown persisted metric values', () => {
    expect(resolveMetricConfigKey('y_removedMetric')).toBe(DEFAULT_METRIC_CONFIG_KEY);
    expect(resolveMetricConfigKey('arbitrary')).toBe(DEFAULT_METRIC_CONFIG_KEY);
    expect(isBenchmarkMetricKey('removedMetric')).toBe(false);
  });

  it('maps links for the removed API-price metric to Neocloud infrastructure cost', () => {
    expect(resolveMetricConfigKey('y_tokensPerDollar')).toBe('y_tokensPerDollarN');
  });

  it('maps links for the removed ¥ axes to the same tokens priced in $', () => {
    expect(resolveMetricConfigKey('y_tokensPerRmbH')).toBe('y_tokensPerDollarH');
    expect(resolveMetricConfigKey('y_tokensPerRmbN')).toBe('y_tokensPerDollarN');
    expect(resolveMetricConfigKey('y_tokensPerRmbR')).toBe('y_tokensPerDollarR');
    expect(resolveMetricConfigKey('y_outputTokensPerRmbH')).toBe('y_outputTokensPerDollarH');
    expect(resolveMetricConfigKey('y_inputTokensPerRmbR')).toBe('y_inputTokensPerDollarR');
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
