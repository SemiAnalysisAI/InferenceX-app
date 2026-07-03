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
import { filterDataByCostLimit } from '@/components/inference/utils';
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
import {
  mergeRunScopedRows,
  transformBenchmarkRows,
  withPercentile,
} from '@/lib/benchmark-transform';
import { Sequence, type Model } from '@/lib/data-mappings';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import { calculateCostsForGpus, calculatePowerForGpus } from '@/lib/utils';
import { paretoFrontForDirection, type ParetoDirection } from '@/lib/chart-utils';
import {
  applyQuickFilters,
  computeAvailableQuickFilters,
  EMPTY_QUICK_FILTERS,
  type QuickFilters,
} from '@/components/inference/utils/quickFilters';

/**
 * Chart x-axis variant selected by the mode buttons above the plot. This is
 * the single definition — InferenceContext (URL/state) and ChartDisplay
 * (buttons, derived-metric remapping) import it from here.
 */
export type XAxisMode =
  | 'ttft'
  | 'e2e'
  | 'normalized-e2e'
  | 'interactivity'
  | 'session-time'
  | 'prefill-tps';

export const X_AXIS_MODES: readonly XAxisMode[] = [
  'ttft',
  'e2e',
  'normalized-e2e',
  'interactivity',
  'session-time',
  'prefill-tps',
];

/**
 * Modes whose x metric is derived from persisted per-request traces —
 * these only exist for agentic scenarios (fixed-seq rows have no
 * trace_replay blob to derive them from).
 */
export function isAgenticOnlyXAxisMode(mode: XAxisMode): boolean {
  return mode === 'normalized-e2e' || mode === 'session-time' || mode === 'prefill-tps';
}

/**
 * Compute the set of benchmark_results.id values that sit on the
 * (e2e_latency, y) Pareto frontier within each (hwKey, precision, date)
 * group. Used to restrict the non-e2e xmode charts (ttft, interactivity,
 * session-time, prefill-tps) so they show *only* the points that win on
 * end-to-end latency — preventing benchmark-hacking where a config tops
 * one axis while tanking the other.
 *
 * Returns null when the y-metric has no roofline direction declared on
 * the e2e chart (caller falls back to no filtering in that case).
 */
function e2eParetoIds(
  points: InferenceData[],
  selectedYAxisMetric: string,
  percentile: string,
): Set<number> | null {
  const e2eChartDef = (chartDefinitions as ChartDefinition[]).find((c) => c.chartType === 'e2e');
  if (!e2eChartDef) return null;
  const dir = e2eChartDef[`${selectedYAxisMetric}_roofline` as keyof ChartDefinition] as
    | ParetoDirection
    | undefined;
  if (!dir) return null;
  const frontierFn = paretoFrontForDirection(dir);
  // Percentile-prefixed e2e-latency field name (e.g. 'p90_e2el').
  const e2elField = withPercentile('median_e2el', percentile);
  const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;

  // Re-frame each candidate point in (e2el, y) space, then compute the
  // pareto per (hwKey, precision, date) bucket — frontiers don't span dates
  // (a May 17 point can't dominate a May 15 plot).
  const byGroup = new Map<string, InferenceData[]>();
  for (const p of points) {
    const yValue = (p[metricKey] as { y?: number } | undefined)?.y;
    const xValue = (p as unknown as Record<string, unknown>)[e2elField];
    if (typeof xValue !== 'number' || !Number.isFinite(xValue)) continue;
    if (typeof yValue !== 'number' || !Number.isFinite(yValue)) continue;
    const key = `${p.hwKey}|${p.precision}|${p.date}`;
    let bucket = byGroup.get(key);
    if (!bucket) {
      bucket = [];
      byGroup.set(key, bucket);
    }
    bucket.push({ ...p, x: xValue, y: yValue });
  }
  const ids = new Set<number>();
  for (const bucket of byGroup.values()) {
    for (const f of frontierFn(bucket)) {
      if (isPersistedBenchmarkId(f.id)) ids.add(f.id);
    }
  }
  return ids;
}

/** Build deduplicated comparison dates, excluding the main run date. */
export function buildComparisonDates(
  selectedGPUs: string[],
  selectedDates: string[],
  selectedDateRange: { startDate: string; endDate: string },
  selectedRunDate: string | undefined,
): string[] {
  if (selectedGPUs.length === 0) return [];
  // Range endpoints + individually-added dates/runs (redundant same-day range
  // endpoints dropped), minus the main run date which the primary query covers.
  return resolveComparisonEntries(selectedDates, selectedDateRange).filter(
    (d) => d !== selectedRunDate,
  );
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

type RooflineDirection = 'upper_left' | 'upper_right' | 'lower_left' | 'lower_right';
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

/** The dedup key fields a chart series is identified by. */
interface DedupeRow {
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  precision: string;
  offload_mode?: string | null;
  date: string;
}

// offload_mode normalized `?? 'off'` to match the SQL layer's getBenchmarksForRun
// lineKey — agentic offload=on and offload=off are distinct series.
const dedupeSeriesKey = (r: DedupeRow): string =>
  `${r.hardware}|${r.framework}|${r.spec_method}|${r.disagg}|${r.precision}|${r.offload_mode ?? 'off'}`;

/**
 * For each series — (hardware, framework, spec_method, disagg, precision,
 * offload_mode) — keep only the rows from that series' most recent date. When
 * parallelism settings change between runs, old config_ids create stale points
 * under the same legend line; dropping all-but-latest removes them.
 *
 * Without `offload_mode` in the key, an offload=on sweep ingested on a LATER date
 * than the offload=off sweep would win the shared group and silently drop the
 * (earlier-dated) offload=off variant — a data-loss regression.
 */
export function dedupeRowsToLatestPerConfig<T extends DedupeRow>(rows: T[]): T[] {
  const maxDatePerGroup = new Map<string, string>();
  for (const r of rows) {
    const k = dedupeSeriesKey(r);
    const cur = maxDatePerGroup.get(k);
    if (!cur || r.date > cur) maxDatePerGroup.set(k, r.date);
  }
  return rows.filter((r) => r.date === maxDatePerGroup.get(dedupeSeriesKey(r)));
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
  /**
   * Current x-axis mode. When set to anything other than 'e2e', the displayed
   * data is filtered to the (e2e-latency, y) Pareto frontier so the ttft /
   * interactivity / session-time / prefill-tps charts show only points that
   * also win on end-to-end latency — preventing benchmark-hacking where a
   * config tops one metric while tanking the other. The 'e2e' mode is the
   * source of truth and keeps the full point set.
   */
  selectedXAxisMode: XAxisMode = 'e2e',
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
    () => buildComparisonDates(selectedGPUs, selectedDates, selectedDateRange, selectedRunDate),
    [selectedGPUs, selectedDates, selectedDateRange, selectedRunDate],
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
    const seqFiltered = allRows.filter(seqFilter);

    // Keep only each series' latest-date rows (drops stale config_ids left behind
    // when parallelism settings change between runs). Keyed per offload variant so
    // an offload=on sweep can't hide a differently-dated offload=off series.
    const deduped = dedupeRowsToLatestPerConfig(seqFiltered);

    const mainRows = deduped.map((r) =>
      selectedRunDate ? { ...r, date: selectedRunDate, actualDate: r.date } : r,
    );
    if (comparisonDates.length === 0) return mainRows;
    const extraRows = comparisonQueries.flatMap((q, i) =>
      (q.data ?? [])
        .filter(seqFilter)
        .map((r) => ({ ...r, date: comparisonDates[i], actualDate: r.date })),
    );
    return [...mainRows, ...extraRows];
  }, [allRows, selectedSequence, comparisonDates, comparisonDataKey, selectedRunDate]);

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

        // Default x-axis = chart's natural latency metric, percentile-adjusted
        // for the agentic case (median_e2el → p99_e2el etc.). Percentiles only
        // exist for agentic scenarios; fixed-seq benchmarks have no p90_/p99_
        // columns, and the percentile selector is hidden for them — but its
        // state persists at the 'p90' default across mode/sequence switches.
        // Applying that stale percentile to a fixed-seq metric yields a null
        // column (e.g. p90_intvty), which renders as x=0/NaN and drops the
        // point from the chart. Force median for non-agentic so the natural
        // metric (median_intvty / median_e2el) is used.
        const isAgentic = selectedSequence === Sequence.AgenticTraces;
        const naturalX = withPercentile(
          chartDef.x,
          isAgentic ? selectedPercentile : 'median',
        ) as keyof AggDataEntry;
        let xAxisField: keyof AggDataEntry = naturalX;
        let xAxisLabel = chartDef.x_label;

        const metricTitle =
          (chartDef[`${selectedYAxisMetric}_title` as keyof ChartDefinition] as string) || '';
        const isInputMetric = metricTitle.toLowerCase().includes('input');

        // Resolve the effective x-axis override per chart type
        const effectiveXMetric =
          chartDef.chartType === 'e2e' ? selectedE2eXAxisMetric : selectedXAxisMetric;
        // The TTFT override is now any *_ttft metric (not just p90_ttft) — the
        // x-axis-mode picker reconciles the percentile prefix based on sequence
        // kind (fixed-seq → median, agentic → user-picked percentile).
        const isTtftOverride =
          typeof effectiveXMetric === 'string' && effectiveXMetric.endsWith('_ttft');
        const ttftPctl = isTtftOverride
          ? (effectiveXMetric as string).replace(/_ttft$/u, '')
          : 'p90';
        const ttftPctlWord = ttftPctl === 'median' ? 'Median' : ttftPctl.toUpperCase();
        const ttftLabel = `${ttftPctlWord} Time To First Token (s)`;

        if (
          effectiveXMetric &&
          chartDef.chartType === 'interactivity' &&
          isInputMetric &&
          !isAgentic
        ) {
          xAxisField = effectiveXMetric as keyof AggDataEntry;
          const labelKey = `${selectedYAxisMetric}_x_label` as keyof ChartDefinition;
          if (effectiveXMetric === chartDef[`${selectedYAxisMetric}_x` as keyof ChartDefinition]) {
            xAxisLabel = (chartDef[labelKey] as string) || chartDef.x_label;
          } else {
            xAxisLabel = isTtftOverride ? ttftLabel : chartDef.x_label;
          }
        } else if (chartDef.chartType === 'interactivity' && isInputMetric) {
          // Agentic falls through here too — the manual X-axis dropdown is
          // hidden in agentic mode (would double up with the percentile
          // selector), so the config default + percentile post-processing
          // below drives the x axis.
          const xOverrideKey = `${selectedYAxisMetric}_x` as keyof ChartDefinition;
          const xLabelOverrideKey = `${selectedYAxisMetric}_x_label` as keyof ChartDefinition;
          xAxisField = (chartDef[xOverrideKey] as keyof AggDataEntry) || chartDef.x;
          xAxisLabel = (chartDef[xLabelOverrideKey] as string) || chartDef.x_label;
        } else if (chartDef.chartType === 'e2e' && isTtftOverride) {
          xAxisField = effectiveXMetric as keyof AggDataEntry;
          xAxisLabel = ttftLabel;
        }

        // Agentic: rewrite the resolved x metric to the chosen percentile,
        // and relabel accordingly. Both have to be updated unconditionally —
        // xAxisField may already be percentile-adjusted (via naturalX) while
        // xAxisLabel still carries the raw chartDef.x_label prefix.
        // The chart heading ("vs. <latency>") is also rewritten to include
        // the percentile so the title above the plot reflects what's drawn.
        const headingKey = `${selectedYAxisMetric}_heading` as keyof ChartDefinition;
        let chartHeading = (chartDef[headingKey] as string) || chartDef.heading;
        if (isAgentic) {
          xAxisField = withPercentile(
            xAxisField as string,
            selectedPercentile,
          ) as keyof AggDataEntry;
          const pctlWord = selectedPercentile.toUpperCase();
          xAxisLabel = xAxisLabel.replace(/^(?:Median|Mean|P75|P90|P95|P99(?:\.9)?)\b/iu, pctlWord);
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
        let filteredData = dataSource[index] || [];

        // Filter by selected GPUs if any
        filteredData = filterByGPU(filteredData, selectedGPUs, GPU_ALIAS_TO_CANONICAL);

        // Quick filters (vendor / agg-disagg / mtp-stp) — coarse pre-filter that
        // also prunes the legend and rooflines since they derive from this set.
        filteredData = applyQuickFilters(filteredData, quickFilters);

        if (compareGpuPair) {
          filteredData = filteredData.filter((d) =>
            hardwareKeyMatchesAnyBase(String(d.hwKey), compareGpuPair),
          );
        }

        filteredData = filterDataByCostLimit(filteredData, chartDefinition, selectedYAxisMetric);

        // For AGENTIC workloads only: when the user is NOT viewing the
        // e2e latency chart, mark each point with whether it sits on the
        // (e2e_latency, y) Pareto frontier for its (hwKey, precision,
        // date) group. The chart still renders every point as scatter —
        // only e2e-Pareto winners feed the roofline (ScatterGraph honors
        // the flag). Prevents benchmark-hacking the TTFT / interactivity
        // line by tanking decode (or vice versa) without hiding the
        // non-optimal configs from view.
        //
        // Fixed-seq workloads keep the existing per-axis Pareto since
        // there's no separate "session-time" notion of total latency —
        // their e2e IS the request latency, so a TTFT hack there reads
        // honestly on e2e too. The anti-hack constraint is specifically
        // about multi-turn agentic where TTFT measures a tiny fraction
        // of the user-visible session time.
        const isAgentic = selectedSequence === Sequence.AgenticTraces;
        const e2eParetoSet =
          isAgentic && selectedXAxisMode !== 'e2e'
            ? e2eParetoIds(filteredData, selectedYAxisMetric, selectedPercentile)
            : null;

        // Filter to points that have the selected metric, then remap x/y
        const hasMetric = filteredData.some((d) => metricKey in d);
        const isTtftX = typeof xAxisField === 'string' && xAxisField.endsWith('_ttft');
        const processedData = hasMetric
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
                const isOnE2eFrontier =
                  e2eParetoSet === null
                    ? undefined
                    : isPersistedBenchmarkId(d.id) && e2eParetoSet.has(d.id);
                return {
                  ...d,
                  x: xValue,
                  y: yValue,
                  roof,
                  isOnE2eFrontier,
                };
              })
              // When TTFT is on the x-axis, apply the latency limit to filter
              // overload outliers (fixed-seq conc=2048 rows with TTFT > 60s that
              // compress all real data to the far left). Skip for agentic — long
              // TTFTs there reflect real workloads (multi-turn, big prompts).
              .filter(
                (d) =>
                  !isTtftX ||
                  isAgentic ||
                  !chartDefinition.y_latency_limit ||
                  d.x <= chartDefinition.y_latency_limit,
              )
          : [];

        return {
          model: selectedModel,
          sequence: selectedSequence,
          chartDefinition,
          data: processedData,
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
    selectedXAxisMode,
    selectedPercentile,
    quickFilters,
  ]);

  return { graphs, loading, error, hardwareConfig, availableQuickFilters };
}
