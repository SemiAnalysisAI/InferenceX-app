'use client';
import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { track } from '@/lib/analytics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

import chartDefinitions, { type MetricKey } from '@/components/inference/metric-registry';
import { resolveXAxisKind } from '@/components/inference/axis-metric-explanations';
import { resolveXAxisField } from '@/components/inference/utils/resolveXAxisField';
import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
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
import { bestSeriesPerSku } from '@/components/inference/utils/best-series-per-sku';
import InferenceTable from '@/components/inference/ui/InferenceTable';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { type SegmentedToggleOption, SegmentedToggle } from '@/components/ui/segmented-toggle';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartShareActions, MetricAssumptionNotes } from '@/components/ui/chart-display-helpers';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { metricLabel, metricTitle } from '@/lib/chart-utils';
import { exportToCsv } from '@/lib/csv-export';
import { inferenceChartToCsv } from '@/lib/csv-export-helpers';
import { knownIssueCsvNote, matchKnownConfigIssues } from '@/lib/known-issues';
import { getDisplayLabel, getFrameworkLabel } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useOverlayScopeReconciliation,
  useUnofficialRun,
} from '@/components/unofficial-run-provider';
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
import { useResidentSequenceLengths } from '@/hooks/api/use-resident-sequence-lengths';
import { getHardwareConfig, hardwareKeyMatchesAnyBase } from '@/lib/constants';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import { useLocale } from '@/lib/use-locale';

import { ATOM_FOOTNOTE_MARKER, AtomEngineFootnote } from '@/components/ui/atom-engine-footnote';
import { AgenticOptimizationNote } from '@/components/inference/ui/AgenticOptimizationNote';
import { OffloadHaloLegendKey } from '@/components/inference/ui/OffloadHaloLegendKey';

import AxisMetricFooter from './AxisMetricFooter';
import ChartControls from './ChartControls';
import ComparisonChangelog from './ComparisonChangelog';
import CustomCosts from './CustomCosts';
import CustomPowers from './CustomPowers';
import GPUGraph from './GPUGraph';
import ReplayLauncher, { type ReplayLauncherHandle } from '../replay/ReplayLauncher';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { getModelSlugEntryForDisplayName } from '@/lib/compare-slug';
import { formatParamCount, getModelArchitecture } from '@/lib/model-architectures';
import WorkflowInfoDisplay from './WorkflowInfoDisplay';
import { NormalizedInteractivityHelpLink } from './NormalizedInteractivityHelpLink';

type InferenceViewMode = 'chart' | 'table';

/**
 * Replaces the old in-card Model Architecture drawer: a row that links to the
 * model's `/model/[slug]` page, which hosts the full architecture diagram,
 * vendor eval scores, and a model-focused view of this dashboard. Renders
 * nothing for models without a public slug (hidden models).
 */
function ModelArchitectureLink({ model, locale }: { model: Model; locale: 'en' | 'zh' }) {
  const entry = getModelSlugEntryForDisplayName(model);
  if (!entry) return null;
  const arch = getModelArchitecture(model);
  const label = getModelLabel(model);
  return (
    <Link
      href={`/model/${entry.slug}`}
      data-testid="model-architecture-link"
      className="group rounded-lg border border-border/50 bg-muted/30 px-4 py-2 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors"
      onClick={() => track('model_architecture_link_clicked', { model, slug: entry.slug })}
    >
      <div className="flex items-center gap-2 min-w-0">
        <svg
          className="size-4 shrink-0 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="9" x2="9" y2="21" />
        </svg>
        <span className="text-sm font-medium truncate">
          {locale === 'zh'
            ? `了解 ${label} 模型架构`
            : `Learn more about the ${label} architecture`}
        </span>
        {arch && (
          <span className="hidden sm:flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs py-0">
              {arch.architectureType === 'moe' ? 'MoE' : 'Dense'}
            </Badge>
            <Badge variant="outline" className="text-xs py-0">
              {arch.attentionType === 'AlternatingSinkGQA' ? 'Sink/Full GQA' : arch.attentionType}
            </Badge>
            <Badge variant="outline" className="text-xs py-0">
              {formatParamCount(arch.totalParams)}
            </Badge>
          </span>
        )}
      </div>
      <span className="text-sm shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
        →
      </span>
    </Link>
  );
}

const STRINGS = {
  en: {
    inferencePerformance: 'Inference Performance',
    inferencePerformanceDesc:
      'Agentic inference metrics from the AgentX scenario and fixed-sequence inference metrics across models, hardware configurations, and serving parameters.',
    chart: 'Chart',
    table: 'Table',
    sourceUnofficial: 'Source: UNOFFICIAL',
    sourceOfficial: 'Source: SemiAnalysis InferenceX™',
    updated: 'Updated:',
    e2eNormIntvtyDisclaimer:
      'E2E Normalized Interactivity requires persisted per-request traces, so unofficial-run overlays are unavailable for this experimental view.',
    completedSequenceLengths: (count: string) =>
      `Completed requests across all resident points (n=${count})`,
    viewMode: 'View mode',
    vsTtft: (word: string) => `vs. ${word} Time To First Token`,
    vsE2eLatency: (pctl?: string) =>
      pctl ? `vs. ${pctl} End-to-end Latency` : 'vs. End-to-end Latency',
  },
  zh: {
    inferencePerformance: '推理性能',
    inferencePerformanceDesc:
      '不同模型、硬件配置和服务参数下，来自 AgentX 场景的智能体推理指标与固定序列推理指标。',
    chart: '图表',
    table: '表格',
    sourceUnofficial: '来源：非官方',
    sourceOfficial: '来源：SemiAnalysis InferenceX™',
    updated: '更新时间：',
    e2eNormIntvtyDisclaimer:
      '端到端归一化交互性需要持久化的逐请求 trace 数据，因此该实验性视图不支持非官方运行覆盖。',
    completedSequenceLengths: (count: string) => `当前所有数据点的已完成请求（n=${count}）`,
    viewMode: '视图模式',
    vsTtft: (word: string) => `vs. ${word === 'Median' ? '中位' : word} 首 token 延迟（TTFT）`,
    vsE2eLatency: (pctl?: string) => (pctl ? `vs. ${pctl} 端到端延迟` : 'vs. 端到端延迟'),
  },
} as const;

// Translate the "vs. …" chart-heading suffix from the metric registry
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

export function formatTokenLength(value: number): string {
  const rounded = Math.round(value);
  if (rounded < 1_000) return String(rounded);
  if (rounded < 10_000) return `${(rounded / 1_000).toFixed(1).replace(/\.0$/u, '')}k`;
  if (rounded < 1_000_000) return `${Math.round(rounded / 1_000)}k`;
  return `${(rounded / 1_000_000).toFixed(2).replace(/\.0+$/u, '')}m`;
}

/**
 * Renders the inference chart cards, captions, and overlay controls for the current filtered
 * benchmark data.
 *
 * `embedded` renders the chart without the header section (title, description,
 * share actions, and selector controls) — used by the `/model/[slug]` pages,
 * which seed the model/scenario/metric via providers instead of user-facing
 * selectors. The run-date changelog strip and the charts themselves remain.
 */
export default function ChartDisplay({ embedded = false }: { embedded?: boolean } = {}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { graphs, loading, error, dateRangeAvailableDates } = useInferenceData();
  const {
    selectedGPUs,
    selectedPrecisions,
    selectedDates,
    selectedDateRange,
    selectedModel,
    selectedSequence,
    selectedRunDate,
    activeHwTypes,
    bestPerSku,
    activeDates,
    compareGpuPair,
    quickFilters,
  } = useInferenceFilters();
  const {
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
    selectedPercentile,
    selectedXAxisMode,
  } = useInferenceDisplay();
  const {
    setSelectedDates,
    setSelectedDatesFromRunExpansion,
    setIsLegendExpanded,
    setSelectedXAxisMode,
  } = useInferenceActions();
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
    localOfficialOverride,
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
  )}|${unofficialRunInfos.map((run) => run.url).join(',')}|official:${[...officialScope]
    .toSorted()
    .join(',')}|overlay:${[...overlayScope].toSorted().join(',')}`;
  const selectedOfficialHwTypes = isUnofficialRun
    ? (localOfficialOverride ?? activeHwTypes)
    : activeHwTypes;
  const scopedActiveOverlayHwTypes = useMemo(
    () => new Set([...activeOverlayHwTypes].filter((key) => overlayScope.has(key))),
    [activeOverlayHwTypes, overlayScope],
  );
  // Caption spec badges (TCO $/chip/hr, Power/Chip) should only quote chips
  // that can actually appear on the plot: the active official legend selection
  // plus any active unofficial-overlay selection.
  const captionHwKeys = useMemo(
    () => new Set([...selectedOfficialHwTypes, ...scopedActiveOverlayHwTypes]),
    [selectedOfficialHwTypes, scopedActiveOverlayHwTypes],
  );
  const overlayScopeRegistration = useMemo(
    () =>
      isUnofficialRun
        ? {
            scopeKey: overlayRowsScopeKey,
            officialHwTypes: officialScope,
            overlayHwTypes: overlayScope,
            bestOfficialHwTypes: scopedBestSelections.official,
            bestOverlayHwTypes: scopedBestSelections.overlay,
            bestPerSku,
            ready: !loading || officialScope.size > 0,
          }
        : null,
    [
      isUnofficialRun,
      overlayRowsScopeKey,
      officialScope,
      overlayScope,
      scopedBestSelections,
      bestPerSku,
      loading,
      activeOverlayHwTypes,
      localOfficialOverride,
    ],
  );
  useOverlayScopeReconciliation(overlayScopeRegistration);

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
  const residentPointIds = useMemo(() => {
    if (!isAgenticSequence) return [] as number[];
    const ids = new Set<number>();
    for (const graph of visibleGraphs) {
      const points = [...graph.data, ...(graph.clippedData ?? []).map((entry) => entry.point)];
      for (const point of points) {
        if (
          selectedPrecisions.includes(point.precision) &&
          point.benchmark_type === 'agentic_traces' &&
          isPersistedBenchmarkId(point.id)
        ) {
          ids.add(point.id);
        }
      }
    }
    return [...ids];
  }, [isAgenticSequence, selectedPrecisions, visibleGraphs]);
  // Unofficial-run artifacts are transformed in memory and do not have
  // persisted aggregate_stats sketches. Suppress the subtitle in overlay mode
  // rather than presenting official-only values as if they covered the overlay.
  const residentSequenceLengthsQuery = useResidentSequenceLengths(
    residentPointIds,
    isAgenticSequence && !isUnofficialRun,
  );
  const residentSequenceLengths =
    residentSequenceLengthsQuery.data?.coveredPoints ===
    residentSequenceLengthsQuery.data?.requestedPoints
      ? residentSequenceLengthsQuery.data
      : null;
  const useDerivedXAxis = isAgenticSequence && isAgenticOnlyXAxisMode(selectedXAxisMode);
  const derivedTargetIds = useMemo(() => {
    if (!useDerivedXAxis) return [] as number[];
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
  }, [useDerivedXAxis, visibleGraphs]);
  const derivedQuery = useDerivedAgenticMetrics(derivedTargetIds, isAgenticSequence);
  const derivedMetrics = derivedQuery.data;
  const isDerivedXAxisLoading =
    useDerivedXAxis &&
    derivedTargetIds.length > 0 &&
    (derivedQuery.isPending || derivedQuery.isFetching) &&
    !derivedMetrics;
  const derivedSpec = useDerivedXAxis ? DERIVED_X_MODE_SPECS[selectedXAxisMode] : undefined;

  const renderableGraphs = useMemo(() => {
    if (!isAgenticSequence) return visibleGraphs;
    if (!derivedMetrics) {
      // Legacy AgentX axes can still render transient/non-persisted rows, which
      // have no ids to request.
      if (!derivedSpec && derivedTargetIds.length === 0) return visibleGraphs;
      return visibleGraphs.map((graph) => ({ ...graph, data: [], clippedData: [] }));
    }
    return visibleGraphs.map((graph) => {
      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof typeof graph.chartDefinition;
      const configuredCorner = graph.chartDefinition[rooflineKey] as RooflineDirection | undefined;
      const derivedCorner =
        graph.chartDefinition.chartType === 'e2e'
          ? derivedModeRoofline(configuredCorner, true)
          : configuredCorner;

      const preparePoint = (point: InferenceData): InferenceData | null => {
        const pointId = isPersistedBenchmarkId(point.id) ? point.id : null;
        if (!derivedSpec) return point;
        if (pointId === null) return null;
        const raw = derivedSpec.value(derivedMetrics[pointId], selectedPercentile);
        if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
        return { ...point, x: derivedSpec.toX(raw) };
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
        ...(derivedCorner ? { [rooflineKey]: derivedCorner } : {}),
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
    isFirstLoad || isDerivedXAxisLoading
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
            // Which logical metric the x-axis plots right now. Classify off
            // the field `resolveXAxisField` resolves for this chart's current
            // state — the same resolver both chart pipelines plot with — so
            // the footer always matches the drawn axis (e.g. an input metric
            // without a `*_x` override keeps the natural interactivity x).
            // Trace-derived agentic modes bypass that resolver, hence the flag.
            const footerXAxisKind = resolveXAxisKind(graph.chartDefinition.chartType, {
              xAxisField: resolveXAxisField(
                graph.chartDefinition,
                selectedYAxisMetric,
                graph.chartDefinition.chartType === 'e2e'
                  ? selectedE2eXAxisMetric
                  : selectedXAxisMetric,
                { isAgentic: isAgenticSequence, percentile: selectedPercentile },
              ).xAxisField,
              isDerivedNormalizedInteractivity: Boolean(derivedSpec),
            });
            // Notices for the axis-metric info footer: the KV-offload halo
            // key, the agentic optimization note, and the ATOM engine
            // footnote. Detected from the same data the chart plots —
            // official points plus any loaded unofficial-run overlay for
            // this chart type — so they moved out of the legend without
            // changing when they appear.
            const footerOverlay = selectUnofficialOverlayForMode(
              selectedXAxisMode,
              graph.chartDefinition.chartType,
              overlayDataByChartType,
            );
            const footerPoints = [
              ...graph.data,
              ...(footerOverlay?.data ?? []),
              ...(footerOverlay?.clippedData ?? []).map((entry) => entry.point),
            ];
            const hasOffloadHalo = footerPoints.some((point) => point.offload_mode === 'on');
            const hasAtomSeries = footerPoints.some(
              (point) =>
                point.framework !== undefined &&
                getFrameworkLabel(point.framework).includes(ATOM_FOOTNOTE_MARKER),
            );
            const footerNotices =
              hasOffloadHalo || isAgenticSequence || hasAtomSeries ? (
                <>
                  {hasOffloadHalo && <OffloadHaloLegendKey />}
                  {isAgenticSequence && <AgenticOptimizationNote />}
                  {hasAtomSeries && <AtomEngineFootnote />}
                </>
              ) : undefined;
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
                  <Card data-coach-mark-root="">
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
                          {residentSequenceLengths && (
                            <p
                              className="mb-2 text-xs text-muted-foreground"
                              data-testid="resident-sequence-lengths"
                            >
                              {t.completedSequenceLengths(
                                residentSequenceLengths.isl.n.toLocaleString(
                                  locale === 'zh' ? 'zh-CN' : 'en-US',
                                ),
                              )}{' '}
                              · ISL p50 {formatTokenLength(residentSequenceLengths.isl.p50)} · p75{' '}
                              {formatTokenLength(residentSequenceLengths.isl.p75)} · p90{' '}
                              {formatTokenLength(residentSequenceLengths.isl.p90)} · p95{' '}
                              {formatTokenLength(residentSequenceLengths.isl.p95)} · p99{' '}
                              {formatTokenLength(residentSequenceLengths.isl.p99)} | OSL p50{' '}
                              {formatTokenLength(residentSequenceLengths.osl.p50)} · p75{' '}
                              {formatTokenLength(residentSequenceLengths.osl.p75)} · p90{' '}
                              {formatTokenLength(residentSequenceLengths.osl.p90)} · p95{' '}
                              {formatTokenLength(residentSequenceLengths.osl.p95)} · p99{' '}
                              {formatTokenLength(residentSequenceLengths.osl.p99)}
                            </p>
                          )}
                          <MetricAssumptionNotes
                            selectedYAxisMetric={selectedYAxisMetric}
                            activeHwKeys={captionHwKeys}
                          />
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
                        </div>
                      );
                    })()}
                    <AxisMetricFooter
                      chartId={`chart-${graphIndex}`}
                      metricKey={selectedYAxisMetric.replace(/^y_/u, '') as MetricKey}
                      xAxisKind={footerXAxisKind}
                      xAxisLabel={graph.chartDefinition.x_label}
                      notices={footerNotices}
                    />
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
            {!embedded && (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold mb-2">{t.inferencePerformance}</h2>
                    <p className="text-muted-foreground text-sm mb-4">
                      {t.inferencePerformanceDesc}
                    </p>
                  </div>
                  <ChartShareActions />
                </div>
                <ChartControls />
                <ModelArchitectureLink model={selectedModel} locale={locale} />
              </>
            )}
            {selectedGPUs.length === 0 && <WorkflowInfoDisplay />}
            {selectedGPUs.length > 0 && (
              <ComparisonChangelog
                changelogs={changelogs}
                selectedGPUs={selectedGPUs}
                selectedPrecisions={selectedPrecisions}
                modelDbKeys={modelDbKeys}
                selectedSequence={selectedSequence}
                defaultExpanded={!embedded}
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

      {(selectedYAxisMetric === 'y_costUser' ||
        selectedYAxisMetric === 'y_tokensPerDollarUser') && (
        <section>
          <CustomCosts loading={loading} />
        </section>
      )}
      {selectedYAxisMetric === 'y_powerUser' && (
        <section>
          <CustomPowers loading={loading} />
        </section>
      )}
      <Tabs
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
            // Before mount, render all buttons so SSR and first client render match.
            if (!mounted) return true;
            return !isAgenticOnlyXAxisMode(value) || isAgenticSequence;
          }).map(({ value, label, labelZh }) => {
            const modeLabel = locale === 'zh' ? labelZh : label;
            if (value !== 'e2e-normalized-interactivity') {
              return (
                <TabsTrigger
                  key={value}
                  value={value}
                  data-testid={`x-axis-mode-${value}`}
                  className="min-w-[130px] sm:min-w-[140px] flex-1 sm:flex-initial justify-center"
                >
                  {modeLabel}
                </TabsTrigger>
              );
            }

            return (
              <span
                key={value}
                role="presentation"
                className="relative flex flex-1 sm:flex-initial"
              >
                <TabsTrigger
                  value={value}
                  data-testid={`x-axis-mode-${value}`}
                  className="min-w-[130px] flex-1 justify-center pr-9 sm:min-w-[140px] sm:flex-initial"
                >
                  {modeLabel}
                </TabsTrigger>
                <NormalizedInteractivityHelpLink locale={locale} />
              </span>
            );
          })}
        </TabsList>
      </Tabs>
      <div className="flex flex-col gap-4">{displayGraphs}</div>
    </div>
  );
}
