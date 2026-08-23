'use client';

import { track } from '@/lib/analytics';
import { type ReactNode, useMemo, useRef } from 'react';
import * as d3 from 'd3';

import { getHardwareConfig, getModelSortIndex } from '@/lib/constants';
import { contrastColors } from '@/lib/d3-chart/contrast-colors';
import { D3Chart, type LayerConfig } from '@/lib/d3-chart/D3Chart';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { twoRowYAxisLabels } from '@/lib/d3-chart/axis-labels';
import { computeLeftMargin, measureTextWidth } from '@/lib/d3-chart/dynamic-margins';

import { useReliabilityContext } from '@/components/reliability/ReliabilityContext';
import type { ModelSuccessRateData } from '@/components/reliability/types';
import { useThemeColors } from '@/hooks/useThemeColors';
import { type Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';
import ChartLegend from '@/components/ui/chart-legend';

type ChartItem = ModelSuccessRateData & { modelLabel: string };

const BASE_MARGIN = { top: 24, right: 24, bottom: 40 };

const TOOLTIP_STRINGS = {
  en: {
    dismiss: 'Click elsewhere to dismiss',
    successRate: 'Success Rate:',
    successful: 'Successful:',
    totalRuns: 'Total Runs:',
  },
  zh: {
    dismiss: '点击其他区域关闭',
    successRate: '成功率：',
    successful: '成功次数：',
    totalRuns: '总运行次数：',
  },
} as const;

const generateReliabilityTooltipContent = (
  data: ChartItem,
  isPinned: boolean,
  locale: Locale = 'en',
): string => {
  const t = TOOLTIP_STRINGS[locale];
  const modelLabel = getHardwareConfig(data.model).label;
  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">${modelLabel}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${t.successRate}</strong> ${data.successRate.toFixed(2)}%</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${t.successful}</strong> ${data.n_success}</div>
      <div style="color: var(--muted-foreground); font-size: 11px;"><strong>${t.totalRuns}</strong> ${data.total}</div>
    </div>
  `;
};

/** Position value + overlay labels together, flipping both when the longer one doesn't fit. */
function positionLabelPairs(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleLinear<number, number>,
  getBarColor: (d: ChartItem) => string,
  locale: Locale,
) {
  const valueLabels = group.selectAll<SVGTextElement, ChartItem>('.value-label');
  const overlayLabels = group.selectAll<SVGTextElement, ChartItem>('.overlay-label');

  const maxWidths = new Map<string, number>();
  valueLabels.each((d) => {
    maxWidths.set(
      d.modelLabel,
      measureTextWidth(`${d.successRate.toFixed(1)}%`, '600 12px sans-serif'),
    );
  });
  overlayLabels.each((d) => {
    const prev = maxWidths.get(d.modelLabel) ?? 0;
    const w = measureTextWidth(
      locale === 'zh' ? `${d.n_success}/${d.total} 次运行` : `${d.n_success}/${d.total} runs`,
      '500 10px sans-serif',
    );
    maxWidths.set(d.modelLabel, Math.max(prev, w));
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

const RELIABILITY_STRINGS = {
  en: {
    highContrast: 'High Contrast',
    resetFilter: 'Reset filter',
    xAxis: 'Success Rate (%)',
    loading: 'Loading reliability data…',
    loadError: 'Failed to load reliability data.',
    noData: 'No reliability data available for this date range.',
    instructions:
      'Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset · Hover for details',
    runCount: (success: number, total: number) => `${success}/${total} runs`,
  },
  zh: {
    highContrast: '高对比度',
    resetFilter: '重置筛选',
    xAxis: '成功率（%）',
    loading: '正在加载可靠性数据……',
    loadError: '可靠性数据加载失败。',
    noData: '所选时间范围内暂无可靠性数据。',
    instructions: 'Shift+滚轮横向缩放 · 拖动平移 · 双击重置 · 悬停查看详情',
    runCount: (success: number, total: number) => `${success}/${total} 次运行`,
  },
} as const;

export default function ReliabilityBarChartD3({ caption }: { caption?: ReactNode }) {
  const hoveredBarXRef = useRef(0);
  const {
    loading,
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
  const locale = useLocale();
  const legendT = RELIABILITY_STRINGS[locale];

  const sortedModels = useMemo(
    () =>
      [...filteredReliabilityData]
        .toSorted(
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
        .toSorted(
          (a, b) =>
            getModelSortIndex(a.model) - getModelSortIndex(b.model) ||
            a.model.localeCompare(b.model),
        )
        .map((data) => ({
          name: data.model,
          label: getHardwareConfig(data.model).label,
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
      [...chartData].toSorted(
        (a, b) =>
          getModelSortIndex(a.model) - getModelSortIndex(b.model) || a.model.localeCompare(b.model),
      ),
    [chartData],
  );

  const dataIdentity = useMemo(
    () =>
      JSON.stringify(
        sortedChartData.map((datum) => JSON.stringify([datum.model, datum.modelLabel])).toSorted(),
      ),
    [sortedChartData],
  );
  const metricIdentity = useMemo(
    () =>
      JSON.stringify(
        sortedChartData
          .map((datum) =>
            JSON.stringify([
              datum.model,
              datum.modelLabel,
              datum.successRate,
              datum.n_success,
              datum.total,
            ]),
          )
          .toSorted(),
      ),
    [sortedChartData],
  );
  const paletteIdentity = useMemo(
    () =>
      JSON.stringify(
        sortedChartData
          .map((datum) => JSON.stringify([datum.model, getCssColor(resolveColor(datum.model))]))
          .toSorted(),
      ),
    [getCssColor, resolveColor, sortedChartData],
  );
  // Reverse so first in sort order appears at top (band scale range is [height, 0]).
  const yDomain = useMemo(
    () => [...sortedChartData].toReversed().map((datum) => datum.modelLabel),
    [sortedChartData],
  );
  const xScaleConfig = useMemo(
    () => ({ type: 'linear' as const, domain: [0, 100] as [number, number] }),
    [],
  );
  const yScaleConfig = useMemo(
    () => ({ type: 'band' as const, domain: yDomain, padding: 0.15 }),
    [yDomain],
  );
  const zoomConfig = useMemo(
    () => ({
      enabled: true,
      axes: 'x' as const,
      scaleExtent: [0.1, 1] as [number, number],
      rescaleX: (xScale: ContinuousScale, transform: d3.ZoomTransform) =>
        xScale.copy().domain([0, 100 / transform.k]) as ContinuousScale,
      customTransformStorage: (transform: d3.ZoomTransform) => d3.zoomIdentity.scale(transform.k),
    }),
    [],
  );
  const tooltipConfig = useMemo(
    () => ({
      rulerType: 'vertical' as const,
      content: (datum: ChartItem, isPinned: boolean) =>
        generateReliabilityTooltipContent(datum, isPinned, locale),
      getRulerX: () => hoveredBarXRef.current,
      getRulerY: (
        datum: ChartItem,
        scale: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>,
      ) => {
        const bandScale = scale as unknown as d3.ScaleBand<string>;
        return (bandScale(datum.modelLabel) ?? 0) + bandScale.bandwidth() / 2;
      },
      onHoverStart: (selection: d3.Selection<SVGRectElement, ChartItem, SVGGElement, unknown>) => {
        hoveredBarXRef.current = Number.parseFloat(selection.attr('width') || '0');
        selection.attr('stroke', 'var(--foreground)').attr('stroke-width', 1.5);
      },
      onHoverEnd: (selection: d3.Selection<SVGRectElement, ChartItem, SVGGElement, unknown>) => {
        selection.attr('stroke', 'none');
      },
      attachToLayer: 0,
    }),
    [locale],
  );

  const dynamicHeight = useMemo(() => {
    const barCount = sortedChartData.length || 1;
    return Math.max(600, barCount * 45 + 80);
  }, [sortedChartData.length]);

  const layers = useMemo(
    (): LayerConfig<ChartItem>[] => [
      {
        type: 'horizontalBar',
        key: 'bars',
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
        displayIdentity: paletteIdentity,
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
            .text((d) => legendT.runCount(d.n_success, d.total));

          positionLabelPairs(
            group,
            ctx.xScale as d3.ScaleLinear<number, number>,
            (d) => getCssColor(resolveColor(d.model)),
            locale,
          );
        },
        onDisplayUpdate: (group, ctx) => {
          const baseXScale = ctx.xScale as d3.ScaleLinear<number, number>;
          const svgNode = ctx.layout.svg.node();
          const transform = svgNode ? d3.zoomTransform(svgNode) : d3.zoomIdentity;
          const currentXScale = baseXScale.copy().domain([0, 100 / transform.k]);
          positionLabelPairs(
            group,
            currentXScale,
            (datum) => getCssColor(resolveColor(datum.model)),
            locale,
          );
        },
        onZoom: (group, ctx) => {
          const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
          positionLabelPairs(group, newXScale, (d) => getCssColor(resolveColor(d.model)), locale);
        },
      },
    ],
    [sortedChartData, getCssColor, legendT, locale, paletteIdentity, resolveColor],
  );

  const yAxisConfig = useMemo(() => ({ customize: twoRowYAxisLabels() }), []);

  const chartMargin = useMemo(
    () => ({ ...BASE_MARGIN, left: computeLeftMargin(yDomain) }),
    [yDomain],
  );

  const xAxisConfig = useMemo(
    () => ({
      label: legendT.xAxis,
      tickFormat: (d: d3.AxisDomain) => `${d}%`,
      tickCount: 5,
    }),
    [legendT.xAxis],
  );

  const isEmpty = loading || error || chartData.length === 0;

  const emptyOverlay = isEmpty ? (
    <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-lg z-10">
      <p className="text-sm font-medium text-muted-foreground bg-background/90 border border-border rounded-md px-4 py-2 shadow-sm">
        {loading ? legendT.loading : error ? legendT.loadError : legendT.noData}
      </p>
    </div>
  ) : null;

  return (
    <div className="relative">
      <D3Chart<ChartItem>
        chartId="reliability-chart"
        data={sortedChartData}
        dataIdentity={dataIdentity}
        metricIdentity={metricIdentity}
        displayIdentity={paletteIdentity}
        height={dynamicHeight}
        margin={chartMargin}
        watermark="logo"
        grabCursor
        clipContent={false}
        caption={caption}
        noDataOverlay={emptyOverlay}
        instructions={legendT.instructions}
        xScale={xScaleConfig}
        yScale={yScaleConfig}
        xAxis={xAxisConfig}
        yAxis={yAxisConfig}
        layers={layers}
        zoom={zoomConfig}
        tooltip={tooltipConfig}
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
                label: legendT.highContrast,
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
                      label: legendT.resetFilter,
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
