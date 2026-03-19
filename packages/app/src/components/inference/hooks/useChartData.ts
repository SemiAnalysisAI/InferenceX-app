import { useMemo, useRef } from 'react';

import { useQueries } from '@tanstack/react-query';
import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import {
  AggDataEntry,
  ChartDefinition,
  HardwareConfig,
  InferenceData,
  RenderableGraph,
  YAxisMetricKey,
} from '@/components/inference/types';
import { filterDataByCostLimit } from '@/components/inference/utils';
import { useBenchmarks, benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';
import { GPU_ALIAS_TO_CANONICAL, getModelSortIndex } from '@/lib/constants';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import { Model, Sequence } from '@/lib/data-mappings';
import { calculateCostsForGpus, calculatePowerForGpus } from '@/lib/utils';

/** Build deduplicated comparison dates, excluding the main run date. */
export function buildComparisonDates(
  selectedGPUs: string[],
  selectedDates: string[],
  selectedDateRange: { startDate: string; endDate: string },
  selectedRunDate: string | undefined,
): string[] {
  if (selectedGPUs.length === 0) return [];
  const dates: string[] = [];
  if (selectedDateRange.startDate && selectedDateRange.endDate) {
    dates.push(selectedDateRange.startDate, selectedDateRange.endDate);
  }
  dates.push(...selectedDates);
  return [...new Set(dates.filter((d) => d !== selectedRunDate))];
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
  userCosts: { [gpuKey: string]: number | undefined } | null,
  userPowers: { [gpuKey: string]: number | undefined } | null,
  selectedRunDate?: string,
  enabled: boolean = true,
  latestAvailableDate?: string,
) {
  // When the selected date is the latest available, use '' (empty string) to match
  // the initial no-date query key, reusing the eagerly-fetched benchmarks from the
  // materialized view instead of firing a redundant second fetch with identical data.
  const queryDate =
    selectedRunDate && latestAvailableDate && selectedRunDate === latestAvailableDate
      ? ''
      : selectedRunDate;

  const {
    data: allRows,
    isLoading: queryLoading,
    error: queryError,
  } = useBenchmarks(selectedModel, queryDate, enabled);

  // GPU comparison: fetch data for each additional comparison date
  const comparisonDates = useMemo(() => {
    return buildComparisonDates(selectedGPUs, selectedDates, selectedDateRange, selectedRunDate);
  }, [selectedGPUs, selectedDates, selectedDateRange, selectedRunDate]);

  const comparisonQueries = useQueries({
    queries: comparisonDates.map((date) => benchmarkQueryOptions(selectedModel, date, enabled)),
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
  const sequenceIslOsl = useMemo(() => sequenceToIslOsl(selectedSequence), [selectedSequence]);
  const rows = useMemo(() => {
    if (!allRows || !sequenceIslOsl) return [];
    const seqFilter = (r: { isl: number; osl: number }) =>
      r.isl === sequenceIslOsl.isl && r.osl === sequenceIslOsl.osl;
    const seqFiltered = allRows.filter(seqFilter);

    // For each (hw, framework, spec_method, disagg, precision) group, keep only
    // rows from the most recent date. When parallelism settings change between runs,
    // old config_ids create stale data points under the same legend line — drop them.
    const maxDatePerGroup = new Map<string, string>();
    for (const r of seqFiltered) {
      const key = `${r.hardware}|${r.framework}|${r.spec_method}|${r.disagg}|${r.precision}`;
      const cur = maxDatePerGroup.get(key);
      if (!cur || r.date > cur) maxDatePerGroup.set(key, r.date);
    }
    const deduped = seqFiltered.filter((r) => {
      const key = `${r.hardware}|${r.framework}|${r.spec_method}|${r.disagg}|${r.precision}`;
      return r.date === maxDatePerGroup.get(key);
    });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- comparisonDataKey is a stable proxy for comparisonQueries data
  }, [allRows, sequenceIslOsl, comparisonDates, comparisonDataKey, selectedRunDate]);

  // Transform filtered rows into chart data
  const { chartData, hardwareConfig: rawHardwareConfig } = useMemo(() => {
    if (rows.length === 0)
      return { chartData: [] as InferenceData[][], hardwareConfig: {} as HardwareConfig };
    return transformBenchmarkRows(rows);
  }, [rows]);

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
    const sortedKeys = hwKeys.sort(
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

  // Stable chart definitions — only depends on metric/axis selections, not data.
  // Separated so that sequence/data changes don't create new chartDefinition refs,
  // which would cause Effect 3 (metric reposition) to fire redundantly after Effect 2.
  const stableChartDefinitions = useMemo(() => {
    return (chartDefinitions as ChartDefinition[]).map((chartDef) => {
      const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;

      // Determine dynamic x-axis
      let xAxisField: keyof AggDataEntry = chartDef.x;
      let xAxisLabel = chartDef.x_label;

      const metricTitle =
        (chartDef[`${selectedYAxisMetric}_title` as keyof ChartDefinition] as string) || '';
      const isInputMetric = metricTitle.toLowerCase().includes('input');

      // Resolve the effective x-axis override per chart type
      const effectiveXMetric =
        chartDef.chartType === 'e2e' ? selectedE2eXAxisMetric : selectedXAxisMetric;
      const isTtftOverride = effectiveXMetric === 'p99_ttft' || effectiveXMetric === 'median_ttft';
      const ttftLabel =
        effectiveXMetric === 'p99_ttft'
          ? 'P99 Time To First Token (s)'
          : 'Median Time To First Token (s)';

      if (effectiveXMetric && chartDef.chartType === 'interactivity' && isInputMetric) {
        xAxisField = effectiveXMetric as keyof AggDataEntry;
        const labelKey = `${selectedYAxisMetric}_x_label` as keyof ChartDefinition;
        if (effectiveXMetric === chartDef[`${selectedYAxisMetric}_x` as keyof ChartDefinition]) {
          xAxisLabel = (chartDef[labelKey] as string) || chartDef.x_label;
        } else {
          xAxisLabel = isTtftOverride ? ttftLabel : chartDef.x_label;
        }
      } else if (chartDef.chartType === 'interactivity' && isInputMetric) {
        const xOverrideKey = `${selectedYAxisMetric}_x` as keyof ChartDefinition;
        const xLabelOverrideKey = `${selectedYAxisMetric}_x_label` as keyof ChartDefinition;
        xAxisField = (chartDef[xOverrideKey] as keyof AggDataEntry) || chartDef.x;
        xAxisLabel = (chartDef[xLabelOverrideKey] as string) || chartDef.x_label;
      } else if (chartDef.chartType === 'e2e' && isTtftOverride) {
        xAxisField = effectiveXMetric as keyof AggDataEntry;
        xAxisLabel = ttftLabel;
      }

      // The x-axis is "flipped" only when the good-direction reverses
      // (e.g. interactivity → TTFT: "higher is better" → "lower is better").
      // E2EL → TTFT keeps the same direction ("lower is better" for both),
      // so no roofline flip is needed for the e2e chart.
      const xAxisFlipped =
        xAxisField !== chartDef.x && !(chartDef.chartType === 'e2e' && isTtftOverride);

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
          x_label: xAxisLabel,
          y_label: dynamicYLabel === null ? undefined : String(dynamicYLabel),
        },
        metricKey,
        xAxisField,
      };
    });
  }, [selectedYAxisMetric, selectedXAxisMetric, selectedE2eXAxisMetric]);

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

        filteredData = filterDataByCostLimit(filteredData, chartDefinition, selectedYAxisMetric);

        // Filter to points that have the selected metric, then remap x/y
        const hasMetric = filteredData.some((d) => metricKey in d);
        const isTtftX = xAxisField === 'p99_ttft' || xAxisField === 'median_ttft';
        const processedData = hasMetric
          ? filteredData
              .filter((d) => metricKey in d)
              .map((d: InferenceData) => {
                const yValue = (d[metricKey] as { y: number })?.y ?? d.y;
                const roof = (d[metricKey] as { roof: boolean })?.roof ?? false;
                const xValue = (d as any)[xAxisField] ?? d.x;
                return {
                  ...d,
                  x: xValue,
                  y: yValue,
                  roof,
                };
              })
              // When TTFT is on the x-axis, apply the latency limit to filter overload outliers
              // (e.g. conc=2048 rows with TTFT > 60s that compress all real data to the far left)
              .filter(
                (d) =>
                  !isTtftX ||
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
  ]);

  return { graphs, loading, error, hardwareConfig };
}
