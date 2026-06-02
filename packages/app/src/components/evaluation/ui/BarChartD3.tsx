'use client';

import { track } from '@/lib/analytics';
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';

import {
  D3Chart,
  type D3ChartHandle,
  type TooltipConfig,
  type ZoomConfig,
} from '@/lib/d3-chart/D3Chart';

import { useEvaluation } from '@/components/evaluation/EvaluationContext';
import type { EvaluationChartData } from '@/components/evaluation/types';
import {
  type EvalBenchmark,
  type Precision,
  getEvalBenchmarkLabel,
  getChartWatermark,
  getPrecisionLabel,
} from '@/lib/data-mappings';
import ChartLegend from '@/components/ui/chart-legend';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnofficialRun } from '@/components/unofficial-run-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { computeToggle } from '@/hooks/useTogglableSet';

import { buildEvalBarChartLayers } from './evalBarChartLayers';
import { buildEvalLegendItems } from './evalBarChartLegendItems';
import { useEvalChartConfigs } from './useEvalChartConfigs';

// Static legend for disagg parallelism notation; hoisted so the same element
// identity is reused every render instead of rebuilt as a prop.
const PARALLELISM_KEY = (
  <div className="mt-2 px-1 pr-2 text-[10px] text-muted-foreground/80 leading-tight no-export">
    <div>
      <span className="font-mono">P(·/·/·/·)</span> prefill
      <span className="mx-1">·</span>
      <span className="font-mono">D(·/·/·/·)</span> decode
    </div>
    <div>
      slots: <span className="font-mono">tp/ep/dpa/nw</span>
      <span className="mx-1">·</span>
      <span className="font-mono">T</span>/<span className="font-mono">F</span> = DPA true/false
    </div>
  </div>
);

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatDateStr = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-');
  return dateFormatter.format(
    new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)),
  );
};

const runLinkHTML = (runUrl?: string) =>
  runUrl
    ? `<div style="font-size: 11px; margin-top: 4px;">
        <a href="${runUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--muted-foreground); text-decoration: underline; cursor: pointer;">GitHub Actions Run</a>
      </div>`
    : '';

const row = (label: string, value: string) =>
  `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${label}:</strong> ${value}</div>`;

const fmtSideTooltip = (tp: number, ep: number, dpa: boolean, nw: number) =>
  `TP ${tp}, EP ${ep}, DPA ${dpa ? 'True' : 'False'}, NW ${nw}`;

const parallelismHTML = (data: EvaluationChartData): string => {
  if (!data.disagg) {
    return (
      row('Tensor Parallelism', String(data.tp)) +
      row('Expert Parallelism', String(data.ep)) +
      row('Data Parallel Attention', data.dp_attention ? 'True' : 'False')
    );
  }
  return (
    row('Multinode', data.isMultinode ? 'True' : 'False') +
    row(
      'Prefill',
      fmtSideTooltip(
        data.prefillTp,
        data.prefillEp,
        data.prefillDpAttention,
        data.prefillNumWorkers,
      ),
    ) +
    row('Decode', fmtSideTooltip(data.tp, data.ep, data.dp_attention, data.decodeNumWorkers)) +
    row('GPUs', `${data.numPrefillGpu} prefill / ${data.numDecodeGpu} decode`)
  );
};

const generateEvaluationTooltipContent = (
  data: EvaluationChartData,
  isPinned: boolean,
  unofficialBranch?: string,
): string => {
  const minScore = data.minScore ?? data.score;
  const maxScore = data.maxScore ?? data.score;
  const border = unofficialBranch ? '2px solid #dc2626' : '1px solid var(--border)';
  return `
    <div style="background: var(--popover); border: ${border}; border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      ${
        unofficialBranch
          ? `<div style="color: #dc2626; font-size: 10px; font-weight: 700; margin-bottom: 4px; text-transform: uppercase;">✕ UNOFFICIAL RUN</div>
      ${row('Branch', unofficialBranch)}`
          : ''
      }
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">${data.configLabel.replaceAll('\n', '<br>')}</div>
      ${row('Date', data.date)}
      ${row('Mean Score', data.score.toFixed(4))}
      ${row('Min Score', minScore.toFixed(4))}
      ${row('Max Score', maxScore.toFixed(4))}
      ${row('Concurrency', String(data.conc))}
      ${row('Precision', getPrecisionLabel(data.precision as Precision))}
      ${parallelismHTML(data)}
      ${runLinkHTML(data.runUrl)}
    </div>
  `;
};

/** Custom y-axis label formatting for horizontal bar chart: split on newline, show multi-line */
function formatYAxisLabels(axisGroup: d3.Selection<SVGGElement, unknown, null, undefined>) {
  axisGroup.selectAll('.tick text').each(function () {
    const el = d3.select(this);
    const label = el.text();
    const lines = label.split('\n');
    const totalHeight = lines.length * 1.1; // em units
    el.text(null);
    lines.forEach((line: string, i: number) => {
      el.append('tspan')
        .text(line)
        .attr('x', -8)
        .attr('dy', i === 0 ? `${-totalHeight / 2 + 0.9}em` : '1.1em')
        .attr('font-weight', i === 0 ? '600' : 'normal')
        .attr('font-size', i === 0 ? '10px' : '9px');
    });
    el.attr('text-anchor', 'end');
  });
}

// X-axis zoom with a translate constraint that keeps the [0,1] score domain in
// view. Built per-render because it closes over the current margin + domain.
function buildEvalZoomConfig(
  chartMargin: { left: number; right: number },
  xDomain: [number, number],
): ZoomConfig {
  return {
    enabled: true,
    axes: 'x',
    scaleExtent: [1, 20],
    resetEventName: 'evaluation_zoom_reset_evaluation-chart',
    constrain: (transform) => {
      const k = transform.k;
      const innerWidth =
        (typeof window === 'undefined' ? 800 : window.innerWidth) -
        chartMargin.left -
        chartMargin.right;
      const xScale = d3.scaleLinear().domain(xDomain).range([0, innerWidth]);
      const minTx = -xScale(1) * k + innerWidth;
      const maxTx = -xScale(0) * k;
      const tx = minTx < maxTx ? Math.max(minTx, Math.min(maxTx, transform.x)) : transform.x;
      return d3.zoomIdentity.translate(tx, transform.y).scale(k);
    },
  };
}

// Crosshair tooltip config. Static — the content/ruler accessors don't depend
// on component state.
const EVAL_TOOLTIP_CONFIG: TooltipConfig<EvaluationChartData> = {
  rulerType: 'crosshair',
  content: generateEvaluationTooltipContent,
  getRulerX: (d, xs) => (xs as d3.ScaleLinear<number, number>)(d.score),
  getRulerY: (d, ys) => {
    const bs = ys as unknown as d3.ScaleBand<string>;
    return (bs(d.configLabel) || 0) + bs.bandwidth() / 2;
  },
  onHoverStart: (sel) => {
    sel.attr('r', 8);
  },
  onHoverEnd: (sel) => {
    sel.attr('r', 6);
  },
  attachToLayer: 1,
};

// First-load skeleton for the evaluation chart.
function EvalChartSkeleton() {
  return (
    <div className="p-3">
      <Skeleton className="h-7 w-2/4 mb-1" />
      <Skeleton className="h-5 w-3/4 mb-2" />
      <Skeleton className="h-[600px] w-full" />
    </div>
  );
}

interface EvalChartEmptyStateProps {
  error: boolean;
  hasSelections: boolean;
  modelHasEvalData: boolean;
  hasNoEvalDataForDate: boolean;
  selectedRunDate: string;
}

// Skeleton-less empty / error message shown when there is nothing to plot.
function EvalChartEmptyState({
  error,
  hasSelections,
  modelHasEvalData,
  hasNoEvalDataForDate,
  selectedRunDate,
}: EvalChartEmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-100 text-muted-foreground">
      <div className="text-center">
        {error ? (
          'Failed to load eval data.'
        ) : hasSelections && !modelHasEvalData ? (
          'No evaluation data is available for this model.'
        ) : hasNoEvalDataForDate ? (
          <>
            <div>No evaluation data available for {formatDateStr(selectedRunDate)}.</div>
            <div>Try selecting a different date.</div>
          </>
        ) : (
          <>
            <div>No evaluation data available for selected model and benchmark combination.</div>
            <div>Try selecting a different combination.</div>
          </>
        )}
      </div>
    </div>
  );
}

interface EvalBarChartLegendProps {
  legendItems: React.ComponentProps<typeof ChartLegend>['legendItems'];
  onItemRemove: (name: string) => void;
  isLegendExpanded: boolean;
  showLabels: boolean;
  highContrast: boolean;
  showResetFilter: boolean;
  parallelismKey: ReactNode;
  onExpandedChange: (expanded: boolean) => void;
  onToggleLabels: (checked: boolean) => void;
  onToggleHighContrast: (checked: boolean) => void;
  onResetFilter: () => void;
}

// Sidebar legend for the evaluation bar chart, with the show-labels /
// high-contrast switches, the conditional reset-filter action, and the
// disagg parallelism key.
function EvalBarChartLegend({
  legendItems,
  onItemRemove,
  isLegendExpanded,
  showLabels,
  highContrast,
  showResetFilter,
  parallelismKey,
  onExpandedChange,
  onToggleLabels,
  onToggleHighContrast,
  onResetFilter,
}: EvalBarChartLegendProps) {
  return (
    <ChartLegend
      variant="sidebar"
      legendItems={legendItems}
      onItemRemove={onItemRemove}
      isLegendExpanded={isLegendExpanded}
      onExpandedChange={onExpandedChange}
      switches={[
        {
          id: 'eval-show-labels',
          label: 'Show Labels',
          checked: showLabels,
          onCheckedChange: onToggleLabels,
        },
        {
          id: 'eval-high-contrast',
          label: 'High Contrast',
          checked: highContrast,
          onCheckedChange: onToggleHighContrast,
        },
      ]}
      actions={
        showResetFilter
          ? [
              {
                id: 'eval-reset-filter',
                label: 'Reset filter',
                onClick: onResetFilter,
              },
            ]
          : []
      }
      enableTooltips={true}
      keyIndicators={parallelismKey}
    />
  );
}

export default function EvalBarChartD3({ caption }: { caption?: ReactNode }) {
  const {
    loading,
    error,
    chartData,
    unofficialChartData,
    unfilteredChartData,
    enabledHardware,
    toggleHardware,
    removeHardware,
    hwTypesWithData,
    selectAllHwTypes,
    highContrast,
    setHighContrast,
    showLabels,
    setShowLabels,
    highlightedConfigs,
    selectedBenchmark,
    selectedModel,
    selectedRunDate,
    availableDates,
    isLegendExpanded,
    setIsLegendExpanded,
    modelHasEvalData,
  } = useEvaluation();
  const {
    isUnofficialRun,
    unofficialRunInfo,
    unofficialRunInfos,
    activeOverlayHwTypes,
    setActiveOverlayHwTypes,
    allOverlayHwTypes,
    resetOverlayHwTypes,
    localOfficialOverride,
    setLocalOfficialOverride,
    runIndexByUrl,
  } = useUnofficialRun();
  const chartRef = useRef<D3ChartHandle>(null);

  /** Look up the branch for an eval row via its `runUrl`, falling back to the
   * first loaded run. Used so hovering an overlay bar shows that row's own
   * branch across multi-run loads. */
  const branchForRow = useCallback(
    (datum: EvaluationChartData): string | undefined => {
      const url = datum.runUrl ?? null;
      if (url) {
        const direct = runIndexByUrl[url];
        if (direct !== undefined) return unofficialRunInfos[direct]?.branch;
        const idMatch = url.match(/\/runs\/(\d+)/u);
        if (idMatch) {
          const viaId = runIndexByUrl[idMatch[1]];
          if (viaId !== undefined) return unofficialRunInfos[viaId]?.branch;
        }
      }
      return unofficialRunInfo?.branch ?? undefined;
    },
    [runIndexByUrl, unofficialRunInfos, unofficialRunInfo],
  );

  const effectiveOfficialHardware = localOfficialOverride ?? enabledHardware;

  const allUnifiedHwTypes = useMemo(() => {
    const all = new Set<string>();
    hwTypesWithData.forEach((hwKey) => all.add(hwKey));
    allOverlayHwTypes.forEach((hwKey) => all.add(`overlay:${hwKey}`));
    return all;
  }, [hwTypesWithData, allOverlayHwTypes]);

  const unifiedToggle = useCallback(
    (hwKey: string) => {
      const prev = new Set<string>();
      effectiveOfficialHardware.forEach((key) => prev.add(key));
      activeOverlayHwTypes.forEach((key) => prev.add(`overlay:${key}`));
      const next = computeToggle(prev, hwKey, allUnifiedHwTypes);
      const nextOfficial = new Set<string>();
      const nextOverlay = new Set<string>();
      for (const key of next) {
        if (key.startsWith('overlay:')) nextOverlay.add(key.slice(8));
        else nextOfficial.add(key);
      }
      setLocalOfficialOverride(nextOfficial);
      setActiveOverlayHwTypes(nextOverlay);
    },
    [
      activeOverlayHwTypes,
      allUnifiedHwTypes,
      effectiveOfficialHardware,
      setActiveOverlayHwTypes,
      setLocalOfficialOverride,
    ],
  );

  const handleToggleHardware = useCallback(
    (hwKey: string) => {
      if (isUnofficialRun) unifiedToggle(hwKey);
      else toggleHardware(hwKey);
    },
    [isUnofficialRun, toggleHardware, unifiedToggle],
  );

  const {
    configurations,
    unofficialConfigurations,
    yLabels,
    chartMargin,
    sortedConfigLabels,
    activeHwKeys,
    activeConfigLabels,
    configLabelToHwKey,
  } = useEvalChartConfigs({
    chartData,
    unofficialChartData,
    unfilteredChartData,
    effectiveOfficialHardware,
    activeOverlayHwTypes,
  });
  const hcVendorKeyFor = useCallback(
    (configLabel: string) => configLabelToHwKey.get(configLabel) ?? configLabel,
    [configLabelToHwKey],
  );
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    identifiers: sortedConfigLabels,
    activeKeys: activeHwKeys,
    hcKeys: activeConfigLabels,
    hcVendorKeyFor,
  });

  useEffect(() => {
    const pinnedPoint = chartRef.current?.getPinnedPoint() as EvaluationChartData | null;
    if (!pinnedPoint) return;
    const isOverlay = chartRef.current?.getPinnedPointIsOverlay();
    if (isOverlay && !activeOverlayHwTypes.has(String(pinnedPoint.hwKey))) {
      chartRef.current?.dismissTooltip();
      return;
    }
    if (!isOverlay && !effectiveOfficialHardware.has(String(pinnedPoint.hwKey))) {
      chartRef.current?.dismissTooltip();
    }
  }, [activeOverlayHwTypes, effectiveOfficialHardware]);

  const legendItems = useMemo(
    () =>
      buildEvalLegendItems({
        configurations,
        unofficialConfigurations,
        unofficialChartData,
        unofficialRunInfos,
        runIndexByUrl,
        highlightedConfigs,
        effectiveOfficialHardware,
        resolveColor,
        onToggleHardware: handleToggleHardware,
      }),
    [
      configurations,
      effectiveOfficialHardware,
      handleToggleHardware,
      highlightedConfigs,
      resolveColor,
      unofficialConfigurations,
      unofficialChartData,
      unofficialRunInfos,
      runIndexByUrl,
    ],
  );

  const xDomain = useMemo((): [number, number] => {
    const allData = [...chartData, ...unofficialChartData];
    if (allData.length === 0) return [0, 1];
    const xMin = d3.min(allData, (d) => d.score - (d.scoreError || 0)) || 0;
    const xMax = d3.max(allData, (d) => d.score + (d.scoreError || 0)) || 1;
    const xPadding = (xMax - xMin) * 0.3;
    return [Math.max(0, xMin - xPadding), Math.min(1, xMax + xPadding)];
  }, [chartData, unofficialChartData]);

  const chartHeight = Math.max(400, yLabels.length * 40 + chartMargin.top + chartMargin.bottom);

  const errorData = useMemo(
    () => chartData.filter((d) => d.errorMin !== undefined && d.errorMax !== undefined),
    [chartData],
  );

  const hasDisaggConfigs = useMemo(
    () => [...chartData, ...unofficialChartData].some((d) => d.disagg),
    [chartData, unofficialChartData],
  );

  const parallelismKey = hasDisaggConfigs ? PARALLELISM_KEY : null;
  const unofficialErrorData = useMemo(
    () => unofficialChartData.filter((d) => d.errorMin !== undefined && d.errorMax !== undefined),
    [unofficialChartData],
  );

  // Horizontal bar chart: yScale = band (config labels), xScale = linear (scores)
  const layers = useMemo(
    () =>
      buildEvalBarChartLayers({
        chartData,
        errorData,
        unofficialChartData,
        unofficialErrorData,
        getCssColor,
        resolveColor,
        showLabels,
        runIndexByUrl,
        chartRef,
        branchForRow,
        tooltipContent: generateEvaluationTooltipContent,
      }),
    [
      chartData,
      errorData,
      getCssColor,
      resolveColor,
      showLabels,
      unofficialChartData,
      unofficialErrorData,
      branchForRow,
      runIndexByUrl,
    ],
  );

  // Show skeleton on first load
  const isInitializing = loading || (!selectedBenchmark && !error);
  if (isInitializing && chartData.length === 0 && unofficialChartData.length === 0) {
    return <EvalChartSkeleton />;
  }

  if (error || (chartData.length === 0 && unofficialChartData.length === 0)) {
    const hasSelections = Boolean(selectedBenchmark && selectedModel && selectedRunDate);
    const hasNoEvalDataForDate =
      hasSelections && availableDates.length > 0 && !availableDates.includes(selectedRunDate);
    return (
      <EvalChartEmptyState
        error={Boolean(error)}
        hasSelections={hasSelections}
        modelHasEvalData={modelHasEvalData}
        hasNoEvalDataForDate={hasNoEvalDataForDate}
        selectedRunDate={selectedRunDate}
      />
    );
  }

  return (
    <D3Chart<EvaluationChartData>
      ref={chartRef}
      chartId="evaluation-chart"
      data={chartData}
      height={chartHeight}
      margin={chartMargin}
      watermark={getChartWatermark(isUnofficialRun)}
      grabCursor={false}
      caption={caption}
      xScale={{ type: 'linear', domain: xDomain }}
      yScale={{ type: 'band', domain: yLabels, padding: 0.1 }}
      xAxis={{
        label: `${getEvalBenchmarkLabel(selectedBenchmark as EvalBenchmark)} Score`,
        tickFormat: (d) => Number(d).toFixed(2),
        tickCount: 5,
      }}
      yAxis={{ customize: formatYAxisLabels }}
      layers={layers}
      zoom={buildEvalZoomConfig(chartMargin, xDomain)}
      tooltip={EVAL_TOOLTIP_CONFIG}
      legendElement={
        <EvalBarChartLegend
          legendItems={legendItems}
          onItemRemove={removeHardware}
          isLegendExpanded={isLegendExpanded}
          showLabels={showLabels}
          highContrast={highContrast}
          showResetFilter={
            effectiveOfficialHardware.size < hwTypesWithData.size ||
            activeOverlayHwTypes.size < allOverlayHwTypes.size
          }
          parallelismKey={parallelismKey}
          onExpandedChange={(expanded) => {
            setIsLegendExpanded(expanded);
            track('evaluation_legend_expanded', { expanded });
          }}
          onToggleLabels={(checked) => {
            setShowLabels(checked);
            track('evaluation_show_labels_toggled', { enabled: checked });
          }}
          onToggleHighContrast={(checked) => {
            setHighContrast(checked);
            track('evaluation_high_contrast_toggled', { enabled: checked });
          }}
          onResetFilter={() => {
            selectAllHwTypes();
            setLocalOfficialOverride(null);
            resetOverlayHwTypes();
            track('evaluation_filter_reset');
          }}
        />
      }
    />
  );
}
