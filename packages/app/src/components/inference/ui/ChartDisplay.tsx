'use client';
import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { track } from '@/lib/analytics';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Check, ChevronDown, Table2 } from 'lucide-react';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import { useInference } from '@/components/inference/InferenceContext';
import type {
  ChartDefinition,
  HardwareConfig,
  InferenceData,
  OverlayData,
} from '@/components/inference/types';
import {
  processOverlayChartDataWithClipping,
  selectUnofficialOverlayForMode,
} from '@/components/inference/utils';
import {
  isRunComparisonEntry,
  makeRunComparisonEntry,
} from '@/components/inference/utils/comparisonEntry';
import { dataRunsForDate } from '@/components/inference/utils/runEnumeration';
import { matchesQuickFilters } from '@/components/inference/utils/quickFilters';
import { canonicalNormalizedFrontierIds } from '@/components/inference/utils/canonicalFrontier';
import { bestSeriesPerSku } from '@/components/inference/utils/best-series-per-sku';
import InferenceTable from '@/components/inference/ui/InferenceTable';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { type SegmentedToggleOption, SegmentedToggle } from '@/components/ui/segmented-toggle';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartShareActions, MetricAssumptionNotes } from '@/components/ui/chart-display-helpers';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { metricLabel, metricTitle } from '@/lib/chart-utils';
import { exportToCsv } from '@/lib/csv-export';
import { inferenceChartToCsv } from '@/lib/csv-export-helpers';
import { knownIssueCsvNote, matchKnownConfigIssues } from '@/lib/known-issues';
import { cn, getDisplayLabel } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import {
  type Model,
  type Precision,
  Sequence,
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
  sequenceKind,
} from '@/lib/data-mappings';
import { useComparisonChangelogs } from '@/hooks/api/use-comparison-changelogs';
import {
  derivedModeRoofline,
  isAgenticOnlyXAxisMode,
  type RooflineDirection,
  type XAxisMode,
} from '@/components/inference/hooks/useChartData';
import {
  useDerivedAgenticMetrics,
  type DerivedAgenticMetric,
} from '@/hooks/api/use-derived-agentic-metrics';
import { getHardwareConfig, hardwareKeyMatchesAnyBase } from '@/lib/constants';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';

import ChartControls from './ChartControls';
import ComparisonChangelog from './ComparisonChangelog';
import CustomCosts from './CustomCosts';
import CustomPowers from './CustomPowers';
import GPUGraph from './GPUGraph';
import ReplayLauncher, { type ReplayLauncherHandle } from '../replay/ReplayLauncher';

const ModelArchitectureDiagram = dynamic(() => import('./ModelArchitectureDiagram'), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full" />,
});
import WorkflowInfoDisplay from './WorkflowInfoDisplay';

type InferenceViewMode = 'chart' | 'table';

const STRINGS = {
  en: {
    inferencePerformance: 'Inference Performance',
    inferencePerformanceDesc:
      'Inference performance metrics across different models, hardware configurations, and serving parameters.',
    chart: 'Chart',
    table: 'Table',
    sourceUnofficial: 'Source: UNOFFICIAL',
    sourceOfficial: 'Source: SemiAnalysis InferenceX™',
    updated: 'Updated:',
    e2eNormIntvtyDisclaimer:
      'E2E Normalized Interactivity requires persisted per-request traces, so unofficial-run overlays are unavailable for this experimental view.',
    selectDateRange: 'Select a date range or add a run to view chip comparison',
    viewMode: 'View mode',
    vsTtft: (word: string) => `vs. ${word} Time To First Token`,
    vsE2eLatency: (pctl?: string) =>
      pctl ? `vs. ${pctl} End-to-end Latency` : 'vs. End-to-end Latency',
    advancedXAxis: 'Advanced',
    advancedXAxisWith: (label: string) => `Advanced: ${label}`,
  },
  zh: {
    inferencePerformance: '推理性能',
    inferencePerformanceDesc: '不同模型、硬件配置和服务参数下的推理性能指标。',
    chart: '图表',
    table: '表格',
    sourceUnofficial: '来源：非官方',
    sourceOfficial: '来源：SemiAnalysis InferenceX™',
    updated: '更新时间：',
    e2eNormIntvtyDisclaimer:
      '端到端归一化交互性需要持久化的逐请求 trace 数据，因此该实验性视图不支持非官方运行覆盖。',
    selectDateRange: '请选择日期范围或添加运行以查看 Chip 对比',
    viewMode: '视图模式',
    vsTtft: (word: string) => `vs. ${word === 'Median' ? '中位' : word} 首 token 延迟（TTFT）`,
    vsE2eLatency: (pctl?: string) => (pctl ? `vs. ${pctl} 端到端延迟` : 'vs. 端到端延迟'),
    advancedXAxis: '高级',
    advancedXAxisWith: (label: string) => `高级：${label}`,
  },
} as const;

// Translate the "vs. …" chart-heading suffix from inference-chart-config.json
// into Chinese. useChartData rewrites the heading with the selected percentile
// for agentic sequences (e.g. "vs. P90 Interactivity"), so this matches the
// pattern instead of a fixed string; unknown headings pass through unchanged.
const HEADING_SUBJECT_ZH: Record<string, string> = {
  'E2E Normalized Interactivity': '端到端归一化交互性',
  Interactivity: '交互性',
  'End-to-end Latency': '端到端延迟',
  'Time To First Token': '首 token 延迟（TTFT）',
};

function zhHeading(configured: string): string {
  const match = /^vs\.\s+(?:(?<pctl>Median|Mean|P\d+(?:\.\d+)?)\s+)?(?<subject>.+)$/iu.exec(
    configured,
  );
  const subjectZh = match?.groups && HEADING_SUBJECT_ZH[match.groups.subject];
  if (!subjectZh) return configured;
  const pctl = match.groups?.pctl;
  return `vs. ${pctl ? `${pctl} ` : ''}${subjectZh}`;
}

const X_AXIS_MODE_BUTTONS: { value: XAxisMode; label: string; labelZh: string }[] = [
  {
    value: 'e2e-normalized-interactivity',
    label: 'E2E Normalized Interactivity',
    labelZh: '端到端归一化交互性',
  },
  { value: 'interactivity', label: 'Interactivity', labelZh: '交互性' },
  { value: 'e2e', label: 'E2E Latency', labelZh: '端到端延迟' },
  { value: 'ttft', label: 'TTFT', labelZh: 'TTFT' },
];

/**
 * X-axis modes tucked behind the "Advanced" menu on agentic charts.
 *
 * AgentX headlines E2E Normalized Interactivity, so the three per-request
 * latency views are secondary there and would otherwise crowd the strip. They
 * stay flat top-level tabs on every other scenario: E2E Normalized
 * Interactivity is agentic-only, so collapsing them elsewhere would leave the
 * strip with nothing in it.
 */
const ADVANCED_X_AXIS_MODES: readonly XAxisMode[] = ['interactivity', 'e2e', 'ttft'];

const isAdvancedXAxisMode = (mode: XAxisMode): boolean => ADVANCED_X_AXIS_MODES.includes(mode);

/**
 * "Advanced" x-axis picker for agentic charts. Styled to sit in the tab strip
 * beside the real tabs, but it is a menu button rather than a `TabsTrigger`:
 * Radix would otherwise treat it as a fifth tab stop and steal arrow-key
 * navigation from the modes inside it. The active mode's label is shown on the
 * trigger so the strip still says which metric the x-axis is plotting.
 */
function AdvancedXAxisMenu({
  selected,
  onSelect,
  locale,
  labels,
}: {
  selected: XAxisMode;
  onSelect: (mode: XAxisMode) => void;
  locale: Locale;
  labels: { advanced: string; advancedWith: (label: string) => string };
}) {
  const [open, setOpen] = useState(false);
  const active = isAdvancedXAxisMode(selected);
  const options = X_AXIS_MODE_BUTTONS.filter(({ value }) => isAdvancedXAxisMode(value));
  const activeLabel = options.find(({ value }) => value === selected);
  const activeText = activeLabel && (locale === 'zh' ? activeLabel.labelZh : activeLabel.label);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-testid="x-axis-mode-advanced"
        data-state={active ? 'active' : 'inactive'}
        // No aria-label: the accessible name comes from the visible text, so
        // screen readers announce "Advanced: TTFT" rather than a bare
        // "Advanced" that hides which metric the x-axis is plotting.
        className={cn(
          'relative inline-flex items-center justify-center gap-1.5',
          'border-b-2 border-transparent px-4 py-2',
          'text-sm font-semibold whitespace-nowrap',
          'text-muted-foreground hover:border-muted-foreground/30',
          'data-[state=active]:text-secondary dark:data-[state=active]:text-primary',
          'data-[state=active]:border-secondary dark:data-[state=active]:border-primary',
          'transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
          'min-w-[130px] sm:min-w-[140px] flex-1 sm:flex-initial cursor-pointer',
        )}
      >
        {active && activeText ? labels.advancedWith(activeText) : labels.advanced}
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent align="center" className="w-52 p-1" data-testid="x-axis-mode-advanced-menu">
        <ul className="flex flex-col">
          {options.map(({ value, label, labelZh }) => {
            const isActive = value === selected;
            return (
              <li key={value}>
                <button
                  type="button"
                  data-testid={`x-axis-mode-${value}`}
                  aria-current={isActive}
                  onClick={() => {
                    setOpen(false);
                    onSelect(value);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm',
                    'cursor-pointer transition-colors',
                    isActive
                      ? 'bg-accent text-secondary dark:text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {locale === 'zh' ? labelZh : label}
                  {isActive && <Check className="size-4" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Presentation and data plumbing for trace-derived agentic x-axis modes. */
interface DerivedXModeSpec {
  xLabel: (percentileLabel: string) => string;
  xLabelZh?: (percentileLabel: string) => string;
  heading: (percentileLabel: string) => string;
  headingZh?: (percentileLabel: string) => string;
  value: (m: DerivedAgenticMetric | undefined, percentile: string) => number | null | undefined;
  toX: (raw: number) => number;
}

const DERIVED_X_MODE_SPECS: Partial<Record<XAxisMode, DerivedXModeSpec>> = {
  'e2e-normalized-interactivity': {
    xLabel: (pctl) => `${pctl} E2E Normalized Interactivity (tok/s/user)`,
    xLabelZh: (pctl) => `${pctl} 端到端归一化交互性 (tok/s/user)`,
    heading: (pctl) => `vs. ${pctl} E2E Normalized Interactivity`,
    headingZh: (pctl) => `vs. ${pctl} 端到端归一化交互性`,
    value: (m, percentile) =>
      percentile === 'p75' ? m?.p75_e2e_norm_intvty : m?.p90_e2e_norm_intvty,
    toX: (raw) => raw,
  },
};

const VIEW_MODE_OPTIONS: SegmentedToggleOption<InferenceViewMode>[] = [
  {
    value: 'chart',
    label: 'Chart',
    icon: <BarChart3 className="size-3.5" />,
    testId: 'inference-chart-view-btn',
  },
  {
    value: 'table',
    label: 'Table',
    icon: <Table2 className="size-3.5" />,
    testId: 'inference-table-view-btn',
  },
];

/**
 * Renders the inference chart cards, captions, and overlay controls for the current filtered
 * benchmark data.
 */
export default function ChartDisplay() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const {
    graphs,
    loading,
    error,
    workflowInfo,
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
    selectedGPUs,
    selectedPrecisions,
    selectedDates,
    setSelectedDates,
    setSelectedDatesFromRunExpansion,
    selectedDateRange,
    dateRangeAvailableDates,
    selectedModel,
    selectedSequence,
    selectedRunDate,
    setIsLegendExpanded,
    activeHwTypes,
    bestPerSku,
    activeDates,
    selectedPercentile,
    compareGpuPair,
    selectedXAxisMode,
    setSelectedXAxisMode,
    quickFilters,
  } = useInference();
  const selectedBenchmarkType: 'single_turn' | 'agentic_traces' =
    selectedSequence === Sequence.AgenticTraces ? 'agentic_traces' : 'single_turn';
  const workflowInfoBenchmarkType =
    selectedSequence === Sequence.AgenticTraces ? 'agentic_traces' : undefined;

  const {
    changelogs,
    loading: changelogsLoading,
    totalDatesQueried,
  } = useComparisonChangelogs(
    selectedGPUs,
    selectedDateRange,
    dateRangeAvailableDates,
    workflowInfoBenchmarkType,
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const modelDbKeys = useMemo(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? [selectedModel],
    [selectedModel],
  );
  // Stable run numbering shared by the changelog and the chart legend: each of a
  // date's runs gets a fixed 1-based number (by start time) regardless of which
  // are on the chart, so the two surfaces always show the same #N for a run and a
  // removed run leaves a matching gap. Built from the same data-run enumeration
  // the changelog uses.
  const runNumbering = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of changelogs) {
      dataRunsForDate(c.runConfigs, {
        modelDbKeys,
        selectedGPUs,
        selectedPrecisions,
        benchmarkType: selectedBenchmarkType,
      }).forEach((run, idx) => {
        map.set(makeRunComparisonEntry(c.date, run.runId), idx + 1);
      });
    }
    return map;
  }, [changelogs, modelDbKeys, selectedGPUs, selectedPrecisions, selectedBenchmarkType]);

  // Expand a plain-date selection into one entry per run once that date's runs are
  // known. Picking a date that has multiple runs shows each run as its own series
  // (matching the changelog, which renders a block per run) instead of a single
  // merged "latest" line with no changelog row — keeping the legend and changelog
  // in sync. Idempotent: after expansion no expandable plain date remains.
  useEffect(() => {
    const runConfigsByDate = new Map(changelogs.map((c) => [c.date, c.runConfigs]));
    const scope = {
      modelDbKeys,
      selectedGPUs,
      selectedPrecisions,
      benchmarkType: selectedBenchmarkType,
    };
    setSelectedDatesFromRunExpansion((prev) => {
      let changed = false;
      const out: string[] = [];
      for (const entry of prev) {
        if (isRunComparisonEntry(entry)) {
          out.push(entry);
          continue;
        }
        const rc = runConfigsByDate.get(entry);
        const runs = rc ? dataRunsForDate(rc, scope) : [];
        if (runs.length > 1) {
          changed = true;
          for (const run of runs) out.push(makeRunComparisonEntry(entry, run.runId));
        } else {
          out.push(entry);
        }
      }
      if (!changed) return prev;
      return [...new Set(out)];
    });
  }, [
    changelogs,
    modelDbKeys,
    selectedGPUs,
    selectedPrecisions,
    selectedBenchmarkType,
    selectedDates,
    setSelectedDatesFromRunExpansion,
  ]);

  const [viewModes, setViewModes] = useState<Record<number, InferenceViewMode>>({});
  const replayHandlesRef = useRef<Record<number, ReplayLauncherHandle | null>>({});
  const getViewMode = (index: number): InferenceViewMode => viewModes[index] ?? 'chart';
  const handleViewModeChange = (index: number, value: InferenceViewMode) => {
    setViewModes((prev) => ({ ...prev, [index]: value }));
    track('inference_view_changed', { view: value, chartIndex: index });
  };

  const viewModeOptions = useMemo<SegmentedToggleOption<InferenceViewMode>[]>(
    () =>
      VIEW_MODE_OPTIONS.map((opt) => ({
        ...opt,
        label: opt.value === 'chart' ? t.chart : t.table,
      })),
    [t],
  );

  const {
    unofficialRunInfo,
    unofficialRunInfos,
    runIndexByUrl,
    getOverlayData,
    isUnofficialRun,
    activeOverlayHwTypes,
    setActiveOverlayHwTypes,
    localOfficialOverride,
    setLocalOfficialOverride,
  } = useUnofficialRun();

  // Compute overlay data for each chart type — must match useChartData processing
  const overlayDataByChartType = useMemo(() => {
    if (!unofficialRunInfo || !getOverlayData) {
      return { e2e: null, interactivity: null };
    }

    const e2eRaw = getOverlayData(selectedModel, selectedSequence, 'e2e');
    const interactivityRaw = getOverlayData(selectedModel, selectedSequence, 'interactivity');

    // Per-row run lookup used by the overlay tooltip so hovering a point shows
    // its OWN run's branch, not the banner-level first-run fallback.
    const getRunForRow = (row: InferenceData) => {
      const url = row.run_url ?? null;
      if (!url) return undefined;
      if (url in runIndexByUrl) {
        const info = unofficialRunInfos[runIndexByUrl[url]];
        return info ? { branch: info.branch, url: info.url } : undefined;
      }
      const idMatch = url.match(/\/runs\/(?<runId>\d+)/u);
      if (idMatch && idMatch[1] in runIndexByUrl) {
        const info = unofficialRunInfos[runIndexByUrl[idMatch[1]]];
        return info ? { branch: info.branch, url: info.url } : undefined;
      }
      return undefined;
    };

    const processData = (
      rawData: { data: InferenceData[]; hardwareConfig: any } | null,
      chartType: 'e2e' | 'interactivity',
    ): OverlayData | null => {
      if (!rawData || rawData.data.length === 0) return null;

      const effectiveXMetric = chartType === 'e2e' ? selectedE2eXAxisMetric : selectedXAxisMetric;
      const isAgentic = sequenceKind(selectedSequence) === 'agentic';
      const processed = processOverlayChartDataWithClipping(
        rawData.data,
        chartType,
        selectedYAxisMetric,
        effectiveXMetric,
        {
          isAgentic,
          selectedPercentile,
          // Unofficial rows lack persisted request traces, so they cannot be
          // admitted to the normalized north-star frontier on any agentic axis.
          restrictToNormalizedFrontier: isAgentic,
        },
      );

      let overlayPoints = processed.data;
      let clippedOverlayPoints = processed.clippedData;
      if (compareGpuPair?.length === 2) {
        overlayPoints = overlayPoints.filter((p) =>
          hardwareKeyMatchesAnyBase(String(p.hwKey), compareGpuPair),
        );
        clippedOverlayPoints = clippedOverlayPoints.filter(({ point }) =>
          hardwareKeyMatchesAnyBase(String(point.hwKey), compareGpuPair),
        );
      }

      if (overlayPoints.length === 0 && clippedOverlayPoints.length === 0) return null;

      const keySet = new Set([
        ...overlayPoints.map((p) => String(p.hwKey)),
        ...clippedOverlayPoints.map(({ point }) => String(point.hwKey)),
      ]);
      const hardwareConfigFiltered = Object.fromEntries(
        Object.entries(rawData.hardwareConfig).filter(([k]) => keySet.has(k)),
      ) as HardwareConfig;

      return {
        data: overlayPoints,
        clippedData: clippedOverlayPoints,
        hardwareConfig: hardwareConfigFiltered,
        label: unofficialRunInfo.branch,
        runUrl: unofficialRunInfo.url,
        getRunForRow,
      };
    };

    return {
      e2e: processData(e2eRaw, 'e2e'),
      interactivity: processData(interactivityRaw, 'interactivity'),
    };
  }, [
    unofficialRunInfo,
    unofficialRunInfos,
    runIndexByUrl,
    getOverlayData,
    selectedModel,
    selectedSequence,
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
    selectedPercentile,
    selectedXAxisMode,
    compareGpuPair,
  ]);

  const overlayScope = useMemo(() => {
    const eligibleKeys = new Set<string>();
    for (const overlay of [overlayDataByChartType.e2e, overlayDataByChartType.interactivity]) {
      const points = [
        ...(overlay?.data ?? []),
        ...(overlay?.clippedData ?? []).map((entry) => entry.point),
      ];
      for (const point of points) {
        const key = String(point.hwKey);
        if (
          selectedPrecisions.includes(point.precision) &&
          matchesQuickFilters(point, quickFilters)
        ) {
          eligibleKeys.add(key);
        }
      }
    }
    return eligibleKeys;
  }, [overlayDataByChartType, selectedPrecisions, quickFilters]);
  const officialScope = useMemo(() => {
    const eligibleKeys = new Set<string>();
    for (const graph of graphs) {
      const points = [...graph.data, ...(graph.clippedData ?? []).map((entry) => entry.point)];
      for (const point of points) {
        if (
          selectedPrecisions.includes(point.precision) &&
          matchesQuickFilters(point, quickFilters)
        ) {
          eligibleKeys.add(String(point.hwKey));
        }
      }
    }
    return eligibleKeys;
  }, [graphs, selectedPrecisions, quickFilters]);
  const scopedBestSelections = useMemo(() => {
    if (!bestPerSku) return { official: officialScope, overlay: overlayScope };
    const wantedType = selectedXAxisMode === 'interactivity' ? 'interactivity' : 'e2e';
    const graph = graphs.find((candidate) => candidate.chartDefinition.chartType === wantedType);
    const direction =
      graph?.chartDefinition[`${selectedYAxisMetric}_roofline` as keyof ChartDefinition];
    if (
      !graph ||
      (direction !== 'upper_right' &&
        direction !== 'upper_left' &&
        direction !== 'lower_left' &&
        direction !== 'lower_right')
    ) {
      return { official: officialScope, overlay: overlayScope };
    }
    const overlay = overlayDataByChartType[wantedType];
    const officialBest = bestSeriesPerSku(graph.data, direction);
    const overlayBest = bestSeriesPerSku(overlay?.data ?? [], direction);
    return {
      official: officialBest.size > 0 ? officialBest : officialScope,
      overlay: overlayBest.size > 0 ? overlayBest : overlayScope,
    };
  }, [
    bestPerSku,
    graphs,
    officialScope,
    overlayDataByChartType,
    overlayScope,
    selectedXAxisMode,
    selectedYAxisMetric,
  ]);
  const overlayRowsScopeKey = `${selectedModel}|${selectedSequence}|${selectedPrecisions.join(
    ',',
  )}|${unofficialRunInfos.map((run) => run.url).join(',')}`;
  const [appliedOverlayRowsScopeKey, setAppliedOverlayRowsScopeKey] = useState(overlayRowsScopeKey);
  const overlayRowsScopeChanged =
    isUnofficialRun && appliedOverlayRowsScopeKey !== overlayRowsScopeKey;
  const selectedOfficialHwTypes = overlayRowsScopeChanged
    ? officialScope
    : isUnofficialRun
      ? (localOfficialOverride ?? activeHwTypes)
      : activeHwTypes;
  // Preview tables follow the same policy as ScatterGraph: preserve every
  // active engine family instead of applying the production comparison guard.
  const scopedActiveOverlayHwTypes = useMemo(() => {
    const activeScopedOverlayKeys = new Set(
      [...activeOverlayHwTypes].filter((key) => overlayScope.has(key)),
    );
    return overlayRowsScopeChanged ? scopedBestSelections.overlay : activeScopedOverlayKeys;
  }, [activeOverlayHwTypes, overlayScope, overlayRowsScopeChanged, scopedBestSelections.overlay]);
  useEffect(() => {
    const merged = new Set(activeOverlayHwTypes);
    overlayScope.forEach((key) => merged.delete(key));
    scopedActiveOverlayHwTypes.forEach((key) => merged.add(key));
    let selectionChanged = merged.size !== activeOverlayHwTypes.size;
    if (!selectionChanged) {
      for (const key of merged) {
        if (!activeOverlayHwTypes.has(key)) {
          selectionChanged = true;
          break;
        }
      }
    }
    if (selectionChanged) setActiveOverlayHwTypes(merged);
    // A scope change can render once before its official graphs arrive. Do not
    // persist that transient empty set as an intentional legend selection.
    if (overlayRowsScopeChanged && (!loading || officialScope.size > 0)) {
      setLocalOfficialOverride(scopedBestSelections.official);
      setAppliedOverlayRowsScopeKey(overlayRowsScopeKey);
    }
  }, [
    overlayRowsScopeChanged,
    overlayRowsScopeKey,
    activeOverlayHwTypes,
    loading,
    officialScope,
    scopedBestSelections.official,
    overlayScope,
    scopedActiveOverlayHwTypes,
    setActiveOverlayHwTypes,
    setLocalOfficialOverride,
  ]);

  const visibleComparisonRows = useCallback(
    (officialRows: InferenceData[], overlay: OverlayData | null | undefined) => {
      const eligibleOfficialRows = officialRows.filter(
        (point) =>
          selectedPrecisions.includes(point.precision) && matchesQuickFilters(point, quickFilters),
      );
      const eligibleOverlayRows = (overlay?.data ?? []).filter(
        (point) =>
          selectedPrecisions.includes(point.precision) && matchesQuickFilters(point, quickFilters),
      );
      const availableOfficialKeys = new Set(
        eligibleOfficialRows.map((point) => String(point.hwKey)),
      );
      const availableOverlayKeys = new Set(eligibleOverlayRows.map((point) => String(point.hwKey)));
      const activeOfficialKeys = new Set(
        [...selectedOfficialHwTypes].filter((key) => availableOfficialKeys.has(key)),
      );
      const officialKeys = activeOfficialKeys;
      const overlayKeys = new Set(
        [...scopedActiveOverlayHwTypes].filter((key) => availableOverlayKeys.has(key)),
      );

      return {
        officialRows: eligibleOfficialRows.filter((point) => officialKeys.has(String(point.hwKey))),
        overlayRows: eligibleOverlayRows.filter((point) => overlayKeys.has(String(point.hwKey))),
      };
    },
    [selectedPrecisions, quickFilters, selectedOfficialHwTypes, scopedActiveOverlayHwTypes],
  );

  if (!loading && error) {
    console.error(error);
    throw new Error('Something went wrong.');
  }

  // Show skeletons only on first load (no data yet). During refetch, keepPreviousData
  // keeps old graphs visible so we never flash skeletons when switching filters.
  const isFirstLoad = loading && graphs.length === 0;

  // When the selected model has no DB data but an unofficial run provides overlay
  // data for this (model, sequence), synthesize empty-data stub graphs from the
  // chart-config so the overlay has a base chart to render on.
  const effectiveGraphs = useMemo(() => {
    if (graphs.length > 0) return graphs;
    const hasOverlay =
      (overlayDataByChartType.e2e?.data.length ?? 0) > 0 ||
      (overlayDataByChartType.e2e?.clippedData?.length ?? 0) > 0 ||
      (overlayDataByChartType.interactivity?.data.length ?? 0) > 0 ||
      (overlayDataByChartType.interactivity?.clippedData?.length ?? 0) > 0;
    if (!hasOverlay) return graphs;
    return (chartDefinitions as ChartDefinition[]).map((chartDefinition) => ({
      model: selectedModel,
      sequence: selectedSequence,
      chartDefinition,
      data: [] as InferenceData[],
      clippedData: [],
    }));
  }, [graphs, overlayDataByChartType, selectedModel, selectedSequence]);

  const visibleGraphs = useMemo(() => {
    const wantedType = selectedXAxisMode === 'interactivity' ? 'interactivity' : 'e2e';
    const filtered = effectiveGraphs.filter((g) => g.chartDefinition.chartType === wantedType);
    return filtered.length > 0 ? filtered : effectiveGraphs;
  }, [effectiveGraphs, selectedXAxisMode]);

  const isAgenticSequence = sequenceKind(selectedSequence) === 'agentic';
  const useDerivedXAxis = isAgenticSequence && isAgenticOnlyXAxisMode(selectedXAxisMode);
  const derivedTargetIds = useMemo(() => {
    // Every agentic x-axis is classified by the normalized north-star
    // frontier, so all modes need the persisted trace-derived metric.
    if (!isAgenticSequence) return [] as number[];
    const ids = new Set<number>();
    for (const graph of visibleGraphs) {
      const points = [...graph.data, ...(graph.clippedData ?? []).map((entry) => entry.point)];
      for (const point of points) {
        if (point.benchmark_type === 'agentic_traces' && isPersistedBenchmarkId(point.id)) {
          ids.add(point.id);
        }
      }
    }
    return [...ids];
  }, [isAgenticSequence, visibleGraphs]);
  const derivedQuery = useDerivedAgenticMetrics(derivedTargetIds, isAgenticSequence);
  const derivedMetrics = derivedQuery.data;
  const isCanonicalFrontierLoading =
    isAgenticSequence &&
    derivedTargetIds.length > 0 &&
    (derivedQuery.isPending || derivedQuery.isFetching) &&
    !derivedMetrics;
  const derivedSpec = useDerivedXAxis ? DERIVED_X_MODE_SPECS[selectedXAxisMode] : undefined;

  const renderableGraphs = useMemo(() => {
    if (!isAgenticSequence) return visibleGraphs;
    if (!derivedMetrics) {
      // Legacy AgentX axes can still render transient/non-persisted rows, which
      // have no ids to request. Persisted rows remain gated on their derived
      // metrics so every displayed frontier can enforce canonical eligibility.
      if (!derivedSpec && derivedTargetIds.length === 0) return visibleGraphs;
      return visibleGraphs.map((graph) => ({ ...graph, data: [], clippedData: [] }));
    }
    return visibleGraphs.map((graph) => {
      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof typeof graph.chartDefinition;
      // The normalized axis is higher-is-better. Compute its true Pareto
      // direction once, regardless of which x-axis is currently displayed.
      const configuredCorner = graph.chartDefinition[rooflineKey] as RooflineDirection | undefined;
      const canonicalCorner =
        graph.chartDefinition.chartType === 'e2e'
          ? derivedModeRoofline(configuredCorner, true)
          : configuredCorner;
      const allPoints = [...graph.data, ...(graph.clippedData ?? []).map((entry) => entry.point)];
      const canonicalIds = canonicalNormalizedFrontierIds(
        allPoints,
        derivedMetrics,
        selectedPercentile,
        canonicalCorner,
      );

      const preparePoint = (point: InferenceData): InferenceData | null => {
        const pointId = isPersistedBenchmarkId(point.id) ? point.id : null;
        const stamped = {
          ...point,
          isOnNormalizedInteractivityFrontier:
            canonicalIds === null ? undefined : pointId !== null && canonicalIds.has(pointId),
        };
        if (!derivedSpec) return stamped;
        if (pointId === null) return null;
        const raw = derivedSpec.value(derivedMetrics[pointId], selectedPercentile);
        if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
        return { ...stamped, x: derivedSpec.toX(raw) };
      };

      const data = graph.data
        .map(preparePoint)
        .filter((point): point is InferenceData => point !== null);
      const clippedData = (graph.clippedData ?? [])
        .map((entry) => {
          const point = preparePoint(entry.point);
          return point ? { ...entry, point } : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (!derivedSpec) return { ...graph, data, clippedData };

      const xLabelFn =
        locale === 'zh' && derivedSpec.xLabelZh ? derivedSpec.xLabelZh : derivedSpec.xLabel;
      const chartDefinition = {
        ...graph.chartDefinition,
        x_label: xLabelFn(selectedPercentile.toUpperCase()),
        y_latency_limit: undefined,
        ...(canonicalCorner ? { [rooflineKey]: canonicalCorner } : {}),
      };
      return { ...graph, chartDefinition, data, clippedData };
    });
  }, [
    isAgenticSequence,
    derivedSpec,
    derivedTargetIds.length,
    visibleGraphs,
    derivedMetrics,
    selectedYAxisMetric,
    selectedPercentile,
    locale,
  ]);

  const displayGraphs =
    isFirstLoad || isCanonicalFrontierLoading
      ? [
          <Card key="skeleton-0">
            <Skeleton className="h-7 w-2/4 mb-1" />
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-[600px] w-full" />
          </Card>,
        ]
      : renderableGraphs.length === 0
        ? []
        : renderableGraphs.map((graph, graphIndex) => {
            const isTimelineMode = Boolean(
              selectedDateRange.startDate && selectedDateRange.endDate && selectedGPUs.length > 0,
            );
            const replayAvailable = getViewMode(graphIndex) === 'chart' && !isTimelineMode;
            return (
              <section key={graphIndex} className="pt-8 md:pt-0">
                <figure data-testid="chart-figure" className="relative rounded-lg">
                  <ChartButtons
                    chartId={`chart-${graphIndex}`}
                    analyticsPrefix={
                      isTimelineMode
                        ? 'gpu_timeseries'
                        : graph.chartDefinition.chartType === 'e2e'
                          ? 'latency'
                          : 'interactivity'
                    }
                    leadingControls={
                      <SegmentedToggle
                        value={getViewMode(graphIndex)}
                        options={viewModeOptions}
                        onValueChange={(v) => handleViewModeChange(graphIndex, v)}
                        ariaLabel={t.viewMode}
                        testId={`inference-view-toggle-${graphIndex}`}
                      />
                    }
                    hideImageExport={getViewMode(graphIndex) === 'table'}
                    setIsLegendExpanded={setIsLegendExpanded}
                    exportFileName={`InferenceX_${selectedModel}_${graph.chartDefinition.chartType}`}
                    onExportMp4={
                      replayAvailable
                        ? () => replayHandlesRef.current[graphIndex]?.open()
                        : undefined
                    }
                    onExportCsv={() => {
                      const candidateVisibleData = isTimelineMode
                        ? graph.data.filter((d) => activeDates.has(`${d.date}_${d.hwKey}`))
                        : graph.data;
                      const overlay = selectUnofficialOverlayForMode(
                        selectedXAxisMode,
                        graph.chartDefinition.chartType,
                        overlayDataByChartType,
                      );
                      const {
                        officialRows: visibleData,
                        overlayRows: visibleOverlayRowsForExport,
                      } = isTimelineMode
                        ? { officialRows: candidateVisibleData, overlayRows: [] }
                        : visibleComparisonRows(candidateVisibleData, overlay);
                      const { headers, rows } = inferenceChartToCsv(
                        visibleData,
                        graph.model,
                        graph.sequence,
                        visibleOverlayRowsForExport,
                        {
                          yHeader: metricLabel(graph.chartDefinition, selectedYAxisMetric, locale),
                          yPath: (graph.chartDefinition as ChartDefinition)[
                            selectedYAxisMetric
                          ] as string,
                          xHeader: graph.chartDefinition.x_label,
                        },
                      );
                      // Match warnings against the same series the chart annotates,
                      // including visible unofficial-run overlay series.
                      const issueNotes = matchKnownConfigIssues(graph.model, [
                        ...visibleData,
                        ...visibleOverlayRowsForExport,
                      ]).map((issue) =>
                        knownIssueCsvNote(issue, getDisplayLabel(getHardwareConfig(issue.hwKey))),
                      );
                      exportToCsv(
                        `InferenceX_${selectedModel}_${graph.chartDefinition.chartType}`,
                        headers,
                        rows,
                        issueNotes,
                      );
                    }}
                  />
                  <Card>
                    {(() => {
                      const chartCaption = (
                        <>
                          <h2 className="text-lg font-semibold">
                            {metricTitle(graph.chartDefinition, selectedYAxisMetric, locale)}{' '}
                            {(() => {
                              // For Input metrics with dynamic x-axis, use dynamic heading.
                              // Classify off the ENGLISH title — the localized one has no
                              // 'input' substring to match on zh pages.
                              const isInputMetric = metricTitle(
                                graph.chartDefinition,
                                selectedYAxisMetric,
                                'en',
                              )
                                .toLowerCase()
                                .includes('input');
                              if (
                                graph.chartDefinition.chartType === 'interactivity' &&
                                isInputMetric &&
                                selectedXAxisMetric
                              ) {
                                if (selectedXAxisMetric === 'p99_ttft') {
                                  return t.vsTtft('P99');
                                } else if (selectedXAxisMetric === 'median_ttft') {
                                  return t.vsTtft('Median');
                                }
                              }

                              // The e2e chart heading follows the branch-level x-axis
                              // mode selector.
                              if (graph.chartDefinition.chartType === 'e2e') {
                                const modeSpec = DERIVED_X_MODE_SPECS[selectedXAxisMode];
                                if (modeSpec) {
                                  const heading =
                                    locale === 'zh' && modeSpec.headingZh
                                      ? modeSpec.headingZh
                                      : modeSpec.heading;
                                  return heading(selectedPercentile.toUpperCase());
                                }
                                if (selectedE2eXAxisMetric?.endsWith('_ttft')) {
                                  const percentile = selectedE2eXAxisMetric.replace(/_ttft$/u, '');
                                  const word =
                                    percentile === 'median' ? 'Median' : percentile.toUpperCase();
                                  return t.vsTtft(word);
                                }
                                return isAgenticSequence
                                  ? t.vsE2eLatency(selectedPercentile.toUpperCase())
                                  : t.vsE2eLatency();
                              }

                              // Fall back to configured heading
                              const configured =
                                graph.chartDefinition[
                                  `${selectedYAxisMetric}_heading` as keyof typeof graph.chartDefinition
                                ] || graph.chartDefinition.heading;
                              return locale === 'zh' ? zhHeading(String(configured)) : configured;
                            })()}
                          </h2>
                          <p className="text-sm text-muted-foreground mb-2">
                            {getModelLabel(graph.model as Model)} •{' '}
                            {selectedPrecisions
                              .map((prec) => getPrecisionLabel(prec as Precision))
                              .join(', ')}{' '}
                            • {getSequenceLabel(graph.sequence as Sequence)} •{' '}
                            {isUnofficialRun ? t.sourceUnofficial : t.sourceOfficial}
                            {selectedRunDate && (
                              <>
                                {' '}
                                • {t.updated}{' '}
                                {new Date(`${selectedRunDate}T00:00:00Z`).toLocaleDateString(
                                  locale === 'zh' ? 'zh-CN' : 'en-US',
                                  {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    timeZone: 'UTC',
                                  },
                                )}
                              </>
                            )}
                          </p>
                          <MetricAssumptionNotes selectedYAxisMetric={selectedYAxisMetric} />
                          {isUnofficialRun &&
                            selectedXAxisMode === 'e2e-normalized-interactivity' && (
                              <p className="mb-2 text-xs text-muted-foreground">
                                {t.e2eNormIntvtyDisclaimer}
                              </p>
                            )}
                          <UnofficialDomainNotice />
                        </>
                      );

                      if (getViewMode(graphIndex) === 'table') {
                        const overlay = selectUnofficialOverlayForMode(
                          selectedXAxisMode,
                          graph.chartDefinition.chartType,
                          overlayDataByChartType,
                        );
                        // Display limits keep outliers off the plotted domain but
                        // must not silently remove measured rows from the table.
                        // Restore both official and unofficial clipped points before
                        // applying the shared precision, quick-filter, and legend gates.
                        const tableOfficialData = [
                          ...graph.data,
                          ...(graph.clippedData ?? []).map((entry) => entry.point),
                        ];
                        const tableOverlay = overlay
                          ? {
                              ...overlay,
                              data: [
                                ...overlay.data,
                                ...(overlay.clippedData ?? []).map((entry) => entry.point),
                              ],
                            }
                          : overlay;
                        const { officialRows, overlayRows } = visibleComparisonRows(
                          tableOfficialData,
                          tableOverlay,
                        );
                        return (
                          <>
                            {chartCaption}
                            <InferenceTable
                              data={[...officialRows, ...overlayRows]}
                              chartDefinition={graph.chartDefinition}
                              selectedYAxisMetric={selectedYAxisMetric}
                            />
                          </>
                        );
                      }

                      return selectedGPUs.length > 0 &&
                        ((selectedDateRange.startDate && selectedDateRange.endDate) ||
                          selectedDates.length > 0) ? (
                        <GPUGraph
                          chartId={`chart-${graphIndex}`}
                          modelLabel={graph.model}
                          data={graph.data}
                          xLabel={graph.chartDefinition.x_label}
                          yLabel={metricLabel(graph.chartDefinition, selectedYAxisMetric, locale)}
                          chartDefinition={graph.chartDefinition}
                          caption={chartCaption}
                          runNumbering={runNumbering}
                        />
                      ) : (
                        <div className="relative">
                          <ScatterGraph
                            chartId={`chart-${graphIndex}`}
                            modelLabel={graph.model}
                            data={graph.data}
                            clippedData={graph.clippedData}
                            xLabel={graph.chartDefinition.x_label}
                            yLabel={metricLabel(graph.chartDefinition, selectedYAxisMetric, locale)}
                            chartDefinition={graph.chartDefinition}
                            caption={chartCaption}
                            overlayData={
                              selectUnofficialOverlayForMode(
                                selectedXAxisMode,
                                graph.chartDefinition.chartType,
                                overlayDataByChartType,
                              ) ?? undefined
                            }
                          />
                          {selectedGPUs.length > 0 &&
                            (!selectedDateRange.startDate || !selectedDateRange.endDate) &&
                            selectedDates.length === 0 && (
                              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-lg z-10">
                                <p className="text-sm font-medium text-muted-foreground bg-background/90 border border-border rounded-md px-4 py-2 shadow-sm">
                                  {t.selectDateRange}
                                </p>
                              </div>
                            )}
                        </div>
                      );
                    })()}
                    {replayAvailable && (
                      <ReplayLauncher
                        ref={(handle) => {
                          replayHandlesRef.current[graphIndex] = handle;
                        }}
                        parentChartId={`chart-${graphIndex}`}
                        chartDefinition={graph.chartDefinition}
                        yLabel={metricLabel(graph.chartDefinition, selectedYAxisMetric, locale)}
                        xLabel={graph.chartDefinition.x_label}
                      />
                    )}
                  </Card>
                </figure>
              </section>
            );
          });

  return (
    <div data-testid="inference-chart-display" className="flex flex-col gap-4">
      <section className="relative z-20">
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-2">{t.inferencePerformance}</h2>
                <p className="text-muted-foreground text-sm mb-4">{t.inferencePerformanceDesc}</p>
              </div>
              <ChartShareActions />
            </div>
            <ChartControls />
            <ModelArchitectureDiagram model={selectedModel} />
            {selectedGPUs.length === 0 && <WorkflowInfoDisplay workflowInfo={workflowInfo} />}
            {selectedGPUs.length > 0 && (
              <ComparisonChangelog
                changelogs={changelogs}
                selectedGPUs={selectedGPUs}
                selectedPrecisions={selectedPrecisions}
                modelDbKeys={modelDbKeys}
                selectedSequence={selectedSequence}
                loading={changelogsLoading}
                totalDatesQueried={totalDatesQueried}
                selectedDates={selectedDates}
                selectedDateRange={selectedDateRange}
                onAddDate={(date) => {
                  // Functional updater: adding several runs in quick succession must
                  // each build on the latest state, not the value captured at render.
                  setSelectedDates((prev) => (prev.includes(date) ? prev : [...prev, date]));
                }}
                onRemoveDate={(date) => {
                  setSelectedDates((prev) => prev.filter((d) => d !== date));
                }}
                onAddAllDates={(dates) => {
                  setSelectedDates((prev) => [...new Set([...prev, ...dates])]);
                }}
                firstAvailableDate={dateRangeAvailableDates[0]}
              />
            )}
          </div>
        </Card>
      </section>

      {selectedYAxisMetric === 'y_costUser' && (
        <section>
          <CustomCosts loading={loading} />
        </section>
      )}
      {selectedYAxisMetric === 'y_powerUser' && (
        <section>
          <CustomPowers loading={loading} />
        </section>
      )}
      {/*
        Manual activation: with Radix's default automatic mode, merely focusing
        a trigger fires onValueChange. On agentic the strip renders a single tab
        while the selected mode may live in the Advanced menu, so tabbing to
        that lone trigger would silently snap the x-axis back to E2E Normalized
        Interactivity. Manual activation also suits a control whose every change
        redraws the chart — arrow keys move focus, Enter/Space commits.
      */}
      <Tabs
        activationMode="manual"
        value={selectedXAxisMode}
        onValueChange={(value) => {
          setSelectedXAxisMode(value as XAxisMode);
          track('latency_x_axis_mode_selected', { mode: value });
        }}
      >
        <TabsList
          aria-label="Chart x-axis metric"
          data-testid="x-axis-mode-buttons"
          className="flex-wrap justify-center gap-x-1 gap-y-1.5 sm:gap-x-1.5"
        >
          {X_AXIS_MODE_BUTTONS.filter(({ value }) => {
            // Before mount, render the flat strip so SSR and first client render match.
            if (!mounted) return true;
            if (isAgenticOnlyXAxisMode(value)) return isAgenticSequence;
            // On agentic these three move into the Advanced menu below.
            return !(isAgenticSequence && isAdvancedXAxisMode(value));
          }).map(({ value, label, labelZh }) => (
            <TabsTrigger
              key={value}
              value={value}
              data-testid={`x-axis-mode-${value}`}
              className="min-w-[130px] sm:min-w-[140px] flex-1 sm:flex-initial justify-center"
            >
              {locale === 'zh' ? labelZh : label}
            </TabsTrigger>
          ))}
          {mounted && isAgenticSequence && (
            <AdvancedXAxisMenu
              selected={selectedXAxisMode}
              onSelect={(mode) => {
                setSelectedXAxisMode(mode);
                track('latency_x_axis_mode_selected', { mode });
              }}
              locale={locale}
              labels={{ advanced: t.advancedXAxis, advancedWith: t.advancedXAxisWith }}
            />
          )}
        </TabsList>
      </Tabs>
      <div className="flex flex-col gap-4">{displayGraphs}</div>
    </div>
  );
}
