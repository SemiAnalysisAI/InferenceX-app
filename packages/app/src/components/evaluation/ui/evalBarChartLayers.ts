import * as d3 from 'd3';

import type { D3ChartHandle, LayerConfig } from '@/lib/d3-chart/D3Chart';
import { renderErrorBars } from '@/lib/d3-chart/layers/error-bars';
import { renderPoints, updatePointsOnZoom } from '@/lib/d3-chart/layers/points';
import { computeTooltipPosition } from '@/lib/d3-chart/layers/scatter-points';
import type { EvaluationChartData } from '@/components/evaluation/types';
import { overlayRunColor, overlayRunIndex } from '@/lib/overlay-run-style';

const OVERLAY_X_SIZE = 6;
const OVERLAY_X_HOVER_SIZE = 8;
const OVERLAY_HIT_RADIUS = 10;
const OVERLAY_ERROR_STROKE_WIDTH = 1.5;

const getOverlayXPath = (size: number) =>
  `M ${-size},${-size} L ${size},${size} M ${-size},${size} L ${size},${-size}`;

const yCenter = (yScale: d3.ScaleBand<string>, d: EvaluationChartData) =>
  (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2;

/** Official error bars (horizontal). Extracted verbatim from EvalBarChartD3. */
function errorBarsLayer(errorData: EvaluationChartData[]): LayerConfig<EvaluationChartData> {
  const positionCaps = (
    bars: d3.Selection<SVGGElement, EvaluationChartData, SVGGElement, unknown>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleBand<string>,
  ) => {
    bars
      .select('.eb-stem')
      .attr('x1', (d) => xScale(d.errorMin!))
      .attr('x2', (d) => xScale(d.errorMax!))
      .attr('y1', (d) => yCenter(yScale, d))
      .attr('y2', (d) => yCenter(yScale, d));
    const capH = yScale.bandwidth() / 6;
    bars
      .select('.eb-cap-top')
      .attr('x1', (d) => xScale(d.errorMin!))
      .attr('x2', (d) => xScale(d.errorMin!))
      .attr('y1', (d) => yCenter(yScale, d) - capH)
      .attr('y2', (d) => yCenter(yScale, d) + capH);
    bars
      .select('.eb-cap-bot')
      .attr('x1', (d) => xScale(d.errorMax!))
      .attr('x2', (d) => xScale(d.errorMax!))
      .attr('y1', (d) => yCenter(yScale, d) - capH)
      .attr('y2', (d) => yCenter(yScale, d) + capH);
  };

  return {
    type: 'custom',
    key: 'error-bars',
    render: (group, { xScale: xs, yScale: ys }) => {
      const xScale = xs as d3.ScaleLinear<number, number>;
      const yScale = ys as d3.ScaleBand<string>;
      // Horizontal error bars: swap x/y semantics
      // getCx = y center, getYMin = x left, getYMax = x right, capWidth = vertical cap height
      renderErrorBars(group, errorData, {
        getCx: (d: EvaluationChartData) => yCenter(yScale, d),
        getYMin: (d: EvaluationChartData) => xScale(d.errorMin!),
        getYMax: (d: EvaluationChartData) => xScale(d.errorMax!),
        capWidth: yScale.bandwidth() / 3,
        stroke: 'var(--foreground)',
      });
      // Rotate error bars 90 degrees — the render draws vertical, we need horizontal.
      // Instead, manually position: stem is horizontal, caps are vertical.
      const bars = group.selectAll<SVGGElement, EvaluationChartData>('.error-bar');
      positionCaps(bars, xScale, yScale);
    },
    onZoom: (group, ctx) => {
      const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
      const yScale = ctx.yScale as d3.ScaleBand<string>;
      const bars = group.selectAll<SVGGElement, EvaluationChartData>('.error-bar');
      positionCaps(bars, newXScale, yScale);
    },
  };
}

/** Official mean-score points. */
function meanPointsLayer(
  chartData: EvaluationChartData[],
  getCssColor: (color: string) => string,
  resolveColor: (configLabel: string, hwKey: string) => string,
): LayerConfig<EvaluationChartData> {
  return {
    type: 'custom',
    key: 'mean-points',
    render: (group, { xScale: xs, yScale: ys }) => {
      const xScale = xs as d3.ScaleLinear<number, number>;
      const yScale = ys as d3.ScaleBand<string>;
      return renderPoints(group, chartData, {
        getCx: (d: EvaluationChartData) => xScale(d.score),
        getCy: (d: EvaluationChartData) => yCenter(yScale, d),
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
        (d) => yCenter(yScale, d),
      );
    },
  };
}

/** Unofficial-run overlay error bars. */
function unofficialErrorBarsLayer(
  unofficialErrorData: EvaluationChartData[],
  runIndexByUrl: Record<string, number>,
): LayerConfig<EvaluationChartData> {
  const positionCaps = (
    bars: d3.Selection<SVGGElement, EvaluationChartData, SVGGElement, unknown>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleBand<string>,
  ) => {
    const capH = yScale.bandwidth() / 6;
    bars
      .select('.unofficial-eb-stem')
      .attr('x1', (d) => xScale(d.errorMin!))
      .attr('x2', (d) => xScale(d.errorMax!))
      .attr('y1', (d) => yCenter(yScale, d))
      .attr('y2', (d) => yCenter(yScale, d));
    bars
      .select('.unofficial-eb-cap-top')
      .attr('x1', (d) => xScale(d.errorMin!))
      .attr('x2', (d) => xScale(d.errorMin!))
      .attr('y1', (d) => yCenter(yScale, d) - capH)
      .attr('y2', (d) => yCenter(yScale, d) + capH);
    bars
      .select('.unofficial-eb-cap-bot')
      .attr('x1', (d) => xScale(d.errorMax!))
      .attr('x2', (d) => xScale(d.errorMax!))
      .attr('y1', (d) => yCenter(yScale, d) - capH)
      .attr('y2', (d) => yCenter(yScale, d) + capH);
  };

  return {
    type: 'custom',
    key: 'unofficial-error-bars',
    render: (group, { xScale: xs, yScale: ys }) => {
      const xScale = xs as d3.ScaleLinear<number, number>;
      const yScale = ys as d3.ScaleBand<string>;

      const bars = group
        .selectAll<SVGGElement, EvaluationChartData>('.unofficial-error-bar')
        .data(unofficialErrorData, (d) => `${d.configLabel}|${d.score}|${d.errorMin}|${d.errorMax}`)
        .join((enter) => {
          const bar = enter.append('g').attr('class', 'unofficial-error-bar');
          bar
            .append('line')
            .attr('class', 'unofficial-eb-stem')
            .attr('stroke-width', OVERLAY_ERROR_STROKE_WIDTH);
          bar
            .append('line')
            .attr('class', 'unofficial-eb-cap-top')
            .attr('stroke-width', OVERLAY_ERROR_STROKE_WIDTH);
          bar
            .append('line')
            .attr('class', 'unofficial-eb-cap-bot')
            .attr('stroke-width', OVERLAY_ERROR_STROKE_WIDTH);
          return bar;
        });

      bars.style('filter', null);
      bars
        .selectAll<SVGLineElement, EvaluationChartData>(
          '.unofficial-eb-stem, .unofficial-eb-cap-top, .unofficial-eb-cap-bot',
        )
        .attr('stroke', (d) => overlayRunColor(overlayRunIndex(d.runUrl ?? null, runIndexByUrl)));

      positionCaps(bars, xScale, yScale);
    },
    onZoom: (group, { newXScale, yScale: ys }) => {
      const xScale = newXScale as d3.ScaleLinear<number, number>;
      const yScale = ys as d3.ScaleBand<string>;
      const bars = group.selectAll<SVGGElement, EvaluationChartData>('.unofficial-error-bar');
      positionCaps(bars, xScale, yScale);
    },
  };
}

/** Official score value labels. */
function scoreLabelsLayer(
  chartData: EvaluationChartData[],
  showLabels: boolean,
): LayerConfig<EvaluationChartData> {
  return {
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
        .attr('transform', (d) => `translate(${xScale(d.score) + 12},${yCenter(yScale, d)})`);
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
        .attr('transform', (d) => `translate(${newXScale(d.score) + 12},${yCenter(yScale, d)})`);
    },
  };
}

interface UnofficialOverlayDeps {
  unofficialChartData: EvaluationChartData[];
  runIndexByUrl: Record<string, number>;
  showLabels: boolean;
  chartRef: React.RefObject<D3ChartHandle | null>;
  branchForRow: (datum: EvaluationChartData) => string | undefined;
  tooltipContent: (
    data: EvaluationChartData,
    isPinned: boolean,
    unofficialBranch?: string,
  ) => string;
}

/** Unofficial-run overlay points (the ✕ markers) with their tooltip wiring. */
function unofficialOverlayLayer({
  unofficialChartData,
  runIndexByUrl,
  showLabels,
  chartRef,
  branchForRow,
  tooltipContent,
}: UnofficialOverlayDeps): LayerConfig<EvaluationChartData> {
  return {
    type: 'custom',
    key: 'unofficial-overlay',
    render: (group, { xScale: xs, yScale: ys, layout }) => {
      const xScale = xs as d3.ScaleLinear<number, number>;
      const yScale = ys as d3.ScaleBand<string>;
      const svgNode = layout.svg.node();
      const tooltipNode = svgNode?.nextElementSibling as HTMLDivElement | null;
      const container = svgNode?.parentElement as HTMLDivElement | null;
      if (!svgNode || !tooltipNode || !container) return;

      const tooltip = d3.select(tooltipNode);
      const overlayPoints = group
        .selectAll<SVGGElement, EvaluationChartData>('.unofficial-eval-point')
        .data(unofficialChartData, (d) => `${d.configLabel}|${d.score}`)
        .join((enter) => {
          const g = enter.append('g').attr('class', 'unofficial-eval-point');
          g.append('circle')
            .attr('r', OVERLAY_HIT_RADIUS)
            .attr('fill', 'transparent')
            .attr('cursor', 'pointer');
          g.append('path')
            .attr('class', 'unofficial-eval-x')
            .attr('d', getOverlayXPath(OVERLAY_X_SIZE))
            .attr('fill', 'none')
            .attr('stroke-width', 2.5)
            .attr('stroke-linecap', 'round')
            .attr('cursor', 'pointer');
          return g;
        });

      overlayPoints.attr('transform', (d) => `translate(${xScale(d.score)},${yCenter(yScale, d)})`);
      overlayPoints.style('filter', null);

      overlayPoints
        .select('.unofficial-eval-x')
        .attr('stroke', (d) => overlayRunColor(overlayRunIndex(d.runUrl ?? null, runIndexByUrl)));

      overlayPoints.each(function (d) {
        d3.select(this)
          .selectAll<SVGTextElement, boolean>('.unofficial-score-label')
          .data(showLabels ? [true] : [])
          .join('text')
          .attr('class', 'unofficial-score-label')
          .attr('x', 12)
          .attr('text-anchor', 'start')
          .style('fill', 'var(--foreground)')
          .attr('font-size', '10px')
          .attr('font-weight', '600')
          .attr('dy', '0.35em')
          .attr('pointer-events', 'none')
          .text(d.score.toFixed(3));
      });

      overlayPoints
        .on('mouseenter', function (_event, d) {
          if (chartRef.current?.isPinned()) return;
          d3.select(this)
            .select('.unofficial-eval-x')
            .attr('d', getOverlayXPath(OVERLAY_X_HOVER_SIZE))
            .attr('stroke-width', 3.5);
          tooltip
            .style('opacity', 1)
            .style('display', 'block')
            .style('pointer-events', 'none')
            .html(tooltipContent(d, false, branchForRow(d)));
        })
        .on('mousemove', (event) => {
          if (chartRef.current?.isPinned()) return;
          const [mx, my] = d3.pointer(event, container);
          const pos = computeTooltipPosition(mx, my, tooltip, container);
          tooltip.style('left', `${pos.left}px`).style('top', `${pos.top}px`);
        })
        .on('mouseleave', function () {
          if (chartRef.current?.isPinned()) return;
          d3.select(this)
            .select('.unofficial-eval-x')
            .attr('d', getOverlayXPath(OVERLAY_X_SIZE))
            .attr('stroke-width', 2.5);
          tooltip.style('opacity', 0).style('display', 'none');
        })
        .on('click', (event, d) => {
          event.stopPropagation();
          const [mx, my] = d3.pointer(event, container);
          tooltip
            .html(tooltipContent(d, true, branchForRow(d)))
            .style('opacity', 1)
            .style('display', 'block')
            .style('pointer-events', 'auto');
          const pos = computeTooltipPosition(mx, my, tooltip, container);
          tooltip.style('left', `${pos.left}px`).style('top', `${pos.top}px`);
          chartRef.current?.pinTooltip(d, true);
        });
    },
    onZoom: (group, { newXScale, yScale: ys }) => {
      const xScale = newXScale as d3.ScaleLinear<number, number>;
      const yScale = ys as d3.ScaleBand<string>;
      group
        .selectAll<SVGGElement, EvaluationChartData>('.unofficial-eval-point')
        .attr('transform', (d) => `translate(${xScale(d.score)},${yCenter(yScale, d)})`);
    },
  };
}

export interface BuildEvalBarChartLayersArgs {
  chartData: EvaluationChartData[];
  errorData: EvaluationChartData[];
  unofficialChartData: EvaluationChartData[];
  unofficialErrorData: EvaluationChartData[];
  getCssColor: (color: string) => string;
  resolveColor: (configLabel: string, hwKey: string) => string;
  showLabels: boolean;
  runIndexByUrl: Record<string, number>;
  chartRef: React.RefObject<D3ChartHandle | null>;
  branchForRow: (datum: EvaluationChartData) => string | undefined;
  tooltipContent: (
    data: EvaluationChartData,
    isPinned: boolean,
    unofficialBranch?: string,
  ) => string;
}

/**
 * Builds the full ordered layer stack for the evaluation bar chart. Horizontal
 * bar chart: yScale = band (config labels), xScale = linear (scores). Includes
 * both the official and unofficial-run overlay layers.
 */
export function buildEvalBarChartLayers({
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
  tooltipContent,
}: BuildEvalBarChartLayersArgs): LayerConfig<EvaluationChartData>[] {
  return [
    errorBarsLayer(errorData),
    meanPointsLayer(chartData, getCssColor, resolveColor),
    unofficialErrorBarsLayer(unofficialErrorData, runIndexByUrl),
    scoreLabelsLayer(chartData, showLabels),
    unofficialOverlayLayer({
      unofficialChartData,
      runIndexByUrl,
      showLabels,
      chartRef,
      branchForRow,
      tooltipContent,
    }),
  ];
}
