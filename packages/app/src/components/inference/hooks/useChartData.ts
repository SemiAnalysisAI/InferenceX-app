import { useMemo, useRef } from 'react';

import { useQueries } from '@tanstack/react-query';
import { rowToSequence } from '@semianalysisai/inferencex-constants';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import type {
  AggDataEntry,
  ChartDefinition,
  HardwareConfig,
  InferenceData,
  RenderableGraph,
  YAxisMetricKey,
} from '@/components/inference/types';
import { partitionChartDataByLimits } from '@/components/inference/utils';
import {
  parseComparisonEntry,
  resolveComparisonEntries,
} from '@/components/inference/utils/comparisonEntry';
import { useBenchmarks, benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';
import {
  GPU_ALIAS_TO_CANONICAL,
  getModelSortIndex,
  hardwareKeyMatchesAnyBase,
} from '@/lib/constants';
import { mergeRunScopedRows, transformBenchmarkRows } from '@/lib/benchmark-transform';
import {
  dedupeAgenticHistoryRuns,
  dedupeRowsToLatestPerConfig as dedupeLatestBenchmarkSeries,
} from '@/lib/benchmark-run-selection';
import { Sequence, type Model } from '@/lib/data-mappings';
import { calculateCostsForGpus, calculatePowerForGpus } from '@/lib/utils';
import { overviewServingSeriesKey, type OverviewServingSeriesRow } from '@/lib/overview-data';
import { resolveXAxisField } from '@/components/inference/utils/resolveXAxisField';
import {
  applyQuickFilters,
  computeAvailableQuickFilters,
  EMPTY_QUICK_FILTERS,
  type QuickFilters,
} from '@/components/inference/utils/quickFilters';

/**
 * Chart x-axis variant selected by the mode buttons above the plot. This is
 * the single definition — InferenceContext (URL/state) and ChartDisplay
 * (buttons) import it from here.
 */
export type XAxisMode = 'ttft' | 'e2e' | 'interactivity' | 'e2e-normalized-interactivity';

export const X_AXIS_MODES: readonly XAxisMode[] = [
  'ttft',
  'e2e',
  'interactivity',
  'e2e-normalized-interactivity',
];

/**
 * Modes whose x metric is derived from persisted per-request traces —
 * these only exist for agentic scenarios (fixed-seq rows have no
 * trace_replay blob to derive them from).
 */
export function isAgenticOnlyXAxisMode(mode: XAxisMode): boolean {
  return mode === 'e2e-normalized-interactivity';
}

/** Build deduplicated comparison dates, excluding the main run date. */
export function buildComparisonDates(
  selectedGPUs: string[],
  selectedDates: string[],
  selectedDateRange: { startDate: string; endDate: string },
  selectedRunDate: string | undefined,
  selectedRunId?: string,
): string[] {
  if (selectedGPUs.length === 0) return [];
  // Range endpoints + individually-added dates/runs (redundant same-day range
  // endpoints dropped), minus the main date/run which the primary query covers.
  // Other run-qualified entries on the same day are distinct overlays and stay.
  return resolveComparisonEntries(selectedDates, selectedDateRange).filter((entry) => {
    if (entry === selectedRunDate) return false;
    const { runId } = parseComparisonEntry(entry);
    return runId === undefined || runId !== selectedRunId;
  });
}

/** Filter data by GPU key, resolving aliases to canonical keys. */
export function filterByGPU<T extends { hwKey: unknown }>(
  data: T[],
  selectedGPUs: string[],
  aliasMap: Record<string, string>,
): T[] {
  if (selectedGPUs.length === 0) return data;
  return data.filter((dp) => {
    const hwKey = String(dp.hwKey);
    const canonical = aliasMap[hwKey];
    return (
      selectedGPUs.includes(hwKey) || (canonical !== undefined && selectedGPUs.includes(canonical))
    );
  });
}

/** Restrict one snapshot to the exact serving envelope selected by Overview. */
export function filterOverviewHistoryRows<T extends OverviewServingSeriesRow>(
  rows: T[],
  configKey: string | undefined,
): T[] {
  return configKey === undefined
    ? rows
    : rows.filter((row) => overviewServingSeriesKey(row) === configKey);
}

export type RooflineDirection = 'upper_left' | 'upper_right' | 'lower_left' | 'lower_right';
const FLIP_MAP: Record<RooflineDirection, RooflineDirection> = {
  upper_left: 'upper_right',
  upper_right: 'upper_left',
  lower_left: 'lower_right',
  lower_right: 'lower_left',
};

/** Flip roofline direction when the x-axis is swapped. */
export function flipRooflineDirection(dir: RooflineDirection): RooflineDirection {
  return FLIP_MAP[dir];
}

/**
 * Roofline corner for a trace-derived x-axis mode. Derived modes render on the
 * e2e chart definition, whose corners assume lower-x-is-better; when the
 * derived metric is higher-is-better (E2E Normalized Interactivity) the corner mirrors
 * horizontally. This keeps the y-metric's own good direction — throughput
 * lands on an upper corner, cost and joules on a lower one — where hardcoding
 * a single corner inverted the frontier for the cost metrics.
 */
export function derivedModeRoofline(
  configuredE2eCorner: RooflineDirection | undefined,
  higherXIsBetter: boolean,
): RooflineDirection | undefined {
  if (!configuredE2eCorner || !higherXIsBetter) return configuredE2eCorner;
  return flipRooflineDirection(configuredE2eCorner);
}

// Statistic words that may already prefix an x-axis label (from chart config
// or the TTFT override label). Trailing whitespace is consumed so a replace
// never doubles the separator space.
const X_LABEL_STAT_PREFIX_RE = /^(?:Median|Mean|P75|P90|P95|P99(?:\.9)?)\b\s*/iu;

/**
 * Agentic sequences plot percentile fields (e.g. `p90_intvty`, `p75_e2el`),
 * so the x-axis label must carry the selected percentile. Replaces an
 * existing leading statistic word (e.g. the TTFT override's "P90 Time To
 * First Token (s)") or prefixes the percentile when the configured label has
 * none (e.g. "Interactivity (tok/s/user)" → "P90 Interactivity (tok/s/user)").
 * Only call for agentic sequences — fixed-seq labels must stay untouched.
 */
export function applyAgenticPercentileToXLabel(label: string, pctlWord: string): string {
  return X_LABEL_STAT_PREFIX_RE.test(label)
    ? label.replace(X_LABEL_STAT_PREFIX_RE, `${pctlWord} `)
    : `${pctlWord} ${label}`;
}

/** The dedup key fields a chart series is identified by. */
interface DedupeRow {
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  precision: string;
  offload_mode?: string | null;
  benchmark_type?: string;
  date: string;
  workflow_run_id?: number;
  run_started_at?: string | null;
}

// offload_mode normalized `?? 'off'` to match the SQL layer's getBenchmarksForRun
// lineKey — agentic offload=on and offload=off are distinct series.
/**
 * Keep only the newest workflow run for each chart series. Agentic series omit
 * point-level spec decoding from their curve identity; fixed-sequence series do not.
 */
export function dedupeRowsToLatestPerConfig<T extends DedupeRow>(rows: T[]): T[] {
  return dedupeLatestBenchmarkSeries(rows);
}

/**
 * Coarse filters that apply to every y-axis metric: the explicit GPU picks, the
 * vendor / deployment / spec quick-filter pills, and the two-GPU compare scope.
 * Deliberately excludes the y-metric coverage filter, so the result is the set
 * of configs the user could have selected regardless of which axis is drawn.
 */
export function applyScopeFilters(
  points: InferenceData[],
  selectedGPUs: string[],
  quickFilters: QuickFilters,
  compareGpuPair?: readonly [string, string] | null,
): InferenceData[] {
  let scoped = filterByGPU(points, selectedGPUs, GPU_ALIAS_TO_CANONICAL);
  scoped = applyQuickFilters(scoped, quickFilters);
  if (compareGpuPair) {
    scoped = scoped.filter((d) => hardwareKeyMatchesAnyBase(String(d.hwKey), compareGpuPair));
  }
  return scoped;
}

export function useChartData(
  selectedModel: Model,
  selectedSequence: Sequence,
  selectedPrecisions: string[],
  selectedYAxisMetric: string,
  selectedXAxisMetric: string | null,
  selectedE2eXAxisMetric: string | null,
  selectedGPUs: string[],
  selectedDates: string[],
  selectedDateRange: { startDate: string; endDate: string },
  userCosts: Record<string, number | undefined> | null,
  userPowers: Record<string, number | undefined> | null,
  selectedRunDate?: string,
  enabled = true,
  latestAvailableDate?: string,
  selectedPercentile = 'p90',
  /** When set, only series for these two registry GPU keys are shown (compare pages). */
  compareGpuPair?: readonly [string, string] | null,
  /**
   * Exact GitHub run id used to pin contested configs while carrying forward
   * configs that the selected run did not produce.
   */
  selectedRunId?: string,
  /** Selected main run id, including non-contested runs, used only to avoid
   * fetching the primary run again as a same-day comparison overlay. */
  comparisonMainRunId?: string,
  /** Current x-axis mode. Canonical agentic-frontier stamping happens later,
   * after ChartDisplay has fetched the trace-derived normalized metric. */
  _selectedXAxisMode: XAxisMode = 'e2e',
  /**
   * GitHub run id for the "as of run" base view. Set only when an
   * earlier-than-latest run is selected.
   */
  asOfRunId?: string,
  /**
   * Coarse vendor / aggregation / spec-decoding filters applied to every point
   * (also applied to overlay points in ScatterGraph so both paths stay in sync).
   */
  quickFilters: QuickFilters = EMPTY_QUICK_FILTERS,
  overviewHistoryPair?: {
    currentConfigKey: string;
    baselineConfigKey: string;
  },
) {
  // When the selected date is the latest available, use '' (empty string) to match
  // the initial no-date query key, reusing the eagerly-fetched benchmarks from the
  // materialized view instead of firing a redundant second fetch with identical data.
  //
  // The '' shortcut hits the materialized view, which has no run-level filter, so it
  // is only valid for the latest run. When an earlier run is selected (asOfRunId set)
  // we must query the date-filtered path so the run cutoff applies.
  const queryDate = asOfRunId
    ? (selectedRunDate ?? '')
    : selectedRunDate && latestAvailableDate && selectedRunDate === latestAvailableDate
      ? ''
      : selectedRunDate;

  // Two queries: the normal latest-per-config view (always), plus the
  // run-scoped rows when a specific workflow run is selected. The merged
  // result pins ONLY the configs the selected run produced to that run, and
  // carries every other config forward from the base rows — selecting one of
  // two same-day vLLM runs must not hide the day's SGLang curve just because
  // it lives in a different workflow run. The base query is the default view
  // query, so it's almost always already in the React Query cache.
  const {
    data: baseRows,
    isLoading: baseLoading,
    error: baseError,
  } = useBenchmarks(selectedModel, queryDate, enabled, asOfRunId);
  const {
    data: runRows,
    isLoading: runLoading,
    error: runError,
  } = useBenchmarks(selectedModel, '', enabled && Boolean(selectedRunId), selectedRunId, true);

  const allRows = useMemo(() => {
    if (!selectedRunId) return baseRows;
    // Wait for the run rows before rendering a scoped view — rendering base
    // rows first would flash the un-scoped chart, then swap contested points.
    if (!runRows) return undefined;
    if (!baseRows) return runRows;
    return mergeRunScopedRows(runRows, baseRows);
  }, [selectedRunId, runRows, baseRows]);

  const queryLoading = baseLoading || (Boolean(selectedRunId) && runLoading);
  const queryError = baseError ?? (selectedRunId ? runError : null);

  // GPU comparison: fetch data for each additional comparison date
  const comparisonDates = useMemo(
    () =>
      buildComparisonDates(
        selectedGPUs,
        selectedDates,
        selectedDateRange,
        selectedRunDate,
        comparisonMainRunId,
      ),
    [selectedGPUs, selectedDates, selectedDateRange, selectedRunDate, comparisonMainRunId],
  );

  // Each comparison entry is either a plain date (latest run that day, exact-date
  // query) or a specific run encoded as `date~r<id>~<i>of<n>` (exact-run query) so
  // multiple same-day runs can be compared as distinct series.
  const comparisonQueries = useQueries({
    queries: comparisonDates.map((entry) => {
      const parsed = parseComparisonEntry(entry);
      return parsed.runId
        ? benchmarkQueryOptions(selectedModel, '', enabled, false, parsed.runId, true)
        : benchmarkQueryOptions(selectedModel, entry, enabled, true);
    }),
  });

  const comparisonLoading = comparisonQueries.some((q) => q.isLoading);

  // Loading = query is fetching OR we haven't received any data yet (waiting for date/filters)
  const loading = queryLoading || !allRows || (comparisonDates.length > 0 && comparisonLoading);
  const error = queryError ? queryError.message : null;

  // Stable identity for comparison query data — useQueries returns a new array ref every render,
  // so we derive a stable key from dataUpdatedAt timestamps to avoid cascading memo invalidation.
  const comparisonDataKey = comparisonQueries.map((q) => q.dataUpdatedAt).join(',');

  // Merge main rows with comparison date rows.
  // Stamp each row with the *requested* date (not the actual DB date) so that
  // GPUGraph's activeDates filter (keyed by user-selected date) matches the points.
  //
  // rowToSequence handles both fixed-seq (via isl/osl) and agentic (via
  // benchmark_type), so one filter covers every scenario.
  const rows = useMemo(() => {
    if (!allRows) return [];
    const seqFilter = (r: { isl: number | null; osl: number | null; benchmark_type: string }) =>
      rowToSequence(r) === selectedSequence;
    const seqFiltered = filterOverviewHistoryRows(
      allRows.filter(seqFilter),
      overviewHistoryPair?.currentConfigKey,
    );

    // Keep only each series' latest-date rows (drops stale config_ids left behind
    // when parallelism settings change between runs). Keyed per offload variant so
    // an offload=on sweep can't hide a differently-dated offload=off series.
    const deduped = dedupeRowsToLatestPerConfig(seqFiltered);

    const mainRows = deduped.map((r) =>
      selectedRunDate ? { ...r, date: selectedRunDate, actualDate: r.date } : r,
    );
    if (comparisonDates.length === 0) return mainRows;
    const extraRows = comparisonQueries.flatMap((q, i) => {
      const filtered = filterOverviewHistoryRows(
        (q.data ?? []).filter(seqFilter),
        overviewHistoryPair?.baselineConfigKey,
      );
      const selected =
        selectedSequence === Sequence.AgenticTraces ? dedupeAgenticHistoryRuns(filtered) : filtered;
      return selected.map((r) => ({ ...r, date: comparisonDates[i], actualDate: r.date }));
    });
    return [...mainRows, ...extraRows];
  }, [
    allRows,
    selectedSequence,
    comparisonDates,
    comparisonDataKey,
    selectedRunDate,
    overviewHistoryPair?.currentConfigKey,
    overviewHistoryPair?.baselineConfigKey,
  ]);

  // Transform filtered rows into chart data
  const { chartData, hardwareConfig: rawHardwareConfig } = useMemo(() => {
    if (rows.length === 0)
      return { chartData: [] as InferenceData[][], hardwareConfig: {} as HardwareConfig };
    return transformBenchmarkRows(rows, selectedPercentile);
  }, [rows, selectedPercentile]);

  // Sort hardware config — stabilize reference when keys haven't changed.
  // Different sequences for the same model often have the same GPU configs,
  // so avoid creating a new object (which cascades to Effect 2 deps).
  const prevHardwareConfigRef = useRef<{ key: string; config: HardwareConfig }>({
    key: '',
    config: {} as HardwareConfig,
  });
  const hardwareConfig = useMemo(() => {
    const hwKeys = Object.keys(rawHardwareConfig);
    if (hwKeys.length === 0) return rawHardwareConfig;
    const sortedKeys = hwKeys.toSorted(
      (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
    );
    const newKey = sortedKeys.join(',');
    if (newKey === prevHardwareConfigRef.current.key) {
      return prevHardwareConfigRef.current.config;
    }
    const config: HardwareConfig = {} as HardwareConfig;
    sortedKeys.forEach((key) => {
      config[key] = rawHardwareConfig[key];
    });
    prevHardwareConfigRef.current = { key: newKey, config };
    return config;
  }, [rawHardwareConfig]);

  // Quick-filter values that have data for the current model / sequence /
  // precision. Derived from the full transformed point set (BEFORE quick
  // filters) so the pills reflect what exists and don't churn as the user
  // selects — drives which framework pills show and which vendor/agg/spec
  // options are disabled.
  const availableQuickFilters = useMemo(
    () =>
      computeAvailableQuickFilters(
        chartData.flat().filter((d) => selectedPrecisions.includes(d.precision)),
      ),
    [chartData, selectedPrecisions],
  );

  // Stable chart definitions — only depends on metric/axis selections, not data.
  // Separated so that sequence/data changes don't create new chartDefinition refs,
  // which would cause Effect 3 (metric reposition) to fire redundantly after Effect 2.
  const stableChartDefinitions = useMemo(
    () =>
      (chartDefinitions as ChartDefinition[]).map((chartDef) => {
        const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;

        // Resolve which data field the x-axis plots — shared with the overlay
        // path (processOverlayChartData) via resolveXAxisField so the two
        // can't drift. Labels/headings stay here (display-only) and follow the
        // resolver's branch discriminant.
        const isAgentic = selectedSequence === Sequence.AgenticTraces;
        const effectiveXMetric =
          chartDef.chartType === 'e2e' ? selectedE2eXAxisMetric : selectedXAxisMetric;
        const resolved = resolveXAxisField(chartDef, selectedYAxisMetric, effectiveXMetric, {
          isAgentic,
          percentile: selectedPercentile,
        });
        const naturalX = resolved.naturalX as keyof AggDataEntry;
        const xAxisField = resolved.xAxisField as keyof AggDataEntry;
        const { isTtftOverride } = resolved;

        const ttftPctl = isTtftOverride
          ? (effectiveXMetric as string).replace(/_ttft$/u, '')
          : 'p90';
        const ttftPctlWord = ttftPctl === 'median' ? 'Median' : ttftPctl.toUpperCase();
        const ttftLabel = `${ttftPctlWord} Time To First Token (s)`;

        let xAxisLabel = chartDef.x_label;
        if (resolved.branch === 'user-input-override') {
          const labelKey = `${selectedYAxisMetric}_x_label` as keyof ChartDefinition;
          if (effectiveXMetric === chartDef[`${selectedYAxisMetric}_x` as keyof ChartDefinition]) {
            xAxisLabel = (chartDef[labelKey] as string) || chartDef.x_label;
          } else {
            xAxisLabel = isTtftOverride ? ttftLabel : chartDef.x_label;
          }
        } else if (resolved.branch === 'config-input-override') {
          const xLabelOverrideKey = `${selectedYAxisMetric}_x_label` as keyof ChartDefinition;
          xAxisLabel = (chartDef[xLabelOverrideKey] as string) || chartDef.x_label;
        } else if (resolved.branch === 'e2e-ttft-override') {
          xAxisLabel = ttftLabel;
        }

        // Agentic: relabel to the chosen percentile (the resolver already
        // rewrote the field) — xAxisLabel still carries the raw chartDef
        // prefix (or none: the base Interactivity / E2E Latency config labels
        // have no statistic word, so the percentile is prefixed). The chart
        // heading ("vs. <latency>") is also rewritten so the title above the
        // plot reflects what's drawn.
        const headingKey = `${selectedYAxisMetric}_heading` as keyof ChartDefinition;
        let chartHeading = (chartDef[headingKey] as string) || chartDef.heading;
        if (isAgentic) {
          const pctlWord = selectedPercentile.toUpperCase();
          xAxisLabel = applyAgenticPercentileToXLabel(xAxisLabel, pctlWord);
          chartHeading = chartHeading.replace(
            /^(?<vsPrefix>vs\.\s+)(?:(?:Median|Mean|P75|P90|P95|P99(?:\.9)?)\s+)?/iu,
            `$1${pctlWord} `,
          );
        }

        // The x-axis is "flipped" only when the good-direction reverses
        // (e.g. interactivity → TTFT: "higher is better" → "lower is better").
        // E2EL → TTFT keeps the same direction ("lower is better" for both),
        // so no roofline flip is needed for the e2e chart.
        // Compare against `naturalX` (percentile-adjusted) — switching the
        // percentile of the same logical metric is NOT a flip.
        const xAxisFlipped =
          xAxisField !== naturalX && !(chartDef.chartType === 'e2e' && isTtftOverride);

        const yLabelKey = `${selectedYAxisMetric}_label` as keyof ChartDefinition;
        const dynamicYLabel = chartDef[yLabelKey];

        const rooflineOverrides: Partial<ChartDefinition> = {};
        if (xAxisFlipped) {
          for (const key of Object.keys(chartDef) as (keyof ChartDefinition)[]) {
            if (typeof key === 'string' && key.endsWith('_roofline')) {
              const dir = chartDef[key] as string | undefined;
              if (dir && dir in FLIP_MAP) {
                (rooflineOverrides as any)[key] = flipRooflineDirection(dir as RooflineDirection);
              }
            }
          }
        }

        return {
          chartDefinition: {
            ...chartDef,
            ...rooflineOverrides,
            heading: chartHeading,
            x_label: xAxisLabel,
            y_label: dynamicYLabel === null ? undefined : String(dynamicYLabel),
          },
          metricKey,
          xAxisField,
        };
      }),
    [
      selectedYAxisMetric,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      selectedPercentile,
      selectedSequence,
    ],
  );

  // Build renderable graphs (data processing + stable chart definitions)
  const graphs: RenderableGraph[] = useMemo(() => {
    if (chartData.length === 0) return [];

    let dataSource: InferenceData[][] = chartData;
    if (selectedYAxisMetric === 'y_costUser' && userCosts) {
      dataSource = chartData.map((d) => calculateCostsForGpus(d, userCosts));
    }
    if (selectedYAxisMetric === 'y_powerUser' && userPowers) {
      dataSource = chartData.map((d) => calculatePowerForGpus(d, userPowers));
    }

    const result = stableChartDefinitions.map(
      ({ chartDefinition, metricKey, xAxisField }, index) => {
        // Quick filters (vendor / deployment / mtp-stp) are part of this coarse
        // pre-filter, which also prunes the legend and rooflines since they
        // derive from this set.
        const filteredData = applyScopeFilters(
          dataSource[index] || [],
          selectedGPUs,
          quickFilters,
          compareGpuPair,
        );

        // Filter to points that have the selected metric, then remap x/y.
        // Intentional cost/TTFT outliers are partitioned only after this step
        // so ScatterGraph can retain them for dashed boundary continuations.
        const hasMetric = filteredData.some((d) => metricKey in d);
        const isTtftX = typeof xAxisField === 'string' && xAxisField.endsWith('_ttft');
        const mappedData = hasMetric
          ? filteredData
              .filter((d) => metricKey in d)
              .map((d: InferenceData) => {
                const yValue = (d[metricKey] as { y: number })?.y ?? d.y;
                const roof = (d[metricKey] as { roof: boolean })?.roof ?? false;
                // xAxisField is `keyof AggDataEntry`; InferenceData embeds those
                // fields via `Partial<Omit<AggDataEntry, ...>>`, so a typed
                // accessor catches a future field rename (silent fallthrough to
                // d.x would otherwise mask the regression).
                const xCandidate = (d as Partial<AggDataEntry>)[xAxisField];
                const xValue = typeof xCandidate === 'number' ? xCandidate : d.x;
                return {
                  ...d,
                  x: xValue,
                  y: yValue,
                  roof,
                };
              })
          : [];

        const isAgentic = selectedSequence === Sequence.AgenticTraces;

        const { data: processedData, clippedData } = partitionChartDataByLimits(
          mappedData,
          chartDefinition,
          selectedYAxisMetric,
          { isTtftX, isAgentic },
        );

        return {
          model: selectedModel,
          sequence: selectedSequence,
          chartDefinition,
          data: processedData,
          clippedData,
        };
      },
    );
    return result;
  }, [
    chartData,
    selectedModel,
    selectedSequence,
    selectedYAxisMetric,
    selectedGPUs,
    userCosts,
    userPowers,
    stableChartDefinitions,
    compareGpuPair,
    selectedPercentile,
    quickFilters,
  ]);

  // Points that pass every scope filter but NOT the y-metric coverage filter.
  // The legend's active set must be reconciled against these, never against
  // `graphs`: reconcileActiveSet intersects the user's selection with the set
  // it is handed and never re-widens, so reconciling against metric-filtered
  // data permanently deletes every config without telemetry for the selected
  // axis (the Measured Energy axes) the moment that axis is picked. Both chart
  // definitions are built from the same rows, so index 0 carries every hw key.
  const selectionPoints = useMemo(
    () => applyScopeFilters(chartData[0] ?? [], selectedGPUs, quickFilters, compareGpuPair),
    [chartData, selectedGPUs, quickFilters, compareGpuPair],
  );

  return { graphs, selectionPoints, loading, error, hardwareConfig, availableQuickFilters };
}
