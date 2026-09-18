'use client';

import * as d3 from 'd3';
import React, { useCallback, useMemo, useRef } from 'react';

import type { HardwareConfig } from '@/components/inference/types';
import { getHardwareConfig } from '@/lib/constants';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { CustomLayerConfig, D3ChartHandle, RenderContext } from '@/lib/d3-chart/D3Chart/types';
import { getChartWatermark } from '@/lib/data-mappings';
import type { Locale } from '@/lib/i18n';
import { overlayRunColor } from '@/lib/overlay-run-style';
import { useLocale } from '@/lib/use-locale';
import { escapeHtml, getDisplayLabel } from '@/lib/utils';

import {
  formatCap,
  zhStatPhrase,
  type FirstTokenCell,
  type FirstTokenResult,
  type FirstTokenWinner,
} from './first-token-limits';
import { getCostTypeLabel } from './ThroughputBarChart';
import type { CostType } from './types';

/** One bar: a cap × series cell that found a qualifying configuration. */
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
    instructions: 'Hover a bar for the configuration · Click to pin its tooltip',
    lower: (pct: number) => `${pct}% lower`,
    only: (label: string) => `${label} only`,
    unofficialRun: 'UNOFFICIAL RUN',
    branch: 'Branch:',
    dismiss: 'Click elsewhere to dismiss',
    cost: 'Cost:',
    ttft: (stat: string) => `${stat} TTFT:`,
    interactivity: (stat: string) => `${stat} interactivity:`,
    concurrency: 'Concurrency:',
    precision: 'Precision:',
    parallelism: 'Parallelism:',
    disaggregated: 'Disaggregated:',
    yes: 'Yes',
    viewRun: 'View workflow run',
    viewOfficial: 'View raw result on GitHub',
  },
  zh: {
    capTick: (cap: number) => `≤${formatCap(cap)}s`,
    xTitle: (stat: string) => `${zhStatPhrase('首 token 延迟', stat)}上限`,
    yTitle: (tokenType: string) => `每百万${tokenType} token 成本（$）`,
    noConfig: '无实测配置',
    instructions: '悬停柱形查看配置 · 点击固定提示框',
    lower: (pct: number) => `低 ${pct}%`,
    only: (label: string) => `仅 ${label}`,
    unofficialRun: '非官方运行',
    branch: '分支：',
    dismiss: '点击其他区域关闭',
    cost: '成本：',
    ttft: (stat: string) => `${zhStatPhrase('TTFT', stat)}：`,
    interactivity: (stat: string) => `${zhStatPhrase('交互性', stat)}：`,
    concurrency: '并发数：',
    precision: '精度：',
    parallelism: '并行策略：',
    disaggregated: '分离式：',
    yes: '是',
    viewRun: '查看工作流运行',
    viewOfficial: '在 GitHub 查看原始结果',
  },
} as const;

const TOKEN_TYPE_WORD = {
  en: { total: 'total', input: 'input', output: 'output' },
  zh: { total: '总', input: '输入', output: '输出' },
} as const;

/** Three decimals below a dollar, two above — the calculator's cost labels. */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(cost < 1 ? 3 : 2)}`;
}

/** Bare SKU (`GB300`) for the under-axis summary, where the full label will not fit. */
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

function row(html: string): string {
  return `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">${html}</div>`;
}

function parallelismText(
  winner: FirstTokenWinner,
  t: (typeof STRINGS)[Locale],
  locale: Locale,
): string {
  const { tp, ep, dp_attention: dpa } = winner.point;
  const colon = locale === 'zh' ? '：' : ':';
  const dpaValue = locale === 'zh' ? t.yes : 'True';
  if (ep !== null && ep !== undefined && ep > 1 && tp === ep) {
    return `<strong>${t.parallelism}</strong> ${dpa ? 'DEP' : 'TEP'}${tp}`;
  }
  if (ep !== null && ep !== undefined && ep > 1) {
    return `<strong>TP${colon}</strong> ${tp}, <strong>EP${colon}</strong> ${ep}${
      dpa ? `, <strong>DPA${colon}</strong> ${dpaValue}` : ''
    }`;
  }
  return `<strong>TP${colon}</strong> ${tp}${dpa ? `, <strong>DPA${colon}</strong> ${dpaValue}` : ''}`;
}

export function generateFirstTokenTooltipHTML(
  bar: FirstTokenBar,
  options: {
    hardwareConfig: HardwareConfig;
    costType: CostType;
    ttftStat: string;
    interactivityStat: string;
    runInfoByIndex: Record<number, { branch: string; url: string }>;
    locale: Locale;
    isPinned: boolean;
  },
): string {
  const { hardwareConfig, costType, ttftStat, interactivityStat, runInfoByIndex, locale } = options;
  const t = STRINGS[locale];
  const { winner } = bar;
  const isOverlay = winner.runIndex !== undefined;
  const runInfo = isOverlay ? runInfoByIndex[winner.runIndex!] : undefined;
  // Branch names and run URLs come from the GitHub API for whatever run the
  // reader pasted; labels are ours but are escaped for uniformity.
  const label = escapeHtml(configLabel(winner.hwKey, hardwareConfig));
  const runUrl = isOverlay ? runInfo?.url : winner.point.sourceRow?.run_url;
  const runLink = runUrl
    ? `<div style="margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px;"><a href="${escapeHtml(
        runUrl,
      )}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-size: 11px; text-decoration: underline; cursor: pointer;">${
        isOverlay ? t.viewRun : t.viewOfficial
      } &#8599;</a></div>`
    : '';
  const overlayHeader = isOverlay
    ? `<div style="color: var(--destructive, #ef4444); font-size: 11px; font-weight: 600; margin-bottom: 4px;">${t.unofficialRun}</div>${
        runInfo?.branch ? row(`<strong>${t.branch}</strong> ${escapeHtml(runInfo.branch)}`) : ''
      }`
    : '';

  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 320px; pointer-events: auto; user-select: ${options.isPinned ? 'text' : 'none'};">
      ${options.isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      ${overlayHeader}
      <div style="color: var(--foreground); font-size: 13px; font-weight: 600; margin-bottom: 8px;">${label}</div>
      ${row(`<strong>${t.cost}</strong> ${formatCost(winner.cost)}${getCostTypeLabel(costType)}`)}
      ${row(`<strong>${t.ttft(ttftStat)}</strong> ${winner.ttft.toFixed(2)} s`)}
      ${row(`<strong>${t.interactivity(interactivityStat)}</strong> ${winner.interactivity.toFixed(1)} tok/s/user`)}
      ${row(`<strong>${t.concurrency}</strong> ${winner.point.concurrency}`)}
      ${row(`<strong>${t.precision}</strong> ${escapeHtml(winner.precision.toUpperCase())}`)}
      ${row(parallelismText(winner, t, locale))}
      ${winner.point.disagg ? row(`<strong>${t.disaggregated}</strong> ${t.yes}`) : ''}
      ${runLink}
    </div>
  `;
}

interface FirstTokenLimitsChartProps {
  result: FirstTokenResult;
  hardwareConfig: HardwareConfig;
  costType: CostType;
  /** `P90` / `Median`, naming the statistic the TTFT cap is read on. */
  ttftStat: string;
  /** `P90` / `Median`, naming the statistic the interactivity floor is read on. */
  interactivityStat: string;
  colorResolver: (hwKey: string) => string;
  runInfoByIndex: Record<number, { branch: string; url: string }>;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
}

const MARGIN = { top: 24, right: 20, bottom: 104, left: 76 };
const HEIGHT = 500;
/** Inner gap between a cap's bars, as a fraction of the inner band. */
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
    // Headroom for the value label above the tallest bar.
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

        // A slot with nothing under the cap is the finding, so mark it rather
        // than leaving a gap the eye reads as a missing vendor.
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

    /**
     * Under-axis summary per cap — the winning SKU against the runner-up and the
     * gap — plus the x title. Drawn on the root group so it sits below the axis.
     */
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
        if (xTitle.empty()) xTitle = g.append('text').attr('class', 'ft-x-title');
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
    const hoveredBarWidthRef = useRef(0);

    const tooltip = useMemo(
      () => ({
        rulerType: 'none' as const,
        content: (bar: FirstTokenBar, isPinned: boolean) =>
          generateFirstTokenTooltipHTML(bar, { ...tooltipStateRef.current, isPinned }),
        getRulerX: () => hoveredBarWidthRef.current,
        onHoverStart: (
          selection: d3.Selection<SVGRectElement, FirstTokenBar, SVGGElement, unknown>,
        ) => {
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
        legendElement={legendElement}
        caption={caption}
      />
    );
  },
);
FirstTokenLimitsChart.displayName = 'FirstTokenLimitsChart';

export default FirstTokenLimitsChart;
