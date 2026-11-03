'use client';

import * as d3 from 'd3';
import React, { useCallback, useMemo, useRef } from 'react';

import type { HardwareConfig } from '@/components/inference/types';
import {
  ChartPointDetails,
  type ChartPointDetailsProps,
} from '@/components/ui/chart-point-details';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import type { CustomLayerConfig, D3ChartHandle, RenderContext } from '@/lib/d3-chart/D3Chart/types';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import type { Locale } from '@/lib/i18n/i18n';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { useLocale } from '@/lib/i18n/use-locale';
import { getDisplayLabel } from '@/lib/shared/utils';

import {
  formatCap,
  zhStatPhrase,
  type FirstTokenCell,
  type FirstTokenResult,
  type FirstTokenWinner,
} from './first-token-limits';
import { getCostTypeLabel } from './ThroughputBarChart';
import type { CostType } from './types';

export interface FirstTokenBar {
  key: string;
  cap: number;
  seriesKey: string;
  winner: FirstTokenWinner;
}

const STRINGS = {
  en: {
    capTick: (cap: number) => `≤${formatCap(cap)}s`,
    xTitle: (stat: string) => `Maximum ${stat} time to first token`,
    yTitle: (tokenType: string) => `$ per million ${tokenType} tokens`,
    noConfig: 'No measured config',
    instructions: 'Hover a bar for the configuration',
    lower: (pct: number) => `${pct}% lower`,
    only: (label: string) => `${label} only`,
    unofficialRun: 'Unofficial run',
    branch: 'Branch',
    cost: 'Cost',
    ttft: (stat: string) => `${stat} TTFT`,
    interactivity: (stat: string) => `${stat} interactivity`,
    concurrency: 'Concurrency',
    precision: 'Precision',
    parallelism: 'Parallelism',
    disaggregated: 'Disaggregated',
    yes: 'Yes',
    viewRun: 'View workflow run',
    viewOfficial: 'View raw result on GitHub',
  },
  zh: {
    capTick: (cap: number) => `≤${formatCap(cap)}s`,
    xTitle: (stat: string) => `${zhStatPhrase('首 token 延迟', stat)}上限`,
    yTitle: (tokenType: string) => `每百万${tokenType} token 成本（$）`,
    noConfig: '无实测配置',
    instructions: '悬停柱形查看配置',
    lower: (pct: number) => `低 ${pct}%`,
    only: (label: string) => `仅 ${label}`,
    unofficialRun: '非官方运行',
    branch: '分支',
    cost: '成本',
    ttft: (stat: string) => zhStatPhrase('TTFT', stat),
    interactivity: (stat: string) => zhStatPhrase('交互性', stat),
    concurrency: '并发数',
    precision: '精度',
    parallelism: '并行策略',
    disaggregated: '分离式',
    yes: '是',
    viewRun: '查看工作流运行',
    viewOfficial: '在 GitHub 查看原始结果',
  },
} as const;

const TOKEN_TYPE_WORD = {
  en: { total: 'total', input: 'input', output: 'output' },
  zh: { total: '总', input: '输入', output: '输出' },
} as const;

export function formatCost(cost: number): string {
  return `$${cost.toFixed(cost < 1 ? 3 : 2)}`;
}

function skuLabel(hwKey: string, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[hwKey] ?? getHardwareConfig(hwKey);
  return config?.label ?? hwKey;
}

export function configLabel(hwKey: string, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[hwKey] ?? getHardwareConfig(hwKey);
  return config ? getDisplayLabel(config) : hwKey;
}

export function barsFromCells(cells: readonly FirstTokenCell[]): FirstTokenBar[] {
  const bars: FirstTokenBar[] = [];
  for (const cell of cells) {
    if (!cell.winner) continue;
    bars.push({
      key: `${cell.cap}|${cell.series.key}`,
      cap: cell.cap,
      seriesKey: cell.series.key,
      winner: cell.winner,
    });
  }
  return bars;
}

function parallelismText(winner: FirstTokenWinner, dpaValue: string): string {
  const { tp, ep, dp_attention: dpa } = winner.point;
  if (ep !== null && ep !== undefined && ep > 1 && tp === ep) return `${dpa ? 'DEP' : 'TEP'}${tp}`;
  const dpaText = dpa ? ` · DPA ${dpaValue}` : '';
  if (ep !== null && ep !== undefined && ep > 1) return `TP ${tp} · EP ${ep}${dpaText}`;
  return `TP ${tp}${dpaText}`;
}

export function firstTokenPointDetails(
  bar: FirstTokenBar,
  options: {
    hardwareConfig: HardwareConfig;
    costType: CostType;
    ttftStat: string;
    interactivityStat: string;
    runInfoByIndex: Record<number, { branch: string; url: string }>;
    locale: Locale;
  },
): Omit<ChartPointDetailsProps<'run'>, 'onClose'> & { summary: string } {
  const { hardwareConfig, costType, ttftStat, interactivityStat, runInfoByIndex, locale } = options;
  const t = STRINGS[locale];
  const { winner } = bar;
  const isOverlay = winner.runIndex !== undefined;
  const runInfo = isOverlay ? runInfoByIndex[winner.runIndex!] : undefined;
  const runUrl = isOverlay ? runInfo?.url : winner.point.sourceRow?.run_url;
  const config = hardwareConfig[winner.hwKey] ?? getHardwareConfig(winner.hwKey);
  const cost = `${formatCost(winner.cost)}${getCostTypeLabel(costType)}`;
  const ttft = `${winner.ttft.toFixed(2)} s`;
  const interactivity = `${winner.interactivity.toFixed(1)} tok/s/user`;
  const parallelism = parallelismText(winner, locale === 'zh' ? t.yes : 'True');
  return {
    title: config?.label ?? winner.hwKey,
    subtitle: [
      config?.suffix?.replace(/^\((?<inner>.*)\)$/u, '$<inner>'),
      winner.precision.toUpperCase(),
    ]
      .filter(Boolean)
      .join(' · '),
    warning: isOverlay ? t.unofficialRun : undefined,
    metrics: [
      { value: formatCost(winner.cost), label: getCostTypeLabel(costType) },
      { value: winner.ttft.toFixed(2), label: `${t.ttft(ttftStat)} (s)` },
    ],
    summary: [interactivity, `${t.concurrency} ${winner.point.concurrency}`, parallelism].join(
      ' · ',
    ),
    rows: [
      ...(runInfo?.branch ? [{ label: t.branch, value: runInfo.branch, wide: true }] : []),
      { label: t.cost, value: cost },
      { label: t.ttft(ttftStat), value: ttft },
      { label: t.interactivity(interactivityStat), value: interactivity },
      { label: t.concurrency, value: String(winner.point.concurrency) },
      { label: t.precision, value: winner.precision.toUpperCase() },
      { label: t.parallelism, value: parallelism },
      ...(winner.point.disagg ? [{ label: t.disaggregated, value: t.yes }] : []),
    ],
    links: runUrl
      ? [
          {
            action: 'run',
            label: isOverlay ? t.viewRun : t.viewOfficial,
            href: runUrl,
            external: true,
          },
        ]
      : [],
  };
}

interface FirstTokenLimitsChartProps {
  result: FirstTokenResult;
  hardwareConfig: HardwareConfig;
  costType: CostType;
  ttftStat: string;
  interactivityStat: string;
  colorResolver: (hwKey: string) => string;
  runInfoByIndex: Record<number, { branch: string; url: string }>;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
  footer?: React.ReactNode;
}

const MARGIN = { top: 24, right: 20, bottom: 104, left: 76 };
const HEIGHT = 500;
const SERIES_PADDING = 0.15;

const FirstTokenLimitsChart = React.memo(
  ({
    result,
    hardwareConfig,
    costType,
    ttftStat,
    interactivityStat,
    colorResolver,
    runInfoByIndex,
    legendElement,
    caption,
    footer,
  }: FirstTokenLimitsChartProps) => {
    const locale = useLocale();
    const t = STRINGS[locale];
    const chartRef = useRef<D3ChartHandle | null>(null);

    const caps = useMemo(() => [...new Set(result.cells.map((c) => c.cap))], [result.cells]);
    const seriesKeys = useMemo(() => result.series.map((s) => s.key), [result.series]);
    const bars = useMemo(() => barsFromCells(result.cells), [result.cells]);
    const emptyCells = useMemo(() => result.cells.filter((c) => !c.winner), [result.cells]);

    const maxCost = useMemo(() => d3.max(bars, (b) => b.winner.cost) ?? 0, [bars]);

    const barColor = useCallback(
      (bar: FirstTokenBar) =>
        bar.winner.runIndex === undefined
          ? colorResolver(bar.winner.hwKey)
          : overlayRunColor(bar.winner.runIndex),
      [colorResolver],
    );

    const xScale = useMemo(
      () => ({ type: 'band' as const, domain: caps.map((c) => t.capTick(c)), padding: 0.28 }),
      [caps, t],
    );
    const yScale = useMemo(
      () => ({
        type: 'linear' as const,
        domain: [0, maxCost > 0 ? maxCost * 1.18 : 1] as [number, number],
        nice: true,
      }),
      [maxCost],
    );
    const xAxis = useMemo(() => ({ grid: false }), []);
    const yAxis = useMemo(
      () => ({
        label: t.yTitle(TOKEN_TYPE_WORD[locale][costType]),
        tickFormat: (d: d3.AxisDomain) => formatCost(Number(d)),
        tickCount: 6,
      }),
      [t, locale, costType],
    );

    const layers = useMemo<CustomLayerConfig[]>(() => {
      const render = (
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        ctx: RenderContext,
      ) => {
        const x0 = ctx.xScale as d3.ScaleBand<string>;
        const y = ctx.yScale as d3.ScaleLinear<number, number>;
        const x1 = d3
          .scaleBand<string>()
          .domain(seriesKeys)
          .range([0, x0.bandwidth()])
          .padding(SERIES_PADDING);
        const slotX = (cap: number, seriesKey: string) =>
          (x0(t.capTick(cap)) ?? 0) + (x1(seriesKey) ?? 0);

        const rects = group
          .selectAll<SVGRectElement, FirstTokenBar>('.ft-bar')
          .data(bars, (b) => b.key)
          .join('rect')
          .attr('class', 'ft-bar bar')
          .attr('data-series', (b) => b.seriesKey)
          .attr('data-hw', (b) => b.winner.hwKey)
          .attr('x', (b) => slotX(b.cap, b.seriesKey))
          .attr('width', x1.bandwidth())
          .attr('y', (b) => y(b.winner.cost))
          .attr('height', (b) => Math.max(0, ctx.height - y(b.winner.cost)))
          .attr('rx', 3)
          .attr('fill', (b) => barColor(b))
          .attr('opacity', 0.9)
          .attr('cursor', 'pointer');

        group
          .selectAll<SVGTextElement, FirstTokenBar>('.ft-value')
          .data(bars, (b) => b.key)
          .join('text')
          .attr('class', 'ft-value')
          .attr('x', (b) => slotX(b.cap, b.seriesKey) + x1.bandwidth() / 2)
          .attr('y', (b) => y(b.winner.cost) - 6)
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.annotation))
          .attr('font-weight', '600')
          .style('fill', 'var(--foreground)')
          .style('pointer-events', 'none')
          .text((b) => formatCost(b.winner.cost));

        group
          .selectAll<SVGTextElement, FirstTokenCell>('.ft-empty')
          .data(emptyCells, (c) => `${c.cap}|${c.series.key}`)
          .join('text')
          .attr('class', 'ft-empty')
          .attr('x', (c) => slotX(c.cap, c.series.key) + x1.bandwidth() / 2)
          .attr('y', ctx.height - 8)
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.dataLabel))
          .style('fill', 'var(--muted-foreground)')
          .style('pointer-events', 'none')
          .text('—')
          .append('title')
          .text(t.noConfig);

        return rects;
      };
      return [{ type: 'custom', key: 'first-token-bars', render }];
    }, [bars, emptyCells, seriesKeys, barColor, t]);

    const onRender = useCallback(
      (ctx: RenderContext) => {
        const x0 = ctx.xScale as d3.ScaleBand<string>;
        const g = ctx.layout.g;
        const center = (cap: number) => (x0(t.capTick(cap)) ?? 0) + x0.bandwidth() / 2;

        g.selectAll<SVGTextElement, (typeof result.summaries)[number]>('.ft-summary-who')
          .data(result.summaries, (s) => String(s.cap))
          .join('text')
          .attr('class', 'ft-summary-who')
          .attr('x', (s) => center(s.cap))
          .attr('y', ctx.height + 40)
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.axisLabelSub))
          .style('fill', 'var(--muted-foreground)')
          .text((s) => {
            if (!s.best) return '';
            const best = skuLabel(s.best.hwKey, hardwareConfig);
            if (!s.runnerUp) return t.only(best);
            return `${best} vs ${skuLabel(s.runnerUp.hwKey, hardwareConfig)}`;
          });

        g.selectAll<SVGTextElement, (typeof result.summaries)[number]>('.ft-summary-gap')
          .data(result.summaries, (s) => String(s.cap))
          .join('text')
          .attr('class', 'ft-summary-gap')
          .attr('x', (s) => center(s.cap))
          .attr('y', ctx.height + 54)
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.axisLabelSub))
          .attr('font-weight', '600')
          .style('fill', 'var(--foreground)')
          .text((s) => (s.pctLower === null ? '' : t.lower(Math.round(s.pctLower * 100))));

        let xTitle = g.select<SVGTextElement>('.ft-x-title');
        if (xTitle.empty()) xTitle = g.append('text').attr('class', 'x-axis-label ft-x-title');
        xTitle
          .attr('x', ctx.width / 2)
          .attr('y', ctx.height + 82)
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.axisLabel))
          .attr('font-weight', '600')
          .style('fill', 'var(--foreground)')
          .text(t.xTitle(ttftStat));
      },
      [result.summaries, hardwareConfig, t, ttftStat],
    );

    const tooltipStateRef = useRef({
      hardwareConfig,
      costType,
      ttftStat,
      interactivityStat,
      runInfoByIndex,
      locale,
    });
    tooltipStateRef.current = {
      hardwareConfig,
      costType,
      ttftStat,
      interactivityStat,
      runInfoByIndex,
      locale,
    };
    const hoveredBarRef = useRef({ x: 0, y: 0 });
    const barColorRef = useRef(barColor);
    barColorRef.current = barColor;

    const tooltip = useMemo(
      () => ({
        rulerType: 'none' as const,
        content: (bar: FirstTokenBar) => {
          const { title, subtitle, warning, metrics, summary } = firstTokenPointDetails(
            bar,
            tooltipStateRef.current,
          );
          return chartHoverCard(
            {
              title,
              subtitle,
              warning,
              metrics: [...metrics],
              summary,
              color: barColorRef.current(bar),
            },
            { border: warning ? '2px solid #dc2626' : undefined },
          );
        },
        details: (bar: FirstTokenBar, _isOverlay: boolean, close: () => void) => {
          const { summary: _summary, ...details } = firstTokenPointDetails(
            bar,
            tooltipStateRef.current,
          );
          return (
            <ChartPointDetails
              {...details}
              color={barColorRef.current(bar)}
              onClose={close}
              onAction={(_action, event) => event.stopPropagation()}
            />
          );
        },
        getRulerX: () => hoveredBarRef.current.x,
        getRulerY: () => hoveredBarRef.current.y,
        onHoverStart: (
          selection: d3.Selection<SVGRectElement, FirstTokenBar, SVGGElement, unknown>,
        ) => {
          hoveredBarRef.current = {
            x: Number(selection.attr('x')) + Number(selection.attr('width')) / 2,
            y: Number(selection.attr('y')),
          };
          selection
            .attr('opacity', 1)
            .attr('stroke', 'var(--foreground)')
            .attr('stroke-width', 1.5);
        },
        onHoverEnd: (
          selection: d3.Selection<SVGRectElement, FirstTokenBar, SVGGElement, unknown>,
        ) => {
          selection.attr('opacity', 0.9).attr('stroke', 'none');
        },
        attachToLayer: 0,
      }),
      [],
    );

    const zoom = useMemo(() => ({ enabled: false }), []);

    return (
      <D3Chart<FirstTokenBar>
        ref={chartRef}
        chartId="first-token-limits"
        data={bars}
        height={HEIGHT}
        margin={MARGIN}
        watermark={getChartWatermark()}
        testId="first-token-chart"
        clipContent={false}
        xScale={xScale}
        yScale={yScale}
        xAxis={xAxis}
        yAxis={yAxis}
        layers={layers}
        zoom={zoom}
        instructions={t.instructions}
        tooltip={tooltip}
        onRender={onRender}
        onExportRender={onRender}
        legendElement={legendElement}
        caption={caption}
        footer={footer}
      />
    );
  },
);
FirstTokenLimitsChart.displayName = 'FirstTokenLimitsChart';

export default FirstTokenLimitsChart;
