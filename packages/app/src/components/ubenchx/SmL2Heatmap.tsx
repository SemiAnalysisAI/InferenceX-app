'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import type { Locale } from '@/lib/i18n/i18n';

import { SM_L2_RUNS } from './sm-l2-data';
import { transformSmL2Run, type SmL2ViewResult } from './sm-l2-transform';

const STRINGS = {
  en: {
    pageTitle: 'SM-SM L2 Latency Difference',
    pageSubtitle:
      'Pointer-chase L2 cache benchmark revealing SM-to-SM latency differences and GPC/die topology.',
    heatmapTitle: 'SM-SM L2 Latency Difference',
    colorBarLabel: 'mean |diff| per address (cycles)',
    tooltipSm: 'SM',
    tooltipGpc: 'GPC',
    tooltipDie: 'Die',
    tooltipValue: 'Value',
    tooltipDismiss: 'Click elsewhere to dismiss',
    tooltipRow: 'row',
    tooltipCol: 'column',
    methodology: 'Methodology',
    methodologyText:
      'L2 pointer-chase benchmark: each SM walks a linked-list through L2 cache lines, recording per-hop latency via clock64(). The matrix shows mean |diff| between per-address latency vectors of each SM pair, revealing shared L2 partition proximity.',
    statsIntraGpc: 'Intra-GPC mean',
    statsInterGpc: 'Inter-GPC (same die) mean',
    statsCrossDie: 'Cross-die mean',
    source: 'Source',
    aria: 'ubenchX SM-SM L2 latency difference heatmap',
    noData: 'No SM-L2 distance data available.',
  },
  zh: {
    pageTitle: 'SM 间 L2 延迟差异',
    pageSubtitle: '基于指针追踪的 L2 缓存基准测试，揭示 SM 间延迟差异和 GPC/die 拓扑结构。',
    heatmapTitle: 'SM 间 L2 延迟差异',
    colorBarLabel: '每地址平均 |差值|（周期）',
    tooltipSm: 'SM',
    tooltipGpc: 'GPC',
    tooltipDie: 'Die',
    tooltipValue: '值',
    tooltipDismiss: '点击其他区域关闭',
    tooltipRow: '行',
    tooltipCol: '列',
    methodology: '测试方法',
    methodologyText:
      'L2 指针追踪基准测试：每个 SM 沿链表遍历 L2 缓存行，通过 clock64() 记录每跳延迟。矩阵展示每对 SM 的逐地址延迟向量的平均绝对差，揭示 L2 分区的共享亲和度。',
    statsIntraGpc: 'GPC 内平均',
    statsInterGpc: '跨 GPC（同 die）平均',
    statsCrossDie: '跨 die 平均',
    source: '数据来源',
    aria: 'ubenchX SM 间 L2 延迟差异热力图',
    noData: '暂无 SM-L2 距离数据。',
  },
} as const;

/** Minimum cell size in pixels for readability. */
const MIN_CELL = 3;
const MAX_CELL = 6;

function SmL2HeatmapChart({ result, locale }: { result: SmL2ViewResult; locale: Locale }) {
  const t = STRINGS[locale];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [pinnedCell, setPinnedCell] = useState<{ i: number; j: number } | null>(null);

  const n = result.numSms;
  const colorScale = useMemo(
    () => d3.scaleSequential(d3.interpolateViridis).domain([0, result.stats.max]),
    [result.stats.max],
  );

  const drawChart = useCallback(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const container = svgRef.current?.parentElement;
    if (!container) return;
    const containerWidth = container.clientWidth;

    const marginLeft = 60;
    const marginTop = 20;
    const marginRight = 70;
    const marginBottom = 30;
    const availWidth = containerWidth - marginLeft - marginRight;
    const cellSize = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(availWidth / n)));
    const chartSize = cellSize * n;
    const totalWidth = chartSize + marginLeft + marginRight;
    const totalHeight = chartSize + marginTop + marginBottom;

    svg.attr('width', totalWidth).attr('height', totalHeight);

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${marginTop})`);

    // Draw heatmap cells
    const matrix = result.matrix;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        g.append('rect')
          .attr('x', j * cellSize)
          .attr('y', i * cellSize)
          .attr('width', cellSize)
          .attr('height', cellSize)
          .attr('fill', i === j ? 'var(--background)' : colorScale(matrix[i][j]))
          .attr('data-i', i)
          .attr('data-j', j)
          .attr('class', 'heatmap-cell');
      }
    }

    // Die separator
    const dieASms = result.dieACount;
    if (dieASms > 0 && dieASms < n) {
      const sep = dieASms * cellSize;
      g.append('line')
        .attr('x1', 0)
        .attr('y1', sep)
        .attr('x2', chartSize)
        .attr('y2', sep)
        .attr('stroke', 'white')
        .attr('stroke-width', 2.5);
      g.append('line')
        .attr('x1', sep)
        .attr('y1', 0)
        .attr('x2', sep)
        .attr('y2', chartSize)
        .attr('stroke', 'white')
        .attr('stroke-width', 2.5);

      // Die labels
      g.append('text')
        .attr('x', (dieASms * cellSize) / 2)
        .attr('y', -6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .text('Die A');
      g.append('text')
        .attr('x', sep + ((n - dieASms) * cellSize) / 2)
        .attr('y', -6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .text('Die B');
    }

    // GPC boxes and labels
    for (const bound of result.gpcBounds) {
      const x = bound.start * cellSize;
      const y = bound.start * cellSize;
      const sz = (bound.end - bound.start) * cellSize;
      const isPartial = bound.size <= 4;
      g.append('rect')
        .attr('x', x - 0.5)
        .attr('y', y - 0.5)
        .attr('width', sz + 1)
        .attr('height', sz + 1)
        .attr('fill', 'none')
        .attr('stroke', '#aaaaaa')
        .attr('stroke-width', 1);
      const mid = ((bound.start + bound.end) / 2) * cellSize;
      g.append('text')
        .attr('x', -4)
        .attr('y', mid)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#aaaaaa')
        .attr('font-size', '7px')
        .attr('font-weight', 'bold')
        .text(`GPC${bound.gpc}${isPartial ? '*' : ''}`);
    }

    // Color bar
    const barWidth = 14;
    const barHeight = chartSize;
    const barX = chartSize + 16;
    const barG = g.append('g').attr('transform', `translate(${barX}, 0)`);
    const barSteps = 100;
    for (let i = 0; i < barSteps; i++) {
      const val = result.stats.max * (1 - i / barSteps);
      barG
        .append('rect')
        .attr('x', 0)
        .attr('y', (i / barSteps) * barHeight)
        .attr('width', barWidth)
        .attr('height', barHeight / barSteps + 1)
        .attr('fill', colorScale(val));
    }
    // Color bar ticks
    const tickVals = [0, result.stats.max / 2, result.stats.max];
    for (const tv of tickVals) {
      const ty = ((result.stats.max - tv) / result.stats.max) * barHeight;
      barG
        .append('text')
        .attr('x', barWidth + 4)
        .attr('y', ty)
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '8px')
        .text(tv.toFixed(0));
    }
    barG
      .append('text')
      .attr('x', barWidth / 2)
      .attr('y', barHeight + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--muted-foreground)')
      .attr('font-size', '8px')
      .text(t.colorBarLabel);

    // Crosshair group
    const crosshairG = g.append('g').attr('class', 'crosshair').style('pointer-events', 'none');

    // Interaction overlay
    const overlay = g
      .append('rect')
      .attr('width', chartSize)
      .attr('height', chartSize)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair');

    const showTooltip = (i: number, j: number, pinned: boolean) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;

      const infoI = result.smInfo[i];
      const infoJ = result.smInfo[j];
      const val = result.matrix[i][j];
      const color = i === j ? 'var(--muted-foreground)' : colorScale(val);

      tooltip.innerHTML = `
        <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${pinned ? 'text' : 'none'}; max-width: 240px;">
          ${pinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.tooltipDismiss}</div>` : ''}
          <div style="display: flex; align-items: center; gap: 6px; color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background: ${color};"></span>
            ${val.toFixed(1)} cycles
          </div>
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
            <strong>${t.tooltipSm} (${t.tooltipRow}):</strong> ${infoI.sm} &middot; ${t.tooltipGpc} ${infoI.gpc} &middot; ${t.tooltipDie} ${infoI.die}
          </div>
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
            <strong>${t.tooltipSm} (${t.tooltipCol}):</strong> ${infoJ.sm} &middot; ${t.tooltipGpc} ${infoJ.gpc} &middot; ${t.tooltipDie} ${infoJ.die}
          </div>
        </div>
      `;
      tooltip.style.display = 'block';
    };

    const positionTooltip = (event: MouseEvent) => {
      const tooltip = tooltipRef.current;
      const svgEl = svgRef.current;
      if (!tooltip || !svgEl) return;
      const svgRect = svgEl.getBoundingClientRect();
      const x = event.clientX - svgRect.left + 16;
      const y = event.clientY - svgRect.top - 10;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    };

    const drawCrosshair = (i: number, j: number) => {
      crosshairG.selectAll('*').remove();
      // Row highlight
      crosshairG
        .append('rect')
        .attr('x', 0)
        .attr('y', i * cellSize)
        .attr('width', chartSize)
        .attr('height', cellSize)
        .attr('fill', 'none')
        .attr('stroke', 'var(--foreground)')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.6);
      // Col highlight
      crosshairG
        .append('rect')
        .attr('x', j * cellSize)
        .attr('y', 0)
        .attr('width', cellSize)
        .attr('height', chartSize)
        .attr('fill', 'none')
        .attr('stroke', 'var(--foreground)')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.6);
    };

    // Redraws (e.g. after pinning) clear the SVG; restore the pinned crosshair.
    if (pinnedCell) drawCrosshair(pinnedCell.i, pinnedCell.j);

    overlay.on('mousemove', (event: MouseEvent) => {
      // A pinned tooltip stays on its cell until dismissed.
      if (pinnedCell) return;
      const [mx, my] = d3.pointer(event);
      const i = Math.floor(my / cellSize);
      const j = Math.floor(mx / cellSize);
      if (i < 0 || i >= n || j < 0 || j >= n) return;
      drawCrosshair(i, j);
      showTooltip(i, j, false);
      positionTooltip(event);
    });

    overlay.on('mouseleave', () => {
      if (pinnedCell) return;
      crosshairG.selectAll('*').remove();
      const tooltip = tooltipRef.current;
      if (tooltip) tooltip.style.display = 'none';
    });

    overlay.on('click', (event: MouseEvent) => {
      const [mx, my] = d3.pointer(event);
      const i = Math.floor(my / cellSize);
      const j = Math.floor(mx / cellSize);
      if (i < 0 || i >= n || j < 0 || j >= n) return;
      setPinnedCell({ i, j });
      showTooltip(i, j, true);
      positionTooltip(event);
      drawCrosshair(i, j);
      track('ubenchx_sm_l2_cell_clicked', {
        smRow: result.smInfo[i].sm,
        smCol: result.smInfo[j].sm,
      });
    });
  }, [n, colorScale, result, t, pinnedCell]);

  useEffect(() => {
    drawChart();
    const handleResize = () => drawChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  // Dismiss pinned tooltip on outside click
  useEffect(() => {
    if (!pinnedCell) return;
    const handler = (e: MouseEvent) => {
      const svgEl = svgRef.current;
      if (svgEl && !svgEl.contains(e.target as Node)) {
        setPinnedCell(null);
        const tooltip = tooltipRef.current;
        if (tooltip) tooltip.style.display = 'none';
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [pinnedCell]);

  return (
    <div className="relative w-full overflow-x-auto" data-testid="sm-l2-heatmap">
      <svg ref={svgRef} className="block" />
      <div
        ref={tooltipRef}
        data-testid="sm-l2-tooltip"
        className="absolute z-50 pointer-events-none"
        style={{ display: 'none' }}
      />
    </div>
  );
}

export function SmL2Content() {
  const locale = useLocale();
  const t = STRINGS[locale];

  const results = useMemo(
    () =>
      Object.entries(SM_L2_RUNS).map(([key, run]) => ({
        key,
        view: transformSmL2Run(key, run),
      })),
    [],
  );

  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.noData}</p>;
  }

  return (
    <div className="space-y-8" role="group" aria-label={t.aria}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t.pageTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t.pageSubtitle}</p>
      </div>

      {results.map(({ key, view }) => (
        <section key={key}>
          <h2 className="text-lg font-semibold mb-2">
            {key}: {t.heatmapTitle}
          </h2>
          <SmL2HeatmapChart result={view} locale={locale} />

          {/* Stats */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div className="rounded-md border p-3">
              <div className="font-medium">{t.statsIntraGpc}</div>
              <div className="text-foreground text-sm font-semibold">
                {view.stats.intraGpcMean.toFixed(1)} cycles
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="font-medium">{t.statsInterGpc}</div>
              <div className="text-foreground text-sm font-semibold">
                {view.stats.interGpcSameDieMean.toFixed(1)} cycles
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="font-medium">{t.statsCrossDie}</div>
              <div className="text-foreground text-sm font-semibold">
                {view.stats.crossDieMean.toFixed(1)} cycles
              </div>
            </div>
          </div>

          {/* Methodology */}
          <div className="mt-4 text-xs text-muted-foreground space-y-1">
            <h3 className="text-sm font-semibold">{t.methodology}</h3>
            <p>{t.methodologyText}</p>
            <p>
              <strong>{key}:</strong> {view.metadata.gpu} | Driver: {view.metadata.driver} | CUDA:{' '}
              {view.metadata.cuda} | Container: {view.metadata.container}
            </p>
            <p>
              {t.source}:{' '}
              <a
                href={view.metadata.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {view.metadata.sourceUrl}
              </a>
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}
