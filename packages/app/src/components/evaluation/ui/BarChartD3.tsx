'use client';

import { track } from '@/lib/analytics';
import { type ReactNode, useMemo } from 'react';
import * as d3 from 'd3';

import { getModelSortIndex } from '@/lib/constants';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LayerConfig } from '@/lib/d3-chart/D3Chart';
import { renderErrorBars, updateErrorBarsOnZoom } from '@/lib/d3-chart/layers/error-bars';
import { renderPoints, updatePointsOnZoom } from '@/lib/d3-chart/layers/points';

import { useEvaluation } from '@/components/evaluation/EvaluationContext';
import { EvaluationChartData } from '@/components/evaluation/types';
import {
  EvalBenchmark,
  getEvalBenchmarkLabel,
  getPrecisionLabel,
  Precision,
} from '@/lib/data-mappings';
import ChartLegend from '@/components/ui/chart-legend';
import { Skeleton } from '@/components/ui/skeleton';
import { useThemeColors } from '@/hooks/useThemeColors';

const CHART_MARGIN = { top: 24, right: 10, bottom: 80, left: 60 };

const generateEvaluationTooltipContent = (data: EvaluationChartData, isPinned: boolean): string => {
  const minScore = data.minScore ?? data.score;
  const maxScore = data.maxScore ?? data.score;
  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">${data.configLabel.replaceAll('\n', '<br>')}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Date:</strong> ${data.date}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Mean Score:</strong> ${data.score.toFixed(4)}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Min Score:</strong> ${minScore.toFixed(4)}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Max Score:</strong> ${maxScore.toFixed(4)}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Concurrency:</strong> ${data.conc}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Precision:</strong> ${getPrecisionLabel(data.precision as Precision)}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Tensor Parallelism:</strong> ${data.tp}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Expert Parallelism:</strong> ${data.ep}</div>
      <div style="color: var(--muted-foreground); font-size: 11px;"><strong>Data Parallel Attention:</strong> ${data.dp_attention ? 'True' : 'False'}</div>
    </div>
  `;
};

/** Custom x-axis label formatting: split on newline, rotate -36deg */
function formatXAxisLabels(axisGroup: d3.Selection<SVGGElement, unknown, null, undefined>) {
  axisGroup.selectAll('.tick text').each(function () {
    const el = d3.select(this);
    const label = el.text();
    const lines = label.split('\n');
    el.text(null);
    lines.forEach((line: string, i: number) => {
      el.append('tspan')
        .text(line)
        .attr('x', 0)
        .attr('dy', i === 0 ? '0' : '1.1em')
        .attr('font-weight', i === 0 ? '600' : 'normal')
        .attr('font-size', i === 0 ? '10px' : '9px');
    });
    el.attr('transform', 'rotate(-36)')
      .attr('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '1em')
      .attr('font-size', '10px');
  });
}

export default function EvalBarChartD3({ caption }: { caption?: ReactNode }) {
  const {
    loading,
    error,
    chartData,
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

  const configurations = useMemo(() => {
    const configMap = new Map<string, { hwKey: string; configLabel: string }>();
    unfilteredChartData.forEach((data) => {
      if (!configMap.has(data.configLabel)) {
        configMap.set(data.configLabel, {
          hwKey: String(data.hwKey),
          configLabel: data.configLabel,
        });
      }
    });
    return Array.from(configMap.values()).sort(
      (a, b) =>
        getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey) || a.hwKey.localeCompare(b.hwKey),
    );
  }, [unfilteredChartData]);

  const sortedConfigLabels = useMemo(
    () => configurations.map((c) => c.configLabel),
    [configurations],
  );
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    identifiers: sortedConfigLabels,
  });

  const legendItems = useMemo(
    () =>
      configurations.map(({ hwKey, configLabel }) => ({
        name: configLabel,
        label: configLabel.replaceAll('\n', ' '),
        color: resolveColor(configLabel, hwKey),
        title: configLabel.replaceAll('\n', ' '),
        isHighlighted: highlightedConfigs.has(configLabel),
        hw: hwKey,
        isActive: enabledHardware.has(hwKey),
        onClick: () => {
          toggleHardware(hwKey);
          track('eval_hw_toggled', { hw: hwKey });
        },
      })),
    [configurations, enabledHardware, highlightedConfigs, toggleHardware, resolveColor],
  );

  const yDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [0, 1];
    const yMin = d3.min(chartData, (d) => d.score - (d.scoreError || 0)) || 0;
    const yMax = d3.max(chartData, (d) => d.score + (d.scoreError || 0)) || 1;
    const yPadding = (yMax - yMin) * 0.3;
    return [Math.max(0, yMin - yPadding), Math.min(1, yMax + yPadding)];
  }, [chartData]);

  const errorData = useMemo(
    () => chartData.filter((d) => d.errorMin !== undefined && d.errorMax !== undefined),
    [chartData],
  );

  // Use custom layers since error bars + points need band-scale-aware positioning
  const layers = useMemo(
    (): LayerConfig<EvaluationChartData>[] => [
      {
        type: 'custom',
        key: 'error-bars',
        render: (group, { xScale: xs, yScale: ys }) => {
          const xScale = xs as d3.ScaleBand<string>;
          const yScale = ys as d3.ScaleLinear<number, number>;
          renderErrorBars(group, errorData, {
            getCx: (d: EvaluationChartData) =>
              (xScale(d.configLabel) || 0) + xScale.bandwidth() / 2,
            getYMin: (d: EvaluationChartData) => yScale(d.errorMin!),
            getYMax: (d: EvaluationChartData) => yScale(d.errorMax!),
            capWidth: xScale.bandwidth() / 3,
            stroke: 'var(--foreground)',
          });
        },
        onZoom: (group, ctx) => {
          const xScale = ctx.xScale as d3.ScaleBand<string>;
          const newYScale = ctx.newYScale as d3.ScaleLinear<number, number>;
          updateErrorBarsOnZoom(group, {
            getCx: (d: EvaluationChartData) =>
              (xScale(d.configLabel) || 0) + xScale.bandwidth() / 2,
            getYMin: (d: EvaluationChartData) => newYScale(d.errorMin!),
            getYMax: (d: EvaluationChartData) => newYScale(d.errorMax!),
            capWidth: xScale.bandwidth() / 3,
            stroke: 'var(--foreground)',
          });
        },
      },
      {
        type: 'custom',
        key: 'mean-points',
        render: (group, { xScale: xs, yScale: ys }) => {
          const xScale = xs as d3.ScaleBand<string>;
          const yScale = ys as d3.ScaleLinear<number, number>;
          return renderPoints(group, chartData, {
            getCx: (d: EvaluationChartData) =>
              (xScale(d.configLabel) || 0) + xScale.bandwidth() / 2,
            getCy: (d: EvaluationChartData) => yScale(d.score),
            getColor: (d: EvaluationChartData) =>
              getCssColor(resolveColor(d.configLabel, d.hwKey as string)),
            getRadius: () => 6,
            stroke: 'var(--foreground)',
            strokeWidth: 1,
          });
        },
        onZoom: (group, ctx) => {
          const xScale = ctx.xScale as d3.ScaleBand<string>;
          const newYScale = ctx.newYScale as d3.ScaleLinear<number, number>;
          updatePointsOnZoom<EvaluationChartData>(
            group,
            (d) => (xScale(d.configLabel) || 0) + xScale.bandwidth() / 2,
            (d) => newYScale(d.score),
          );
        },
      },
      {
        type: 'custom',
        key: 'score-labels',
        render: (group, { xScale: xs, yScale: ys }) => {
          group.selectAll('.score-label-group').remove();
          if (!showLabels) return;
          const xScale = xs as d3.ScaleBand<string>;
          const yScale = ys as d3.ScaleLinear<number, number>;
          const labelGroups = group
            .selectAll('.score-label-group')
            .data(chartData)
            .join('g')
            .attr('class', 'score-label-group')
            .attr(
              'transform',
              (d) =>
                `translate(${(xScale(d.configLabel) || 0) + xScale.bandwidth() / 2},${yScale(d.score) - 16})`,
            );
          labelGroups
            .append('rect')
            .attr('class', 'score-label-bg')
            .attr('rx', 4)
            .attr('ry', 4)
            .attr('fill', 'var(--popover)')
            .attr('stroke', 'var(--border)')
            .attr('stroke-width', 1);
          labelGroups
            .append('text')
            .attr('class', 'score-label')
            .attr('text-anchor', 'middle')
            .style('fill', 'var(--foreground)')
            .attr('font-size', '10px')
            .attr('font-weight', '600')
            .attr('dy', '0.35em')
            .text((d) => d.score.toFixed(3));
          labelGroups.each(function () {
            const g = d3.select(this);
            const bbox = (g.select('text').node() as SVGTextElement).getBBox();
            g.select('.score-label-bg')
              .attr('x', bbox.x - 5)
              .attr('y', bbox.y - 1)
              .attr('width', bbox.width + 10)
              .attr('height', bbox.height + 2);
          });
        },
        onZoom: (group, ctx) => {
          if (!showLabels) return;
          const xScale = ctx.xScale as d3.ScaleBand<string>;
          const newYScale = ctx.newYScale as d3.ScaleLinear<number, number>;
          group
            .selectAll<SVGGElement, EvaluationChartData>('.score-label-group')
            .attr(
              'transform',
              (d) =>
                `translate(${(xScale(d.configLabel) || 0) + xScale.bandwidth() / 2},${newYScale(d.score) - 16})`,
            );
        },
      },
    ],
    [chartData, errorData, showLabels, getCssColor, resolveColor],
  );

  // Show skeleton on first load
  const isInitializing = loading || (!selectedBenchmark && !error);
  if (isInitializing && chartData.length === 0) {
    return (
      <div className="p-3">
        <Skeleton className="h-7 w-2/4 mb-1" />
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (error || chartData.length === 0) {
    const hasSelections = selectedBenchmark && selectedModel && selectedRunDate;
    const hasNoEvalDataForDate =
      hasSelections && availableDates.length > 0 && !availableDates.includes(selectedRunDate);
    const formatDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-');
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)));
    };
    return (
      <div className="flex items-center justify-center h-100 text-muted-foreground">
        <div className="text-center">
          {error ? (
            'Failed to load eval data.'
          ) : hasSelections && !modelHasEvalData ? (
            'No evaluation data is available for this model.'
          ) : hasNoEvalDataForDate ? (
            <>
              <div>No evaluation data available for {formatDate(selectedRunDate)}.</div>
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

  return (
    <D3Chart<EvaluationChartData>
      chartId="evaluation-chart"
      data={chartData}
      height={600}
      margin={CHART_MARGIN}
      watermark="logo"
      grabCursor={false}
      caption={caption}
      xScale={{ type: 'band', domain: chartData.map((d) => d.configLabel), padding: 0.1 }}
      yScale={{ type: 'linear', domain: yDomain }}
      xAxis={{ customize: formatXAxisLabels }}
      yAxis={{
        label: `${getEvalBenchmarkLabel(selectedBenchmark as EvalBenchmark)} Score`,
        tickFormat: (d) => Number(d).toFixed(2),
        tickCount: 5,
      }}
      layers={layers}
      zoom={{
        enabled: true,
        axes: 'y',
        scaleExtent: [0.25, 20],
        resetEventName: 'evaluation_zoom_reset_evaluation-chart',
        constrain: (transform) => {
          const k = transform.k;
          const yScale = d3
            .scaleLinear()
            .domain(yDomain)
            .range([600 - CHART_MARGIN.top - CHART_MARGIN.bottom, 0]);
          const minTy = 600 - CHART_MARGIN.top - CHART_MARGIN.bottom - yScale(0) * k;
          const maxTy = -yScale(1) * k;
          const ty = minTy < maxTy ? Math.max(minTy, Math.min(maxTy, transform.y)) : transform.y;
          return d3.zoomIdentity.translate(transform.x, ty).scale(k);
        },
      }}
      tooltip={{
        rulerType: 'crosshair',
        content: generateEvaluationTooltipContent,
        getRulerX: (d, xs) => {
          const bs = xs as d3.ScaleBand<string>;
          return (bs(d.configLabel) || 0) + bs.bandwidth() / 2;
        },
        getRulerY: (d, ys) => ys(d.score),
        onHoverStart: (sel) => sel.attr('r', 8),
        onHoverEnd: (sel) => sel.attr('r', 6),
        attachToLayer: 1,
      }}
      legendElement={
        <ChartLegend
          variant="sidebar"
          legendItems={legendItems}
          onItemRemove={removeHardware}
          isLegendExpanded={isLegendExpanded}
          onExpandedChange={(expanded) => {
            setIsLegendExpanded(expanded);
            track('eval_legend_expanded', { expanded });
          }}
          switches={[
            {
              id: 'eval-show-labels',
              label: 'Show Labels',
              checked: showLabels,
              onCheckedChange: (checked) => {
                setShowLabels(checked);
                track('eval_show_labels_toggled', { enabled: checked });
              },
            },
            {
              id: 'eval-high-contrast',
              label: 'High Contrast',
              checked: highContrast,
              onCheckedChange: (checked) => {
                setHighContrast(checked);
                track('eval_high_contrast_toggled', { enabled: checked });
              },
            },
          ]}
          showResetFilter={true}
          allSelected={enabledHardware.size === hwTypesWithData.size}
          onResetFilter={() => {
            selectAllHwTypes();
            track('eval_filter_reset');
          }}
          enableTooltips={true}
        />
      }
    />
  );
}
