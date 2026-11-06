'use client';

import { withTotalChipQualifier } from '@/lib/benchmarks/chip-basis';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { HardwareConfig } from '@/components/inference/types';
import {
  ChartPointDetails,
  type ChartPointDetailsLink,
  type ChartPointDetailsMetric,
  type ChartPointDetailsRow,
} from '@/components/ui/chart-point-details';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { twoRowYAxisLabels } from '@/lib/d3-chart/axis-labels';
import { readableTextContrast } from '@/lib/d3-chart/contrast-colors';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  CustomLayerConfig,
  D3ChartHandle,
  HorizontalBarLayerConfig,
  RenderContext,
} from '@/lib/d3-chart/D3Chart/types';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { computeLeftMargin, measureTextWidth } from '@/lib/d3-chart/dynamic-margins';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { setAttrIfChanged, widthTickCount } from '@/lib/d3-chart/chart-update';
import type { ChartLayout, ContinuousScale } from '@/lib/d3-chart/types';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import type { Locale } from '@/lib/i18n/i18n';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { getDisplayLabel } from '@/lib/shared/utils';

import type {
  BarMetric,
  CalculatorMode,
  CostProvider,
  CostType,
  InterpolatedResult,
} from './types';

const OVERLAY_STRINGS = {
  en: {
    unofficialRun: 'Unofficial run',
    branch: 'Branch',
    viewRun: 'View workflow run',
    viewRaw: 'View raw result on GitHub',
    clamped: 'Outside measured range — showing nearest data point',
    parallelism: 'Parallelism',
    cost: 'Cost',
    concurrency: 'Concurrency',
    precision: 'Precision',
    disaggregated: 'Disaggregated',
    yes: 'Yes',
    dpaTrue: 'True',
  },
  zh: {
    unofficialRun: '非官方运行',
    branch: '分支',
    viewRun: '查看工作流运行',
    viewRaw: '在 GitHub 查看原始结果',
    clamped: '超出实测范围——显示最接近的数据点',
    parallelism: '并行策略',
    cost: '成本',
    concurrency: '并发数',
    precision: '精度',
    disaggregated: '分离式',
    yes: '是',
    dpaTrue: '是',
  },
} as const;

interface ThroughputBarChartProps {
  results: InterpolatedResult[];
  hardwareConfig: HardwareConfig;
  mode: CalculatorMode;
  targetValue: number;
  barMetric: BarMetric;
  costType: CostType;
  /** Input/Output values divided by every deployment chip; the axis label says so. */
  totalChipBasis?: boolean;
  runUrl?: string;
  selectedBars: Set<string>;
  onBarSelect: (resultKey: string) => void;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
  footer?: React.ReactNode;
  colorResolver?: (hwKey: string) => string;
}

import { getThroughputForType, getTpPerMwForType } from './power-ranking';
export {
  getComparableTpPerMwForType,
  getThroughputForType,
  getTpPerMwForType,
} from './power-ranking';

export function getMetricValue(
  d: InterpolatedResult,
  barMetric: BarMetric,
  costType: CostType,
): number {
  switch (barMetric) {
    case 'power': {
      return getTpPerMwForType(d, costType);
    }
    case 'cost': {
      return getCostForType(d, costType);
    }
    default: {
      return getThroughputForType(d, costType);
    }
  }
}

export function getMetricLabel(
  barMetric: BarMetric,
  mode: CalculatorMode,
  costType: CostType,
  locale: Locale = 'en',
): string {
  if (locale === 'zh') {
    const tokenTypePrefix = costType === 'input' ? '输入' : costType === 'output' ? '输出' : '';
    switch (barMetric) {
      case 'power': {
        return `每全电源配置兆瓦${tokenTypePrefix} token 吞吐量 (tok/s/MW)`;
      }
      case 'cost': {
        return `成本 ($${getCostTypeLabel(costType)})`;
      }
      default: {
        return mode === 'interactivity_to_throughput'
          ? `每芯片${tokenTypePrefix}吞吐量 (tok/s/chip)`
          : '交互性 (tok/s/user)';
      }
    }
  }
  const tokenTypePrefix = costType === 'input' ? 'Input ' : costType === 'output' ? 'Output ' : '';
  switch (barMetric) {
    case 'power': {
      return `${tokenTypePrefix}Tokens per Provisioned All-in Megawatt (tok/s/MW)`;
    }
    case 'cost': {
      return `Cost ($${getCostTypeLabel(costType)})`;
    }
    default: {
      return mode === 'interactivity_to_throughput'
        ? `${tokenTypePrefix}Throughput per Chip (tok/s/chip)`
        : 'Interactivity (tok/s/user)';
    }
  }
}

const fixed = (value: number, digits: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const formatSig3 = d3.format('.3~r');
const formatSig3Si = d3.format('.3~s');
const compact = (value: number) =>
  Math.abs(value) >= 1000 ? formatSig3Si(value) : formatSig3(value);
const xTickFormat = (value: d3.AxisDomain) => compact(Number(value));

export function getValueLabel(
  d: InterpolatedResult,
  barMetric: BarMetric,
  mode: CalculatorMode,
  costType: CostType,
): string {
  switch (barMetric) {
    case 'power': {
      return `${compact(getTpPerMwForType(d, costType))} tok/s/MW`;
    }
    case 'cost': {
      return `$${getCostForType(d, costType).toFixed(3)}${getCostTypeLabel(costType)}`;
    }
    default: {
      return mode === 'interactivity_to_throughput'
        ? `${compact(getThroughputForType(d, costType))} tok/s/chip`
        : `${compact(getThroughputForType(d, costType))} tok/s/user`;
    }
  }
}

export function getCostProviderLabel(provider: CostProvider, locale: Locale = 'en'): string {
  if (locale === 'zh') {
    switch (provider) {
      case 'costh': {
        return '自有设备 · 超大规模云厂商批量采购';
      }
      case 'costr': {
        return '租赁设备 · 3 年承诺';
      }
    }
  }
  switch (provider) {
    case 'costh': {
      return 'Owning at large hyperscaler volume';
    }
    case 'costr': {
      return 'Rent – 3-year commit';
    }
  }
}

export interface ChartTitleParts {
  title: string;
  qualifier: string;
}

export function getChartTitle(
  barMetric: BarMetric,
  mode: CalculatorMode,
  targetValue: number,
  costType: CostType,
  costProvider?: CostProvider,
  interactivityPercentile?: string,
): ChartTitleParts {
  const percentilePrefix = interactivityPercentile
    ? `${interactivityPercentile.toUpperCase()} `
    : '';
  const qualifier =
    mode === 'interactivity_to_throughput'
      ? `at ${targetValue} tok/s/user ${percentilePrefix}interactivity`
      : `at ${targetValue} tok/s/chip throughput`;

  const tokenTypeLabel =
    costType === 'input' ? 'Input' : costType === 'output' ? 'Output' : 'Total';

  switch (barMetric) {
    case 'power': {
      return { title: `${tokenTypeLabel} tokens per provisioned all-in megawatt`, qualifier };
    }
    case 'cost': {
      const providerLabel = getCostProviderLabel(costProvider || 'costh');
      return {
        title: `Cost per million ${tokenTypeLabel.toLowerCase()} tokens (${providerLabel})`,
        qualifier,
      };
    }
    default: {
      return {
        title:
          mode === 'interactivity_to_throughput'
            ? `${tokenTypeLabel} token throughput per chip`
            : 'Interactivity',
        qualifier,
      };
    }
  }
}

export function getSortedResults(
  results: InterpolatedResult[],
  barMetric: BarMetric,
  costType: CostType,
): InterpolatedResult[] {
  const sorted = [...results];
  switch (barMetric) {
    case 'power': {
      sorted.sort((a, b) => getTpPerMwForType(b, costType) - getTpPerMwForType(a, costType));
      return sorted;
    }
    case 'cost': {
      sorted.sort((a, b) => getCostForType(a, costType) - getCostForType(b, costType));
      return sorted;
    }
    default: {
      sorted.sort((a, b) => getThroughputForType(b, costType) - getThroughputForType(a, costType));
      return sorted;
    }
  }
}

export function getCostForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return d.costInput;
  if (costType === 'output') return d.costOutput;
  return d.cost;
}

export function getCostTypeLabel(costType: CostType): string {
  if (costType === 'input') return '/M input tok';
  if (costType === 'output') return '/M output tok';
  return '/M tok';
}

export function getResultLabel(d: InterpolatedResult, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[d.hwKey] || getHardwareConfig(d.hwKey);
  const parts: string[] = [];
  const framework = config?.suffix?.replace(/^\((?<inner>.*)\)$/u, '$<inner>');
  if (framework) parts.push(framework);
  if (d.precision) parts.push(d.precision.toUpperCase());
  if (d.isOverlay) parts.push(`✕ ${d.runLabel ?? 'unofficial'}`);
  const baseName = config?.label ?? d.hwKey;
  return parts.length > 0 ? `${baseName} (${parts.join(' · ')})` : baseName;
}

export interface ThroughputPointDetails {
  title: string;
  note?: string;
  subtitle: string;
  warning?: string;
  metrics: ChartPointDetailsMetric[];
  summary: string;
  rows: ChartPointDetailsRow[];
  links: ChartPointDetailsLink<'run'>[];
}

function parallelismLabel(d: InterpolatedResult, dpaValue: string): string {
  const nearest = d.nearestPoints[0];
  const tp = nearest?.tp ?? 0;
  const ep = nearest?.ep;
  const dpa = nearest?.dp_attention ? ` · DPA ${dpaValue}` : '';
  if (ep !== null && ep !== undefined && ep > 1 && tp === ep) {
    return `${nearest?.dp_attention ? 'DEP' : 'TEP'}${tp}`;
  }
  if (ep !== null && ep !== undefined && ep > 1) return `TP ${tp} · EP ${ep}${dpa}`;
  return `TP ${tp}${dpa}`;
}

export function getThroughputPointDetails(
  d: InterpolatedResult,
  hardwareConfig: HardwareConfig,
  mode: CalculatorMode,
  barMetric: BarMetric,
  costType: CostType,
  runUrl?: string,
  locale: Locale = 'en',
): ThroughputPointDetails {
  const t = OVERLAY_STRINGS[locale];
  const config = hardwareConfig[d.hwKey] || getHardwareConfig(d.hwKey);
  const costLabel = getCostTypeLabel(costType);
  const precision = d.nearestPoints[0]?.precision ?? d.precision ?? '';
  const throughput = {
    value: fixed(getThroughputForType(d, costType), 1),
    label: mode === 'interactivity_to_throughput' ? 'tok/s/chip' : 'tok/s/user',
  };
  const cost = {
    value: `$${getCostForType(d, costType).toFixed(3)}`,
    label: costLabel,
  };
  const power = {
    value: fixed(getTpPerMwForType(d, costType), 0),
    label: 'tok/s/MW',
  };
  const parallelism = parallelismLabel(d, t.dpaTrue);
  const effectiveRunUrl = d.isOverlay ? d.runUrl : runUrl;
  return {
    title: config ? getDisplayLabel(config) : d.hwKey,
    subtitle: precision.toUpperCase(),
    warning: d.isOverlay ? t.unofficialRun : undefined,
    metrics:
      barMetric === 'cost'
        ? [cost, throughput]
        : barMetric === 'power'
          ? [power, cost]
          : [throughput, cost],
    summary: [parallelism, `${t.concurrency} ~${d.concurrency}`].join(' · '),
    rows: [
      ...(d.isOverlay && d.runLabel ? [{ label: t.branch, value: d.runLabel, wide: true }] : []),
      { label: t.cost, value: `${cost.value}${costLabel}` },
      { label: 'tok/s/MW', value: power.value },
      { label: t.concurrency, value: `~${d.concurrency}` },
      ...(precision ? [{ label: t.precision, value: precision.toUpperCase() }] : []),
      { label: t.parallelism, value: parallelism },
      ...(d.nearestPoints[0]?.disagg ? [{ label: t.disaggregated, value: t.yes }] : []),
    ],
    links: effectiveRunUrl
      ? [
          {
            action: 'run',
            label: d.isOverlay ? t.viewRun : t.viewRaw,
            href: effectiveRunUrl,
            external: true,
          },
        ]
      : [],
    note: d.clamped ? t.clamped : undefined,
  };
}

export function generateTooltipHTML(details: ThroughputPointDetails, color: string): string {
  return chartHoverCard(
    {
      title: details.title,
      subtitle: details.subtitle,
      color,
      metrics: details.metrics,
      summary: details.note ? `${details.summary} · ${details.note}` : details.summary,
      warning: details.warning,
    },
    { border: details.warning ? '2px solid #dc2626' : undefined },
  );
}

const getLabel = getResultLabel;

function getColor(): string {
  return 'var(--foreground)';
}

const BAR_OPACITY = 0.85;
const MIN_INSIDE_LABEL_CONTRAST = 5.5;
const MIN_CLAMPED_LABEL_CONTRAST = 4.5;
const TOP_AXIS_BAND_PX = 28;

function renderTopAxis(
  layout: ChartLayout,
  xScale: d3.ScaleLinear<number, number>,
  tickCount: number,
) {
  let axis = layout.g.select<SVGGElement>('.x-axis-top');
  if (axis.empty()) {
    axis = layout.g.append('g').attr('class', 'x-axis-top').style('pointer-events', 'none');
    axis
      .append('rect')
      .attr('class', 'x-axis-top-band')
      .attr('fill', 'var(--card)')
      .attr('opacity', 0);
    axis.append('g').attr('class', 'x-axis-top-ticks');
  }
  const count = widthTickCount(layout.width, tickCount);
  axis.attr('data-plot-top', layout.margin.top).attr('data-plot-height', layout.height);
  axis
    .select('.x-axis-top-band')
    .attr('x', -layout.margin.left)
    .attr('y', -TOP_AXIS_BAND_PX)
    .attr('width', layout.width + layout.margin.left + layout.margin.right)
    .attr('height', TOP_AXIS_BAND_PX);
  axis
    .select<SVGGElement>('.x-axis-top-ticks')
    .call(d3.axisTop(xScale).ticks(count).tickFormat(xTickFormat).tickSize(0).tickPadding(8))
    .call((ticks) => ticks.select('.domain').remove());
}

function stickTopAxis(svg: SVGSVGElement | null | undefined) {
  const axis = svg?.querySelector<SVGGElement>('.x-axis-top');
  if (!svg || !axis) return;
  const headerBottom =
    document.querySelector('.vt-site-header')?.getBoundingClientRect().bottom ?? 0;
  const plotTop = svg.getBoundingClientRect().top + Number(axis.dataset.plotTop);
  const maxOffset = Math.max(0, Number(axis.dataset.plotHeight) - TOP_AXIS_BAND_PX);
  const offset = Math.min(maxOffset, Math.max(0, headerBottom + TOP_AXIS_BAND_PX - plotTop));
  setAttrIfChanged(axis, 'transform', `translate(0,${offset})`);
  const band = axis.querySelector('.x-axis-top-band');
  if (band) setAttrIfChanged(band, 'opacity', offset > 0 ? '1' : '0');
}

function positionLabelPairs(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleLinear<number, number>,
  chartWidth: number,
  barMetric: BarMetric,
  costType: CostType,
  getBarColor: (d: InterpolatedResult) => string,
) {
  const valueLabels = group.selectAll<SVGTextElement, InterpolatedResult>('.value-label');
  const overlayLabels = group.selectAll<SVGTextElement, InterpolatedResult>('.overlay-label');

  const maxWidths = new Map<string, number>();
  const insideText = new Map<string, { color: string; ratio: number }>();
  valueLabels.each(function (d) {
    const text = d3.select(this).text();
    maxWidths.set(d.resultKey, measureTextWidth(text, '600 12px sans-serif'));
    insideText.set(d.resultKey, readableTextContrast(getBarColor(d), BAR_OPACITY));
  });
  overlayLabels.each(function (d) {
    const text = d3.select(this).text();
    const prev = maxWidths.get(d.resultKey) ?? 0;
    maxWidths.set(d.resultKey, Math.max(prev, measureTextWidth(text, '500 12px sans-serif')));
  });

  const apply = (sel: d3.Selection<SVGTextElement, InterpolatedResult, SVGGElement, unknown>) => {
    sel.each(function (d) {
      const barEnd = xScale(getMetricValue(d, barMetric, costType));
      const maxW = maxWidths.get(d.resultKey) ?? 0;
      const inside = insideText.get(d.resultKey);
      const outsideX = Math.min(barEnd + 6, Math.max(0, chartWidth - maxW - 2));
      const minRatio =
        outsideX < barEnd + 6 ? MIN_CLAMPED_LABEL_CONTRAST : MIN_INSIDE_LABEL_CONTRAST;
      const fitsInside = barEnd > maxW + 24 && (inside?.ratio ?? 0) >= minRatio;
      const clamped = !fitsInside && outsideX < barEnd + 6;
      const fill = fitsInside && inside ? inside.color : 'var(--foreground)';
      const label = d3
        .select(this)
        .attr('x', fitsInside ? barEnd - 10 : outsideX)
        .attr('text-anchor', fitsInside ? 'end' : 'start')
        .style('fill', fill)
        .attr('stroke', null)
        .attr('visibility', barEnd < 0 || barEnd > chartWidth ? 'hidden' : 'visible');
      if (clamped) {
        label
          .style('stroke', 'var(--background)')
          .style('stroke-width', '3px')
          .style('stroke-linejoin', 'round')
          .style('paint-order', 'stroke');
      } else {
        label
          .style('stroke', null)
          .style('stroke-width', null)
          .style('stroke-linejoin', null)
          .style('paint-order', null);
      }
    });
  };

  apply(valueLabels);
  apply(overlayLabels);
}

export default function ThroughputBarChart({
  results,
  hardwareConfig,
  mode,
  barMetric,
  costType,
  totalChipBasis = false,
  runUrl,
  selectedBars,
  onBarSelect,
  legendElement,
  caption,
  footer,
  colorResolver,
}: ThroughputBarChartProps) {
  const chartRef = useRef<D3ChartHandle>(null);
  const locale = useLocale();

  const resolveBarColor = useCallback(
    (datum: InterpolatedResult) =>
      datum.isOverlay
        ? overlayRunColor(datum.runIndex ?? 0)
        : colorResolver
          ? colorResolver(datum.hwKey)
          : getColor(),
    [colorResolver],
  );

  const hoveredBarXRef = useRef(0);
  const selectedBarsRef = useRef(selectedBars);
  selectedBarsRef.current = selectedBars;

  const onBarSelectRef = useRef(onBarSelect);
  onBarSelectRef.current = onBarSelect;

  const sortedResults = useMemo(
    () => getSortedResults(results, barMetric, costType),
    [results, barMetric, costType],
  );

  const dynamicHeight = useMemo(() => {
    const barCount = sortedResults.length || 1;
    return Math.max(600, barCount * 55 + 120);
  }, [sortedResults.length]);

  const dynamicMargin = useMemo(() => {
    if (sortedResults.length === 0) {
      return { top: TOP_AXIS_BAND_PX + 4, right: 32, bottom: 60, left: 80 };
    }
    const labels = sortedResults.map((r) => getLabel(r, hardwareConfig));
    return {
      top: TOP_AXIS_BAND_PX + 4,
      right: 32,
      bottom: 60,
      left: computeLeftMargin(labels, { split: 'parens', minMargin: 80, padding: 12 }),
    };
  }, [sortedResults, hardwareConfig]);

  const maxBarValue = useMemo(() => {
    const max = d3.max(sortedResults, (d) => getMetricValue(d, barMetric, costType)) || 1;
    return max * 1.02;
  }, [sortedResults, barMetric, costType]);

  const yDomain = useMemo(
    () => [...sortedResults].toReversed().map((r) => r.resultKey),
    [sortedResults],
  );

  const dataIdentity = useMemo(
    () => JSON.stringify(sortedResults.map((datum) => datum.resultKey).toSorted()),
    [sortedResults],
  );
  const metricIdentity = useMemo(
    () =>
      JSON.stringify({
        bars: sortedResults.map((datum) =>
          JSON.stringify([
            datum.resultKey,
            getMetricValue(datum, barMetric, costType),
            getValueLabel(datum, barMetric, mode, costType),
            getCostForType(datum, costType),
            getThroughputForType(datum, costType),
            getLabel(datum, hardwareConfig),
          ]),
        ),
        barMetric,
        costType,
        mode,
        maxBarValue,
        yDomain,
      }),
    [barMetric, costType, hardwareConfig, maxBarValue, mode, sortedResults, yDomain],
  );
  const paletteIdentity = useMemo(
    () =>
      JSON.stringify(
        sortedResults
          .map((datum) => JSON.stringify([datum.resultKey, resolveBarColor(datum)]))
          .toSorted(),
      ),
    [resolveBarColor, sortedResults],
  );
  const xScaleConfig = useMemo(
    () => ({ type: 'linear' as const, domain: [0, maxBarValue] as [number, number] }),
    [maxBarValue],
  );
  const yScaleConfig = useMemo(
    () => ({ type: 'band' as const, domain: yDomain, padding: 0.3 }),
    [yDomain],
  );
  const zoomConfig = useMemo(
    () => ({
      enabled: true,
      axes: 'x' as const,
      scaleExtent: [0.1, 1] as [number, number],
      rescaleX: (xScale: ContinuousScale, transform: d3.ZoomTransform) =>
        xScale.copy().domain([0, xScale.domain()[1] / transform.k]) as ContinuousScale,
      customTransformStorage: (transform: d3.ZoomTransform) => d3.zoomIdentity.scale(transform.k),
    }),
    [maxBarValue],
  );

  const isMobileViewport = useIsMobileViewport();
  const xTickCount = isMobileViewport ? 4 : 6;

  const layers = useMemo(() => {
    const barLayer: HorizontalBarLayerConfig<InterpolatedResult> = {
      type: 'horizontalBar',
      key: 'bars',
      data: sortedResults,
      config: {
        getY: (d) => d.resultKey,
        getX: (d) => getMetricValue(d, barMetric, costType),
        getColor: (d) => resolveBarColor(d),
        rx: 4,
        opacity: BAR_OPACITY,
        keyFn: (d) => d.resultKey,
      },
    };

    const labelLayer: CustomLayerConfig = {
      type: 'custom',
      key: 'bar-labels',
      displayIdentity: paletteIdentity,
      render: (zoomGroup, ctx) => {
        const xScale = ctx.xScale as d3.ScaleLinear<number, number>;
        const yScale = ctx.yScale as d3.ScaleBand<string>;

        zoomGroup
          .selectAll<SVGTextElement, InterpolatedResult>('.value-label')
          .data(sortedResults, (d) => d.resultKey)
          .join('text')
          .attr('class', 'value-label')
          .attr('y', (d) => (yScale(d.resultKey) ?? 0) + yScale.bandwidth() / 2 - 7)
          .attr('dy', '0.35em')
          .attr('font-size', '12px')
          .attr('font-weight', '600')
          .style('fill', 'var(--foreground)')
          .style('pointer-events', 'none')
          .text((d) => getValueLabel(d, barMetric, mode, costType));

        zoomGroup
          .selectAll<SVGTextElement, InterpolatedResult>('.overlay-label')
          .data(sortedResults, (d) => d.resultKey)
          .join('text')
          .attr('class', 'overlay-label')
          .attr('y', (d) => (yScale(d.resultKey) ?? 0) + yScale.bandwidth() / 2 + 8)
          .attr('dy', '0.35em')
          .attr('font-size', '12px')
          .attr('font-weight', '500')
          .style('fill', 'var(--muted-foreground)')
          .style('pointer-events', 'none')
          .text((d) => {
            if (barMetric === 'cost') {
              return mode === 'interactivity_to_throughput'
                ? `${compact(getThroughputForType(d, costType))} tok/s/chip`
                : `${compact(getThroughputForType(d, costType))} tok/s/user`;
            }
            const costLbl = getCostTypeLabel(costType);
            return `$${getCostForType(d, costType).toFixed(3)}${costLbl}`;
          });

        const barColor = (d: InterpolatedResult) => resolveBarColor(d);
        positionLabelPairs(zoomGroup, xScale, ctx.width, barMetric, costType, barColor);
        renderTopAxis(
          ctx.layout,
          (ctx.renderedXScale ?? xScale) as d3.ScaleLinear<number, number>,
          xTickCount,
        );
      },
      onDisplayUpdate: (zoomGroup, ctx) => {
        const baseXScale = ctx.xScale as d3.ScaleLinear<number, number>;
        const svgNode = ctx.layout.svg.node();
        const transform = svgNode ? d3.zoomTransform(svgNode) : d3.zoomIdentity;
        const currentXScale = baseXScale.copy().domain([0, baseXScale.domain()[1] / transform.k]);
        positionLabelPairs(
          zoomGroup,
          currentXScale,
          ctx.width,
          barMetric,
          costType,
          resolveBarColor,
        );
        renderTopAxis(ctx.layout, currentXScale, xTickCount);
      },
      onZoom: (zoomGroup, ctx) => {
        const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
        const barColor = (d: InterpolatedResult) => resolveBarColor(d);
        positionLabelPairs(zoomGroup, newXScale, ctx.width, barMetric, costType, barColor);
        renderTopAxis(ctx.layout, newXScale, xTickCount);
      },
    };

    return [barLayer, labelLayer];
  }, [
    sortedResults,
    barMetric,
    costType,
    mode,
    maxBarValue,
    paletteIdentity,
    resolveBarColor,
    xTickCount,
  ]);

  const tooltipStateRef = useRef({
    hardwareConfig,
    mode,
    barMetric,
    costType,
    runUrl,
    locale,
    resolveBarColor,
  });
  tooltipStateRef.current = {
    hardwareConfig,
    mode,
    barMetric,
    costType,
    runUrl,
    locale,
    resolveBarColor,
  };

  const tooltip = useMemo(() => {
    const pointDetails = (datum: InterpolatedResult) => {
      const state = tooltipStateRef.current;
      return getThroughputPointDetails(
        datum,
        state.hardwareConfig,
        state.mode,
        state.barMetric,
        state.costType,
        state.runUrl,
        state.locale,
      );
    };
    return {
      rulerType: 'vertical' as const,
      content: (datum: InterpolatedResult) =>
        generateTooltipHTML(pointDetails(datum), tooltipStateRef.current.resolveBarColor(datum)),
      details: (datum: InterpolatedResult, _isOverlay: boolean, close: () => void) => {
        const { note, summary: _summary, ...details } = pointDetails(datum);
        return (
          <ChartPointDetails
            {...details}
            date={note}
            color={tooltipStateRef.current.resolveBarColor(datum)}
            onClose={close}
            onAction={(_action, event) => event.stopPropagation()}
          />
        );
      },
      getRulerX: () => hoveredBarXRef.current,
      getRulerY: (datum: InterpolatedResult, yScale: unknown) => {
        const band = yScale as d3.ScaleBand<string>;
        return (band(datum.resultKey) ?? 0) + band.bandwidth() / 2;
      },
      onHoverStart: (
        selection: d3.Selection<SVGRectElement, InterpolatedResult, SVGGElement, unknown>,
      ) => {
        hoveredBarXRef.current = Number.parseFloat(selection.attr('width') || '0');
        const hasSelection = selectedBarsRef.current.size > 0;
        if (!hasSelection) {
          selection
            .attr('opacity', 1)
            .attr('stroke', 'var(--foreground)')
            .attr('stroke-width', 1.5);
        }
      },
      onHoverEnd: (
        selection: d3.Selection<SVGRectElement, InterpolatedResult, SVGGElement, unknown>,
        datum: InterpolatedResult,
      ) => {
        const hasSelection = selectedBarsRef.current.size > 0;
        const isSelected = selectedBarsRef.current.has(datum.resultKey);
        selection
          .attr('opacity', hasSelection ? (isSelected ? 0.95 : 0.15) : 0.85)
          .attr('stroke', 'none');
      },
      onPointClick: (datum: InterpolatedResult) => {
        onBarSelectRef.current(datum.resultKey);
        track('calculator_bar_selected', { gpu: datum.hwKey, precision: datum.precision });
      },
      attachToLayer: 0,
    };
  }, []);

  const yAxisConfig = useMemo(() => {
    const labelMap = new Map(sortedResults.map((r) => [r.resultKey, getLabel(r, hardwareConfig)]));
    return {
      tickFormat: (d: d3.AxisDomain) => labelMap.get(String(d)) ?? String(d),
      customize: twoRowYAxisLabels({ split: 'parens' }),
    };
  }, [sortedResults, hardwareConfig]);

  const xAxisConfig = useMemo(
    () => ({ tickCount: xTickCount, tickFormat: xTickFormat }),
    [xTickCount],
  );

  const renderDecorations = useMemo(
    () => (ctx: RenderContext) => {
      const { layout, width, height } = ctx;
      let xLabelEl = layout.g.select<SVGTextElement>('.x-axis-label-calc');
      if (xLabelEl.empty()) {
        xLabelEl = layout.g.append('text').attr('class', 'x-axis-label x-axis-label-calc');
      }
      xLabelEl
        .attr('x', width / 2)
        .attr('y', height + 45)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .style('fill', 'var(--muted-foreground)')
        .text(
          totalChipBasis
            ? (withTotalChipQualifier(getMetricLabel(barMetric, mode, costType, locale), locale) ??
                '')
            : getMetricLabel(barMetric, mode, costType, locale),
        );

      const renderGroup = layout.g;
      applySelectionOpacities(renderGroup, selectedBarsRef.current);
    },
    [barMetric, mode, costType, locale, totalChipBasis],
  );
  const onRender = useCallback(
    (ctx: RenderContext) => {
      renderDecorations(ctx);
      stickTopAxis(ctx.layout.svg.node());
    },
    [renderDecorations],
  );
  const onExportRender = useCallback(
    (ctx: RenderContext) => {
      renderDecorations(ctx);
      const topAxis = ctx.layout.g.select('.x-axis-top').attr('transform', null);
      topAxis.select('.x-axis-top-band').attr('opacity', 0);
    },
    [renderDecorations],
  );

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        stickTopAxis(chartRef.current?.getSvgElement());
      });
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  useEffect(() => {
    const svgEl = chartRef.current?.getSvgElement();
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    applySelectionOpacities(svg as any, selectedBars);
  }, [selectedBars]);

  if (results.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-64 text-muted-foreground"
        data-testid="calculator-no-data"
      >
        {locale === 'zh'
          ? '当前选择无可用数据。请尝试调整模型、序列长度或精度。'
          : 'No data available for the current selection. Try adjusting the model, sequence, or precision.'}
      </div>
    );
  }

  return (
    <D3Chart<InterpolatedResult>
      ref={chartRef}
      chartId="calculator-chart"
      data={sortedResults}
      dataIdentity={dataIdentity}
      metricIdentity={metricIdentity}
      displayIdentity={paletteIdentity}
      height={dynamicHeight}
      margin={dynamicMargin}
      watermark={getChartWatermark()}
      testId="calculator-bar-chart"
      grabCursor
      clipContent={false}
      xScale={xScaleConfig}
      yScale={yScaleConfig}
      xAxis={xAxisConfig}
      yAxis={yAxisConfig}
      layers={layers}
      zoom={zoomConfig}
      instructions={
        locale === 'zh'
          ? 'Shift+滚轮横向缩放 · 拖动平移 · 双击重置'
          : 'Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset'
      }
      tooltip={tooltip}
      onRender={onRender}
      onExportRender={onExportRender}
      legendElement={legendElement}
      caption={caption}
      footer={footer}
    />
  );
}

function applySelectionOpacities(
  group: d3.Selection<any, unknown, null, undefined>,
  selectedBars: Set<string>,
): void {
  const hasSelection = selectedBars.size > 0;

  group.selectAll<SVGRectElement, InterpolatedResult>('.bar').attr('opacity', (d) => {
    if (!hasSelection) return 0.85;
    return selectedBars.has(d.resultKey) ? 0.95 : 0.15;
  });

  group.selectAll<SVGTextElement, InterpolatedResult>('.value-label').attr('opacity', (d) => {
    if (!hasSelection) return 1;
    return selectedBars.has(d.resultKey) ? 1 : 0.25;
  });

  group.selectAll<SVGTextElement, InterpolatedResult>('.overlay-label').attr('opacity', (d) => {
    if (!hasSelection) return 1;
    return selectedBars.has(d.resultKey) ? 1 : 0.25;
  });
}
