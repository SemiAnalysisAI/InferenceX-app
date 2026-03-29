'use client';

import { track } from '@/lib/analytics';
import { type ReactNode, useMemo } from 'react';
import * as d3 from 'd3';

import { getModelSortIndex } from '@/lib/constants';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LayerConfig } from '@/lib/d3-chart/D3Chart';
import { renderErrorBars } from '@/lib/d3-chart/layers/error-bars';
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

const CHART_MARGIN = { top: 24, right: 24, bottom: 52, left: 160 };

const runLinkHTML = (runUrl?: string) =>
  runUrl
    ? `<div style="font-size: 11px; margin-top: 4px;">
        <a href="${runUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--muted-foreground); text-decoration: underline; cursor: pointer;">GitHub Actions Run</a>
      </div>`
    : '';

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
  const activeHwKeys = useMemo(
    () => configurations.filter((c) => enabledHardware.has(c.hwKey)).map((c) => c.hwKey),
    [configurations, enabledHardware],
  );
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    identifiers: sortedConfigLabels,
    activeKeys: activeHwKeys,
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
          track('evaluation_hw_toggled', { hw: hwKey });
        },
      })),
    [configurations, enabledHardware, highlightedConfigs, toggleHardware, resolveColor],
  );

  const xDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [0, 1];
    const xMin = d3.min(chartData, (d) => d.score - (d.scoreError || 0)) || 0;
    const xMax = d3.max(chartData, (d) => d.score + (d.scoreError || 0)) || 1;
    const xPadding = (xMax - xMin) * 0.3;
    return [Math.max(0, xMin - xPadding), Math.min(1, xMax + xPadding)];
  }, [chartData]);

  const chartHeight = Math.max(400, chartData.length * 40 + CHART_MARGIN.top + CHART_MARGIN.bottom);

  const errorData = useMemo(
    () => chartData.filter((d) => d.errorMin !== undefined && d.errorMax !== undefined),
    [chartData],
  );

  // Horizontal bar chart: yScale = band (config labels), xScale = linear (scores)
  const layers = useMemo(
    (): LayerConfig<EvaluationChartData>[] => [
      {
        type: 'custom',
        key: 'error-bars',
        render: (group, { xScale: xs, yScale: ys }) => {
          const xScale = xs as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          // Horizontal error bars: swap x/y semantics
          // getCx = y center, getYMin = x left, getYMax = x right, capWidth = vertical cap height
          renderErrorBars(group, errorData, {
            getCx: (d: EvaluationChartData) =>
              (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2,
            getYMin: (d: EvaluationChartData) => xScale(d.errorMin!),
            getYMax: (d: EvaluationChartData) => xScale(d.errorMax!),
            capWidth: yScale.bandwidth() / 3,
            stroke: 'var(--foreground)',
          });
          // Rotate error bars 90 degrees — the render draws vertical, we need horizontal.
          // Instead, manually position: stem is horizontal, caps are vertical.
          const bars = group.selectAll<SVGGElement, EvaluationChartData>('.error-bar');
          bars
            .select('.eb-stem')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2);
          const capH = yScale.bandwidth() / 6;
          bars
            .select('.eb-cap-top')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMin!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
          bars
            .select('.eb-cap-bot')
            .attr('x1', (d) => xScale(d.errorMax!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
        },
        onZoom: (group, ctx) => {
          const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
          const yScale = ctx.yScale as d3.ScaleBand<string>;
          const bars = group.selectAll<SVGGElement, EvaluationChartData>('.error-bar');
          bars
            .select('.eb-stem')
            .attr('x1', (d) => newXScale(d.errorMin!))
            .attr('x2', (d) => newXScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2);
          const capH = yScale.bandwidth() / 6;
          bars
            .select('.eb-cap-top')
            .attr('x1', (d) => newXScale(d.errorMin!))
            .attr('x2', (d) => newXScale(d.errorMin!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
          bars
            .select('.eb-cap-bot')
            .attr('x1', (d) => newXScale(d.errorMax!))
            .attr('x2', (d) => newXScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
        },
      },
      {
        type: 'custom',
        key: 'mean-points',
        render: (group, { xScale: xs, yScale: ys }) => {
          const xScale = xs as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          return renderPoints(group, chartData, {
            getCx: (d: EvaluationChartData) => xScale(d.score),
            getCy: (d: EvaluationChartData) =>
              (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2,
            getColor: (d: EvaluationChartData) =>
              getCssColor(resolveColor(d.configLabel, d.hwKey as string)),
            getRadius: () => 6,
            stroke: 'none',
            strokeWidth: 0,
          });
        },
        onZoom: (group, ctx) => {
          const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
          const yScale = ctx.yScale as d3.ScaleBand<string>;
          updatePointsOnZoom<EvaluationChartData>(
            group,
            (d) => newXScale(d.score),
            (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2,
          );
        },
      },
      {
        type: 'custom',
        key: 'score-labels',
        render: (group, { xScale: xs, yScale: ys }) => {
          group.selectAll('.score-label-group').remove();
          if (!showLabels) return;
          const xScale = xs as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          const labelGroups = group
            .selectAll('.score-label-group')
            .data(chartData)
            .join('g')
            .attr('class', 'score-label-group')
            .attr(
              'transform',
              (d) =>
                `translate(${xScale(d.score) + 12},${(yScale(d.configLabel) || 0) + yScale.bandwidth() / 2})`,
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
            .attr('text-anchor', 'start')
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
          const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
          const yScale = ctx.yScale as d3.ScaleBand<string>;
          group
            .selectAll<SVGGElement, EvaluationChartData>('.score-label-group')
            .attr(
              'transform',
              (d) =>
                `translate(${newXScale(d.score) + 12},${(yScale(d.configLabel) || 0) + yScale.bandwidth() / 2})`,
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
      height={chartHeight}
      margin={CHART_MARGIN}
      watermark="logo"
      grabCursor={false}
      caption={caption}
      xScale={{ type: 'linear', domain: xDomain }}
      yScale={{ type: 'band', domain: chartData.map((d) => d.configLabel), padding: 0.1 }}
      xAxis={{
        label: `${getEvalBenchmarkLabel(selectedBenchmark as EvalBenchmark)} Score`,
        tickFormat: (d) => Number(d).toFixed(2),
        tickCount: 5,
      }}
      yAxis={{ customize: formatYAxisLabels }}
      layers={layers}
      zoom={{
        enabled: true,
        axes: 'x',
        scaleExtent: [1, 20],
        resetEventName: 'evaluation_zoom_reset_evaluation-chart',
        constrain: (transform) => {
          const k = transform.k;
          const innerWidth =
            (typeof window !== 'undefined' ? window.innerWidth : 800) -
            CHART_MARGIN.left -
            CHART_MARGIN.right;
          const xScale = d3.scaleLinear().domain(xDomain).range([0, innerWidth]);
          const minTx = -xScale(1) * k + innerWidth;
          const maxTx = -xScale(0) * k;
          const tx = minTx < maxTx ? Math.max(minTx, Math.min(maxTx, transform.x)) : transform.x;
          return d3.zoomIdentity.translate(tx, transform.y).scale(k);
        },
      }}
      tooltip={{
        rulerType: 'crosshair',
        content: generateEvaluationTooltipContent,
        getRulerX: (d, xs) => (xs as d3.ScaleLinear<number, number>)(d.score),
        getRulerY: (d, ys) => {
          const bs = ys as unknown as d3.ScaleBand<string>;
          return (bs(d.configLabel) || 0) + bs.bandwidth() / 2;
        },
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
            track('evaluation_legend_expanded', { expanded });
          }}
          switches={[
            {
              id: 'eval-show-labels',
              label: 'Show Labels',
              checked: showLabels,
              onCheckedChange: (checked) => {
                setShowLabels(checked);
                track('evaluation_show_labels_toggled', { enabled: checked });
              },
            },
            {
              id: 'eval-high-contrast',
              label: 'High Contrast',
              checked: highContrast,
              onCheckedChange: (checked) => {
                setHighContrast(checked);
                track('evaluation_high_contrast_toggled', { enabled: checked });
              },
            },
          ]}
          actions={
            enabledHardware.size < hwTypesWithData.size
              ? [
                  {
                    id: 'eval-reset-filter',
                    label: 'Reset filter',
                    onClick: () => {
                      selectAllHwTypes();
                      track('evaluation_filter_reset');
                    },
                  },
                ]
              : []
          }
          enableTooltips={true}
        />
      }
    />
  );
}
