'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import type { Locale } from '@/lib/i18n/i18n';
import {
  CHART_TOOLTIP_Z_INDEX,
  placeFloatingTooltip,
  stickyHeaderBottom,
} from '@/lib/d3-chart/tooltip-placement';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { Card } from '@/components/ui/card';
import { TABLE_HEAD_CELL_STYLE, TABLE_HEAD_ROW_STYLE } from '@/components/ui/control-styles';
import { Heading } from '@/components/ui/heading';
import { ResultContext, sourceLinkClassName } from '@/components/ui/result-context';
import { Stat } from '@/components/ui/stat';

import { SM_L2_RUNS } from './sm-l2-data';
import { transformSmL2Run, type SmL2ViewResult } from './sm-l2-transform';

const STRINGS = {
  en: {
    heatmapTitle: 'SM-SM L2 latency difference',
    colorBarLabel: 'mean |diff| per address (clock64 cycles)',
    tooltipSm: 'SM',
    tooltipGpc: 'GPC',
    tooltipDie: 'Die',
    tooltipValue: 'Value',
    tooltipRow: 'row',
    tooltipCol: 'column',
    cycles: 'cycles',
    methodology: 'Methodology',
    methodologyText:
      'Each SM walks a linked list through L2 cache lines, recording per-hop latency with clock64(). Each cell is the mean absolute difference between two SMs’ matched-address latency profiles, not direct SM-to-SM communication latency or a physical distance.',
    statsIntraGpc: 'Intra-GPC mean',
    statsInterGpc: 'Inter-GPC (same die) mean',
    statsCrossDie: 'Cross-die mean',
    source: 'Source: ',
    device: 'Device',
    hardware: 'Hardware',
    driver: 'Driver',
    container: 'Container',
    aria: 'uBenchX SM-SM L2 latency difference heatmap',
    noData: 'No SM-L2 distance data available',
  },
  zh: {
    heatmapTitle: 'SM 间 L2 延迟差异',
    colorBarLabel: '每地址平均 |差值|（clock64 周期）',
    tooltipSm: 'SM',
    tooltipGpc: 'GPC',
    tooltipDie: 'Die',
    tooltipValue: '值',
    tooltipRow: '行',
    tooltipCol: '列',
    cycles: '周期',
    methodology: '测试方法',
    methodologyText:
      '每个 SM 沿链表遍历 L2 缓存行，并用 clock64() 记录每跳延迟。每个单元格表示两个 SM 在相同地址上测得的延迟特征之间的平均绝对差，既不是 SM 间直接通信延迟，也不是物理距离。',
    statsIntraGpc: 'GPC 内平均',
    statsInterGpc: '跨 GPC（同 die）平均',
    statsCrossDie: '跨 die 平均',
    source: '数据来源：',
    device: '设备',
    hardware: '硬件',
    driver: '驱动',
    container: '容器',
    aria: 'uBenchX SM 间 L2 延迟差异热力图',
    noData: '暂无 SM-L2 距离数据',
  },
} as const;

const MIN_CELL = 3;
const MAX_CELL = 6;

function SmL2HeatmapChart({ result, locale }: { result: SmL2ViewResult; locale: Locale }) {
  const t = STRINGS[locale];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [pinnedCell, setPinnedCell] = useState<{ i: number; j: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    const marginRight = 80;
    const marginBottom = 8;
    const availWidth = containerWidth - marginLeft - marginRight;
    const cellSize = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(availWidth / n)));
    const chartSize = cellSize * n;
    const totalWidth = chartSize + marginLeft + marginRight;
    const totalHeight = chartSize + marginTop + marginBottom;

    svg.attr('width', totalWidth).attr('height', totalHeight);

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${marginTop})`);

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

      g.append('text')
        .attr('x', (dieASms * cellSize) / 2)
        .attr('y', -6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '11px')
        .attr('font-weight', 500)
        .text('Die A');
      g.append('text')
        .attr('x', sep + ((n - dieASms) * cellSize) / 2)
        .attr('y', -6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '11px')
        .attr('font-weight', 500)
        .text('Die B');
    }

    let lastLabelY = Number.NEGATIVE_INFINITY;
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
      if (mid - lastLabelY < 12) continue;
      lastLabelY = mid;
      g.append('text')
        .attr('x', -4)
        .attr('y', mid)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '10px')
        .text(`GPC${bound.gpc}${isPartial ? '*' : ''}`);
    }

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
    const tickVals = [0, result.stats.max / 2, result.stats.max];
    for (const tv of tickVals) {
      const ty = ((result.stats.max - tv) / result.stats.max) * barHeight;
      barG
        .append('text')
        .attr('x', barWidth + 4)
        .attr('y', ty)
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '10px')
        .text(tv.toFixed(0));
    }
    barG
      .append('text')
      .attr('transform', `translate(${barWidth + 36}, ${barHeight / 2}) rotate(90)`)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--muted-foreground)')
      .attr('font-size', '10px')
      .text(t.colorBarLabel);

    const crosshairG = g.append('g').attr('class', 'crosshair').style('pointer-events', 'none');

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

      tooltip.innerHTML = chartHoverCard(
        {
          title: `${t.tooltipSm} ${infoI.sm} × ${infoJ.sm}`,
          color,
          metrics: [{ value: val.toFixed(1), label: t.cycles }],
          summary: `${t.tooltipSm} (${t.tooltipRow}) ${t.tooltipGpc} ${infoI.gpc} · ${t.tooltipDie} ${infoI.die} · ${t.tooltipSm} (${t.tooltipCol}) ${t.tooltipGpc} ${infoJ.gpc} · ${t.tooltipDie} ${infoJ.die}`,
        },
        { pinned, maxWidth: 260 },
      );
      tooltip.style.display = 'block';
    };

    const positionTooltip = (event: MouseEvent) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      const root = document.documentElement;
      const { left, top } = placeFloatingTooltip({
        x: event.clientX,
        y: event.clientY,
        width: tooltip.offsetWidth,
        height: tooltip.offsetHeight,
        offset: 16,
        placement: 'below',
        viewportWidth: root.clientWidth || window.innerWidth,
        viewportHeight: root.clientHeight || window.innerHeight,
        headerBottom: stickyHeaderBottom(),
      });
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };

    const drawCrosshair = (i: number, j: number) => {
      crosshairG.selectAll('*').remove();
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

    if (pinnedCell) drawCrosshair(pinnedCell.i, pinnedCell.j);

    overlay.on('mousemove', (event: MouseEvent) => {
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
        sm_row: result.smInfo[i].sm,
        sm_col: result.smInfo[j].sm,
      });
    });
  }, [n, colorScale, result, t, pinnedCell]);

  useEffect(() => {
    drawChart();
    const handleResize = () => drawChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  useEffect(() => {
    if (!pinnedCell) return;
    const handler = (e: MouseEvent) => {
      const svgEl = svgRef.current;
      const target = e.target as Node;
      // The pinning click redraws the cells, so its target is already detached when this runs.
      if (!target.isConnected) return;
      if (svgEl && !svgEl.contains(target)) {
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
      {mounted &&
        createPortal(
          <div
            ref={tooltipRef}
            data-testid="sm-l2-tooltip"
            className="pointer-events-none fixed"
            style={{ display: 'none', zIndex: CHART_TOOLTIP_Z_INDEX }}
          />,
          document.body,
        )}
    </div>
  );
}

export function SmL2Content({ gpu = 'all' }: { gpu?: string }) {
  const locale = useLocale();
  const t = STRINGS[locale];

  const results = useMemo(
    () =>
      Object.entries(SM_L2_RUNS)
        .filter(([key]) => gpu === 'all' || gpu === key)
        .map(([key, run]) => ({
          key,
          view: transformSmL2Run(key, run),
        })),
    [gpu],
  );

  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.noData}</p>;
  }

  return (
    <div className="flex flex-col gap-4" role="group" aria-label={t.aria}>
      {results.map(({ key, view }) => (
        <section key={key} className="space-y-4">
          <figure className="relative min-w-0">
            <Card>
              <figcaption>
                <Heading as="h2" level="card">
                  {key}: {t.heatmapTitle}
                </Heading>
              </figcaption>
              <div className="mt-3">
                <SmL2HeatmapChart result={view} locale={locale} />
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {(
                  [
                    [t.statsIntraGpc, view.stats.intraGpcMean],
                    [t.statsInterGpc, view.stats.interGpcSameDieMean],
                    [t.statsCrossDie, view.stats.crossDieMean],
                  ] as const
                ).map(([label, value]) => (
                  <Stat key={label} label={label} value={`${value.toFixed(1)} ${t.cycles}`} />
                ))}
              </dl>
              <div className="mt-3">
                <ResultContext locale={locale} layout="footer" source="SemiAnalysis InferenceX™" />
                <div className="mt-3 max-w-[80ch] space-y-1.5 text-xs leading-5 text-muted-foreground">
                  <h3 className="font-medium text-foreground">{t.methodology}</h3>
                  <p>{t.methodologyText}</p>
                </div>
                <div className="mt-3 overflow-x-auto" data-testid="sm-l2-device-specs">
                  <table className="w-full text-left text-xs text-muted-foreground tabular-nums">
                    <thead>
                      <tr className={TABLE_HEAD_ROW_STYLE}>
                        {[t.device, t.hardware, t.driver, 'CUDA', t.container].map((header) => (
                          <th
                            key={header}
                            scope="col"
                            className={`${TABLE_HEAD_CELL_STYLE} py-1.5 pr-4`}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th
                          scope="row"
                          className="py-1.5 pr-4 font-medium whitespace-nowrap text-foreground"
                        >
                          {key}
                        </th>
                        <td className="py-1.5 pr-4 whitespace-nowrap">{view.metadata.gpu}</td>
                        <td className="py-1.5 pr-4 whitespace-nowrap">{view.metadata.driver}</td>
                        <td className="py-1.5 pr-4 whitespace-nowrap">{view.metadata.cuda}</td>
                        <td className="min-w-64 py-1.5 pr-4 break-all">
                          {view.metadata.container}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t.source}
                  <a
                    href={view.metadata.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={sourceLinkClassName}
                  >
                    PR #
                    {view.metadata.sourceUrl.slice(view.metadata.sourceUrl.lastIndexOf('/') + 1)}
                  </a>
                </p>
              </div>
            </Card>
          </figure>
        </section>
      ))}
    </div>
  );
}
