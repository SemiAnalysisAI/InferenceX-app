import { describe, expect, it } from 'vitest';

import type { ChartDefinition } from './types';
import {
  applyCostDisplayToChartDefinition,
  displayTokenCostValue,
  isTokenCostMetric,
  parseCostDisplayMode,
  storedMetricYValue,
  tokenCostMetricTitle,
} from './cost-display';

describe('cost display', () => {
  it('defaults missing and unknown URL values to tokens per dollar', () => {
    expect(parseCostDisplayMode(null)).toBe('tokens-per-dollar');
    expect(parseCostDisplayMode('unknown')).toBe('tokens-per-dollar');
    expect(parseCostDisplayMode('cost-per-million')).toBe('cost-per-million');
  });

  it('converts tokens per dollar to cost per million tokens by exact reciprocal', () => {
    expect(displayTokenCostValue(2_000_000, 'tokens-per-dollar')).toBe(2_000_000);
    expect(displayTokenCostValue(2_000_000, 'cost-per-million')).toBe(0.5);
    expect(displayTokenCostValue(0, 'cost-per-million')).toBe(0);
  });

  it('preserves a stored zero instead of falling back to throughput', () => {
    expect(storedMetricYValue({ y: 0 }, 42)).toBe(0);
    expect(storedMetricYValue(undefined, 42)).toBe(42);
  });

  it('recognizes only selectable token-cost metrics', () => {
    expect(isTokenCostMetric('y_costhOutput')).toBe(true);
    expect(isTokenCostMetric('y_costUser')).toBe(true);
    expect(isTokenCostMetric('y_tpPerGpu')).toBe(false);
  });

  it('uses unit-neutral Y-axis option titles in both locales', () => {
    expect(tokenCostMetricTitle('y_costh', 'en')).toBe('Total Token Cost (Owning - Hyperscaler)');
    expect(tokenCostMetricTitle('y_costrOutput', 'zh')).toBe('输出 token 成本（3 年租赁）');
  });

  it('switches labels and Pareto direction for cost per million tokens', () => {
    const chartDef = {
      chartType: 'interactivity',
      heading: 'heading',
      x: 'median_interactivity',
      x_label: 'Interactivity',
      y: 'tput_per_gpu',
      y_costh_roofline: 'upper_left',
    } as unknown as ChartDefinition;

    const displayed = applyCostDisplayToChartDefinition(chartDef, 'y_costh', 'cost-per-million');

    expect(displayed.y_costh_label).toBe('Cost per Million Total Tokens ($/M tok)');
    expect(displayed.y_costh_labelZh).toBe('每百万总 token 成本（$/M tok）');
    expect(displayed.y_costh_title).toBe('Cost per Million Total Tokens (Owning - Hyperscaler)');
    expect(displayed.y_costh_roofline).toBe('lower_right');
    expect(displayed.y_cost_limit).toBe(5);
    expect(chartDef.y_costh_roofline).toBe('upper_left');
  });
});
