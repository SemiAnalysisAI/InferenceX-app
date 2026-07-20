import { describe, it, expect } from 'vitest';

import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import {
  filterDataByCostLimit,
  processOverlayChartData,
  selectUnofficialOverlayForMode,
} from '@/components/inference/utils';

describe('selectUnofficialOverlayForMode', () => {
  const overlays = { e2e: { id: 'e2e' }, interactivity: { id: 'interactivity' } };

  it('suppresses raw unofficial E2E data for normalized E2E mode', () => {
    expect(selectUnofficialOverlayForMode('normalized-e2e', 'e2e', overlays)).toBeNull();
  });

  it('preserves matching unofficial overlays for supported modes', () => {
    expect(selectUnofficialOverlayForMode('e2e', 'e2e', overlays)).toBe(overlays.e2e);
    expect(selectUnofficialOverlayForMode('interactivity', 'interactivity', overlays)).toBe(
      overlays.interactivity,
    );
  });
});

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
    costh: { y: 2, roof: false },
    costn: { y: 1.5, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 5, roof: false },
    costni: { y: 3, roof: false },
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
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1 }), 'y_tpPerGpu');
    expect(result).toHaveLength(2);
  });

  it('returns data unchanged when cost metric is selected but y_cost_limit is absent', () => {
    const data = [pt({ costh: { y: 999, roof: false } }), pt()];
    const result = filterDataByCostLimit(data, chartDef(), 'y_costh');
    expect(result).toHaveLength(2);
  });

  it('filters by costh.y <= y_cost_limit', () => {
    const data = [
      pt({ costh: { y: 1, roof: false } }), // keep
      pt({ costh: { y: 2.5, roof: false } }), // remove
      pt({ costh: { y: 2, roof: false } }), // keep (equal to limit)
    ];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 2 }), 'y_costh');
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.costh.y <= 2)).toBe(true);
  });

  it('filters by costn.y <= y_cost_limit', () => {
    const data = [pt({ costn: { y: 1, roof: false } }), pt({ costn: { y: 3, roof: false } })];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1.5 }), 'y_costn');
    expect(result).toHaveLength(1);
    expect(result[0].costn.y).toBe(1);
  });

  it('filters by costr.y <= y_cost_limit', () => {
    const data = [pt({ costr: { y: 0.5, roof: false } }), pt({ costr: { y: 1.5, roof: false } })];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1 }), 'y_costr');
    expect(result).toHaveLength(1);
  });

  it('filters by costhOutput.y when metric is y_costhOutput', () => {
    const data = [
      pt({ costhOutput: { y: 1, roof: false } }),
      pt({ costhOutput: { y: 5, roof: false } }),
    ];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 2 }), 'y_costhOutput');
    expect(result).toHaveLength(1);
  });

  it('filters by costhi.y when metric is y_costhi', () => {
    const data = [pt({ costhi: { y: 2, roof: false } }), pt({ costhi: { y: 10, roof: false } })];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 3 }), 'y_costhi');
    expect(result).toHaveLength(1);
  });

  it('does NOT filter y_costUser by cost limit (custom user metric bypasses the limit)', () => {
    // y_costUser allows users to enter arbitrary costs; the hard-coded limit must not apply
    const data = [
      pt({ costUser: { y: 1, roof: false } }),
      pt({ costUser: { y: 999, roof: false } }),
    ];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 2 }), 'y_costUser');
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
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1 }), 'y_unknownCost');
    expect(result).toHaveLength(2);
  });

  it('returns empty array when all points exceed the limit', () => {
    const data = [pt({ costh: { y: 5, roof: false } }), pt({ costh: { y: 10, roof: false } })];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1 }), 'y_costh');
    expect(result).toHaveLength(0);
  });

  it('returns all points when all are within the limit', () => {
    const data = [pt({ costh: { y: 0.5, roof: false } }), pt({ costh: { y: 0.9, roof: false } })];
    const result = filterDataByCostLimit(data, chartDef({ y_cost_limit: 1 }), 'y_costh');
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
    // inputTputPerGpu has x override to p90_ttft on interactivity chart
    const data = [
      pt({
        x: 100,
        inputTputPerGpu: { y: 5, roof: false },
        p90_ttft: 0.25,
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
        p90_ttft: 0.1,
        median_intvty: 50,
      } as any),
    ];
    const result = processOverlayChartData(data, 'interactivity', 'y_inputTputPerGpu', 'p90_ttft');
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0.1);
  });

  it('does not remap x for e2e chart even with input metrics', () => {
    const data = [
      pt({
        x: 100,
        inputTputPerGpu: { y: 5, roof: false },
        p90_ttft: 0.25,
        median_e2el: 2.5,
      } as any),
    ];
    const result = processOverlayChartData(data, 'e2e', 'y_inputTputPerGpu', null);
    expect(result).toHaveLength(1);
    // e2e uses median_e2el as x (from chart config default), not p90_ttft
    expect(result[0].x).toBe(2.5);
  });

  it('remaps x to TTFT for e2e chart when selectedXAxisMetric is p90_ttft', () => {
    const data = [
      pt({
        x: 100,
        tpPerGpu: { y: 42, roof: false },
        p90_ttft: 0.12,
        median_e2el: 2.5,
      } as any),
    ];
    const result = processOverlayChartData(data, 'e2e', 'y_tpPerGpu', 'p90_ttft');
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0.12);
  });

  it('filters e2e TTFT outliers exceeding y_latency_limit', () => {
    const data = [
      pt({ tpPerGpu: { y: 10, roof: false }, p90_ttft: 0.5, median_e2el: 1 } as any),
      pt({ tpPerGpu: { y: 5, roof: false }, p90_ttft: 999, median_e2el: 2 } as any),
    ];
    const result = processOverlayChartData(data, 'e2e', 'y_tpPerGpu', 'p90_ttft');
    // y_latency_limit is 60 in the e2e chart config — the 999 outlier should be filtered
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0.5);
  });

  it('does not filter interactivity points by latency limit when x-axis is default', () => {
    // Regression: selectedXAxisMetric defaults to 'p90_ttft' but the interactivity
    // chart's x-axis stays median_intvty for non-input metrics. The latency limit
    // (60) must NOT apply to median_intvty values.
    const data = [
      pt({ tpPerGpu: { y: 42, roof: false }, median_intvty: 200 } as any),
      pt({ tpPerGpu: { y: 10, roof: false }, median_intvty: 30 } as any),
    ];
    const result = processOverlayChartData(data, 'interactivity', 'y_tpPerGpu', 'p90_ttft');
    expect(result).toHaveLength(2);
  });

  it('applies latency limit on interactivity only when x-axis is actually overridden', () => {
    // When an input metric IS selected and x-axis overrides to p90_ttft,
    // the latency limit should apply.
    const data = [
      pt({ inputTputPerGpu: { y: 5, roof: false }, p90_ttft: 0.5, median_intvty: 10 } as any),
      pt({ inputTputPerGpu: { y: 3, roof: false }, p90_ttft: 999, median_intvty: 20 } as any),
    ];
    const result = processOverlayChartData(data, 'interactivity', 'y_inputTputPerGpu', 'p90_ttft');
    // x-axis is overridden to p90_ttft for input metric — latency limit SHOULD filter 999
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

  // Regression: overlay points must sit on the SAME x column as the official run.
  // useChartData plots agentic interactivity at withPercentile('median_intvty',
  // selectedPercentile) (e.g. p90_intvty). The overlay previously ignored the
  // percentile and used the raw median_intvty, so an `?unofficialrun=` overlay of
  // the very same run rendered to the right of its own official points on the
  // "P90 Interactivity" chart. See InferenceX_GLM.png misalignment report.
  it('applies the selected percentile to the natural interactivity x-axis for agentic overlays', () => {
    const data = [
      pt({ tpPerGpu: { y: 42, roof: false }, median_intvty: 200, p90_intvty: 130 } as any),
    ];
    const result = processOverlayChartData(data, 'interactivity', 'y_tpPerGpu', null, {
      isAgentic: true,
      selectedPercentile: 'p90',
    });
    expect(result).toHaveLength(1);
    // Must land on p90_intvty (130), NOT the raw median_intvty (200).
    expect(result[0].x).toBe(130);
  });

  it('applies the selected percentile to the natural e2e x-axis for agentic overlays', () => {
    const data = [pt({ tpPerGpu: { y: 42, roof: false }, median_e2el: 2.5, p99_e2el: 9 } as any)];
    const result = processOverlayChartData(data, 'e2e', 'y_tpPerGpu', null, {
      isAgentic: true,
      selectedPercentile: 'p99',
    });
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(9);
  });

  it('keeps the natural median x-axis for non-agentic overlays regardless of percentile', () => {
    // Fixed-seq rows have no p90_/p99_ columns; the percentile selector is hidden
    // and forced to median. A stale 'p90' must NOT be applied to fixed-seq overlays.
    const data = [
      pt({ tpPerGpu: { y: 42, roof: false }, median_intvty: 200, p90_intvty: 130 } as any),
    ];
    const result = processOverlayChartData(data, 'interactivity', 'y_tpPerGpu', null, {
      isAgentic: false,
      selectedPercentile: 'p90',
    });
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(200);
  });

  // Anti-benchmark-hacking parity: the agentic interactivity roofline is
  // restricted to configs that ALSO win on end-to-end latency. The overlay must
  // stamp `isOnE2eFrontier` the same way the official path does, so
  // overlayRooflines draws the same e2e-restricted frontier instead of a fresh
  // interactivity-plane one that rides above the official line. See uno.png.
  it('stamps isOnE2eFrontier on agentic interactivity overlays (restricts to e2e-Pareto winners)', () => {
    // e2e roofline for tpPerGpu is upper_right on (e2el, tput). With e2el 1/2/3
    // and tput 100/200/150, the frontier keeps A(1,100) and B(2,200); C(3,150)
    // is dominated (lower tput at higher latency) → NOT on the e2e frontier,
    // even though its higher interactivity would put it on a naive intvty front.
    const A = pt({
      tpPerGpu: { y: 100, roof: false },
      p90_e2el: 1,
      p90_intvty: 130,
    } as any);
    const B = pt({
      tpPerGpu: { y: 200, roof: false },
      p90_e2el: 2,
      p90_intvty: 90,
    } as any);
    const C = pt({
      tpPerGpu: { y: 150, roof: false },
      p90_e2el: 3,
      p90_intvty: 200,
    } as any);
    const result = processOverlayChartData([A, B, C], 'interactivity', 'y_tpPerGpu', null, {
      isAgentic: true,
      selectedPercentile: 'p90',
      restrictToE2eFrontier: true,
    });
    const frontierByY = Object.fromEntries(result.map((p) => [p.y, p.isOnE2eFrontier]));
    expect(frontierByY[100]).toBe(true); // A
    expect(frontierByY[200]).toBe(true); // B
    expect(frontierByY[150]).toBe(false); // C — interactivity-optimal but not e2e-optimal
  });

  it('does not stamp isOnE2eFrontier for non-agentic overlays', () => {
    // ChartDisplay computes restrictToE2eFrontier = isAgentic && mode !== 'e2e',
    // so fixed-seq always passes false.
    const data = [pt({ tpPerGpu: { y: 100, roof: false }, median_intvty: 50, p90_e2el: 1 } as any)];
    const result = processOverlayChartData(data, 'interactivity', 'y_tpPerGpu', null, {
      isAgentic: false,
      selectedPercentile: 'median',
      restrictToE2eFrontier: false,
    });
    expect(result[0].isOnE2eFrontier).toBeUndefined();
  });

  it('does not stamp isOnE2eFrontier in the e2e x-mode (it already IS the e2e frontier)', () => {
    const data = [pt({ tpPerGpu: { y: 100, roof: false }, median_e2el: 1, p90_e2el: 1 } as any)];
    const result = processOverlayChartData(data, 'e2e', 'y_tpPerGpu', null, {
      isAgentic: true,
      selectedPercentile: 'p90',
      restrictToE2eFrontier: false,
    });
    expect(result[0].isOnE2eFrontier).toBeUndefined();
  });

  it('stamps isOnE2eFrontier on the e2e chart when x is overridden to TTFT (ttft mode)', () => {
    // The 'ttft' x-axis mode renders the e2e chartType with a *_ttft override.
    // Official stamps the e2e-frontier flag for every non-e2e x-mode, so the
    // overlay must too — otherwise the TTFT overlay roofline draws a fresh
    // TTFT-plane frontier instead of the e2e-restricted one.
    const A = pt({
      tpPerGpu: { y: 100, roof: false },
      p90_e2el: 1,
      p90_ttft: 0.2,
    } as any);
    const B = pt({
      tpPerGpu: { y: 150, roof: false },
      p90_e2el: 3, // dominated on e2e? No — higher tput at higher e2el stays on upper_right
      p90_ttft: 0.4,
    } as any);
    const C = pt({
      tpPerGpu: { y: 90, roof: false },
      p90_e2el: 5, // dominated: lower tput than B at higher e2el
      p90_ttft: 0.1,
    } as any);
    const result = processOverlayChartData([A, B, C], 'e2e', 'y_tpPerGpu', 'p90_ttft', {
      isAgentic: true,
      selectedPercentile: 'p90',
      restrictToE2eFrontier: true,
    });
    const byY = Object.fromEntries(result.map((p) => [p.y, p.isOnE2eFrontier]));
    expect(byY[100]).toBe(true); // A
    expect(byY[150]).toBe(true); // B
    expect(byY[90]).toBe(false); // C — TTFT-optimal but not e2e-optimal
  });

  it('seeds the agentic e2e frontier per unofficial run (runs do not cross-dominate)', () => {
    // Merged across runs, run-2's point (higher e2el, lower tput) would be
    // dominated by run-1's and dropped. Per run, each is on its own frontier.
    const r1 = pt({
      tpPerGpu: { y: 500, roof: false },
      p90_e2el: 1,
      p90_intvty: 100,
      run_url: 'https://gh/runs/1',
    } as any);
    const r2 = pt({
      tpPerGpu: { y: 100, roof: false },
      p90_e2el: 5,
      p90_intvty: 40,
      run_url: 'https://gh/runs/2',
    } as any);
    const result = processOverlayChartData([r1, r2], 'interactivity', 'y_tpPerGpu', null, {
      isAgentic: true,
      selectedPercentile: 'p90',
      restrictToE2eFrontier: true,
    });
    const byUrl = Object.fromEntries(result.map((p) => [p.run_url, p.isOnE2eFrontier]));
    expect(byUrl['https://gh/runs/1']).toBe(true);
    expect(byUrl['https://gh/runs/2']).toBe(true); // false if runs were merged
  });

  it('leaves isOnE2eFrontier unset for metrics with no e2e roofline direction', () => {
    // y_measuredAvgPower has no `_roofline` on the e2e chart def, so no e2e
    // restriction applies. The official path leaves the flag undefined and
    // draws the roofline unrestricted; the overlay must do the same — an
    // all-false stamping here would seed an EMPTY overlay frontier and (with
    // Optimal Only on) hide every overlay point.
    const data = [
      pt({
        measuredAvgPower: { y: 700, roof: false },
        p90_intvty: 100,
        p90_e2el: 10,
      } as any),
    ];
    const result = processOverlayChartData(data, 'interactivity', 'y_measuredAvgPower', null, {
      isAgentic: true,
      selectedPercentile: 'p90',
      restrictToE2eFrontier: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].isOnE2eFrontier).toBeUndefined();
  });

  it('applies the selected percentile to an agentic input-metric x override', () => {
    // Input metrics on the interactivity chart override x to *_ttft; agentic must
    // carry the chosen percentile onto that override (p90_ttft) too.
    const data = [
      pt({
        inputTputPerGpu: { y: 5, roof: false },
        median_ttft: 0.1,
        p90_ttft: 0.4,
      } as any),
    ];
    const result = processOverlayChartData(data, 'interactivity', 'y_inputTputPerGpu', null, {
      isAgentic: true,
      selectedPercentile: 'p90',
    });
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0.4);
  });
});
