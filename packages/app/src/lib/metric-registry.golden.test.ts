/**
 * GOLDEN ORACLE for the metric-definition refactor.
 *
 * This test pins the EFFECTIVE resolution of every per-metric config field, for
 * BOTH chart definitions and EVERY selectable metric key, exactly as the app's
 * readers compute them TODAY. It is deliberately independent of the internal
 * config representation: it resolves everything through the same public surface
 * the runtime consumers use (the `ChartDefinition[]` exported by the chart
 * config module), so it must pass byte-identically before and after the JSON →
 * registry migration.
 *
 * What it covers, per (chartType, metricKey):
 *   - value path      chartDef[metric]                  (dotted "<field>.y")
 *   - y label         chartDef[`${metric}_label`]
 *   - title           chartDef[`${metric}_title`]
 *   - roofline dir    chartDef[`${metric}_roofline`]
 *   - x override      chartDef[`${metric}_x`] / `_x_label`
 *   - heading         chartDef[`${metric}_heading`]
 * Plus, once per chart: the `y_cost_limit` / `y_latency_limit` clamps and the
 * `x` / `x_label` / `heading` / `chartType` / `y` chart-level fields.
 *
 * It ALSO pins the two derived-behaviour resolvers the app layers on top of the
 * raw fields, because those are the actual observable behaviour:
 *   - the "input metric" detection (today: `title.toLowerCase().includes('input')`)
 *   - the effective x-axis field resolution (buildReplayTimeline.resolveXAxisField
 *     / useChartData / processOverlayChartData share this logic)
 *   - the roofline direction lookup with its `lower_right` default
 *     (useGroupedRooflines.rooflineDirectionFor)
 *
 * If a future edit changes any resolved value, this snapshot fails and the diff
 * shows exactly which (chart, metric, field) drifted.
 */

import { describe, it, expect } from 'vitest';

import chartDefinitions from '@/components/inference/inference-chart-config';
import type { ChartDefinition } from '@/lib/chart-types';
import { Y_AXIS_METRICS } from '@/lib/chart-point';

const defs = chartDefinitions as unknown as ChartDefinition[];

// Every selectable Y-axis metric key. Y_AXIS_METRICS is the roofline-bearing
// universe; `y_costUser` / `y_powerUser` are dropdown-only (custom user values)
// and are appended so the oracle also covers their label/title/roofline reads.
// `'y'` is the plain-throughput default and carries no per-metric fields.
const METRIC_KEYS: string[] = [
  ...Y_AXIS_METRICS.filter((m) => m !== 'y'),
  'y_costUser',
  'y_powerUser',
];

// --- Verbatim copies of the app's resolver logic (the oracle) --------------
// These mirror the shared readers exactly so the golden values are computed the
// same way the runtime does. They intentionally do NOT import the app helpers,
// so a refactor that changes those helpers is still measured against a frozen
// expectation.

function readTitle(chartDef: ChartDefinition, metric: string): string {
  return (chartDef[`${metric}_title` as keyof ChartDefinition] as string) || '';
}

function isInputMetric(chartDef: ChartDefinition, metric: string): boolean {
  return readTitle(chartDef, metric).toLowerCase().includes('input');
}

// buildReplayTimeline.resolveXAxisField / processOverlayChartData, with
// selectedXAxisMetric = null (the default, no user x-override) so the pinned
// value is the metric's intrinsic x-axis field.
function resolveDefaultXAxisField(chartDef: ChartDefinition, metric: string): string {
  const input = isInputMetric(chartDef, metric);
  if (chartDef.chartType === 'interactivity' && input) {
    const xOverrideKey = `${metric}_x` as keyof ChartDefinition;
    return (chartDef[xOverrideKey] as string) || (chartDef.x as string);
  }
  return chartDef.x as string;
}

// useGroupedRooflines.rooflineDirectionFor: read `${metric}_roofline`, default
// to 'lower_right' when absent.
function effectiveRooflineDirection(chartDef: ChartDefinition, metric: string): string {
  const dir = chartDef[`${metric}_roofline` as keyof ChartDefinition] as string | undefined;
  return dir ?? 'lower_right';
}

interface ResolvedMetric {
  valuePath: string | undefined;
  label: string | undefined;
  title: string | undefined;
  rooflineRaw: string | undefined;
  rooflineEffective: string;
  xOverride: string | undefined;
  xOverrideLabel: string | undefined;
  heading: string | undefined;
  isInput: boolean;
  defaultXAxisField: string;
}

function resolveMetric(chartDef: ChartDefinition, metric: string): ResolvedMetric {
  const get = (suffix: string) =>
    chartDef[`${metric}${suffix}` as keyof ChartDefinition] as string | undefined;
  return {
    valuePath: chartDef[metric as keyof ChartDefinition] as string | undefined,
    label: get('_label'),
    title: get('_title'),
    rooflineRaw: get('_roofline'),
    rooflineEffective: effectiveRooflineDirection(chartDef, metric),
    xOverride: get('_x'),
    xOverrideLabel: get('_x_label'),
    heading: get('_heading'),
    isInput: isInputMetric(chartDef, metric),
    defaultXAxisField: resolveDefaultXAxisField(chartDef, metric),
  };
}

function resolveChart(chartDef: ChartDefinition) {
  const perMetric: Record<string, ResolvedMetric> = {};
  for (const m of METRIC_KEYS) perMetric[m] = resolveMetric(chartDef, m);
  return {
    chartType: chartDef.chartType,
    x: chartDef.x,
    x_label: chartDef.x_label,
    y: chartDef.y,
    heading: chartDef.heading,
    y_cost_limit: chartDef.y_cost_limit,
    y_latency_limit: chartDef.y_latency_limit,
    perMetric,
  };
}

describe('metric config golden oracle', () => {
  it('exposes exactly two chart definitions (interactivity, e2e)', () => {
    expect(defs.map((d) => d.chartType)).toEqual(['interactivity', 'e2e']);
  });

  it('covers every selectable metric key', () => {
    // 24 roofline metrics (Y_AXIS_METRICS minus 'y') + 2 custom-user metrics.
    expect(METRIC_KEYS).toMatchInlineSnapshot(`
      [
        "y_tpPerGpu",
        "y_inputTputPerGpu",
        "y_outputTputPerGpu",
        "y_tpPerMw",
        "y_inputTputPerMw",
        "y_outputTputPerMw",
        "y_costh",
        "y_costn",
        "y_costr",
        "y_costhOutput",
        "y_costnOutput",
        "y_costrOutput",
        "y_costhi",
        "y_costni",
        "y_costri",
        "y_jTotal",
        "y_jOutput",
        "y_jInput",
        "y_measuredAvgPower",
        "y_measuredPrefillAvgPower",
        "y_measuredDecodeAvgPower",
        "y_measuredJPerOutputToken",
        "y_measuredJPerTotalToken",
        "y_measuredJPerInputToken",
        "y_costUser",
        "y_powerUser",
      ]
    `);
  });

  it('resolves the interactivity chart identically to today', () => {
    expect(resolveChart(defs[0])).toMatchInlineSnapshot(`
      {
        "chartType": "interactivity",
        "heading": "vs. Interactivity",
        "perMetric": {
          "y_costUser": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Total Tokens ($)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Cost per Million Total Tokens (Custom User Values)",
            "valuePath": "costUser.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costh": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Total Tokens ($)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Cost per Million Total Tokens (Owning - Hyperscaler)",
            "valuePath": "costh.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costhOutput": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Output Tokens ($)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Cost per Million Output Tokens (Owning - Hyperscaler)",
            "valuePath": "costhOutput.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costhi": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": true,
            "label": "Cost per Million Input Tokens ($)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Cost per Million Input Tokens (Owning - Hyperscaler)",
            "valuePath": "costhi.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costn": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Total Tokens ($)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Cost per Million Total Tokens (Owning - Neocloud Giant)",
            "valuePath": "costn.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costnOutput": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Output Tokens ($)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Cost per Million Output Tokens (Owning - Neocloud Giant)",
            "valuePath": "costnOutput.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costni": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": true,
            "label": "Cost per Million Input Tokens ($)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Cost per Million Input Tokens (Owning - Neocloud Giant)",
            "valuePath": "costni.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costr": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Total Tokens ($)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Cost per Million Total Tokens (3 Year Rental)",
            "valuePath": "costr.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costrOutput": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Output Tokens ($)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Cost per Million Output Tokens (3 Year Rental)",
            "valuePath": "costrOutput.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costri": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": true,
            "label": "Cost per Million Input Tokens ($)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Cost per Million Input Tokens (3 Year Rental)",
            "valuePath": "costri.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_inputTputPerGpu": {
            "defaultXAxisField": "p99_ttft",
            "heading": "vs. P99 Time To First Token",
            "isInput": true,
            "label": "Input Token Throughput per GPU (tok/s/gpu)",
            "rooflineEffective": "upper_left",
            "rooflineRaw": "upper_left",
            "title": "Input Token Throughput per GPU",
            "valuePath": "inputTputPerGpu.y",
            "xOverride": "p99_ttft",
            "xOverrideLabel": "P99 Time To First Token (s)",
          },
          "y_inputTputPerMw": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": true,
            "label": "Input Token Throughput per All in Utility MW (tok/s/MW)",
            "rooflineEffective": "upper_left",
            "rooflineRaw": "upper_left",
            "title": "Input Token Throughput per All in Utility MW",
            "valuePath": "inputTputPerMw.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_jInput": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": true,
            "label": "All-in Provisioned J per Input Token (J/tok)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "All-in Provisioned Joules per Input Token",
            "valuePath": "jInput.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_jOutput": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "All-in Provisioned J per Output Token (J/tok)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "All-in Provisioned Joules per Output Token",
            "valuePath": "jOutput.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_jTotal": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "All-in Provisioned J per Total Token (J/tok)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "All-in Provisioned Joules per Total Token",
            "valuePath": "jTotal.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredAvgPower": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Measured Avg Power per GPU (W)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": undefined,
            "title": "Measured Average Power per GPU",
            "valuePath": "measuredAvgPower.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredDecodeAvgPower": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Measured Decode Power per GPU (W)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": undefined,
            "title": "Measured Decode Power per GPU",
            "valuePath": "measuredDecodeAvgPower.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredJPerInputToken": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": true,
            "label": "Measured J per Input Token (J/tok)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Measured Joules per Input Token",
            "valuePath": "measuredJPerInputToken.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredJPerOutputToken": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Measured J per Output Token (J/tok)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Measured Joules per Output Token",
            "valuePath": "measuredJPerOutputToken.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredJPerTotalToken": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Measured J per Token (J/tok)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": "lower_right",
            "title": "Measured Joules per Token (incl. prompt)",
            "valuePath": "measuredJPerTotalToken.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredPrefillAvgPower": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Measured Prefill Power per GPU (W)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": undefined,
            "title": "Measured Prefill Power per GPU",
            "valuePath": "measuredPrefillAvgPower.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_outputTputPerGpu": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Output Token Throughput per GPU (tok/s/gpu)",
            "rooflineEffective": "upper_left",
            "rooflineRaw": "upper_left",
            "title": "Output Token Throughput per GPU",
            "valuePath": "outputTputPerGpu.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_outputTputPerMw": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Output Token Throughput per All in Utility MW (tok/s/MW)",
            "rooflineEffective": "upper_left",
            "rooflineRaw": "upper_left",
            "title": "Output Token Throughput per All in Utility MW",
            "valuePath": "outputTputPerMw.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_powerUser": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Token Throughput per All in Utility MW (tok/s/MW)",
            "rooflineEffective": "upper_left",
            "rooflineRaw": "upper_left",
            "title": "Token Throughput per All in Utility MW (Custom User Values)",
            "valuePath": "powerUser.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_tpPerGpu": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Token Throughput per GPU (tok/s/gpu)",
            "rooflineEffective": "upper_left",
            "rooflineRaw": "upper_left",
            "title": "Token Throughput per GPU",
            "valuePath": "tpPerGpu.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_tpPerMw": {
            "defaultXAxisField": "median_intvty",
            "heading": undefined,
            "isInput": false,
            "label": "Token Throughput per All in Utility MW (tok/s/MW)",
            "rooflineEffective": "upper_left",
            "rooflineRaw": "upper_left",
            "title": "Token Throughput per All in Utility MW",
            "valuePath": "tpPerMw.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
        },
        "x": "median_intvty",
        "x_label": "Interactivity (tok/s/user)",
        "y": "tput_per_gpu",
        "y_cost_limit": 5,
        "y_latency_limit": 60,
      }
    `);
  });

  it('resolves the e2e chart identically to today', () => {
    expect(resolveChart(defs[1])).toMatchInlineSnapshot(`
      {
        "chartType": "e2e",
        "heading": "vs. End-to-end Latency",
        "perMetric": {
          "y_costUser": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Total Tokens ($)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Cost per Million Total Tokens (Custom User Values)",
            "valuePath": "costUser.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costh": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Total Tokens ($)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Cost per Million Total Tokens (Owning - Hyperscaler)",
            "valuePath": "costh.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costhOutput": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Output Tokens ($)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Cost per Million Output Tokens (Owning - Hyperscaler)",
            "valuePath": "costhOutput.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costhi": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": true,
            "label": "Cost per Million Input Tokens ($)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Cost per Million Input Tokens (Owning - Hyperscaler)",
            "valuePath": "costhi.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costn": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Total Tokens ($)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Cost per Million Total Tokens (Owning - Neocloud Giant)",
            "valuePath": "costn.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costnOutput": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Output Tokens ($)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Cost per Million Output Tokens (Owning - Neocloud Giant)",
            "valuePath": "costnOutput.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costni": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": true,
            "label": "Cost per Million Input Tokens ($)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Cost per Million Input Tokens (Owning - Neocloud Giant)",
            "valuePath": "costni.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costr": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Total Tokens ($)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Cost per Million Total Tokens (3 Year Rental)",
            "valuePath": "costr.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costrOutput": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Cost per Million Output Tokens ($)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Cost per Million Output Tokens (3 Year Rental)",
            "valuePath": "costrOutput.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_costri": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": true,
            "label": "Cost per Million Input Tokens ($)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Cost per Million Input Tokens (3 Year Rental)",
            "valuePath": "costri.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_inputTputPerGpu": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": true,
            "label": "Input Token Throughput per GPU (tok/s/gpu)",
            "rooflineEffective": "upper_right",
            "rooflineRaw": "upper_right",
            "title": "Input Token Throughput per GPU",
            "valuePath": "inputTputPerGpu.y",
            "xOverride": "p99_ttft",
            "xOverrideLabel": "P99 Time To First Token (s)",
          },
          "y_inputTputPerMw": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": true,
            "label": "Input Token Throughput per All in Utility MW (tok/s/MW)",
            "rooflineEffective": "upper_right",
            "rooflineRaw": "upper_right",
            "title": "Input Token Throughput per All in Utility MW",
            "valuePath": "inputTputPerMw.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_jInput": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": true,
            "label": "All-in Provisioned J per Input Token (J/tok)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "All-in Provisioned Joules per Input Token",
            "valuePath": "jInput.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_jOutput": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "All-in Provisioned J per Output Token (J/tok)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "All-in Provisioned Joules per Output Token",
            "valuePath": "jOutput.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_jTotal": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "All-in Provisioned J per Total Token (J/tok)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "All-in Provisioned Joules per Total Token",
            "valuePath": "jTotal.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredAvgPower": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Measured Avg Power per GPU (W)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": undefined,
            "title": "Measured Average Power per GPU",
            "valuePath": "measuredAvgPower.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredDecodeAvgPower": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Measured Decode Power per GPU (W)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": undefined,
            "title": "Measured Decode Power per GPU",
            "valuePath": "measuredDecodeAvgPower.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredJPerInputToken": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": true,
            "label": "Measured J per Input Token (J/tok)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Measured Joules per Input Token",
            "valuePath": "measuredJPerInputToken.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredJPerOutputToken": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Measured J per Output Token (J/tok)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Measured Joules per Output Token",
            "valuePath": "measuredJPerOutputToken.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredJPerTotalToken": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Measured J per Token (J/tok)",
            "rooflineEffective": "lower_left",
            "rooflineRaw": "lower_left",
            "title": "Measured Joules per Token (incl. prompt)",
            "valuePath": "measuredJPerTotalToken.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_measuredPrefillAvgPower": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Measured Prefill Power per GPU (W)",
            "rooflineEffective": "lower_right",
            "rooflineRaw": undefined,
            "title": "Measured Prefill Power per GPU",
            "valuePath": "measuredPrefillAvgPower.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_outputTputPerGpu": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Output Token Throughput per GPU (tok/s/gpu)",
            "rooflineEffective": "upper_right",
            "rooflineRaw": "upper_right",
            "title": "Output Token Throughput per GPU",
            "valuePath": "outputTputPerGpu.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_outputTputPerMw": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Output Token Throughput per All in Utility MW (tok/s/MW)",
            "rooflineEffective": "upper_right",
            "rooflineRaw": "upper_right",
            "title": "Output Token Throughput per All in Utility MW",
            "valuePath": "outputTputPerMw.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_powerUser": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Token Throughput per All in Utility MW (tok/s/MW)",
            "rooflineEffective": "upper_right",
            "rooflineRaw": "upper_right",
            "title": "Token Throughput per All in Utility MW (Custom User Values)",
            "valuePath": "powerUser.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_tpPerGpu": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Token Throughput per GPU (tok/s/gpu)",
            "rooflineEffective": "upper_right",
            "rooflineRaw": "upper_right",
            "title": "Token Throughput per GPU",
            "valuePath": "tpPerGpu.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
          "y_tpPerMw": {
            "defaultXAxisField": "median_e2el",
            "heading": undefined,
            "isInput": false,
            "label": "Token Throughput per All in Utility MW (tok/s/MW)",
            "rooflineEffective": "upper_right",
            "rooflineRaw": "upper_right",
            "title": "Token Throughput per All in Utility MW",
            "valuePath": "tpPerMw.y",
            "xOverride": undefined,
            "xOverrideLabel": undefined,
          },
        },
        "x": "median_e2el",
        "x_label": "End-to-end Latency (s)",
        "y": "tput_per_gpu",
        "y_cost_limit": 5,
        "y_latency_limit": 60,
      }
    `);
  });
});
