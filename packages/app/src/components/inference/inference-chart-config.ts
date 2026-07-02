/**
 * The two chart definitions (interactivity + e2e), DERIVED from the typed
 * metric registry (`@/lib/metric-registry`).
 *
 * This module replaces the former hand-maintained `inference-chart-config.json`.
 * It rebuilds the exact same flat `ChartDefinition` shape every component reader
 * (and every Cypress mock) already depends on — `y_<metric>`, `y_<metric>_label`,
 * `y_<metric>_title`, `y_<metric>_roofline`, the input-metric `_x` / `_x_label` /
 * `_heading` overrides, and the `y_cost_limit` / `y_latency_limit` clamps — so no
 * consumer had to change how it reads config. The single source of truth is now
 * the registry; adding a metric is one registry entry (see AGENTS.md).
 *
 * The `metric-registry.golden.test.ts` oracle pins the resolved output of this
 * module byte-for-byte against the legacy JSON, guaranteeing the derivation is
 * behaviour-preserving.
 */

import type { AggDataEntry, ChartDefinition, InferenceChartType } from '@/lib/chart-types';
import {
  CHART_AXIS_CONFIG,
  CHART_TYPES,
  getMetricDefinition,
  METRIC_KEYS,
} from '@/lib/metric-registry';

/** Build one flat `ChartDefinition` for a chart type from the registry. */
function buildChartDefinition(chartType: InferenceChartType): ChartDefinition {
  const axis = CHART_AXIS_CONFIG[chartType];

  // Chart-level base fields, matching the legacy JSON key order (chartType,
  // heading, x, x_label, y, then per-metric groups, then the two limits).
  const def: Record<string, unknown> = {
    chartType,
    heading: axis.heading,
    x: axis.x as keyof AggDataEntry,
    x_label: axis.xLabel,
    y: axis.y as keyof AggDataEntry,
  };

  for (const key of METRIC_KEYS) {
    // getMetricDefinition returns the uniform MetricDefinition shape (unlike the
    // `satisfies`-narrowed per-key literal), so optional fields are accessible.
    const m = getMetricDefinition(key)!;
    def[key] = m.path;
    def[`${key}_label`] = m.label;
    def[`${key}_title`] = m.title;

    const roofline = m.roofline[chartType];
    if (roofline !== undefined) {
      def[`${key}_roofline`] = roofline;
    }

    // Input-metric x-axis overrides: emitted for both charts (the readers only
    // act on them for the interactivity chart), matching the legacy JSON which
    // carried `_x` / `_x_label` on both. The `_heading` override is
    // interactivity-only (the e2e JSON never had it). Gated on the override
    // fields themselves, not `isInputMetric` — only `y_inputTputPerGpu` carries
    // them, so only it gets `_x` / `_x_label` / `_heading` (as before).
    if (m.xOverride !== undefined) def[`${key}_x`] = m.xOverride;
    if (m.xOverrideLabel !== undefined) def[`${key}_x_label`] = m.xOverrideLabel;
    if (chartType === 'interactivity' && m.interactivityHeading !== undefined) {
      def[`${key}_heading`] = m.interactivityHeading;
    }
  }

  def.y_cost_limit = axis.costLimit;
  def.y_latency_limit = axis.latencyLimit;

  return def as unknown as ChartDefinition;
}

const chartDefinitions: ChartDefinition[] = CHART_TYPES.map(buildChartDefinition);

export default chartDefinitions;
