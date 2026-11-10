'use client';

import * as d3 from 'd3';
import { useMemo, useState } from 'react';
import type {
  CollectiveXDataset,
  CollectiveXPercentile,
  CollectiveXSwapPoint,
} from '@semianalysisai/inferencex-db/collectivex/types';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import ChartLegend from '@/components/ui/chart-legend';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { collectiveXRunDasharray } from './data';
import {
  formatSwapBytes,
  swapChartPoints,
  swapRangeBands,
  swapRooflines,
  swapYAxis,
  type SwapChartPoint,
  type SwapRangePoint,
  type SwapRoofline,
  type SwapYAxis,
} from './swap-data';

type LinearScale = d3.ScaleLinear<number, number>;

type PlotGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/** Pixel span of the axis break (top < bottom), or null when the axis has no break. */
function breakSpan(yScale: LinearScale, rooflines: SwapRoofline[], axis: SwapYAxis) {
  const cut = axis.breakAt;
  if (cut === null) return null;
  const firstFar = rooflines.map((r) => axis.toPlot(r.gbps)).find((y) => y > cut);
  if (firstFar === undefined) return null;
  return {
    top: yScale(cut + (firstFar - cut) * 0.5),
    bottom: yScale(cut + (firstFar - cut) * 0.15),
  };
}

/**
 * Roofline names on the empty left of the plot, plus the axis break: a card-coloured gap across
 * the plot (hiding gridlines) and, on the y-axis itself, a gap in the axis line capped by two
 * parallel slashes. The axis marks live in the axis group because the plot group is clipped.
 */
function drawRooflineAnnotations(
  group: PlotGroup,
  yScale: LinearScale,
  width: number,
  height: number,
  rooflines: SwapRoofline[],
  axis: SwapYAxis,
) {
  const span = breakSpan(yScale, rooflines, axis);
  const spans = span && span.bottom > 0 && span.top < height ? [span] : [];
  group
    .selectAll<SVGRectElement, (typeof spans)[number]>('rect.swap-axis-break')
    .data(spans)
    .join('rect')
    .attr('class', 'swap-axis-break')
    .attr('data-testid', 'swap-axis-break')
    .attr('x', 0)
    .attr('width', width)
    .attr('y', (b) => b.top)
    .attr('height', (b) => b.bottom - b.top)
    .attr('fill', 'var(--card)');
  const svg = group.node()?.ownerSVGElement;
  const yAxisGroup = svg ? d3.select(svg).select<SVGGElement>('g.y-axis') : null;
  if (yAxisGroup && !yAxisGroup.empty()) {
    const stroke = yAxisGroup.select('path.domain').attr('stroke') ?? 'currentColor';
    const marks = yAxisGroup
      .selectAll<SVGGElement, (typeof spans)[number]>('g.swap-axis-break-mark')
      .data(spans)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'swap-axis-break-mark');
        g.append('rect').attr('fill', 'var(--card)');
        g.append('path').attr('fill', 'none').attr('stroke-width', 1.25);
        return g;
      });
    marks
      .select('rect')
      .attr('x', -4)
      .attr('width', 8)
      .attr('y', (b) => b.top)
      .attr('height', (b) => b.bottom - b.top);
    marks
      .select('path')
      .attr('stroke', stroke)
      .attr(
        'd',
        (b) => `M-5,${b.top + 2.5}L5,${b.top - 2.5}M-5,${b.bottom + 2.5}L5,${b.bottom - 2.5}`,
      );
  }
  group
    .selectAll<SVGTextElement, SwapRoofline>('text.swap-roofline-label')
    .data(rooflines, (r) => r.id)
    .join('text')
    .attr('class', 'swap-roofline-label')
    .attr('data-testid', 'swap-roofline-label')
    .attr('x', 8)
    .attr('y', (r) => yScale(axis.toPlot(r.gbps)) - 6)
    .attr('fill', 'var(--muted-foreground)')
    .style('font-size', px(CHART_TYPE.annotation))
    .text((r) => `${r.path} · ${r.gbps.toLocaleString()} GB/s`);
}

const bandOf = (p: SwapChartPoint) => `${p.runId}__${p.sku}`;

/** A plotted point: one block count's measurement, or a SKU range's median at one block size. */
interface SwapDisplayPoint {
  id: string;
  x: number;
  y: number;
  legendId: string;
  runId: string;
  label: string;
  colorKey: string;
  series?: SwapChartPoint;
  range?: SwapRangePoint;
}

/**
 * vLLM's function name, set as inline code: monospace on a gray chip. Light themes use the
 * muted gray at half strength so the chip stays light; dark themes keep the full tone, which
 * is already only a small step above their background.
 */
export function SwapBlocksName() {
  return (
    <code className="rounded bg-muted/50 px-1 py-0.5 font-mono dark:bg-muted">swap_blocks</code>
  );
}

const STRINGS = {
  en: {
    heading: (
      <>
        vLLM <SwapBlocksName />
      </>
    ),
    metric: 'Swap-block metric',
    direction: 'Swap-block direction',
    layout: 'Swap-block layout',
    percentile: 'Swap-block percentile',
    latency: 'Latency',
    bandwidth: 'Bandwidth',
    contiguous: 'Contiguous',
    random: 'Random',
    x: 'Block size (bytes, log)',
    blocks: (count: number) => `${count} ${count === 1 ? 'block' : 'blocks'}`,
    log: 'log',
    payload: 'Copied payload',
    description:
      'Host-observed copy latency includes submission and CUDA synchronization. Bandwidth counts copied payload once (GB/s, linear).',
    view: 'Swap-block view',
    viewSeries: 'Series',
    viewRange: 'Range by SKU',
    seriesNote: 'Each line holds the number of blocks fixed.',
    rangeNote:
      'Each band spans the lowest to the highest value across block counts at that block size; the line is their median.',
    rangeMedian: 'Median',
    rangeHeading: 'Range across block counts',
    roofline: 'Nominal hardware roofline',
    rooflineNote:
      'Host transfers use one-way link bandwidth per GPU. Same-GPU copies use HBM bandwidth ÷ 2 (read + write); warm-cache points can exceed that HBM reference. Actual throughput also depends on host memory and placement.',
    yLatency: 'Latency',
    yBandwidth: 'Payload bandwidth',
    noData: 'No measured swap-block points match this selection',
    samples: 'samples',
    verified: 'Correctness verified',
    skipped: 'combinations excluded by the payload budget',
    instructions: 'Shift+Scroll to zoom · Drag to pan · Double-click to reset',
  },
  zh: {
    heading: (
      <>
        vLLM <SwapBlocksName />
      </>
    ),
    metric: '块交换指标',
    direction: '块交换方向',
    layout: '块交换布局',
    percentile: '块交换延迟分位点',
    latency: '延迟',
    bandwidth: '带宽',
    contiguous: '连续',
    random: '随机',
    x: '块大小（字节，对数）',
    blocks: (count: number) => `${count} 个块`,
    log: '对数',
    payload: '复制的有效载荷',
    description:
      '主机侧观测的复制延迟包含提交和 CUDA 同步时间。带宽按复制的有效载荷计算一次（GB/s，线性坐标）。',
    view: '块交换视图',
    viewSeries: '序列',
    viewRange: '按 SKU 显示范围',
    seriesNote: '每条线对应固定的块数量。',
    rangeNote: '每个色带覆盖该块大小下各块数量的最低值到最高值，线为其中位数。',
    rangeMedian: '中位数',
    rangeHeading: '各块数量的范围',
    roofline: '标称硬件带宽上限',
    rooflineNote:
      '主机与 GPU 之间的传输按每个 GPU 的单向链路带宽计算。同一 GPU 内的复制按 HBM 带宽 ÷ 2（读 + 写）计算；缓存命中的数据点可能高于这一 HBM 参考线。实际吞吐量还受主机内存和内存放置位置影响。',
    yLatency: '延迟',
    yBandwidth: '有效载荷带宽',
    noData: '当前筛选条件下没有实测块交换数据',
    samples: '个样本',
    verified: '正确性校验通过',
    skipped: '个组合因超出有效载荷预算而未测量',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置',
  },
} as const;

export function CollectiveXSwapSection({
  datasets,
  runIndexById,
}: {
  datasets: CollectiveXDataset[];
  runIndexById: ReadonlyMap<string, number>;
}) {
  const t = STRINGS[useLocale()];
  const [metric, setMetric] = useState<'latency' | 'bandwidth'>('bandwidth');
  const [direction, setDirection] = useState<CollectiveXSwapPoint['direction']>('h2d');
  const [layout, setLayout] = useState<CollectiveXSwapPoint['layout']>('contiguous');
  const [percentile, setPercentile] = useState<CollectiveXPercentile>('p50');
  const [view, setView] = useState<'series' | 'range'>('range');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);
  const allPoints = useMemo(
    () => swapChartPoints(datasets, { metric, direction, layout, percentile }),
    [datasets, metric, direction, layout, percentile],
  );
  const points = useMemo(
    () => allPoints.filter((p) => !hidden.has(p.seriesId)),
    [allPoints, hidden],
  );
  const seriesByBand = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of allPoints) {
      const ids = map.get(bandOf(p)) ?? [];
      if (!ids.includes(p.seriesId)) ids.push(p.seriesId);
      map.set(bandOf(p), ids);
    }
    return map;
  }, [allPoints]);
  // SKU colours in range view (one per SKU); SKU x block-count colours in series view.
  const colorKeys = useMemo(
    () => [...new Set(allPoints.map((p) => (view === 'range' ? p.sku : p.colorKey)))].toSorted(),
    [allPoints, view],
  );
  const colorOf = (key: string) => d3.schemeTableau10[colorKeys.indexOf(key) % 10];
  const bands = useMemo(() => swapRangeBands(points, metric), [points, metric]);
  const display: SwapDisplayPoint[] = useMemo(
    () =>
      view === 'range'
        ? bands.flatMap((band) =>
            band.points.map((range) => ({
              id: `${band.id}:${range.x}`,
              x: range.x,
              y: range.mid,
              legendId: band.id,
              runId: band.runId,
              label: band.device,
              colorKey: band.sku,
              range,
            })),
          )
        : points.map((p) => ({
            id: `${p.seriesId}:${p.x}`,
            x: p.x,
            y: p.y,
            legendId: p.seriesId,
            runId: p.runId,
            label: p.device,
            colorKey: p.colorKey,
            series: p,
          })),
    [view, bands, points],
  );
  const lines = useMemo(() => {
    const grouped: Record<string, { x: number; y: number }[]> = {};
    for (const p of display) (grouped[p.legendId] ??= []).push({ x: p.x, y: p.y });
    for (const line of Object.values(grouped)) line.sort((a, b) => a.x - b.x);
    return grouped;
  }, [display]);
  const legendEntries = useMemo(
    () =>
      view === 'range'
        ? [...seriesByBand].map(([id, ids]) => {
            const p = allPoints.find((item) => bandOf(item) === id)!;
            return {
              id,
              label: p.device,
              colorKey: p.sku,
              runId: p.runId,
              active: ids.some((sid) => !hidden.has(sid)),
            };
          })
        : [...new Map(allPoints.map((p) => [p.seriesId, p])).values()].map((p) => ({
            id: p.seriesId,
            label: `${p.device} · ${t.blocks(p.row.num_blocks)}`,
            colorKey: p.colorKey,
            runId: p.runId,
            active: !hidden.has(p.seriesId),
          })),
    [view, seriesByBand, allPoints, hidden, t],
  );
  const lineMeta = new Map(display.map((p) => [p.legendId, p]));
  // Always mounted, so leaving the range view redraws it empty.
  const drawRangeBands = (group: PlotGroup, xScale: unknown, yScale: unknown) => {
    const x = xScale as d3.ScaleLogarithmic<number, number>;
    const y = yScale as d3.ScaleContinuousNumeric<number, number>;
    const area = d3
      .area<SwapRangePoint>()
      .x((d) => x(d.x))
      .y0((d) => y(d.lo))
      .y1((d) => y(d.hi))
      .curve(d3.curveLinear);
    group
      .selectAll<SVGPathElement, (typeof bands)[number]>('path.swap-range-band')
      .data(view === 'range' ? bands : [], (band) => band.id)
      .join('path')
      .attr('class', 'swap-range-band')
      .attr('data-testid', 'swap-range-band')
      .attr('fill', (band) => colorOf(band.sku))
      .attr('fill-opacity', 0.18)
      .attr('stroke', (band) => colorOf(band.sku))
      .attr('stroke-opacity', 0.35)
      .attr('stroke-width', 0.75)
      .attr('d', (band) => area(band.points));
  };
  const xValues = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
  const xMin = xValues[0] ?? 1;
  const xMax = xValues.at(-1) ?? 10;
  const rooflines = metric === 'bandwidth' ? swapRooflines(points, direction) : [];
  const dataMax = d3.max(points, (p) => p.y) ?? 1;
  const yAxis = swapYAxis(
    dataMax,
    rooflines.map((r) => r.gbps),
  );
  const yMax = Math.max(dataMax, ...rooflines.map((r) => r.gbps));
  const yMin = d3.min(points, (p) => p.y) ?? 1;
  const results = datasets.flatMap((d) => d.swap_blocks ?? []);
  if (results.length === 0) return null;
  const skipped = results.reduce((n, r) => n + r.skipped_points, 0);
  const toggle = (id: string) => {
    setHidden((prev) => {
      const ids = seriesByBand.get(id) ?? [id];
      const next = new Set(prev);
      const show = ids.every((sid) => next.has(sid));
      for (const sid of ids) {
        if (show) next.delete(sid);
        else next.add(sid);
      }
      return next;
    });
    track('collectivex_swap_series_toggled', { series: id });
  };
  return (
    <Card data-testid="collectivex-swap-section" className="min-w-0 overflow-hidden">
      <Heading level="card">{t.heading}</Heading>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.description} {view === 'range' ? t.rangeNote : t.seriesNote}
      </p>
      {skipped > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {skipped} {t.skipped}
        </p>
      )}
      <div className="my-3 flex flex-wrap gap-3">
        <SegmentedToggle
          value={view}
          options={[
            { value: 'range', label: t.viewRange },
            { value: 'series', label: t.viewSeries },
          ]}
          onValueChange={(v) => {
            setView(v);
            track('collectivex_swap_view_changed', { view: v });
          }}
          ariaLabel={t.view}
          testId="swap-view"
        />
        <SegmentedToggle
          value={metric}
          options={[
            { value: 'bandwidth', label: t.bandwidth },
            { value: 'latency', label: t.latency },
          ]}
          onValueChange={(v) => {
            setMetric(v);
            track('collectivex_swap_metric_changed', { metric: v });
          }}
          ariaLabel={t.metric}
          testId="swap-metric"
        />
        <SegmentedToggle
          value={direction}
          options={[
            { value: 'h2d', label: 'CPU → GPU' },
            { value: 'd2h', label: 'GPU → CPU' },
            { value: 'd2d', label: 'GPU → GPU' },
          ]}
          onValueChange={(v) => {
            setDirection(v);
            track('collectivex_swap_direction_changed', { direction: v });
          }}
          ariaLabel={t.direction}
          testId="swap-direction"
        />
        <SegmentedToggle
          value={layout}
          options={[
            { value: 'contiguous', label: t.contiguous },
            { value: 'random', label: t.random },
          ]}
          onValueChange={(v) => {
            setLayout(v);
            track('collectivex_swap_layout_changed', { layout: v });
          }}
          ariaLabel={t.layout}
          testId="swap-layout"
        />
        <SegmentedToggle
          value={percentile}
          options={(['p50', 'p90', 'p95', 'p99'] as const).map((value) => ({
            value,
            label: value,
          }))}
          onValueChange={(v) => {
            setPercentile(v);
            track('collectivex_swap_percentile_changed', { percentile: v });
          }}
          ariaLabel={t.percentile}
          testId="swap-percentile"
        />
      </div>
      {rooflines.length > 0 && (
        <div data-testid="swap-roofline-legend" className="mb-3 text-xs text-muted-foreground">
          {rooflines.map((roof) => (
            <p key={roof.id} title={roof.devices.join(', ')}>
              <span
                aria-hidden="true"
                className="mr-2 inline-block w-5 border-t-2 border-dashed border-current align-middle"
              />
              {t.roofline}: {roof.gbps.toLocaleString()} GB/s · {roof.path} ·{' '}
              {roof.devices.join(', ')}
            </p>
          ))}
          <p className="mt-1">{t.rooflineNote}</p>
        </div>
      )}
      <D3Chart<SwapDisplayPoint>
        chartId="collectivex-swap"
        testId="collectivex-swap-chart"
        data={display}
        height={440}
        margin={{ top: 24, right: 24, bottom: 65, left: 82 }}
        watermark="logo"
        xScale={{ type: 'log', domain: [xMin / 1.2, xMax * 1.2], nice: false }}
        yScale={{
          type: metric === 'bandwidth' ? 'linear' : 'log',
          domain: metric === 'bandwidth' ? [0, yAxis.domainMax] : [yMin / 1.2, yMax * 1.2],
          nice: false,
        }}
        xAxis={{
          label: t.x,
          tickFormat: (v) => formatSwapBytes(Number(v)),
          tickValues: (scale) => {
            const project = scale as d3.ScaleLogarithmic<number, number>;
            let last = -Infinity;
            return xValues.filter((value, index) => {
              const pixel = project(value);
              if (index === xValues.length - 1) return true;
              if (pixel - last < 64 || project(xMax) - pixel < 64) return false;
              last = pixel;
              return true;
            });
          },
        }}
        yAxis={{
          label: `${metric === 'bandwidth' ? t.yBandwidth : t.yLatency} · ${percentile} (${metric === 'bandwidth' ? 'GB/s' : `µs, ${t.log}`})`,
          tickCount: 6,
          tickValues:
            metric === 'latency'
              ? (scale) => {
                  const [low, high] = (scale as d3.ScaleLogarithmic<number, number>).domain();
                  return d3
                    .range(Math.floor(Math.log10(low)), Math.ceil(Math.log10(high)) + 1)
                    .flatMap((exponent) => [1, 2, 5].map((n) => n * 10 ** exponent))
                    .filter((value) => value >= low && value <= high);
                }
              : (scale) => {
                  const [low, high] = (scale as LinearScale).domain();
                  const cut = yAxis.breakAt;
                  if (cut === null) return (scale as LinearScale).ticks(6);
                  const below = d3
                    .ticks(Math.max(0, low), Math.min(high, cut), 6)
                    .filter((v) => v < cut * 0.92);
                  const above = rooflines
                    .map((r) => yAxis.toPlot(r.gbps))
                    .filter((v) => v > cut && v >= low && v <= high);
                  return [...below, ...above];
                },
          tickFormat: (v) => {
            const value = metric === 'bandwidth' ? yAxis.fromPlot(Number(v)) : Number(v);
            return value === null ? '' : d3.format('.3~s')(value);
          },
        }}
        layers={[
          {
            type: 'line',
            key: 'swap-lines',
            lines,
            config: {
              getColor: (key) => colorOf(lineMeta.get(key)!.colorKey),
              getStrokeDasharray: (key) =>
                collectiveXRunDasharray(runIndexById.get(lineMeta.get(key)!.runId) ?? 0),
              strokeWidth: view === 'range' ? 2 : 1.75,
              curve: d3.curveLinear,
            },
          },
          {
            type: 'custom',
            key: 'swap-range-bands',
            render: (group, ctx) => drawRangeBands(group, ctx.xScale, ctx.yScale),
            onZoom: (group, ctx) => drawRangeBands(group, ctx.newXScale, ctx.newYScale),
          },
          {
            type: 'point',
            key: 'swap-points',
            data: display,
            config: {
              getCx: () => 0,
              getCy: () => 0,
              getX: (p) => p.x,
              getY: (p) => p.y,
              getColor: (p) => colorOf(p.colorKey),
              getRadius: () => 3.5,
              stroke: 'var(--background)',
              strokeWidth: 1,
              keyFn: (p) => p.id,
              maxPoints: Infinity,
            },
          },
          {
            type: 'roofline',
            key: 'swap-rooflines',
            rooflines: Object.fromEntries(
              rooflines.map((roof) => [
                roof.id,
                [
                  { x: xMin / 1.2, y: yAxis.toPlot(roof.gbps) },
                  { x: xMax * 1.2, y: yAxis.toPlot(roof.gbps) },
                ],
              ]),
            ),
            config: {
              getColor: () => 'var(--muted-foreground)',
              strokeDasharray: '6 4',
              strokeWidth: 1.5,
              curve: d3.curveLinear,
            },
          },
          {
            type: 'custom',
            key: 'swap-roofline-labels',
            render: (group, ctx) =>
              drawRooflineAnnotations(
                group,
                ctx.yScale as LinearScale,
                ctx.width,
                ctx.height,
                rooflines,
                yAxis,
              ),
            onZoom: (group, ctx) =>
              drawRooflineAnnotations(
                group,
                ctx.newYScale as LinearScale,
                ctx.width,
                ctx.height,
                rooflines,
                yAxis,
              ),
          },
        ]}
        tooltip={{
          attachToLayer: 2,
          rulerType: 'crosshair',
          content: (p) => {
            const unit = `${percentile} (${metric === 'bandwidth' ? 'GB/s' : 'µs'})`;
            if (p.range) {
              const range = p.range;
              return chartHoverCard({
                title: p.label,
                subtitle: formatSwapBytes(p.x),
                color: colorOf(p.colorKey),
                metrics: [
                  { value: range.mid.toFixed(3), label: `${t.rangeMedian} · ${unit}` },
                  {
                    value: `${range.lo.toFixed(2)} – ${range.hi.toFixed(2)}`,
                    label: t.rangeHeading,
                  },
                ],
                body: range.members
                  .map(
                    (m) =>
                      `<div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; line-height: 15px; font-variant-numeric: tabular-nums;"><span style="color: var(--muted-foreground);">${t.blocks(m.numBlocks)}</span><span>${m.y.toFixed(3)}</span></div>`,
                  )
                  .join(''),
              });
            }
            const row = p.series!.row;
            return chartHoverCard({
              title: p.label,
              subtitle: `${t.blocks(row.num_blocks)} · ${formatSwapBytes(p.x)}`,
              color: colorOf(p.colorKey),
              metrics: [{ value: p.y.toFixed(3), label: unit }],
              summary: `${t.payload}: ${formatSwapBytes(row.payload_bytes)} · ${row.sample_count} ${t.samples} · ${t.verified}`,
            });
          },
          getRulerX: (p, scale) => (scale as d3.ScaleLogarithmic<number, number>)(p.x),
          getRulerY: (p, scale) => scale(p.y),
        }}
        zoom={{
          enabled: true,
          axes: 'both',
          scaleExtent: [1, 20],
          resetEventName: 'collectivex_swap_zoom_reset',
        }}
        instructions={t.instructions}
        noDataOverlay={
          display.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-muted-foreground">
              {t.noData}
            </p>
          ) : undefined
        }
        legendElement={
          <ChartLegend
            variant="sidebar"
            isLegendExpanded={expanded}
            onExpandedChange={setExpanded}
            onItemRemove={toggle}
            reset={{
              id: 'collectivex-swap-reset-filter',
              disabled: hidden.size === 0,
              onClick: () => {
                setHidden(new Set());
                track('collectivex_swap_filter_reset');
              },
            }}
            legendItems={legendEntries.map((entry) => ({
              name: entry.id,
              label: entry.label,
              color: colorOf(entry.colorKey),
              lineDasharray: collectiveXRunDasharray(runIndexById.get(entry.runId) ?? 0),
              isActive: entry.active,
              onClick: () => toggle(entry.id),
            }))}
          />
        }
      />
    </Card>
  );
}
