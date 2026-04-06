'use client';

import { track } from '@/lib/analytics';
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';

import { getModelSortIndex } from '@/lib/constants';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { D3ChartHandle, LayerConfig } from '@/lib/d3-chart/D3Chart';
import { renderErrorBars } from '@/lib/d3-chart/layers/error-bars';
import { renderPoints, updatePointsOnZoom } from '@/lib/d3-chart/layers/points';
import { computeTooltipPosition } from '@/lib/d3-chart/layers/scatter-points';

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
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { useThemeColors } from '@/hooks/useThemeColors';
import { computeToggle } from '@/hooks/useTogglableSet';

const CHART_MARGIN = { top: 24, right: 24, bottom: 52, left: 160 };
const OVERLAY_X_SIZE = 6;
const OVERLAY_X_HOVER_SIZE = 8;
const OVERLAY_HIT_RADIUS = 10;
const OVERLAY_ERROR_STROKE_WIDTH = 1.5;

const getOverlayXPath = (size: number) =>
  `M ${-size},${-size} L ${size},${size} M ${-size},${size} L ${size},${-size}`;

const runLinkHTML = (runUrl?: string) =>
  runUrl
    ? `<div style="font-size: 11px; margin-top: 4px;">
        <a href="${runUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--muted-foreground); text-decoration: underline; cursor: pointer;">GitHub Actions Run</a>
      </div>`
    : '';

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
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Branch:</strong> ${unofficialBranch}</div>`
          : ''
      }
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
    activeOverlayHwTypes,
    setActiveOverlayHwTypes,
    allOverlayHwTypes,
    resetOverlayHwTypes,
    localOfficialOverride,
    setLocalOfficialOverride,
  } = useUnofficialRun();
  const chartRef = useRef<D3ChartHandle>(null);

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

  const unofficialConfigurations = useMemo(() => {
    const configMap = new Map<string, { hwKey: string; configLabel: string }>();
    unofficialChartData.forEach((data) => {
      if (!configMap.has(data.configLabel)) {
        configMap.set(data.configLabel, {
          hwKey: String(data.hwKey),
          configLabel: data.configLabel,
        });
      }
    });
    return Array.from(configMap.values()).sort(
      (a, b) =>
        getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey) ||
        a.hwKey.localeCompare(b.hwKey) ||
        a.configLabel.localeCompare(b.configLabel),
    );
  }, [unofficialChartData]);

  const yLabels = useMemo(() => {
    const labels = new Set<string>();
    [...chartData, ...unofficialChartData].forEach((item) => labels.add(item.configLabel));
    return Array.from(labels);
  }, [chartData, unofficialChartData]);

  const sortedConfigLabels = useMemo(
    () => [...configurations, ...unofficialConfigurations].map((c) => c.configLabel),
    [configurations, unofficialConfigurations],
  );
  const activeHwKeys = useMemo(
    () => [
      ...configurations.filter((c) => effectiveOfficialHardware.has(c.hwKey)).map((c) => c.hwKey),
      ...unofficialConfigurations
        .filter((c) => activeOverlayHwTypes.has(c.hwKey))
        .map((c) => c.hwKey),
    ],
    [configurations, unofficialConfigurations, effectiveOfficialHardware, activeOverlayHwTypes],
  );
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    identifiers: sortedConfigLabels,
    activeKeys: activeHwKeys,
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
    () => [
      ...unofficialConfigurations.map(({ hwKey, configLabel }) => ({
        name: `✕ ${configLabel}`,
        label: `✕ ${configLabel.replaceAll('\n', ' ')}`,
        color: resolveColor(configLabel, hwKey),
        title: `UNOFFICIAL: ${configLabel.replaceAll('\n', ' ')}`,
        isHighlighted: true,
        hw: `overlay:${hwKey}`,
        isActive: true,
        onClick: () => {},
        tooltip: (
          <div className="font-normal text-xs">
            <div className="text-red-500 font-semibold">UNOFFICIAL RUN</div>
            <div>Branch: {unofficialRunInfo?.branch}</div>
            <div>Config: {configLabel.replaceAll('\n', ' ')}</div>
            {unofficialRunInfo?.url && (
              <a
                href={unofficialRunInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View workflow run
              </a>
            )}
          </div>
        ),
      })),
      ...configurations.map(({ hwKey, configLabel }) => ({
        name: configLabel,
        label: configLabel.replaceAll('\n', ' '),
        color: resolveColor(configLabel, hwKey),
        title: configLabel.replaceAll('\n', ' '),
        isHighlighted: highlightedConfigs.has(configLabel),
        hw: hwKey,
        isActive: effectiveOfficialHardware.has(hwKey),
        onClick: () => {
          handleToggleHardware(hwKey);
          track('evaluation_hw_toggled', { hw: hwKey });
        },
      })),
    ],
    [
      configurations,
      effectiveOfficialHardware,
      handleToggleHardware,
      highlightedConfigs,
      resolveColor,
      unofficialConfigurations,
      unofficialRunInfo,
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

  const chartHeight = Math.max(400, yLabels.length * 40 + CHART_MARGIN.top + CHART_MARGIN.bottom);

  const errorData = useMemo(
    () => chartData.filter((d) => d.errorMin !== undefined && d.errorMax !== undefined),
    [chartData],
  );
  const unofficialErrorData = useMemo(
    () => unofficialChartData.filter((d) => d.errorMin !== undefined && d.errorMax !== undefined),
    [unofficialChartData],
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
        key: 'unofficial-error-bars',
        render: (group, { xScale: xs, yScale: ys }) => {
          const xScale = xs as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          const capH = yScale.bandwidth() / 6;

          const bars = group
            .selectAll<SVGGElement, EvaluationChartData>('.unofficial-error-bar')
            .data(
              unofficialErrorData,
              (d) => `${d.configLabel}|${d.score}|${d.errorMin}|${d.errorMax}`,
            )
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

          bars
            .selectAll<SVGLineElement, EvaluationChartData>(
              '.unofficial-eb-stem, .unofficial-eb-cap-top, .unofficial-eb-cap-bot',
            )
            .attr('stroke', (d) => getCssColor(resolveColor(d.configLabel, String(d.hwKey))));

          bars
            .select('.unofficial-eb-stem')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2);

          bars
            .select('.unofficial-eb-cap-top')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMin!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);

          bars
            .select('.unofficial-eb-cap-bot')
            .attr('x1', (d) => xScale(d.errorMax!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
        },
        onZoom: (group, { newXScale, yScale: ys }) => {
          const xScale = newXScale as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          const capH = yScale.bandwidth() / 6;
          const bars = group.selectAll<SVGGElement, EvaluationChartData>('.unofficial-error-bar');

          bars
            .select('.unofficial-eb-stem')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2);

          bars
            .select('.unofficial-eb-cap-top')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMin!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);

          bars
            .select('.unofficial-eb-cap-bot')
            .attr('x1', (d) => xScale(d.errorMax!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
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
      {
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

          overlayPoints.attr(
            'transform',
            (d) =>
              `translate(${xScale(d.score)},${(yScale(d.configLabel) || 0) + yScale.bandwidth() / 2})`,
          );

          overlayPoints
            .select('.unofficial-eval-x')
            .attr('stroke', (d) => getCssColor(resolveColor(d.configLabel, String(d.hwKey))));

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
                .html(
                  generateEvaluationTooltipContent(
                    d,
                    false,
                    unofficialRunInfo?.branch ?? undefined,
                  ),
                );
            })
            .on('mousemove', function (event) {
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
            .on('click', function (event, d) {
              event.stopPropagation();
              const [mx, my] = d3.pointer(event, container);
              tooltip
                .html(
                  generateEvaluationTooltipContent(d, true, unofficialRunInfo?.branch ?? undefined),
                )
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
            .attr(
              'transform',
              (d) =>
                `translate(${xScale(d.score)},${(yScale(d.configLabel) || 0) + yScale.bandwidth() / 2})`,
            );
        },
      },
    ],
    [
      chartData,
      errorData,
      getCssColor,
      resolveColor,
      showLabels,
      unofficialChartData,
      unofficialErrorData,
      unofficialRunInfo,
    ],
  );

  // Show skeleton on first load
  const isInitializing = loading || (!selectedBenchmark && !error);
  if (isInitializing && chartData.length === 0 && unofficialChartData.length === 0) {
    return (
      <div className="p-3">
        <Skeleton className="h-7 w-2/4 mb-1" />
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (error || (chartData.length === 0 && unofficialChartData.length === 0)) {
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
      ref={chartRef}
      chartId="evaluation-chart"
      data={chartData}
      height={chartHeight}
      margin={CHART_MARGIN}
      watermark={isUnofficialRun ? 'unofficial' : 'logo'}
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
            effectiveOfficialHardware.size < hwTypesWithData.size ||
            activeOverlayHwTypes.size < allOverlayHwTypes.size
              ? [
                  {
                    id: 'eval-reset-filter',
                    label: 'Reset filter',
                    onClick: () => {
                      selectAllHwTypes();
                      setLocalOfficialOverride(null);
                      resetOverlayHwTypes();
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
