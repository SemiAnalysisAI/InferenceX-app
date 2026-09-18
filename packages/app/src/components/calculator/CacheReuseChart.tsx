'use client';

import * as d3 from 'd3';
import React, { useMemo, useRef } from 'react';

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
  CACHE_TIER_COLORS,
  formatShare,
  type CacheReuseBar,
  type CacheReuseResult,
  type CacheTier,
} from './cache-reuse';

export const CACHE_REUSE_STRINGS = {
  en: {
    xTitle: 'Concurrency',
    yTitle: 'Share of prompt tokens',
    hbm: 'HBM cache',
    host: 'Host cache',
    combined: 'HBM + host cache (reported together)',
    unreused: 'Not reused',
    ceiling: 'Theoretical ceiling',
    noTiers: 'No cache tiers reported',
    instructions: 'Hover a bar for the breakdown · Click to pin its tooltip',
    unofficialRun: 'UNOFFICIAL RUN',
    branch: 'Branch:',
    dismiss: 'Click elsewhere to dismiss',
    concurrency: 'Concurrency:',
    hostSource: 'Host tier from:',
    external: 'router / external cache',
    cpu: 'CPU offload',
    reportedTotal: 'Reported total:',
    overReported: 'above 100%, clamped',
    precision: 'Precision:',
    tp: 'TP:',
    viewRun: 'View workflow run',
    viewOfficial: 'View raw result on GitHub',
  },
  zh: {
    xTitle: '并发数',
    yTitle: 'prompt token 占比',
    hbm: 'HBM 缓存',
    host: '主机缓存',
    combined: 'HBM + 主机缓存（合并上报）',
    unreused: '未复用',
    ceiling: '理论上限',
    noTiers: '未上报缓存层级',
    instructions: '悬停柱形查看拆分 · 点击固定提示框',
    unofficialRun: '非官方运行',
    branch: '分支：',
    dismiss: '点击其他区域关闭',
    concurrency: '并发数：',
    hostSource: '主机层来源：',
    external: 'router / 外部缓存',
    cpu: 'CPU offload',
    reportedTotal: '上报合计：',
    overReported: '超过 100%，已截断',
    precision: '精度：',
    tp: 'TP：',
    viewRun: '查看工作流运行',
    viewOfficial: '在 GitHub 查看原始结果',
  },
} as const;

export function configLabel(hwKey: string, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[hwKey] ?? getHardwareConfig(hwKey);
  return config ? getDisplayLabel(config) : hwKey;
}

export function tierLabel(tier: CacheTier, combined: boolean, locale: Locale): string {
  const t = CACHE_REUSE_STRINGS[locale];
  if (tier === 'hbm') return combined ? t.combined : t.hbm;
  return t[tier];
}

interface Segment {
  bar: CacheReuseBar;
  tier: CacheTier;
  y0: number;
  y1: number;
}

function segmentsOf(bars: readonly CacheReuseBar[]): Segment[] {
  const out: Segment[] = [];
  for (const bar of bars) {
    const { hbm, host, unreused } = bar.share;
    out.push({ bar, tier: 'hbm', y0: 0, y1: hbm });
    if (host > 0) out.push({ bar, tier: 'host', y0: hbm, y1: hbm + host });
    if (unreused > 0)
      out.push({ bar, tier: 'unreused', y0: hbm + host, y1: hbm + host + unreused });
  }
  return out;
}

function row(html: string): string {
  return `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">${html}</div>`;
}

function swatchRow(color: string, label: string, value: string): string {
  return row(
    `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${color};margin-right:6px;vertical-align:middle;"></span><strong>${label}</strong> ${value}`,
  );
}

export function generateCacheReuseTooltipHTML(
  bar: CacheReuseBar,
  options: {
    hardwareConfig: HardwareConfig;
    runInfoByIndex: Record<number, { branch: string; url: string }>;
    locale: Locale;
    isPinned: boolean;
  },
): string {
  const { hardwareConfig, runInfoByIndex, locale } = options;
  const t = CACHE_REUSE_STRINGS[locale];
  const { share, point } = bar;
  const isOverlay = bar.runIndex !== undefined;
  const runInfo = isOverlay ? runInfoByIndex[bar.runIndex!] : undefined;
  const label = escapeHtml(configLabel(point.hwKey, hardwareConfig));
  const runUrl = isOverlay ? runInfo?.url : point.sourceRow?.run_url;
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
  const hostSource =
    share.hostSource === null ? '' : row(`<strong>${t.hostSource}</strong> ${t[share.hostSource]}`);
  const ceiling =
    share.theoretical === null
      ? ''
      : row(`<strong>${t.ceiling}:</strong> ${formatShare(share.theoretical)}`);
  const overReported =
    share.reportedTotal > 1.005
      ? row(
          `<strong>${t.reportedTotal}</strong> ${formatShare(share.reportedTotal)} (${t.overReported})`,
        )
      : '';

  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 320px; pointer-events: auto; user-select: ${options.isPinned ? 'text' : 'none'};">
      ${options.isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      ${overlayHeader}
      <div style="color: var(--foreground); font-size: 13px; font-weight: 600; margin-bottom: 8px;">${label}</div>
      ${row(`<strong>${t.concurrency}</strong> ${point.concurrency}`)}
      ${swatchRow(CACHE_TIER_COLORS.hbm, `${tierLabel('hbm', share.combined, locale)}:`, formatShare(share.hbm))}
      ${share.combined ? '' : swatchRow(CACHE_TIER_COLORS.host, `${t.host}:`, formatShare(share.host))}
      ${swatchRow(CACHE_TIER_COLORS.unreused, `${t.unreused}:`, formatShare(share.unreused))}
      ${hostSource}
      ${ceiling}
      ${overReported}
      ${row(`<strong>${t.precision}</strong> ${escapeHtml(point.precision.toUpperCase())}`)}
      ${row(`<strong>${t.tp}</strong> ${point.tp}`)}
      ${runLink}
    </div>
  `;
}

interface CacheReuseChartProps {
  result: CacheReuseResult;
  hardwareConfig: HardwareConfig;
  showCeiling: boolean;
  runInfoByIndex: Record<number, { branch: string; url: string }>;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
}

const MARGIN = { top: 16, right: 20, bottom: 64, left: 64 };
const HEIGHT = 480;
/** Inner gap between the official and run bars of one concurrency. */
const SERIES_PADDING = 0.12;
/** Segments shorter than this draw no percentage; the tooltip still has it. */
const MIN_LABEL_HEIGHT = 14;

const CacheReuseChart = React.memo(
  ({
    result,
    hardwareConfig,
    showCeiling,
    runInfoByIndex,
    legendElement,
    caption,
  }: CacheReuseChartProps) => {
    const locale = useLocale();
    const t = CACHE_REUSE_STRINGS[locale];
    const chartRef = useRef<D3ChartHandle | null>(null);

    const seriesKeys = useMemo(() => result.series.map((s) => s.key), [result.series]);
    const segments = useMemo(() => segmentsOf(result.bars), [result.bars]);

    const xScale = useMemo(
      () => ({
        type: 'band' as const,
        domain: result.concurrencies.map(String),
        padding: seriesKeys.length > 1 ? 0.22 : 0.35,
      }),
      [result.concurrencies, seriesKeys.length],
    );
    const yScale = useMemo(
      () => ({ type: 'linear' as const, domain: [0, 1] as [number, number], nice: false }),
      [],
    );
    const xAxis = useMemo(() => ({ grid: false, label: t.xTitle }), [t]);
    const yAxis = useMemo(
      () => ({
        label: t.yTitle,
        tickFormat: (d: d3.AxisDomain) => d3.format('.0%')(Number(d)),
        tickCount: 5,
      }),
      [t],
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
          .padding(seriesKeys.length > 1 ? SERIES_PADDING : 0);
        const slotX = (concurrency: number, seriesKey: string) =>
          (x0(String(concurrency)) ?? 0) + (x1(seriesKey) ?? 0);
        const width = x1.bandwidth();

        group
          .selectAll<SVGRectElement, Segment>('.cr-segment')
          .data(segments, (s) => `${s.bar.key}|${s.tier}`)
          .join('rect')
          .attr('class', (s) => `cr-segment cr-${s.tier}`)
          .attr('data-tier', (s) => s.tier)
          .attr('data-series', (s) => s.bar.seriesKey)
          .attr('data-conc', (s) => s.bar.concurrency)
          .attr('x', (s) => slotX(s.bar.concurrency, s.bar.seriesKey))
          .attr('width', width)
          .attr('y', (s) => y(s.y1))
          .attr('height', (s) => Math.max(0, y(s.y0) - y(s.y1)))
          .attr('fill', (s) => CACHE_TIER_COLORS[s.tier])
          .style('pointer-events', 'none');

        group
          .selectAll<SVGTextElement, Segment>('.cr-value')
          .data(
            segments.filter((s) => y(s.y0) - y(s.y1) >= MIN_LABEL_HEIGHT),
            (s) => `${s.bar.key}|${s.tier}`,
          )
          .join('text')
          .attr('class', 'cr-value')
          .attr('x', (s) => slotX(s.bar.concurrency, s.bar.seriesKey) + width / 2)
          .attr('y', (s) => (y(s.y0) + y(s.y1)) / 2)
          .attr('dy', '0.35em')
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.annotation))
          .attr('font-weight', '600')
          // Dark ink on the pale tiers, light on the slate one: contrast holds in
          // both themes because the tier colors are fixed, not themed.
          .style('fill', (s) => (s.tier === 'unreused' ? '#f5f5f5' : '#0b0f14'))
          .style('pointer-events', 'none')
          .text((s) => formatShare(s.y1 - s.y0));

        group
          .selectAll<SVGLineElement, CacheReuseBar>('.cr-ceiling')
          .data(
            showCeiling ? result.bars.filter((b) => b.share.theoretical !== null) : [],
            (b) => b.key,
          )
          .join('line')
          .attr('class', 'cr-ceiling')
          .attr('x1', (b) => slotX(b.concurrency, b.seriesKey) - 3)
          .attr('x2', (b) => slotX(b.concurrency, b.seriesKey) + width + 3)
          .attr('y1', (b) => y(b.share.theoretical!))
          .attr('y2', (b) => y(b.share.theoretical!))
          .attr('stroke', 'var(--foreground)')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4 3')
          .style('pointer-events', 'none')
          .append('title')
          .text((b) => `${t.ceiling}: ${formatShare(b.share.theoretical!)}`);

        // A row that ran but reported no tier is a gap in the measurement, not
        // in the sweep, so it gets a marker rather than an empty slot.
        group
          .selectAll<SVGTextElement, CacheReuseResult['unmeasured'][number]>('.cr-empty')
          .data(result.unmeasured, (u) => `${u.concurrency}|${u.seriesKey}`)
          .join('text')
          .attr('class', 'cr-empty')
          .attr('x', (u) => slotX(u.concurrency, u.seriesKey) + width / 2)
          .attr('y', ctx.height - 8)
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.dataLabel))
          .style('fill', 'var(--muted-foreground)')
          .style('pointer-events', 'none')
          .text('—')
          .append('title')
          .text(t.noTiers);

        // One full-height hit target per bar carries the tooltip and, for a run,
        // the palette-colored outline that tells it apart from the official bar.
        return group
          .selectAll<SVGRectElement, CacheReuseBar>('.cr-bar')
          .data(result.bars, (b) => b.key)
          .join('rect')
          .attr('class', 'cr-bar bar')
          .attr('data-series', (b) => b.seriesKey)
          .attr('data-conc', (b) => b.concurrency)
          .attr('x', (b) => slotX(b.concurrency, b.seriesKey))
          .attr('width', width)
          .attr('y', y(1))
          .attr('height', Math.max(0, ctx.height - y(1)))
          .attr('fill', 'transparent')
          .attr('stroke', (b) => (b.runIndex === undefined ? 'none' : overlayRunColor(b.runIndex)))
          .attr('stroke-width', 2)
          .attr('cursor', 'pointer');
      };
      return [{ type: 'custom', key: 'cache-reuse-bars', render }];
    }, [segments, seriesKeys, result.bars, result.unmeasured, showCeiling, t]);

    const tooltipStateRef = useRef({ hardwareConfig, runInfoByIndex, locale });
    tooltipStateRef.current = { hardwareConfig, runInfoByIndex, locale };

    const tooltip = useMemo(
      () => ({
        rulerType: 'none' as const,
        content: (bar: CacheReuseBar, isPinned: boolean) =>
          generateCacheReuseTooltipHTML(bar, { ...tooltipStateRef.current, isPinned }),
        getRulerX: () => 0,
        onHoverStart: (
          selection: d3.Selection<SVGRectElement, CacheReuseBar, SVGGElement, unknown>,
        ) => {
          selection.attr('stroke', 'var(--foreground)').attr('stroke-width', 1.5);
        },
        onHoverEnd: (
          selection: d3.Selection<SVGRectElement, CacheReuseBar, SVGGElement, unknown>,
        ) => {
          selection
            .attr('stroke', (b) =>
              b.runIndex === undefined ? 'none' : overlayRunColor(b.runIndex),
            )
            .attr('stroke-width', 2);
        },
        attachToLayer: 0,
      }),
      [],
    );

    const zoom = useMemo(() => ({ enabled: false }), []);

    return (
      <D3Chart<CacheReuseBar>
        ref={chartRef}
        chartId="cache-reuse"
        data={result.bars}
        height={HEIGHT}
        margin={MARGIN}
        watermark={getChartWatermark()}
        testId="cache-reuse-chart"
        clipContent={false}
        xScale={xScale}
        yScale={yScale}
        xAxis={xAxis}
        yAxis={yAxis}
        layers={layers}
        zoom={zoom}
        instructions={t.instructions}
        tooltip={tooltip}
        legendElement={legendElement}
        caption={caption}
      />
    );
  },
);
CacheReuseChart.displayName = 'CacheReuseChart';

export default CacheReuseChart;
