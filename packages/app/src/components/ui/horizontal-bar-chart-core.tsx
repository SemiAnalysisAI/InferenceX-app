'use client';

/**
 * Shared core for the two horizontal-bar D3 charts in the dashboard:
 * `evaluation/ui/BarChartD3` and `reliability/ui/BarChartD3`.
 *
 * ## What this module owns (the genuinely shared ~70%)
 *
 * Both charts render a `<D3Chart variant band-y / linear-x>` alongside a
 * `<ChartLegend variant="sidebar">`, and both duplicate the same wiring around
 * that pair:
 *   - forwarding a `D3ChartHandle` ref through to the D3Chart,
 *   - a band y-scale + a linear x-scale, dynamic left margin from the y labels,
 *   - the sidebar `<ChartLegend>` with its expand/collapse URL-sync + `track()`
 *     call, its High-Contrast switch, and its conditional "Reset filter" action,
 *   - passing through the per-chart `layers`, `tooltip`, and `zoom` config.
 *
 * `HorizontalBarChartCore` centralizes all of that. The two tab components
 * become thin configurations: they compute their data → layout inputs and
 * hand this component the differing parts.
 *
 * ## What stays per-tab (intentionally NOT parameterized here)
 *
 * Per the refactor brief, we do not build a universal chart framework. Pieces
 * that are only superficially similar are passed in verbatim rather than
 * abstracted:
 *   - **Tooltip renderer** — the eval tooltip (precision, TP/EP/DPA, disagg,
 *     date, GitHub link, unofficial-run banner) and the reliability tooltip
 *     (success rate + run counts) share no structure; each tab passes its own
 *     `TooltipConfig`.
 *   - **Layers** — eval has error bars, mean points, unofficial error bars,
 *     score labels and the unofficial X-marker overlay; reliability has a
 *     `horizontalBar` layer plus on/near-bar percentage labels. Each tab builds
 *     its own `LayerConfig[]` (using the shared d3-chart layer helpers) and the
 *     overlay/unofficial-run path lives entirely in the eval tab so its
 *     first-class overlay support is unchanged.
 *   - **Zoom** — different scaleExtent / rescale / constrain behavior.
 *
 * Pure layout math (band centers, inside/outside label placement, sort order)
 * lives in `horizontal-bar-chart-core.helpers.ts` and is unit-tested there.
 */

import { track } from '@/lib/analytics';
import type { ReactNode } from 'react';

import {
  D3Chart,
  type AxisConfig,
  type D3ChartHandle,
  type LayerConfig,
  type ScaleConfig,
  type TooltipConfig,
  type ZoomConfig,
} from '@/lib/d3-chart/D3Chart';
import type { ChartMargin } from '@/lib/d3-chart/types';
import ChartLegend, {
  type CommonLegendItemProps,
  type LegendActionConfig,
  type LegendSwitchConfig,
} from '@/components/ui/chart-legend';

export interface HorizontalBarChartCoreProps<T> {
  /** DOM id for the chart container (`#<chartId>`). Preserved for cypress. */
  chartId: string;
  data: T[];
  height: number;
  margin: ChartMargin;
  watermark: 'logo' | 'unofficial' | 'none';
  /** Reliability uses grab cursor + non-clipped content; eval does not. */
  grabCursor?: boolean;
  clipContent?: boolean;
  instructions?: string;
  caption?: ReactNode;
  /** Optional overlay shown in place of the chart when there's no data. */
  noDataOverlay?: ReactNode;
  /**
   * Wrap the chart in a `relative` positioning container. Reliability needs
   * this so its absolutely-positioned `noDataOverlay` anchors correctly; eval
   * renders bare (no wrapper) to keep its markup byte-identical. Default false.
   */
  wrapRelative?: boolean;

  /** Linear x-scale config (eval: data-driven domain; reliability: [0, 100]). */
  xScale: ScaleConfig;
  /** Band y-scale config (row labels). */
  yScale: ScaleConfig;
  xAxis: AxisConfig;
  yAxis: AxisConfig;

  layers: LayerConfig<T>[];
  zoom: ZoomConfig;
  tooltip: TooltipConfig<T>;

  /** Imperative handle forwarded straight through to D3Chart (eval pins overlays). */
  chartRef?: React.Ref<D3ChartHandle>;

  // --- Legend (sidebar variant) ---
  legendItems: CommonLegendItemProps[];
  /** Fired when a legend item's remove (×) button is used. */
  onItemRemove?: (name: string) => void;
  isLegendExpanded: boolean;
  setIsLegendExpanded: (expanded: boolean) => void;
  /** Analytics event fired on legend expand/collapse, e.g. `evaluation_legend_expanded`. */
  legendExpandedEvent: string;
  switches?: LegendSwitchConfig[];
  actions?: LegendActionConfig[];
  /** Extra legend footer (eval's disagg parallelism key). */
  keyIndicators?: ReactNode;
}

/**
 * Renders the shared `<D3Chart>` + sidebar `<ChartLegend>` pair for a
 * horizontal bar chart.
 *
 * When `wrapRelative` is set (reliability) the chart is wrapped in a `relative`
 * container so the absolutely-positioned `noDataOverlay` anchors to it —
 * matching reliability's original markup. Eval leaves it unset and the
 * `<D3Chart>` renders without an extra wrapper, keeping eval's DOM
 * byte-identical to before this refactor.
 */
export function HorizontalBarChartCore<T>({
  chartId,
  data,
  height,
  margin,
  watermark,
  grabCursor = false,
  clipContent,
  instructions,
  caption,
  noDataOverlay,
  wrapRelative = false,
  xScale,
  yScale,
  xAxis,
  yAxis,
  layers,
  zoom,
  tooltip,
  chartRef,
  legendItems,
  onItemRemove,
  isLegendExpanded,
  setIsLegendExpanded,
  legendExpandedEvent,
  switches,
  actions,
  keyIndicators,
}: HorizontalBarChartCoreProps<T>) {
  const chart = (
    <D3Chart<T>
      ref={chartRef}
      chartId={chartId}
      data={data}
      height={height}
      margin={margin}
      watermark={watermark}
      grabCursor={grabCursor}
      clipContent={clipContent}
      instructions={instructions}
      caption={caption}
      noDataOverlay={noDataOverlay}
      xScale={xScale}
      yScale={yScale}
      xAxis={xAxis}
      yAxis={yAxis}
      layers={layers}
      zoom={zoom}
      tooltip={tooltip}
      legendElement={
        <ChartLegend
          variant="sidebar"
          legendItems={legendItems}
          onItemRemove={onItemRemove}
          isLegendExpanded={isLegendExpanded}
          onExpandedChange={(expanded) => {
            setIsLegendExpanded(expanded);
            track(legendExpandedEvent, { expanded });
          }}
          switches={switches}
          actions={actions}
          enableTooltips={true}
          keyIndicators={keyIndicators}
        />
      }
    />
  );

  return wrapRelative ? <div className="relative">{chart}</div> : chart;
}
