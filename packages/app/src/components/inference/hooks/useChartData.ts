import { useMemo, useRef } from 'react';
import {
  FLIP_MAP,
  applyAgenticPercentileToXLabel,
  applyScopeFilters,
  buildComparisonDates,
  dedupeRowsToLatestPerConfig,
  filterOverviewHistoryRows,
  flipRooflineDirection,
  supportsPointTokenMetric,
  type RooflineDirection,
  type XAxisMode,
} from './chart-data-core';

import { rowToSequence } from '@semianalysisai/inferencex-constants';
import { useQueries, useQuery } from '@tanstack/react-query';

import chartDefinitions, {
  countsInputTokens,
  isAllInMeasuredConfigKey,
  tokenMetricTypeForConfigKey,
} from '@/components/inference/metric-registry';
import { allInMeasuredTableData } from '@/components/inference/utils/inference-table-data';
import {
  applyTokenRevenuePricing,
  usesTokenSalePricing,
} from '@/components/inference/token-revenue';
import type {
  AggDataEntry,
  ChartDefinition,
  HardwareConfig,
  InferenceData,
  PowerCompare,
  RenderableGraph,
  TokenRevenuePriceSource,
  TokenRevenuePricing,
  YAxisMetricKey,
} from '@/components/inference/types';
import { partitionChartDataByLimits } from '@/components/inference/utils';
import { expandPowerCompareSeries } from '@/components/inference/utils/power-compare';
import { parseComparisonEntry } from '@/components/inference/utils/comparisonEntry';
import {
  computeAvailableQuickFilters,
  EMPTY_QUICK_FILTERS,
  type QuickFilters,
} from '@/components/inference/utils/quickFilters';
import {
  resolveXAxisField,
  type FixedSequenceStatistic,
} from '@/components/inference/utils/resolveXAxisField';
import { benchmarkQueryOptions, useBenchmarks } from '@/hooks/api/use-benchmarks';
import type { BenchmarkRow } from '@/lib/api/api';
import {
  benchmarkCurveDate,
  dedupeAgenticHistoryRuns,
} from '@/lib/benchmarks/benchmark-run-selection';
import {
  mergeRunScopedRows,
  transformBenchmarkRows,
  type TokenBasis,
} from '@/lib/benchmarks/benchmark-transform';
import { remapInferencePoint } from '@/lib/charts/chart-utils';
import { DEFAULT_TCO_BASIS, getModelSortIndex, type TcoBasis } from '@/lib/catalog/constants';
import { Sequence, type Model } from '@/lib/catalog/data-mappings';
import { calculateCostsForGpus, calculatePowerForGpus } from '@/lib/shared/utils';
import { isPreferredVrLine, preferVrDefaultRun, VR_DEFAULT_RUN } from '../default-run-preference';

export {
  applyAgenticPercentileToXLabel,
  applyScopeFilters,
  buildComparisonDates,
  dedupeRowsToLatestPerConfig,
  derivedModeRoofline,
  filterByGPU,
  filterOverviewHistoryRows,
  flipRooflineDirection,
  isAgenticOnlyXAxisMode,
  supportsPointTokenMetric,
  X_AXIS_MODES,
  type RooflineDirection,
  type XAxisMode,
} from './chart-data-core';

/** Insert a token-basis qualifier ahead of a trailing unit, e.g. "… (tok/s/chip)". */
function withTokenBasisSuffix(text: unknown, suffix: string): string | undefined {
  if (typeof text !== 'string') return undefined;
  const unit = /\s*[(（][^()（）]*[)）]$/u.exec(text);
  return unit ? `${text.slice(0, unit.index)}${suffix}${unit[0]}` : `${text}${suffix}`;
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
  tokenRevenuePricing: TokenRevenuePricing | null,
  tokenRevenuePriceSource: TokenRevenuePriceSource,
  selectedRunDate?: string,
  enabled = true,
  latestAvailableDate?: string,
  selectedPercentile = 'p90',
  compareGpuPair?: readonly [string, string] | null,
  selectedRunId?: string,
  selectedXAxisMode?: XAxisMode,
  asOfRunId?: string,
  quickFilters: QuickFilters = EMPTY_QUICK_FILTERS,
  overviewHistoryPair?: {
    currentConfigKey: string;
    baselineConfigKey: string;
  },
  benchmarkQueryScope?: string,
  initialBenchmarkRows?: BenchmarkRow[],
  tcoBasis: TcoBasis = DEFAULT_TCO_BASIS,
  allowDefaultRunPreference = false,
  powerCompare: PowerCompare = 'none',
  fixedSequenceStatistic: FixedSequenceStatistic = 'median',
  tokenBasis: TokenBasis = 'total',
) {
  const queryDate = asOfRunId
    ? (selectedRunDate ?? '')
    : selectedRunDate && latestAvailableDate && selectedRunDate === latestAvailableDate
      ? ''
      : selectedRunDate;

  const {
    data: baseRows,
    isLoading: baseLoading,
    isFetching: baseFetching,
    isPlaceholderData: basePlaceholder,
    error: baseError,
  } = useBenchmarks(
    selectedModel,
    queryDate,
    enabled,
    asOfRunId,
    undefined,
    undefined,
    !asOfRunId && queryDate === '' ? initialBenchmarkRows : undefined,
    benchmarkQueryScope,
    true,
  );
  const {
    data: runRows,
    isLoading: runLoading,
    error: runError,
  } = useBenchmarks(selectedModel, '', enabled && Boolean(selectedRunId), selectedRunId, true);

  const preferVr =
    allowDefaultRunPreference &&
    VR_DEFAULT_RUN.enabled &&
    selectedModel === VR_DEFAULT_RUN.model &&
    selectedSequence === VR_DEFAULT_RUN.sequence &&
    !queryDate &&
    !asOfRunId &&
    !compareGpuPair &&
    !overviewHistoryPair &&
    selectedDates.length === 0 &&
    !selectedDateRange.startDate &&
    !selectedDateRange.endDate &&
    Boolean(baseRows?.some(isPreferredVrLine));
  const { data: preferredRows, isLoading: preferredLoading } = useQuery(
    benchmarkQueryOptions(selectedModel, VR_DEFAULT_RUN.date, enabled && preferVr, true),
  );

  const allRows = useMemo(() => {
    let scopedRows = baseRows;
    if (selectedRunId) {
      if (!runRows) return undefined;
      scopedRows = baseRows ? mergeRunScopedRows(runRows, baseRows) : runRows;
    }
    return preferVr && scopedRows && preferredRows
      ? preferVrDefaultRun(scopedRows, preferredRows)
      : scopedRows;
  }, [selectedRunId, runRows, baseRows, preferVr, preferredRows]);

  const queryLoading =
    baseLoading || (Boolean(selectedRunId) && runLoading) || (preferVr && preferredLoading);
  const queryError = baseError ?? (selectedRunId ? runError : null);

  const comparisonDates = useMemo(
    () => buildComparisonDates(selectedGPUs, selectedDates, selectedDateRange, selectedRunDate),
    [selectedGPUs, selectedDates, selectedDateRange, selectedRunDate],
  );

  const comparisonQueries = useQueries({
    queries: comparisonDates.map((entry) => {
      const parsed = parseComparisonEntry(entry);
      return parsed.runId
        ? benchmarkQueryOptions(selectedModel, '', enabled, false, parsed.runId, true)
        : benchmarkQueryOptions(selectedModel, entry, enabled, true);
    }),
  });

  const comparisonLoading = comparisonQueries.some((q) => q.isLoading);

  const loading = queryLoading || !allRows || (comparisonDates.length > 0 && comparisonLoading);
  const refreshing = !loading && (basePlaceholder || baseFetching);
  const error = queryError ? queryError.message : null;

  const comparisonDataKey = comparisonQueries.map((q) => q.dataUpdatedAt).join(',');

  const rows = useMemo(() => {
    if (!allRows) return [];
    const seqFilter = (r: { isl: number | null; osl: number | null; benchmark_type: string }) =>
      rowToSequence(r) === selectedSequence;
    const seqFiltered = filterOverviewHistoryRows(
      allRows.filter(seqFilter),
      overviewHistoryPair?.currentConfigKey,
    );

    const deduped = dedupeRowsToLatestPerConfig(seqFiltered);

    const mainRows = deduped.map((r) => ({
      ...r,
      date: selectedRunDate ?? benchmarkCurveDate(r),
      actualDate: r.date,
    }));
    if (comparisonDates.length === 0) return mainRows;
    const extraRows = comparisonQueries.flatMap((q, i) => {
      const filtered = filterOverviewHistoryRows(
        (q.data ?? []).filter(seqFilter),
        overviewHistoryPair?.baselineConfigKey,
      );
      const selected =
        selectedSequence === Sequence.AgenticTraces ? dedupeAgenticHistoryRuns(filtered) : filtered;
      return selected.map((r) => ({
        ...r,
        date: comparisonDates[i],
        actualDate: r.date,
      }));
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

  const { chartData, hardwareConfig: rawHardwareConfig } = useMemo(() => {
    if (rows.length === 0)
      return {
        chartData: [] as InferenceData[][],
        hardwareConfig: {} as HardwareConfig,
      };
    return transformBenchmarkRows(rows, selectedPercentile, tcoBasis, tokenBasis);
  }, [rows, selectedPercentile, tcoBasis, tokenBasis]);

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
    const newKey = JSON.stringify(sortedKeys.map((key) => [key, rawHardwareConfig[key]]));
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

  const availableQuickFilters = useMemo(
    () =>
      computeAvailableQuickFilters(
        chartData.flat().filter((d) => selectedPrecisions.includes(d.precision)),
      ),
    [chartData, selectedPrecisions],
  );

  const stableChartDefinitions = useMemo(
    () =>
      (chartDefinitions as ChartDefinition[]).map((chartDef) => {
        const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;

        const isAgentic = selectedSequence === Sequence.AgenticTraces;
        const effectiveXMetric =
          chartDef.chartType === 'e2e' ? selectedE2eXAxisMetric : selectedXAxisMetric;
        const resolved = resolveXAxisField(chartDef, selectedYAxisMetric, effectiveXMetric, {
          isAgentic,
          percentile: selectedPercentile,
          xAxisMode: selectedXAxisMode,
          fixedSequenceStatistic,
        });
        const naturalX = resolved.naturalX as keyof AggDataEntry;
        const xAxisField = resolved.xAxisField as keyof AggDataEntry;
        const { isTtftOverride } = resolved;

        const ttftPctl = isTtftOverride ? xAxisField.replace(/_ttft$/u, '') : 'p90';
        const ttftPctlWord =
          ttftPctl === 'median' ? 'Median' : ttftPctl === 'mean' ? 'Mean' : ttftPctl.toUpperCase();
        const ttftLabel = `${ttftPctlWord} Time To First Token (s)`;
        const ttftLabelZh = `${ttftPctlWord} 首 token 延迟 (s)`;

        let xAxisLabel = chartDef.x_label;
        let xAxisLabelZh = chartDef.x_labelZh;
        if (resolved.branch === 'user-input-override') {
          const labelKey = `${selectedYAxisMetric}_x_label` as keyof ChartDefinition;
          const labelZhKey = `${selectedYAxisMetric}_x_labelZh` as keyof ChartDefinition;
          if (effectiveXMetric === chartDef[`${selectedYAxisMetric}_x` as keyof ChartDefinition]) {
            xAxisLabel = (chartDef[labelKey] as string) || chartDef.x_label;
            xAxisLabelZh = (chartDef[labelZhKey] as string) || chartDef.x_labelZh;
          } else {
            xAxisLabel = isTtftOverride ? ttftLabel : chartDef.x_label;
            xAxisLabelZh = isTtftOverride ? ttftLabelZh : chartDef.x_labelZh;
          }
        } else if (resolved.branch === 'config-input-override') {
          const xLabelOverrideKey = `${selectedYAxisMetric}_x_label` as keyof ChartDefinition;
          const xLabelZhOverrideKey = `${selectedYAxisMetric}_x_labelZh` as keyof ChartDefinition;
          xAxisLabel = (chartDef[xLabelOverrideKey] as string) || chartDef.x_label;
          xAxisLabelZh = (chartDef[xLabelZhOverrideKey] as string) || chartDef.x_labelZh;
        } else if (resolved.branch === 'e2e-ttft-override') {
          xAxisLabel = ttftLabel;
          xAxisLabelZh = ttftLabelZh;
        }

        const headingKey = `${selectedYAxisMetric}_heading` as keyof ChartDefinition;
        let chartHeading = isTtftOverride
          ? `vs. ${ttftPctlWord} Time To First Token`
          : selectedXAxisMode === undefined
            ? (chartDef[headingKey] as string) || chartDef.heading
            : chartDef.heading;
        if (isAgentic) {
          const pctlWord = selectedPercentile.toUpperCase();
          xAxisLabel = applyAgenticPercentileToXLabel(xAxisLabel, pctlWord);
          xAxisLabelZh = applyAgenticPercentileToXLabel(xAxisLabelZh, pctlWord);
          chartHeading = chartHeading.replace(
            /^(?<vsPrefix>vs\.\s+)(?:(?:Median|Mean|P75|P90|P95|P99(?:\.9)?)\s+)?/iu,
            `$1${pctlWord} `,
          );
        } else {
          const word = xAxisField.startsWith('mean_')
            ? 'Mean'
            : xAxisField.startsWith('median_')
              ? 'Median'
              : xAxisField.split('_')[0].toUpperCase();
          const wordZh = word === 'Mean' ? '平均' : '中位';
          xAxisLabel = applyAgenticPercentileToXLabel(xAxisLabel, word);
          xAxisLabelZh = applyAgenticPercentileToXLabel(xAxisLabelZh, word).replace(
            /^(?:Mean|Median)\s+/u,
            wordZh,
          );
          chartHeading = chartHeading.replace(
            /^(?<vsPrefix>vs\.\s+)(?:(?:Median|Mean|P75|P90|P95|P99(?:\.9)?)\s+)?/iu,
            `$1${word} `,
          );
        }

        const xAxisFlipped =
          xAxisField !== naturalX && !(chartDef.chartType === 'e2e' && isTtftOverride);

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

        const usesOpenRouterPricing = tokenRevenuePriceSource === 'openrouter';
        const revenueLabels: Partial<ChartDefinition> =
          selectedYAxisMetric === 'y_tokenRevenuePerGpuHour'
            ? usesOpenRouterPricing
              ? {
                  y_tokenRevenuePerGpuHour_label:
                    'Token Revenue per GPU Hour at OpenRouter Pricing ($/GPU/hr)',
                  y_tokenRevenuePerGpuHour_labelZh:
                    '按 OpenRouter 价格计算的每 GPU 小时 token 收入（$/GPU/hr）',
                  y_tokenRevenuePerGpuHour_title:
                    'Token Revenue per GPU Hour at OpenRouter Pricing',
                  y_tokenRevenuePerGpuHour_titleZh:
                    '按 OpenRouter 价格计算的每 GPU 小时 token 收入',
                  y_tokenRevenuePerGpuHour_chartTitle:
                    'Token Revenue per GPU Hour at OpenRouter Pricing',
                  y_tokenRevenuePerGpuHour_chartTitleZh:
                    '按 OpenRouter 价格计算的每 GPU 小时 token 收入',
                }
              : {
                  y_tokenRevenuePerGpuHour_label:
                    'Token Revenue per GPU Hour at Normalized Pricing ($/GPU/hr)',
                  y_tokenRevenuePerGpuHour_labelZh:
                    '按标准化价格计算的每 GPU 小时 token 收入（$/GPU/hr）',
                  y_tokenRevenuePerGpuHour_title:
                    'Token Revenue per GPU Hour at Normalized Pricing',
                  y_tokenRevenuePerGpuHour_titleZh: '按标准化价格计算的每 GPU 小时 token 收入',
                  y_tokenRevenuePerGpuHour_chartTitle:
                    'Token Revenue per GPU Hour at Normalized Pricing',
                  y_tokenRevenuePerGpuHour_chartTitleZh: '按标准化价格计算的每 GPU 小时 token 收入',
                }
            : {};
        const tokenBasisLabels: Partial<ChartDefinition> =
          tokenBasis === 'uncached' && countsInputTokens(selectedYAxisMetric)
            ? Object.fromEntries(
                (['label', 'title', 'chartTitle'] as const).flatMap((field) => [
                  [
                    `${selectedYAxisMetric}_${field}`,
                    withTokenBasisSuffix(
                      chartDef[`${selectedYAxisMetric}_${field}` as keyof ChartDefinition],
                      ' · Uncached',
                    ),
                  ],
                  [
                    `${selectedYAxisMetric}_${field}Zh`,
                    withTokenBasisSuffix(
                      chartDef[`${selectedYAxisMetric}_${field}Zh` as keyof ChartDefinition],
                      ' · 未缓存',
                    ),
                  ],
                ]),
              )
            : {};
        const yLabelKey = `${selectedYAxisMetric}_label` as keyof ChartDefinition;
        const dynamicYLabel = { ...chartDef, ...revenueLabels, ...tokenBasisLabels }[yLabelKey];

        return {
          chartDefinition: {
            ...chartDef,
            ...rooflineOverrides,
            ...revenueLabels,
            ...tokenBasisLabels,
            heading: chartHeading,
            x_scale_field: xAxisField,
            x_label: xAxisLabel,
            x_labelZh: xAxisLabelZh,
            y_label: dynamicYLabel === null ? undefined : String(dynamicYLabel),
          },
          metricKey,
          xAxisField,
        };
      }),
    [
      selectedYAxisMetric,
      selectedXAxisMode,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      selectedPercentile,
      fixedSequenceStatistic,
      selectedSequence,
      tokenRevenuePriceSource,
      tokenBasis,
    ],
  );

  const graphs: RenderableGraph[] = useMemo(() => {
    if (chartData.length === 0 && loading) return [];
    if (
      usesTokenSalePricing(selectedYAxisMetric) &&
      tokenRevenuePriceSource === 'openrouter' &&
      !tokenRevenuePricing
    ) {
      return [];
    }

    let dataSource: InferenceData[][] = chartData;
    if (
      (selectedYAxisMetric === 'y_costUser' || selectedYAxisMetric === 'y_tokensPerDollarUser') &&
      userCosts
    ) {
      dataSource = chartData.map((d) => calculateCostsForGpus(d, userCosts));
    }
    if (selectedYAxisMetric === 'y_powerUser' && userPowers) {
      dataSource = chartData.map((d) => calculatePowerForGpus(d, userPowers));
    }
    if (usesTokenSalePricing(selectedYAxisMetric)) {
      dataSource = chartData.map((d) => applyTokenRevenuePricing(d, tokenRevenuePricing));
    }

    const result = stableChartDefinitions.map(
      ({ chartDefinition, metricKey, xAxisField }, index) => {
        const filteredData = applyScopeFilters(
          dataSource[index] || [],
          selectedGPUs,
          quickFilters,
          compareGpuPair,
        );

        const tokenType = tokenMetricTypeForConfigKey(selectedYAxisMetric);
        const metricData = filteredData.filter(
          (d) => metricKey in d && supportsPointTokenMetric(d, tokenType),
        );
        const hasMetric = metricData.length > 0;
        const isTtftX = typeof xAxisField === 'string' && xAxisField.endsWith('_ttft');
        const mappedData = hasMetric
          ? expandPowerCompareSeries(
              metricData.map((d) => remapInferencePoint(d, metricKey, xAxisField)),
              selectedYAxisMetric,
              powerCompare,
            )
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
          ...(isAllInMeasuredConfigKey(selectedYAxisMetric)
            ? {
                tableData: expandPowerCompareSeries(
                  allInMeasuredTableData(filteredData, metricKey, xAxisField),
                  selectedYAxisMetric,
                  powerCompare,
                ),
              }
            : {}),
        };
      },
    );
    return result;
  }, [
    chartData,
    loading,
    selectedModel,
    selectedSequence,
    selectedYAxisMetric,
    selectedGPUs,
    userCosts,
    userPowers,
    tokenRevenuePricing,
    tokenRevenuePriceSource,
    stableChartDefinitions,
    compareGpuPair,
    selectedPercentile,
    quickFilters,
    powerCompare,
  ]);

  const selectionPoints = useMemo(
    () => applyScopeFilters(chartData[0] ?? [], selectedGPUs, quickFilters, compareGpuPair),
    [chartData, selectedGPUs, quickFilters, compareGpuPair],
  );

  return {
    graphs,
    selectionPoints,
    loading,
    refreshing,
    error,
    hardwareConfig,
    availableQuickFilters,
  };
}
