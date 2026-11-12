'use client';

import { GOOGLE_BLUE, HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { CHIP_BASIS_METRICS, chipBasisCsvNote } from '@/lib/benchmarks/chip-basis';
import { track } from '@/lib/analytics/analytics';
import { selectionAnalyticsContext } from '@/lib/analytics/selection-context';
import { useLocale } from '@/lib/i18n/use-locale';
import dynamic from 'next/dynamic';
import React, { useCallback, useMemo, useState } from 'react';

import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import { useGlobalFilterActions, useGlobalFilterSelection } from '@/providers/GlobalFilterContext';
import { useInterpolatedTrendData } from '@/components/inference/hooks/useInterpolatedTrendData';
import type { TrendLineConfig } from '@/components/inference/types';
import ChartControls from '@/components/inference/ui/ChartControls';
import { CostTierSelector } from '@/components/inference/ui/CostTierSelector';
import { TcoBasisCaption } from '@/components/inference/ui/TcoBasisCaption';
import TrendChart from '@/components/inference/ui/TrendChart';
import { EngineComparisonConflictNotice } from '@/components/inference/ui/engine-comparison-conflict-notice';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import {
  ChartShareActions,
  MetricAssumptionNotes,
  PricesSourceLink,
  metricCostAssumptions,
} from '@/components/ui/chart-display-helpers';
import { ChipBasisCaption } from '@/components/ui/chip-basis-toggle';
import { ControlPanel } from '@/components/ui/control-panel';
import { RangeField } from '@/components/ui/range-field';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Heading, HeadingQualifier } from '@/components/ui/heading';
import { ResultContext } from '@/components/ui/result-context';
import { TcoPriceTable, plottedChipBases } from '@/components/ui/editable-tco-badges';
import { ModelLogo } from '@/components/ui/model-logo';
import { exportToCsv } from '@/lib/export/csv-export';
import { historicalTrendToCsv } from '@/lib/export/csv-export-helpers';
import { ATOM_FOOTNOTE_MARKER, AtomEngineFootnote } from '@/components/ui/atom-engine-footnote';
import ChartLegend from '@/components/ui/chart-legend';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { getModelSortIndex } from '@/lib/catalog/constants';
import {
  type Model,
  type Precision,
  Sequence,
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
} from '@/lib/catalog/data-mappings';
import { cn, getDisplayLabel } from '@/lib/shared/utils';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  includesJalapenoResult,
  includesVeraRubinResult,
  includesTpuv7Result,
  JalapenoOfficialPreviewNotice,
  VeraRubinOfficialPreviewNotice,
  Tpuv7OfficialPreviewNotice,
} from '@/components/ui/official-preview-notice';
import { metricChartTitle, metricLabel } from '@/lib/charts/chart-utils';
import { frameworkDasharray } from '@/lib/charts/framework-dash';
import {
  costTierOptionLabel,
  metricCostTier,
  METRIC_REGISTRY,
  type MetricKey,
} from '@/components/inference/metric-registry';
import { Button } from '@/components/ui/button';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';

import FrontierView, {
  FRONTIER_SECTIONS,
  isFrontierSection,
  type FrontierGrouping,
  type FrontierSection,
} from './FrontierView';
import { frontierHistoryToCsv } from './frontier-history-core';
import { useFrontierHistory } from './useFrontierHistory';
import { useModelHistoryDetails } from './useModelHistoryDetails';

/** Vendors with frontier data, the one with the most chips first. */
function vendorsByChipCount(series: readonly { vendor: string | null }[]): string[] {
  const counts = new Map<string, number>();
  for (const { vendor } of series) if (vendor) counts.set(vendor, (counts.get(vendor) ?? 0) + 1);
  return [...counts]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([vendor]) => vendor);
}

/** Brand colors, matching the GPU specs pages. */
const VENDOR_COLORS: Record<string, string> = {
  NVIDIA: '#76b900',
  AMD: '#ed1c24',
  Google: GOOGLE_BLUE,
};

const ImprovementWaterfallChart = dynamic(
  () => import('@/components/inference/ui/ImprovementWaterfallChart'),
  { loading: () => <Skeleton className="h-[430px] w-full" /> },
);

const STRINGS = {
  en: {
    chartView: 'Chart view',
    line: 'Trend line',
    waterfall: 'Improvement waterfall',
    frontier: 'Frontier',
    compare: 'Compare',
    software: 'Software gains',
    frontierTitle: (yTitle: string) => `${yTitle} vs. interactivity over time`,
    interactivityAxis: (isAgentic: boolean) =>
      `${isAgentic ? 'P90 ' : ''}Interactivity (tok/s/user)`,
    frontierLoadError: 'Frontier history could not be loaded',
    frontierEmpty: 'No frontier history for the selected configurations',
    memes: 'Memes',
    heading: 'Historical trends',
    description:
      'Interpolated performance metrics over time at a fixed interactivity operating point',
    targetLabel: 'Target interactivity (tok/s/user)',
    agenticTargetLabel: 'Target P90 interactivity (tok/s/user)',
    agenticTargetTooltip:
      'AgentX uses 1 / P90 full-response ITL in seconds, not P90 of token rates. Legacy ITL is used only when full-response mean/percentile ITL fields are absent. Missing or invalid P90 latency is omitted.',
    targetTooltip:
      "The interactivity operating point used for interpolation. Move the slider to see how each chip's performance changes at different interactivity levels.",
    captionTitle: (yTitle: string) => `${yTitle} over time`,
    captionQualifier: (target: number, isAgentic: boolean) =>
      `at ${target} tok/s/user ${isAgentic ? 'P90 ' : ''}interactivity`,
    source: 'Source: SemiAnalysis InferenceX™',
    updated: 'Updated:',
    logScale: 'Log scale',
    highContrast: 'High contrast',
    noData: 'No interactivity chart data available for the selected model and sequence',
    loadError: 'Historical benchmark data could not be loaded',
    retry: 'Reload page',
    trendLoadError: 'Historical trend data could not be loaded',
    trendRetry: 'Retry loading trend data',
    targetHint: 'Adjust the operating point used by the trend interpolation.',
    targetGroup: 'Trend target',
    targetNotUsed: 'Frontier views cover every interactivity, so this target does not apply.',
  },
  zh: {
    chartView: '图表视图',
    line: '趋势线',
    waterfall: '性能提升瀑布图',
    frontier: '前沿',
    compare: '对比',
    software: '软件提升',
    frontierTitle: (yTitle: string) => `${yTitle} 与交互性的前沿随时间变化`,
    interactivityAxis: (isAgentic: boolean) => `${isAgentic ? 'P90 ' : ''}交互性 (tok/s/user)`,
    frontierLoadError: '前沿历史数据加载失败',
    frontierEmpty: '所选配置暂无前沿历史数据',
    memes: '梗图',
    heading: '历史趋势',
    description: '将交互性固定在指定水平后，展示各项性能指标随时间的变化；数据经插值计算',
    targetLabel: '目标交互性（tok/s/user）',
    agenticTargetLabel: '目标 P90 交互性（tok/s/user）',
    agenticTargetTooltip:
      'AgentX 交互性为 P90 全响应 ITL（秒）的倒数，不是 token 速率的 P90。仅当全响应 ITL 的均值和分位数字段均缺失时才使用旧版 ITL。P90 延迟缺失或无效的数据点不参与计算。',
    targetTooltip: '设置插值计算采用的交互性水平。移动滑块可比较不同交互性水平下的芯片性能。',
    captionTitle: (yTitle: string) => `${yTitle} 随时间变化`,
    captionQualifier: (target: number, isAgentic: boolean) =>
      `（${isAgentic ? 'P90 ' : ''}交互性 ${target} tok/s/user）`,
    source: '来源：SemiAnalysis InferenceX™',
    updated: '更新时间：',
    logScale: '对数缩放',
    highContrast: '高对比度',
    noData: '所选模型和序列暂无交互性图表数据',
    loadError: '历史基准测试数据加载失败',
    retry: '重新加载页面',
    trendLoadError: '历史趋势数据加载失败',
    trendRetry: '重试加载趋势数据',
    targetHint: '调整趋势插值所使用的交互性水平。',
    targetGroup: '趋势目标',
    targetNotUsed: '前沿视图覆盖全部交互性水平，因此该目标不适用。',
  },
};

export default function HistoricalTrendsDisplay() {
  const [chartView, setChartView] = useState<'line' | 'waterfall' | FrontierSection>('line');
  const isPhone = useIsMobileViewport();
  const frontierSection = isFrontierSection(chartView) ? chartView : null;
  const [memesEnabled, setMemesEnabled] = useState(false);
  // Compare can put vendors or chips side by side; the other views always show chips.
  const [compareGrouping, setCompareGrouping] = useState<FrontierGrouping>('vendor');
  const frontierGrouping: FrontierGrouping =
    frontierSection === 'compare' ? compareGrouping : 'gpu';
  // A vendor narrows every chip view to that company's chips; null shows all vendors.
  const [frontierVendorFilter, setFrontierVendorFilter] = useState<string | null>(null);
  const PerformanceChart = chartView === 'waterfall' ? ImprovementWaterfallChart : TrendChart;
  const { tcoBasis, chipBasis } = useGlobalFilterSelection();
  const modelDetails = useModelHistoryDetails();
  const { setChipBasis } = useGlobalFilterActions();
  const chipBasisControl = useMemo(
    () => ({ value: chipBasis, onChange: setChipBasis, source: 'historical' }),
    [chipBasis, setChipBasis],
  );
  const readOnlyChipBasisControl = useMemo(
    () => ({ ...chipBasisControl, readOnly: true }),
    [chipBasisControl],
  );
  const locale = useLocale();
  const t = STRINGS[locale];
  const { graphs, loading, error, hardwareConfig, hwTypesWithData, availableDates } =
    useInferenceData();
  const { selectedModel, selectedSequence, selectedPrecisions, activeHwTypes, selectedRunDate } =
    useInferenceFilters();
  const isAgentic = selectedSequence === Sequence.AgenticTraces;
  const targetLabel = isAgentic ? t.agenticTargetLabel : t.targetLabel;
  const { selectedYAxisMetric, tokenRevenuePricing, logScale, isLegendExpanded, highContrast } =
    useInferenceDisplay();
  const {
    toggleHwType,
    removeHwType,
    selectAllHwTypes,
    setLogScale,
    setIsLegendExpanded,
    setHighContrast,
    setSelectedPrecisions,
  } = useInferenceActions();

  const hasInteractivityChart =
    Object.keys(hardwareConfig).length > 0 &&
    graphs.some((g) => g.chartDefinition.chartType === 'interactivity');

  const currentYLabel = useMemo(() => {
    if (graphs.length === 0) return '';
    return metricLabel(graphs[0].chartDefinition, selectedYAxisMetric, locale);
  }, [graphs, locale, selectedYAxisMetric]);

  const currentYTitle = useMemo(() => {
    if (graphs.length === 0) return '';
    return metricChartTitle(graphs[0].chartDefinition, selectedYAxisMetric, locale);
  }, [graphs, locale, selectedYAxisMetric]);

  const interactivityRange = useMemo(() => {
    const g = graphs.find((graph) => graph.chartDefinition.chartType === 'interactivity');
    if (!g || g.data.length === 0) return { min: 0, max: 200 };
    const xs = g.data.map((d) => d.x);
    return { min: Math.ceil(Math.min(...xs)), max: Math.floor(Math.max(...xs)) };
  }, [graphs]);

  const [targetInteractivity, setTargetInteractivity] = useState(35);
  const [interactivityInput, setInteractivityInput] = useState('35');

  const handleSliderChange = useCallback((val: number) => {
    setTargetInteractivity(val);
    setInteractivityInput(String(val));
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInteractivityInput(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed) && parsed >= 0) {
      setTargetInteractivity(parsed);
    }
  }, []);

  const handleInputBlur = useCallback(() => {
    const parsed = parseFloat(interactivityInput);
    if (isNaN(parsed) || parsed < 0) {
      setInteractivityInput(String(targetInteractivity));
    } else {
      const { min, max } = interactivityRange;
      const clamped = Math.max(min, Math.min(max, parsed));
      setTargetInteractivity(clamped);
      setInteractivityInput(String(clamped));
    }
    track('historical_trend_target_input', { value: targetInteractivity });
  }, [interactivityInput, targetInteractivity, interactivityRange]);

  const {
    trendLines,
    loading: trendLoading,
    error: trendError,
    refetch: refetchTrendData,
  } = useInterpolatedTrendData({
    selectedModel: selectedModel as Model,
    selectedSequence: selectedSequence as Sequence,
    selectedPrecisions,
    selectedYAxisMetric,
    targetInteractivity,
    availableDates,
    tokenRevenuePricing,
    enabled: hasInteractivityChart,
    tcoBasis,
    chipBasis,
  });

  const higherIsBetter =
    METRIC_REGISTRY[selectedYAxisMetric.replace(/^y_/u, '') as MetricKey]?.polarity !== 'lower';
  const {
    history: frontierHistory,
    hiddenVendors: frontierHiddenVendors,
    loading: frontierLoading,
    error: frontierError,
  } = useFrontierHistory({
    selectedModel: selectedModel as Model,
    selectedSequence: selectedSequence as Sequence,
    selectedPrecisions,
    selectedYAxisMetric,
    higherIsBetter,
    tokenRevenuePricing,
    tcoBasis,
    chipBasis,
    activeHwKeys: activeHwTypes,
    groupBy: frontierGrouping,
    enabled: frontierSection !== null && hasInteractivityChart,
  });

  const activeHwKeys = useMemo(() => [...activeHwTypes], [activeHwTypes]);
  const { resolveColor } = useThemeColors({
    highContrast,
    identifiers: activeHwKeys,
    activeKeys: activeHwKeys,
  });

  const lineConfigs = useMemo(
    (): TrendLineConfig[] =>
      [...trendLines.keys()]
        .filter((groupKey) => {
          const baseHwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
          return activeHwTypes.has(baseHwKey);
        })
        .map((groupKey) => {
          const baseHwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
          const precision = groupKey.includes('__') ? groupKey.split('__')[1] : null;
          const baseLabel = hardwareConfig[baseHwKey]
            ? getDisplayLabel(hardwareConfig[baseHwKey])
            : baseHwKey;
          return {
            id: groupKey,
            hwKey: baseHwKey,
            label: precision
              ? `${baseLabel} (${getPrecisionLabel(precision as Precision)})`
              : baseLabel,
            color: resolveColor(baseHwKey),
            precision: precision ?? selectedPrecisions[0],
          };
        }),
    [trendLines, activeHwTypes, hardwareConfig, selectedPrecisions, resolveColor],
  );
  const frontierVendors = useMemo(
    () => vendorsByChipCount(frontierHistory?.series ?? []),
    [frontierHistory],
  );
  const vendorFilter =
    frontierVendorFilter && frontierVendors.includes(frontierVendorFilter)
      ? frontierVendorFilter
      : null;
  // Chips of one vendor share a hue in the dashboard palette, so views that put chips side by
  // side, or show one vendor's chips, use the high-contrast palette; vendors without a brand
  // color take one from it too.
  const contrastChips =
    frontierGrouping === 'gpu' && (frontierSection !== 'frontier' || vendorFilter !== null);
  const frontierContrastKeys = useMemo(
    () => (frontierSection ? (frontierHistory?.series ?? []).map((series) => series.key) : []),
    [frontierSection, frontierHistory],
  );
  const { resolveColor: resolveContrastColor } = useThemeColors({
    highContrast: true,
    identifiers: frontierContrastKeys,
  });
  const frontierStyles = useMemo(
    () =>
      new Map(
        (frontierHistory?.series ?? []).map((series) => {
          if (series.hwKey === series.vendor)
            return [
              series.key,
              {
                label: series.key,
                color: VENDOR_COLORS[series.key] ?? resolveContrastColor(series.key),
              },
            ];
          // Each SKU takes the label and legend color of its first visible config.
          const colorKey = hardwareConfig[series.hwKey]
            ? series.hwKey
            : (activeHwKeys.find((key) => key.split('_')[0] === series.hwKey) ?? series.hwKey);
          const config = hardwareConfig[colorKey];
          const baseLabel = config?.label ?? series.hwKey;
          return [
            series.key,
            {
              label: series.precision
                ? `${baseLabel} (${getPrecisionLabel(series.precision as Precision)})`
                : baseLabel,
              color: contrastChips ? resolveContrastColor(series.key) : resolveColor(colorKey),
            },
          ];
        }),
      ),
    [
      frontierHistory,
      hardwareConfig,
      resolveColor,
      resolveContrastColor,
      contrastChips,
      activeHwKeys,
    ],
  );
  const frontierConfigLabel = useCallback(
    (config: string) => (hardwareConfig[config] ? getDisplayLabel(hardwareConfig[config]) : config),
    [hardwareConfig],
  );

  // Vendors that only have data at another precision, named so the views can offer to add it.
  const frontierHiddenNotes = useMemo(
    () =>
      frontierHiddenVendors.map((entry) => ({
        vendor: entry.vendor,
        chips: entry.hardware.map((hw) => HW_REGISTRY[hw]?.label ?? hw).join(', '),
        precisions: entry.precisions,
        precisionLabel: entry.precisions
          .map((precision) => getPrecisionLabel(precision as Precision))
          .join(', '),
      })),
    [frontierHiddenVendors],
  );
  const frontierVendorOf = useCallback(
    (key: string) => frontierHistory?.series.find((entry) => entry.key === key)?.vendor ?? null,
    [frontierHistory],
  );

  const showsJalapenoPreview = includesJalapenoResult(lineConfigs.map((config) => config.hwKey));
  const showsVeraRubinPreview = includesVeraRubinResult(lineConfigs.map((config) => config.hwKey));
  const showsTpuv7Preview = includesTpuv7Result(lineConfigs.map((config) => config.hwKey));

  // Chart heading: model, workload and the view's title, with the result's preview notices.
  const caption = (title: string, qualifier: string | null) => (
    <>
      <div>
        <Heading
          as="h2"
          level="card"
          logo={<ModelLogo model={selectedModel as Model} className="size-6" />}
        >
          {getModelLabel(selectedModel as Model)}{' '}
          {getSequenceLabel(selectedSequence as Sequence, locale)} {title}
          {qualifier && <HeadingQualifier>{qualifier}</HeadingQualifier>}
        </Heading>
      </div>
      {showsJalapenoPreview && <JalapenoOfficialPreviewNotice />}
      {showsVeraRubinPreview && <VeraRubinOfficialPreviewNotice />}
      {showsTpuv7Preview && <Tpuv7OfficialPreviewNotice />}
    </>
  );

  const toolbar = (
    <ChartButtons
      chartId="historical-trend"
      hideZoomReset={chartView === 'waterfall'}
      leadingControls={
        <SegmentedToggle
          role="group"
          ariaLabel={t.chartView}
          value={chartView}
          onValueChange={(view) => {
            setChartView(view);
            track('historical_chart_view_changed', { view });
          }}
          options={(['line', 'waterfall', ...FRONTIER_SECTIONS] as const).map((view) => ({
            value: view,
            label: t[view],
            testId: `historical-view-${view}`,
          }))}
          variant={isPhone ? 'select' : 'segments'}
          testId="historical-view"
          className={isPhone ? 'w-full' : 'shrink-0'}
        />
      }
      analyticsPrefix="historical"
      analyticsContext={selectionAnalyticsContext({
        model: selectedModel,
        sequence: selectedSequence,
        precisions: selectedPrecisions,
        gpuCount: activeHwTypes.size,
      })}
      zoomResetEvent={
        frontierSection
          ? 'd3chart_zoom_reset_historical-frontier'
          : 'd3chart_zoom_reset_historical-trend'
      }
      setIsLegendExpanded={setIsLegendExpanded}
      exportFileName={`InferenceX_historical_${selectedModel}`}
      onExportCsv={() => {
        if (frontierSection) {
          if (!frontierHistory) return;
          const { headers, rows } = frontierHistoryToCsv(
            frontierHistory,
            (key) => frontierStyles.get(key)?.label ?? key,
          );
          exportToCsv(`InferenceX_historical_frontier_${selectedModel}`, headers, rows);
          return;
        }
        const { headers, rows } = historicalTrendToCsv(
          trendLines,
          lineConfigs,
          currentYLabel,
          targetInteractivity,
          isAgentic ? 'p90' : 'median',
        );
        exportToCsv(
          `InferenceX_historical_${selectedModel}`,
          headers,
          rows,
          CHIP_BASIS_METRICS.has(selectedYAxisMetric) ? [chipBasisCsvNote(chipBasis, locale)] : [],
        );
      }}
    />
  );

  const footer = (() => {
    const costAssumptions = metricCostAssumptions(selectedYAxisMetric, tcoBasis, null);
    const costBases = costAssumptions
      ? plottedChipBases(
          lineConfigs.map((config) => config.hwKey),
          (base) => base in costAssumptions.values,
        )
      : [];
    return (
      <div className="mt-3">
        <ResultContext
          locale={locale}
          layout="footer"
          costTier={(() => {
            const tier = metricCostTier(selectedYAxisMetric.replace(/^y_/u, '') as MetricKey);
            return tier ? costTierOptionLabel(tier, locale) : undefined;
          })()}
          costTierControl={<CostTierSelector allowCustom={false} footer />}
          tcoBasis={<TcoBasisCaption hardwareKeys={activeHwTypes} source="historical" footer />}
          chipBasis={
            CHIP_BASIS_METRICS.has(selectedYAxisMetric) ? (
              <ChipBasisCaption control={chipBasisControl} />
            ) : undefined
          }
          date={selectedRunDate || undefined}
          source="SemiAnalysis InferenceX™"
          priceTable={
            costAssumptions && costBases.length > 0 ? (
              <TcoPriceTable
                items={costBases.map((base) => ({
                  base,
                  label: HW_REGISTRY[base]?.badgeLabel ?? base.toUpperCase(),
                  value: String(costAssumptions.values[base]),
                }))}
                testId="historical-tco-prices"
                cellTestId="historical-tco-price"
                inputIdPrefix="historical-cost-input"
              />
            ) : undefined
          }
          metaEnd={costAssumptions && !costAssumptions.custom ? <PricesSourceLink /> : undefined}
        />
        <MetricAssumptionNotes
          selectedYAxisMetric={selectedYAxisMetric}
          activeHwKeys={activeHwTypes}
          includeAllPowerThroughputMetrics={false}
          includePowerThroughputCaveat={false}
          tcoBasis={tcoBasis}
          omitCostValues
          chipBasis={readOnlyChipBasisControl}
        />
        {Object.entries(hardwareConfig).some(
          ([key, hwConfig]) =>
            hwTypesWithData.has(key) && getDisplayLabel(hwConfig).includes(ATOM_FOOTNOTE_MARKER),
        ) && <AtomEngineFootnote className="mt-2" />}
      </div>
    );
  })();

  const legend = (
    <>
      <EngineComparisonConflictNotice className="mb-2" />
      <ChartLegend
        variant="sidebar"
        hideAtomFootnote
        collapsible={chartView !== 'waterfall'}
        onItemRemove={removeHwType}
        legendItems={Object.entries(hardwareConfig)
          .filter(([key]) => hwTypesWithData.has(key))
          .toSorted(([a], [b]) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
          .map(([key, hwConfig]) => {
            // Frontier views may recolour chips for contrast; the legend follows the chart.
            const frontierSeries = frontierSection
              ? frontierHistory?.series.find(
                  (series) => series.hwKey !== series.vendor && series.hwKey === key.split('_')[0],
                )
              : undefined;
            return {
              name: hwConfig.name,
              label: getDisplayLabel(hwConfig),
              color:
                (frontierSeries && frontierStyles.get(frontierSeries.key)?.color) ??
                resolveColor(key),
              lineDasharray: chartView === 'line' ? (frameworkDasharray(key) ?? 'none') : undefined,
              title: hwConfig.gpu,
              hw: key,
              isActive: activeHwTypes.has(key),
              onClick: () => {
                toggleHwType(key);
                track('historical_hw_type_toggled', { gpu: key });
              },
            };
          })}
        isLegendExpanded={isLegendExpanded}
        onExpandedChange={(expanded) => {
          setIsLegendExpanded(expanded);
          track('historical_legend_expanded', { enabled: expanded });
        }}
        switches={[
          ...(frontierSection
            ? [
                {
                  id: 'historical-frontier-memes',
                  label: t.memes,
                  checked: memesEnabled,
                  onCheckedChange: (checked: boolean) => {
                    setMemesEnabled(checked);
                    track('historical_frontier_memes_toggled', { enabled: checked });
                  },
                },
              ]
            : []),
          ...(chartView === 'waterfall'
            ? []
            : [
                {
                  id: 'historical-log-scale',
                  label: t.logScale,
                  checked: logScale,
                  onCheckedChange: (checked: boolean) => {
                    setLogScale(checked);
                    track('historical_log_scale_toggled', { enabled: checked });
                  },
                },
              ]),
          {
            id: 'historical-high-contrast',
            label: t.highContrast,
            checked: highContrast,
            onCheckedChange: (checked: boolean) => {
              setHighContrast(checked);
              track('historical_high_contrast_toggled', { enabled: checked });
            },
          },
        ]}
        reset={{
          id: 'historical-reset-filter',
          disabled: [...hwTypesWithData].every((key) => activeHwTypes.has(key)),
          onClick: () => {
            selectAllHwTypes();
            track('historical_legend_filter_reset');
          },
        }}
        enableTooltips={true}
      />
    </>
  );

  if (error) {
    return (
      <section data-testid="historical-trends-display">
        <Card>
          <DashboardSectionHeader
            title={t.heading}
            description={t.loadError}
            descriptionClassName="text-destructive"
            actions={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  track('historical_reload_clicked');
                  window.location.reload();
                }}
              >
                {t.retry}
              </Button>
            }
          />
        </Card>
      </section>
    );
  }

  if (loading || trendLoading) {
    return (
      <section data-testid="historical-trends-display">
        <Card className="relative z-30">
          <div className="flex flex-col gap-4">
            <DashboardSectionHeader title={t.heading} description={t.description} />
            <ChartControls
              tcoSource="historical"
              hideGpuComparison
              modelDetails={modelDetails}
              trailingPanel={
                <div className="space-y-2">
                  <Skeleton className="h-5 w-56" />
                  <Skeleton className="h-9 w-full" />
                </div>
              }
            />
          </div>
        </Card>
        <Card className="mt-4">
          <Skeleton className="h-7 w-2/4 mb-1" />
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-[600px] w-full" />
        </Card>
      </section>
    );
  }

  if (trendError) {
    return (
      <section data-testid="historical-trends-display">
        <Card data-testid="historical-trend-error">
          <DashboardSectionHeader
            title={t.heading}
            description={t.trendLoadError}
            descriptionClassName="text-destructive"
            actions={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  track('historical_trend_retry_clicked');
                  void refetchTrendData();
                }}
              >
                {t.trendRetry}
              </Button>
            }
          />
        </Card>
      </section>
    );
  }

  return (
    <section data-testid="historical-trends-display" className="flex flex-col gap-4">
      <Card className="relative z-30">
        <div className="flex flex-col gap-4">
          <DashboardSectionHeader
            title={t.heading}
            description={t.description}
            actions={<ChartShareActions />}
          />
          <ChartControls
            tcoSource="historical"
            hideGpuComparison
            modelDetails={modelDetails}
            trailingPanel={
              hasInteractivityChart && (
                <ControlPanel legend={t.targetGroup} className="gap-1.5">
                  <div
                    inert={frontierSection ? true : undefined}
                    className={cn('grid gap-1.5', frontierSection && 'opacity-50')}
                  >
                    <LabelWithTooltip
                      htmlFor="historical-target"
                      label={targetLabel}
                      tooltip={`${t.targetHint}${locale === 'zh' ? '' : ' '}${isAgentic ? t.agenticTargetTooltip : t.targetTooltip}`}
                    />
                    <RangeField
                      label={targetLabel}
                      min={interactivityRange.min}
                      max={interactivityRange.max}
                      value={targetInteractivity}
                      onSliderChange={handleSliderChange}
                      onSliderCommit={() =>
                        track('historical_trend_target_set', { value: targetInteractivity })
                      }
                      sliderTestId="historical-target-slider"
                      input={{
                        id: 'historical-target',
                        value: interactivityInput,
                        onChange: handleInputChange,
                        onBlur: handleInputBlur,
                        'data-testid': 'historical-target-input',
                      }}
                    />
                  </div>
                  {frontierSection && (
                    <p className="text-xs text-muted-foreground">{t.targetNotUsed}</p>
                  )}
                </ControlPanel>
              )
            }
          />
        </div>
      </Card>

      {hasInteractivityChart ? (
        <section>
          <figure data-testid="historical-trend-figure" className="relative min-w-0">
            {frontierSection ? (
              frontierError ? (
                <Card>
                  {toolbar}
                  <p className="text-sm text-destructive">{t.frontierLoadError}</p>
                </Card>
              ) : frontierLoading || !frontierHistory ? (
                <Card>
                  {toolbar}
                  <Skeleton className="h-[600px] w-full" />
                </Card>
              ) : frontierHistory.dates.length === 0 ? (
                <Card>
                  {toolbar}
                  <EmptyState>{t.frontierEmpty}</EmptyState>
                </Card>
              ) : (
                <FrontierView
                  chartId="historical-frontier"
                  toolbar={toolbar}
                  section={frontierSection}
                  grouping={frontierGrouping}
                  onGroupingChange={(grouping) => {
                    setCompareGrouping(grouping);
                    track('historical_frontier_grouping_changed', { group_by: grouping });
                  }}
                  vendors={frontierVendors}
                  vendor={vendorFilter}
                  onVendorChange={(vendor) => {
                    setFrontierVendorFilter(vendor);
                    track('historical_frontier_vendor_changed', { vendor: vendor ?? 'all' });
                  }}
                  history={frontierHistory}
                  styles={frontierStyles}
                  memesEnabled={memesEnabled}
                  vendorOf={frontierVendorOf}
                  hiddenVendors={frontierHiddenNotes}
                  onAddPrecisions={(precisions) => {
                    setSelectedPrecisions([...new Set([...selectedPrecisions, ...precisions])]);
                    track('historical_frontier_precision_added', {
                      precisions: precisions.join(','),
                    });
                  }}
                  configLabel={frontierConfigLabel}
                  xLabel={t.interactivityAxis(isAgentic)}
                  yLabel={currentYLabel}
                  logScale={logScale}
                  legendElement={legend}
                  caption={caption(t.frontierTitle(currentYTitle), null)}
                  footer={footer}
                />
              )
            ) : (
              <Card className="relative">
                {toolbar}
                <PerformanceChart
                  chartId="historical-trend"
                  lowerIsBetter={!higherIsBetter}
                  caption={caption(
                    t.captionTitle(currentYTitle),
                    t.captionQualifier(targetInteractivity, isAgentic),
                  )}
                  footer={footer}
                  trendLines={trendLines}
                  lineConfigs={lineConfigs}
                  yLabel={currentYLabel}
                  logScale={logScale}
                  selectedPrecisions={selectedPrecisions}
                  legendElement={legend}
                />
              </Card>
            )}
          </figure>
        </section>
      ) : (
        <EmptyState>{t.noData}</EmptyState>
      )}
    </section>
  );
}
