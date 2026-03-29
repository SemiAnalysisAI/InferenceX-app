import { describe, it, expect } from 'vitest';

import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { filterDataByCostLimit, processOverlayChartData } from '@/components/inference/utils';

// ---------------------------------------------------------------------------
// fixture factories
// ---------------------------------------------------------------------------
function pt(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2024-01-01',
    x: 1,
    y: 1,
    tp: 1,
    conc: 1,
    hwKey: 'h100' as any,
    precision: 'fp16',
    tpPerGpu: { y: 1000, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 2.0, roof: false },
    costn: { y: 1.5, roof: false },
    costr: { y: 1.0, roof: false },
    costhi: { y: 5.0, roof: false },
    costni: { y: 3.0, roof: false },
    costri: { y: 1.5, roof: false },
    ...overrides,
  };
}

function chartDef(overrides: Partial<ChartDefinition> = {}): ChartDefinition {
  return {
    chartType: 'e2e',
    heading: 'Test Chart',
    x: 'median_e2el',
    x_label: 'Latency',
    y: 'tput_per_gpu',
    ...overrides,
  };
}

// ===========================================================================
// filterDataByCostLimit
// ===========================================================================
describe('filterDataByCostLimit', () => {
  it('returns data unchanged when selectedYAxisMetric does not include "cost"', () => {
    const data = [pt(), pt({ x: 2 })];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1.0 }), 'y_tpPerGpu');
    expect(result).toHaveLength(2);
  });

  it('returns data unchanged when cost metric is selected but y_cost_limit is absent', () => {
    const data = [pt({ costh: { y: 999, roof: false } }), pt()];
    const result = filterDataByCostLimit(data, chartDef(), 'y_costh');
    expect(result).toHaveLength(2);
  });

  it('filters by costh.y <= y_cost_limit', () => {
    const data = [
      pt({ costh: { y: 1.0, roof: false } }), // keep
      pt({ costh: { y: 2.5, roof: false } }), // remove
      pt({ costh: { y: 2.0, roof: false } }), // keep (equal to limit)
    ];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 2.0 }), 'y_costh');
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.costh.y <= 2.0)).toBe(true);
  });

  it('filters by costn.y <= y_cost_limit', () => {
    const data = [pt({ costn: { y: 1.0, roof: false } }), pt({ costn: { y: 3.0, roof: false } })];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1.5 }), 'y_costn');
    expect(result).toHaveLength(1);
    expect(result[0].costn.y).toBe(1.0);
  });

  it('filters by costr.y <= y_cost_limit', () => {
    const data = [pt({ costr: { y: 0.5, roof: false } }), pt({ costr: { y: 1.5, roof: false } })];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1.0 }), 'y_costr');
    expect(result).toHaveLength(1);
  });

  it('filters by costhOutput.y when metric is y_costhOutput', () => {
    const data = [
      pt({ costhOutput: { y: 1.0, roof: false } }),
      pt({ costhOutput: { y: 5.0, roof: false } }),
    ];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 2.0 }), 'y_costhOutput');
    expect(result).toHaveLength(1);
  });

  it('filters by costhi.y when metric is y_costhi', () => {
    const data = [
      pt({ costhi: { y: 2.0, roof: false } }),
      pt({ costhi: { y: 10.0, roof: false } }),
    ];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 3.0 }), 'y_costhi');
    expect(result).toHaveLength(1);
  });

  it('does NOT filter y_costUser by cost limit (custom user metric bypasses the limit)', () => {
    // y_costUser allows users to enter arbitrary costs; the hard-coded limit must not apply
    const data = [
      pt({ costUser: { y: 1.0, roof: false } }),
      pt({ costUser: { y: 999.0, roof: false } }),
    ];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 2.0 }), 'y_costUser');
    expect(result).toHaveLength(2);
  });

  it('includes points where the cost field is undefined (missing data passes through)', () => {
    // point has no costhOutput field
    const data = [pt()]; // costhOutput is undefined
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 0.1 }), 'y_costhOutput');
    expect(result).toHaveLength(1);
  });

  it('returns data unchanged for an unknown metric key even if it includes "cost"', () => {
    // 'y_unknownCost' maps to metricKey 'unknownCost', not in costFieldMap
    const data = [pt(), pt()];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1.0 }), 'y_unknownCost');
    expect(result).toHaveLength(2);
  });

  it('returns empty array when all points exceed the limit', () => {
    const data = [pt({ costh: { y: 5.0, roof: false } }), pt({ costh: { y: 10.0, roof: false } })];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1.0 }), 'y_costh');
    expect(result).toHaveLength(0);
  });

  it('returns all points when all are within the limit', () => {
    const data = [pt({ costh: { y: 0.5, roof: false } }), pt({ costh: { y: 0.9, roof: false } })];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1.0 }), 'y_costh');
    expect(result).toHaveLength(2);
  });
});

// ===========================================================================
// processOverlayChartData
// ===========================================================================
describe('processOverlayChartData', () => {
  it('remaps y to the selected metric value', () => {
    const data = [pt({ y: 999, tpPerGpu: { y: 42, roof: false }, median_intvty: 10 } as any)];
    const result = processOverlayChartData(data, 'interactivity', 'y_tpPerGpu', null);
    expect(result).toHaveLength(1);
    expect(result[0].y).toBe(42);
  });

  it('filters out points missing the selected metric', () => {
    // Point without inputTputPerGpu field — should be excluded
    const withMetric = pt({ inputTputPerGpu: { y: 5, roof: false } } as any);
    const withoutMetric = pt();
    delete (withoutMetric as any).inputTputPerGpu;
    const result = processOverlayChartData(
      [withMetric, withoutMetric],
      'interactivity',
      'y_inputTputPerGpu',
      null,
    );
    expect(result).toHaveLength(1);
    expect(result[0].y).toBe(5);
  });

  it('remaps x to config override for input metrics on interactivity chart', () => {
    // inputTputPerGpu has x override to p99_ttft on interactivity chart
    const data = [
      pt({
        x: 100,
        inputTputPerGpu: { y: 5, roof: false },
        p99_ttft: 0.25,
        median_intvty: 50,
      } as any),
    ];
    const result = processOverlayChartData(data, 'interactivity', 'y_inputTputPerGpu', null);
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0.25);
  });

  it('uses user-selected x-axis metric when provided for interactivity input metrics', () => {
    const data = [
      pt({
        x: 100,
        inputTputPerGpu: { y: 5, roof: false },
        median_ttft: 0.1,
        median_intvty: 50,
      } as any),
    ];
    const result = processOverlayChartData(
      data,
      'interactivity',
      'y_inputTputPerGpu',
      'median_ttft',
    );
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0.1);
  });

  it('does not remap x for e2e chart even with input metrics', () => {
    const data = [
      pt({
        x: 100,
        inputTputPerGpu: { y: 5, roof: false },
        p99_ttft: 0.25,
        median_e2el: 2.5,
      } as any),
    ];
    const result = processOverlayChartData(data, 'e2e', 'y_inputTputPerGpu', null);
    expect(result).toHaveLength(1);
    // e2e uses median_e2el as x (from chart config default), not p99_ttft
    expect(result[0].x).toBe(2.5);
  });

  it('remaps x to TTFT for e2e chart when selectedXAxisMetric is p99_ttft', () => {
    const data = [
      pt({
        x: 100,
        tpPerGpu: { y: 42, roof: false },
        p99_ttft: 0.35,
        median_e2el: 2.5,
      } as any),
    ];
    const result = processOverlayChartData(data, 'e2e', 'y_tpPerGpu', 'p99_ttft');
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0.35);
  });

  it('remaps x to TTFT for e2e chart when selectedXAxisMetric is median_ttft', () => {
    const data = [
      pt({
        x: 100,
        tpPerGpu: { y: 42, roof: false },
        median_ttft: 0.12,
        median_e2el: 2.5,
      } as any),
    ];
    const result = processOverlayChartData(data, 'e2e', 'y_tpPerGpu', 'median_ttft');
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0.12);
  });

  it('filters e2e TTFT outliers exceeding y_latency_limit', () => {
    const data = [
      pt({ tpPerGpu: { y: 10, roof: false }, p99_ttft: 0.5, median_e2el: 1 } as any),
      pt({ tpPerGpu: { y: 5, roof: false }, p99_ttft: 999, median_e2el: 2 } as any),
    ];
    const result = processOverlayChartData(data, 'e2e', 'y_tpPerGpu', 'p99_ttft');
    // y_latency_limit is 60 in the e2e chart config — the 999 outlier should be filtered
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0.5);
  });

  it('does not filter interactivity points by latency limit when x-axis is default', () => {
    // Regression: selectedXAxisMetric defaults to 'p99_ttft' but the interactivity
    // chart's x-axis stays median_intvty for non-input metrics. The latency limit
    // (60) must NOT apply to median_intvty values.
    const data = [
      pt({ tpPerGpu: { y: 42, roof: false }, median_intvty: 200 } as any),
      pt({ tpPerGpu: { y: 10, roof: false }, median_intvty: 30 } as any),
    ];
    const result = processOverlayChartData(data, 'interactivity', 'y_tpPerGpu', 'p99_ttft');
    expect(result).toHaveLength(2);
  });

  it('applies latency limit on interactivity only when x-axis is actually overridden', () => {
    // When an input metric IS selected and x-axis overrides to p99_ttft,
    // the latency limit should apply.
    const data = [
      pt({ inputTputPerGpu: { y: 5, roof: false }, p99_ttft: 0.5, median_intvty: 10 } as any),
      pt({ inputTputPerGpu: { y: 3, roof: false }, p99_ttft: 999, median_intvty: 20 } as any),
    ];
    const result = processOverlayChartData(data, 'interactivity', 'y_inputTputPerGpu', 'p99_ttft');
    // x-axis is overridden to p99_ttft for input metric — latency limit SHOULD filter 999
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0.5);
  });

  it('applies cost limit filtering', () => {
    const data = [
      pt({ costh: { y: 0.5, roof: false }, median_intvty: 10 } as any),
      pt({ costh: { y: 100, roof: false }, median_intvty: 20 } as any),
    ];
    // interactivity chart config has y_cost_limit: 5
    const result = processOverlayChartData(data, 'interactivity', 'y_costh', null);
    expect(result).toHaveLength(1);
    expect(result[0].y).toBe(0.5);
  });
});
