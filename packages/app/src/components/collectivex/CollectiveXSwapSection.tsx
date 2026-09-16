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
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { collectiveXRunDasharray } from './data';
import { formatSwapBytes, swapChartPoints, type SwapChartPoint } from './swap-data';

const STRINGS = {
  en: {
    heading: 'vLLM swap_blocks',
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
    run: 'Run',
    description:
      'Host-observed copy latency includes submission and CUDA synchronization. Bandwidth counts copied payload once (GB/s, linear). Each line holds the number of blocks fixed.',
    yLatency: 'Latency',
    yBandwidth: 'Payload bandwidth',
    noData: 'No measured swap-block points match this selection.',
    samples: 'samples',
    verified: 'Correctness verified',
    skipped: 'combinations excluded by the payload budget',
    instructions:
      'Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip',
  },
  zh: {
    heading: 'vLLM swap_blocks',
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
    run: '运行',
    description:
      '主机侧观测的复制延迟包含提交和 CUDA 同步时间。带宽按复制的有效载荷计算一次（GB/s，线性坐标）。每条线对应固定的块数量。',
    yLatency: '延迟',
    yBandwidth: '有效载荷带宽',
    noData: '当前筛选条件下没有实测块交换数据。',
    samples: '个样本',
    verified: '正确性校验通过',
    skipped: '个组合因超出有效载荷预算而未测量',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
  },
} as const;
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

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
  const series = useMemo(
    () => [...new Map(allPoints.map((p) => [p.seriesId, p])).values()],
    [allPoints],
  );
  const colorKeys = useMemo(
    () => [...new Set(allPoints.map((p) => p.colorKey))].sort(),
    [allPoints],
  );
  const color = (p: SwapChartPoint) => d3.schemeTableau10[colorKeys.indexOf(p.colorKey) % 10];
  const lines = useMemo(() => {
    const grouped: Record<string, { x: number; y: number }[]> = {};
    for (const p of points) (grouped[p.seriesId] ??= []).push({ x: p.x, y: p.y });
    for (const line of Object.values(grouped)) line.sort((a, b) => a.x - b.x);
    return grouped;
  }, [points]);
  const byId = new Map(series.map((p) => [p.seriesId, p]));
  const xValues = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
  const xMin = xValues[0] ?? 1;
  const xMax = xValues.at(-1) ?? 10;
  const yMax = d3.max(points, (p) => p.y) ?? 1;
  const yMin = d3.min(points, (p) => p.y) ?? 1;
  const results = datasets.flatMap((d) => d.swap_blocks ?? []);
  if (results.length === 0) return null;
  const skipped = results.reduce((n, r) => n + r.skipped_points, 0);
  const toggle = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    track('collectivex_swap_series_toggled', { series: id });
  };
  return (
    <Card data-testid="collectivex-swap-section" className="min-w-0 overflow-hidden">
      <Heading level="card">{t.heading}</Heading>
      <p className="text-sm text-muted-foreground">{t.description}</p>
      {skipped > 0 && (
        <p className="text-xs text-muted-foreground">
          {skipped} {t.skipped}
        </p>
      )}
      <div className="my-3 flex flex-wrap gap-3">
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
      <D3Chart<SwapChartPoint>
        chartId="collectivex-swap"
        testId="collectivex-swap-chart"
        data={points}
        height={440}
        margin={{ top: 24, right: 24, bottom: 65, left: 82 }}
        watermark="logo"
        xScale={{ type: 'log', domain: [xMin / 1.2, xMax * 1.2], nice: false }}
        yScale={{
          type: metric === 'bandwidth' ? 'linear' : 'log',
          domain: metric === 'bandwidth' ? [0, yMax * 1.1] : [yMin / 1.2, yMax * 1.2],
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
              : undefined,
          tickFormat: (v) => d3.format('.3~s')(Number(v)),
        }}
        layers={[
          {
            type: 'line',
            key: 'swap-lines',
            lines,
            config: {
              getColor: (key) => color(byId.get(key)!),
              getStrokeDasharray: (key) =>
                collectiveXRunDasharray(runIndexById.get(byId.get(key)!.runId) ?? 0),
              strokeWidth: 1.75,
              curve: d3.curveLinear,
            },
          },
          {
            type: 'point',
            key: 'swap-points',
            data: points,
            config: {
              getCx: () => 0,
              getCy: () => 0,
              getX: (p) => p.x,
              getY: (p) => p.y,
              getColor: color,
              getRadius: () => 3.5,
              stroke: 'var(--background)',
              strokeWidth: 1,
              keyFn: (p) => `${p.seriesId}:${p.x}`,
              maxPoints: Infinity,
            },
          },
        ]}
        tooltip={{
          attachToLayer: 1,
          rulerType: 'crosshair',
          content: (p) =>
            `<div class="rounded-md border bg-background p-3 text-xs shadow-md"><strong>${escapeHtml(p.device)} · ${t.blocks(p.row.num_blocks)}</strong><div>${t.run} #${escapeHtml(p.runId)} · ${formatSwapBytes(p.x)}</div><div>${t.payload}: ${formatSwapBytes(p.row.payload_bytes)}</div><div>${percentile}: ${p.y.toFixed(3)} ${metric === 'bandwidth' ? 'GB/s' : 'µs'}</div><div>${p.row.sample_count} ${t.samples} · ${t.verified}</div></div>`,
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
          points.length === 0 ? (
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
            disableActiveSort
            legendItems={series.map((p) => ({
              name: p.seriesId,
              label: `${p.device} · ${t.blocks(p.row.num_blocks)}`,
              title: `${t.run} #${p.runId}`,
              color: color(p),
              lineDasharray: collectiveXRunDasharray(runIndexById.get(p.runId) ?? 0),
              isActive: !hidden.has(p.seriesId),
              onClick: () => toggle(p.seriesId),
            }))}
          />
        }
      />
    </Card>
  );
}
