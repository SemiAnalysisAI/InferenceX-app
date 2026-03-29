'use client';

import { track } from '@/lib/analytics';
import { type ReactNode, useMemo, useRef } from 'react';
import * as d3 from 'd3';

import { HARDWARE_CONFIG, getModelSortIndex } from '@/lib/constants';
import { contrastColors } from '@/lib/d3-chart/contrast-colors';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LayerConfig } from '@/lib/d3-chart/D3Chart';
import type { ContinuousScale } from '@/lib/d3-chart/types';

import { useReliabilityContext } from '@/components/reliability/ReliabilityContext';
import { ModelSuccessRateData } from '@/components/reliability/types';
import { useThemeColors } from '@/hooks/useThemeColors';
import ChartLegend from '@/components/ui/chart-legend';

type ChartItem = ModelSuccessRateData & { modelLabel: string };

const CHART_MARGIN = { top: 24, right: 24, bottom: 40, left: 70 };

const generateReliabilityTooltipContent = (data: ChartItem, isPinned: boolean): string => {
  const modelLabel =
    HARDWARE_CONFIG[data.model as keyof typeof HARDWARE_CONFIG]?.label || data.model;
  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">${modelLabel}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Success Rate:</strong> ${data.successRate.toFixed(2)}%</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Successful:</strong> ${data.n_success}</div>
      <div style="color: var(--muted-foreground); font-size: 11px;"><strong>Total Runs:</strong> ${data.total}</div>
    </div>
  `;
};

/** Position value + overlay labels together, flipping both when the longer one doesn't fit. */
function positionLabelPairs(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleLinear<number, number>,
  getBarColor: (d: ChartItem) => string,
) {
  const valueLabels = group.selectAll<SVGTextElement, ChartItem>('.value-label');
  const overlayLabels = group.selectAll<SVGTextElement, ChartItem>('.overlay-label');

  const maxWidths = new Map<string, number>();
  valueLabels.each(function (d) {
    maxWidths.set(d.modelLabel, this.getComputedTextLength());
  });
  overlayLabels.each(function (d) {
    const prev = maxWidths.get(d.modelLabel) ?? 0;
    maxWidths.set(d.modelLabel, Math.max(prev, this.getComputedTextLength()));
  });

  const apply = (sel: d3.Selection<SVGTextElement, ChartItem, SVGGElement, unknown>) => {
    sel.each(function (d) {
      const barEnd = xScale(d.successRate);
      const maxW = maxWidths.get(d.modelLabel) ?? 0;
      const fitsInside = barEnd > maxW + 24;
      const fill = fitsInside ? contrastColors(getBarColor(d)) : 'var(--foreground)';
      d3.select(this)
        .attr('x', fitsInside ? barEnd - 10 : barEnd + 6)
        .attr('text-anchor', fitsInside ? 'end' : 'start')
        .style('fill', fill)
        .attr('stroke', null);
    });
  };

  apply(valueLabels);
  apply(overlayLabels);
}

export default function ReliabilityBarChartD3({ caption }: { caption?: ReactNode }) {
  const hoveredBarXRef = useRef(0);
  const {
    error,
    chartData,
    highContrast,
    setHighContrast,
    filteredReliabilityData,
    enabledModels,
    toggleModel,
    removeModel,
    modelsWithData,
    selectAllModels,
    isLegendExpanded,
    setIsLegendExpanded,
  } = useReliabilityContext();

  const sortedModels = useMemo(
    () =>
      [...filteredReliabilityData]
        .sort(
          (a, b) =>
            getModelSortIndex(a.model) - getModelSortIndex(b.model) ||
            a.model.localeCompare(b.model),
        )
        .map((d) => d.model),
    [filteredReliabilityData],
  );

  const activeModelKeys = useMemo(
    () => sortedModels.filter((m) => enabledModels.has(m)),
    [sortedModels, enabledModels],
  );
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    identifiers: sortedModels,
    activeKeys: activeModelKeys,
  });

  const legendItems = useMemo(
    () =>
      [...filteredReliabilityData]
        .sort(
          (a, b) =>
            getModelSortIndex(a.model) - getModelSortIndex(b.model) ||
            a.model.localeCompare(b.model),
        )
        .map((data) => ({
          name: data.model,
          label: HARDWARE_CONFIG[data.model as keyof typeof HARDWARE_CONFIG]?.label || data.model,
          color: resolveColor(data.model),
          isActive: enabledModels.has(data.model),
          onClick: () => {
            toggleModel(data.model);
            track('reliability_model_toggled', { model: data.model });
          },
        })),
    [filteredReliabilityData, enabledModels, toggleModel, resolveColor],
  );

  // Sort chart data by model sort index (same as legend)
  const sortedChartData = useMemo(
    () =>
      [...chartData].sort(
        (a, b) =>
          getModelSortIndex(a.model) - getModelSortIndex(b.model) || a.model.localeCompare(b.model),
      ),
    [chartData],
  );

  const dynamicHeight = useMemo(() => {
    const barCount = sortedChartData.length || 1;
    return Math.max(600, barCount * 45 + 80);
  }, [sortedChartData.length]);

  const layers = useMemo(
    (): LayerConfig<ChartItem>[] => [
      {
        type: 'horizontalBar',
        data: sortedChartData,
        config: {
          getY: (d) => d.modelLabel,
          getX: (d) => d.successRate,
          getColor: (d) => getCssColor(resolveColor(d.model)),
          rx: 2,
          opacity: 1,
          keyFn: (d) => d.modelLabel,
        },
      },
      {
        type: 'custom',
        key: 'bar-labels',
        render: (group, ctx) => {
          const yScale = ctx.yScale as d3.ScaleBand<string>;

          // Value labels (top line, bold) — percentage
          group
            .selectAll<SVGTextElement, ChartItem>('.value-label')
            .data(sortedChartData, (d) => d.modelLabel)
            .join('text')
            .attr('class', 'value-label')
            .attr('y', (d) => (yScale(d.modelLabel) ?? 0) + yScale.bandwidth() / 2 - 6)
            .attr('dy', '0.35em')
            .attr('font-size', '12px')
            .attr('font-weight', '600')
            .style('pointer-events', 'none')
            .text((d) => `${d.successRate.toFixed(1)}%`);

          // Overlay labels (bottom line, muted) — run count
          group
            .selectAll<SVGTextElement, ChartItem>('.overlay-label')
            .data(sortedChartData, (d) => d.modelLabel)
            .join('text')
            .attr('class', 'overlay-label')
            .attr('y', (d) => (yScale(d.modelLabel) ?? 0) + yScale.bandwidth() / 2 + 8)
            .attr('dy', '0.35em')
            .attr('font-size', '10px')
            .attr('font-weight', '500')
            .style('pointer-events', 'none')
            .text((d) => `${d.n_success}/${d.total} runs`);

          positionLabelPairs(group, ctx.xScale as d3.ScaleLinear<number, number>, (d) =>
            getCssColor(resolveColor(d.model)),
          );
        },
        onZoom: (group, ctx) => {
          const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
          positionLabelPairs(group, newXScale, (d) => getCssColor(resolveColor(d.model)));
        },
      },
    ],
    [sortedChartData, getCssColor, resolveColor],
  );

  // Reverse so first in sort order appears at top (band scale range is [height, 0])
  const yDomain = useMemo(
    () => [...sortedChartData].reverse().map((d) => d.modelLabel),
    [sortedChartData],
  );

  const yAxisConfig = useMemo(
    () => ({
      customize: (axisGroup: d3.Selection<SVGGElement, unknown, null, undefined>) => {
        axisGroup.selectAll('.tick text').each(function () {
          const el = d3.select(this);
          const fullLabel = el.text();
          const lastSpace = fullLabel.lastIndexOf(' ');
          el.text(null);
          if (lastSpace > 0) {
            el.append('tspan')
              .text(fullLabel.slice(0, lastSpace))
              .attr('x', -8)
              .attr('dy', '-0.4em')
              .attr('font-size', '12px')
              .attr('font-weight', '600');
            el.append('tspan')
              .text(fullLabel.slice(lastSpace + 1))
              .attr('x', -8)
              .attr('dy', '1.2em')
              .attr('font-size', '10px')
              .style('fill', 'var(--muted-foreground)');
          } else {
            el.append('tspan')
              .text(fullLabel)
              .attr('x', -8)
              .attr('font-size', '12px')
              .attr('font-weight', '600');
          }
          el.attr('text-anchor', 'end');
        });
      },
    }),
    [],
  );

  const xAxisConfig = useMemo(
    () => ({
      label: 'Success Rate (%)',
      tickFormat: (d: d3.AxisDomain) => `${d}%`,
      tickCount: 5,
    }),
    [],
  );

  const isEmpty = error || chartData.length === 0;

  const emptyOverlay = isEmpty ? (
    <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-lg z-10">
      <p className="text-sm font-medium text-muted-foreground bg-background/90 border border-border rounded-md px-4 py-2 shadow-sm">
        {error
          ? 'Failed to load reliability data.'
          : 'No reliability data available for this date range.'}
      </p>
    </div>
  ) : null;

  return (
    <div className="relative">
      <D3Chart<ChartItem>
        chartId="reliability-chart"
        data={sortedChartData}
        height={dynamicHeight}
        margin={CHART_MARGIN}
        watermark="logo"
        grabCursor
        clipContent={false}
        caption={caption}
        noDataOverlay={emptyOverlay}
        instructions="Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset · Hover for details"
        xScale={{ type: 'linear', domain: [0, 100] }}
        yScale={{ type: 'band', domain: yDomain, padding: 0.15 }}
        xAxis={xAxisConfig}
        yAxis={yAxisConfig}
        layers={layers}
        zoom={{
          enabled: true,
          axes: 'x',
          scaleExtent: [0.1, 1],
          rescaleX: (xScale, transform) =>
            xScale.copy().domain([0, 100 / transform.k]) as ContinuousScale,
          customTransformStorage: (transform) => d3.zoomIdentity.scale(transform.k),
        }}
        tooltip={{
          rulerType: 'vertical',
          content: generateReliabilityTooltipContent,
          getRulerX: () => hoveredBarXRef.current,
          getRulerY: (d, ys) => {
            const bandScale = ys as unknown as d3.ScaleBand<string>;
            return (bandScale(d.modelLabel) ?? 0) + bandScale.bandwidth() / 2;
          },
          onHoverStart: (sel) => {
            hoveredBarXRef.current = parseFloat(sel.attr('width') || '0');
            sel.attr('stroke', 'var(--foreground)').attr('stroke-width', 1.5);
          },
          onHoverEnd: (sel) => {
            sel.attr('stroke', 'none');
          },
          attachToLayer: 0,
        }}
        legendElement={
          <ChartLegend
            variant="sidebar"
            legendItems={legendItems}
            onItemRemove={removeModel}
            isLegendExpanded={isLegendExpanded}
            onExpandedChange={(expanded) => {
              setIsLegendExpanded(expanded);
              track('reliability_legend_expanded', { expanded });
            }}
            switches={[
              {
                id: 'reliability-high-contrast',
                label: 'High Contrast',
                checked: highContrast,
                onCheckedChange: (checked) => {
                  setHighContrast(checked);
                  track('reliability_high_contrast_toggled', { enabled: checked });
                },
              },
            ]}
            actions={
              enabledModels.size < modelsWithData.size
                ? [
                    {
                      id: 'reliability-reset-filter',
                      label: 'Reset filter',
                      onClick: () => {
                        selectAllModels();
                        track('reliability_filter_reset');
                      },
                    },
                  ]
                : []
            }
            enableTooltips={true}
          />
        }
      />
    </div>
  );
}
