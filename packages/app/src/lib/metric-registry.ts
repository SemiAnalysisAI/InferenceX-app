/**
 * SINGLE SOURCE OF TRUTH for every Y-axis metric the inference charts can plot.
 *
 * Historically each metric was hand-declared in FIVE places that had to stay in
 * lockstep: `ChartDefinition` (4 flat fields × ~26 metrics), the two flat
 * `inference-chart-config.json` chart objects, `Y_AXIS_METRICS`,
 * `ROOFLINE_METRIC_FIELDS`, and the dropdown option list. This registry collapses
 * all of that into one typed table; the flat `ChartDefinition[]` the components
 * consume, `Y_AXIS_METRICS`, and `ROOFLINE_METRIC_FIELDS` are all DERIVED from it
 * (see `inference-chart-config.ts`, `chart-point.ts`, `roofline.ts`).
 *
 * Adding a metric is now a single registry entry (plus, if it should appear in
 * the dropdown, one line in `ChartControls.METRIC_GROUPS`). See AGENTS.md
 * "Add/modify a metric".
 *
 * Runtime-compatible: no Node.js modules, no build-time deps — imported by
 * runtime chart code and API routes alike.
 */

import type { InferenceChartType, YAxisMetricKey } from '@/lib/chart-types';

/** Pareto-front direction for a metric on a given chart. */
export type RooflineDirection = 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';

/**
 * One metric's definition. Everything here is chart-independent EXCEPT
 * `roofline`, whose direction flips between the interactivity and e2e charts
 * (higher/lower-is-better reverses when the x-axis good-direction reverses).
 */
export interface MetricDefinition {
  /**
   * The `InferenceData` field this metric plots, as a dotted accessor path
   * (e.g. `'costh.y'`). This is the value the flat config exposes as
   * `chartDef[metricKey]` and that `getNestedYValue` reads.
   */
  path: string;
  /** Y-axis / table-column label (units), e.g. `'Cost per Million Total Tokens ($)'`. */
  label: string;
  /** Human title used in the dropdown, chart subtitle, and input-metric detection. */
  title: string;
  /**
   * Pareto direction per chart. `undefined` for a chart means "no pre-marked
   * roofline for this metric on that chart" — consumers fall back to their
   * historical default (`lower_right`) via `rooflineDirectionFor`. The
   * measured-power metrics have no configured roofline on either chart.
   */
  roofline: {
    interactivity?: RooflineDirection;
    e2e?: RooflineDirection;
  };
  /**
   * Marks this as an "input" metric. Replaces the old
   * `title.toLowerCase().includes('input')` string sniff with an explicit flag.
   * Set for EXACTLY the metrics whose title contained "input" under the legacy
   * config (input throughput per-GPU / per-MW, the three per-input-token cost
   * metrics, and the two per-input-token energy metrics), so the observable
   * behaviour is byte-identical — no accidental match on a future title.
   *
   * On the interactivity chart this drives the X-Axis Metric dropdown / X-Axis
   * Scale selector visibility and the dynamic "vs. TTFT" heading. The actual
   * x-axis SWAP additionally requires `xOverride` (only `y_inputTputPerGpu` has
   * it), exactly as the legacy `chartDef[`${metric}_x`] || chartDef.x` fallback.
   */
  isInputMetric?: boolean;
  /** X-axis field to swap to on the interactivity chart (input metrics only). */
  xOverride?: string;
  /** X-axis label for the swapped axis (input metrics only). */
  xOverrideLabel?: string;
  /** Interactivity-chart heading override (input metrics only). */
  interactivityHeading?: string;
  /**
   * Whether this metric participates in the pre-computed roofline marking pass
   * (`Y_AXIS_METRICS` / `ROOFLINE_METRIC_FIELDS`). The custom-user metrics
   * (`y_costUser` / `y_powerUser`) are computed on the fly and are NOT part of
   * that universe, so they set this `false`.
   */
  inYAxisMetrics: boolean;
  /**
   * The `{ y, roof }` field key on `InferenceData` for the roof-marking pass.
   * Only meaningful when `inYAxisMetrics` is true.
   */
  rooflineField?: YAxisMetricKey;
  /**
   * Whether `rooflineField` is ALWAYS present on a point (required) or only
   * conditionally (optional — created only when the source stat exists). This
   * exactly preserves `ROOFLINE_METRIC_FIELDS[].required`. Only meaningful when
   * `inYAxisMetrics` is true.
   */
  rooflineRequired?: boolean;
}

/**
 * The metric-key naming convention: always `y_` + the `InferenceData` field
 * (`y_tpPerGpu`, `y_costh`, …). This is the shape that appears in the dropdown,
 * URL (`i_metric`), and flat config. The PRECISE set of registered keys is the
 * `MetricKey` union below (derived from `METRIC_REGISTRY`'s actual keys); this
 * alias is only the naming pattern used in constraints.
 */
export type MetricKeyPattern = `y_${string}`;

/**
 * The registry. INSERTION ORDER MATTERS: `Y_AXIS_METRICS` is derived from this
 * in order, and the roofline-marking passes iterate it — the order here matches
 * the historical `Y_AXIS_METRICS` / `ROOFLINE_METRIC_FIELDS` order exactly.
 *
 * Declared with `satisfies` (not an explicit `Record<…>` annotation) so the
 * exact key literals are preserved for `MetricKey` below — that precise union is
 * what generates the flat `ChartDefinition` fields without an index signature.
 *
 * The dropdown's group order is owned separately by `ChartControls.METRIC_GROUPS`
 * (a curated grouping, not 1:1 with this order), so changing order here does not
 * reorder the dropdown.
 */
export const METRIC_REGISTRY = {
  y_tpPerGpu: {
    path: 'tpPerGpu.y',
    label: 'Token Throughput per GPU (tok/s/gpu)',
    title: 'Token Throughput per GPU',
    roofline: { interactivity: 'upper_left', e2e: 'upper_right' },
    inYAxisMetrics: true,
    rooflineField: 'tpPerGpu',
    rooflineRequired: true,
  },
  y_inputTputPerGpu: {
    path: 'inputTputPerGpu.y',
    label: 'Input Token Throughput per GPU (tok/s/gpu)',
    title: 'Input Token Throughput per GPU',
    roofline: { interactivity: 'upper_left', e2e: 'upper_right' },
    isInputMetric: true,
    xOverride: 'p99_ttft',
    xOverrideLabel: 'P99 Time To First Token (s)',
    interactivityHeading: 'vs. P99 Time To First Token',
    inYAxisMetrics: true,
    rooflineField: 'inputTputPerGpu',
    rooflineRequired: false,
  },
  y_outputTputPerGpu: {
    path: 'outputTputPerGpu.y',
    label: 'Output Token Throughput per GPU (tok/s/gpu)',
    title: 'Output Token Throughput per GPU',
    roofline: { interactivity: 'upper_left', e2e: 'upper_right' },
    inYAxisMetrics: true,
    rooflineField: 'outputTputPerGpu',
    rooflineRequired: false,
  },
  y_tpPerMw: {
    path: 'tpPerMw.y',
    label: 'Token Throughput per All in Utility MW (tok/s/MW)',
    title: 'Token Throughput per All in Utility MW',
    roofline: { interactivity: 'upper_left', e2e: 'upper_right' },
    inYAxisMetrics: true,
    rooflineField: 'tpPerMw',
    rooflineRequired: true,
  },
  y_inputTputPerMw: {
    path: 'inputTputPerMw.y',
    label: 'Input Token Throughput per All in Utility MW (tok/s/MW)',
    title: 'Input Token Throughput per All in Utility MW',
    roofline: { interactivity: 'upper_left', e2e: 'upper_right' },
    isInputMetric: true,
    inYAxisMetrics: true,
    rooflineField: 'inputTputPerMw',
    rooflineRequired: false,
  },
  y_outputTputPerMw: {
    path: 'outputTputPerMw.y',
    label: 'Output Token Throughput per All in Utility MW (tok/s/MW)',
    title: 'Output Token Throughput per All in Utility MW',
    roofline: { interactivity: 'upper_left', e2e: 'upper_right' },
    inYAxisMetrics: true,
    rooflineField: 'outputTputPerMw',
    rooflineRequired: false,
  },
  y_costh: {
    path: 'costh.y',
    label: 'Cost per Million Total Tokens ($)',
    title: 'Cost per Million Total Tokens (Owning - Hyperscaler)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: true,
    rooflineField: 'costh',
    rooflineRequired: true,
  },
  y_costn: {
    path: 'costn.y',
    label: 'Cost per Million Total Tokens ($)',
    title: 'Cost per Million Total Tokens (Owning - Neocloud Giant)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: true,
    rooflineField: 'costn',
    rooflineRequired: true,
  },
  y_costr: {
    path: 'costr.y',
    label: 'Cost per Million Total Tokens ($)',
    title: 'Cost per Million Total Tokens (3 Year Rental)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: true,
    rooflineField: 'costr',
    rooflineRequired: true,
  },
  y_costhOutput: {
    path: 'costhOutput.y',
    label: 'Cost per Million Output Tokens ($)',
    title: 'Cost per Million Output Tokens (Owning - Hyperscaler)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: true,
    rooflineField: 'costhOutput',
    rooflineRequired: false,
  },
  y_costnOutput: {
    path: 'costnOutput.y',
    label: 'Cost per Million Output Tokens ($)',
    title: 'Cost per Million Output Tokens (Owning - Neocloud Giant)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: true,
    rooflineField: 'costnOutput',
    rooflineRequired: false,
  },
  y_costrOutput: {
    path: 'costrOutput.y',
    label: 'Cost per Million Output Tokens ($)',
    title: 'Cost per Million Output Tokens (3 Year Rental)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: true,
    rooflineField: 'costrOutput',
    rooflineRequired: false,
  },
  y_costhi: {
    path: 'costhi.y',
    label: 'Cost per Million Input Tokens ($)',
    title: 'Cost per Million Input Tokens (Owning - Hyperscaler)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    isInputMetric: true,
    inYAxisMetrics: true,
    rooflineField: 'costhi',
    rooflineRequired: true,
  },
  y_costni: {
    path: 'costni.y',
    label: 'Cost per Million Input Tokens ($)',
    title: 'Cost per Million Input Tokens (Owning - Neocloud Giant)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    isInputMetric: true,
    inYAxisMetrics: true,
    rooflineField: 'costni',
    rooflineRequired: true,
  },
  y_costri: {
    path: 'costri.y',
    label: 'Cost per Million Input Tokens ($)',
    title: 'Cost per Million Input Tokens (3 Year Rental)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    isInputMetric: true,
    inYAxisMetrics: true,
    rooflineField: 'costri',
    rooflineRequired: true,
  },
  y_jTotal: {
    path: 'jTotal.y',
    label: 'All-in Provisioned J per Total Token (J/tok)',
    title: 'All-in Provisioned Joules per Total Token',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: true,
    rooflineField: 'jTotal',
    rooflineRequired: false,
  },
  y_jOutput: {
    path: 'jOutput.y',
    label: 'All-in Provisioned J per Output Token (J/tok)',
    title: 'All-in Provisioned Joules per Output Token',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: true,
    rooflineField: 'jOutput',
    rooflineRequired: false,
  },
  y_jInput: {
    path: 'jInput.y',
    label: 'All-in Provisioned J per Input Token (J/tok)',
    title: 'All-in Provisioned Joules per Input Token',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    isInputMetric: true,
    inYAxisMetrics: true,
    rooflineField: 'jInput',
    rooflineRequired: false,
  },
  y_measuredAvgPower: {
    path: 'measuredAvgPower.y',
    label: 'Measured Avg Power per GPU (W)',
    title: 'Measured Average Power per GPU',
    // No configured roofline on either chart — falls back to lower_right at
    // render time (matches "lower power at the same interactivity is better").
    roofline: {},
    inYAxisMetrics: true,
    rooflineField: 'measuredAvgPower',
    rooflineRequired: false,
  },
  y_measuredPrefillAvgPower: {
    path: 'measuredPrefillAvgPower.y',
    label: 'Measured Prefill Power per GPU (W)',
    title: 'Measured Prefill Power per GPU',
    roofline: {},
    inYAxisMetrics: true,
    rooflineField: 'measuredPrefillAvgPower',
    rooflineRequired: false,
  },
  y_measuredDecodeAvgPower: {
    path: 'measuredDecodeAvgPower.y',
    label: 'Measured Decode Power per GPU (W)',
    title: 'Measured Decode Power per GPU',
    roofline: {},
    inYAxisMetrics: true,
    rooflineField: 'measuredDecodeAvgPower',
    rooflineRequired: false,
  },
  y_measuredJPerOutputToken: {
    path: 'measuredJPerOutputToken.y',
    label: 'Measured J per Output Token (J/tok)',
    title: 'Measured Joules per Output Token',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: true,
    rooflineField: 'measuredJPerOutputToken',
    rooflineRequired: false,
  },
  // NOTE: Y_AXIS_METRICS / ROOFLINE_METRIC_FIELDS order historically listed the
  // "total" measured-J metric before the "input" one; that ordering is preserved
  // by `measuredJPerTotalToken` appearing before `measuredJPerInputToken` here.
  y_measuredJPerTotalToken: {
    path: 'measuredJPerTotalToken.y',
    label: 'Measured J per Token (J/tok)',
    title: 'Measured Joules per Token (incl. prompt)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: true,
    rooflineField: 'measuredJPerTotalToken',
    rooflineRequired: false,
  },
  y_measuredJPerInputToken: {
    path: 'measuredJPerInputToken.y',
    label: 'Measured J per Input Token (J/tok)',
    title: 'Measured Joules per Input Token',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    isInputMetric: true,
    inYAxisMetrics: true,
    rooflineField: 'measuredJPerInputToken',
    rooflineRequired: false,
  },
  // Custom-user metrics: computed at render time from user cost/power inputs, so
  // they are NOT part of the pre-marked roofline universe (Y_AXIS_METRICS). They
  // still carry a roofline direction for the on-the-fly `rooflineDirectionFor`.
  y_costUser: {
    path: 'costUser.y',
    label: 'Cost per Million Total Tokens ($)',
    title: 'Cost per Million Total Tokens (Custom User Values)',
    roofline: { interactivity: 'lower_right', e2e: 'lower_left' },
    inYAxisMetrics: false,
  },
  y_powerUser: {
    path: 'powerUser.y',
    label: 'Token Throughput per All in Utility MW (tok/s/MW)',
    title: 'Token Throughput per All in Utility MW (Custom User Values)',
    roofline: { interactivity: 'upper_left', e2e: 'upper_right' },
    inYAxisMetrics: false,
  },
} satisfies Record<MetricKeyPattern, MetricDefinition>;

/**
 * The precise union of every registered metric key (`'y_tpPerGpu' | 'y_costh' |
 * …`), derived from the registry object. Used to generate the flat
 * `ChartDefinition` fields as NAMED optional properties (not an index signature),
 * so non-metric `y_*` fields like `y_cost_limit` / `y_latency_limit` don't clash.
 */
export type MetricKey = keyof typeof METRIC_REGISTRY;

/**
 * `Record`-typed view of the registry for VALUE access. `METRIC_REGISTRY` itself
 * is declared with `satisfies` so its KEY literals survive for `MetricKey`; that
 * however narrows each value to only the fields it sets (so optional fields like
 * `xOverride` "don't exist" on entries that omit them). Reading through this
 * uniformly-typed alias restores the full `MetricDefinition` shape per entry.
 */
const REGISTRY: Record<MetricKey, MetricDefinition> = METRIC_REGISTRY;

/** All registry keys, in registry (insertion) order. */
export const METRIC_KEYS = Object.keys(METRIC_REGISTRY) as MetricKey[];

/**
 * The roofline-bearing metric keys (those with `inYAxisMetrics: true`), in
 * registry order — declared as an `as const` tuple so `YAxisMetric` stays a
 * precise literal union. Drives `Y_AXIS_METRICS` and `ROOFLINE_METRIC_FIELDS`.
 * Custom-user metrics are excluded (computed at render time, not pre-marked).
 *
 * This tuple and the `inYAxisMetrics` flags are cross-checked at module load
 * (`assertRegistryConsistency` below), so the two cannot silently drift: adding
 * a roofline metric means one registry entry AND one line here, and a mismatch
 * throws immediately rather than producing a subtly wrong chart.
 */
export const ROOFLINE_METRIC_KEYS = [
  'y_tpPerGpu',
  'y_inputTputPerGpu',
  'y_outputTputPerGpu',
  'y_tpPerMw',
  'y_inputTputPerMw',
  'y_outputTputPerMw',
  'y_costh',
  'y_costn',
  'y_costr',
  'y_costhOutput',
  'y_costnOutput',
  'y_costrOutput',
  'y_costhi',
  'y_costni',
  'y_costri',
  'y_jTotal',
  'y_jOutput',
  'y_jInput',
  'y_measuredAvgPower',
  'y_measuredPrefillAvgPower',
  'y_measuredDecodeAvgPower',
  'y_measuredJPerOutputToken',
  'y_measuredJPerTotalToken',
  'y_measuredJPerInputToken',
] as const satisfies readonly MetricKey[];

export type RooflineMetricKey = (typeof ROOFLINE_METRIC_KEYS)[number];

/**
 * `{ metric, field, required }` triples for the roof reset + marking passes in
 * `markRooflinePoints`, derived from the registry. `field` / `required` are the
 * `{ y, roof }` field key on `InferenceData` and its always-present flag.
 */
export const ROOFLINE_METRIC_FIELD_SPECS = ROOFLINE_METRIC_KEYS.map((metric) => {
  const def = REGISTRY[metric];
  return {
    metric,
    // Non-null: every roofline entry carries these (enforced below).
    field: def.rooflineField!,
    required: def.rooflineRequired!,
  };
});

/**
 * Fail fast if the registry and the derived `ROOFLINE_METRIC_KEYS` tuple ever
 * disagree — e.g. a metric marked `inYAxisMetrics: true` that's missing from the
 * tuple (or vice versa), or a roofline metric missing its `rooflineField` /
 * `rooflineRequired`. Runs once at import; cheap.
 */
function assertRegistryConsistency(): void {
  const flagged = METRIC_KEYS.filter((k) => REGISTRY[k].inYAxisMetrics);
  const tuple = ROOFLINE_METRIC_KEYS as readonly MetricKey[];
  const flaggedSet = new Set(flagged);
  const tupleSet = new Set(tuple);
  for (const k of flagged) {
    if (!tupleSet.has(k)) {
      throw new Error(
        `metric-registry: ${k} has inYAxisMetrics:true but is not in ROOFLINE_METRIC_KEYS`,
      );
    }
    const def = REGISTRY[k];
    if (def.rooflineField === undefined || def.rooflineRequired === undefined) {
      throw new Error(
        `metric-registry: ${k} is a roofline metric but lacks rooflineField/rooflineRequired`,
      );
    }
  }
  for (const k of tuple) {
    if (!flaggedSet.has(k)) {
      throw new Error(
        `metric-registry: ${k} is in ROOFLINE_METRIC_KEYS but not marked inYAxisMetrics:true`,
      );
    }
  }
}

assertRegistryConsistency();

/**
 * Per-chart constants that are NOT metric-specific: the default x-axis, its
 * label, the base heading, and the cost/latency clamps. Keyed by chart type so
 * the derived `ChartDefinition[]` (and any future chart) reads from one place.
 */
export interface ChartAxisConfig {
  x: string;
  xLabel: string;
  y: string;
  heading: string;
  costLimit: number;
  latencyLimit: number;
}

export const CHART_AXIS_CONFIG: Record<InferenceChartType, ChartAxisConfig> = {
  interactivity: {
    x: 'median_intvty',
    xLabel: 'Interactivity (tok/s/user)',
    y: 'tput_per_gpu',
    heading: 'vs. Interactivity',
    costLimit: 5,
    latencyLimit: 60,
  },
  e2e: {
    x: 'median_e2el',
    xLabel: 'End-to-end Latency (s)',
    y: 'tput_per_gpu',
    heading: 'vs. End-to-end Latency',
    costLimit: 5,
    latencyLimit: 60,
  },
};

/** The two charts, in the order the config array historically listed them. */
export const CHART_TYPES: InferenceChartType[] = ['interactivity', 'e2e'];

// ---------------------------------------------------------------------------
// Metric lookup helpers
// ---------------------------------------------------------------------------

/** Look up a metric definition by key (e.g. `'y_costh'`), or undefined. */
export function getMetricDefinition(metricKey: string): MetricDefinition | undefined {
  return REGISTRY[metricKey as MetricKey];
}

/**
 * Whether a metric is an "input" metric — the explicit-flag replacement for the
 * historical `title.toLowerCase().includes('input')` sniff. Returns `true` for
 * exactly the same seven metrics the sniff matched, so the interactivity-chart
 * UI (X-Axis Metric dropdown, X-Axis Scale selector, "vs. TTFT" heading) and the
 * x-axis-swap gate behave identically — but keyed to intent, not a substring.
 */
export function metricIsInputMetric(metricKey: string): boolean {
  return getMetricDefinition(metricKey)?.isInputMetric === true;
}

/**
 * The metric's own x-axis override field for the interactivity chart, or
 * undefined if it has none. Mirrors the legacy `chartDef[`${metric}_x`]` read;
 * callers still fall back to `chartDef.x` when this is undefined.
 */
export function metricXOverride(metricKey: string): string | undefined {
  return getMetricDefinition(metricKey)?.xOverride;
}
