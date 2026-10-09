'use client';

import { useId, useMemo } from 'react';
import type * as d3 from 'd3';
import { D3Chart, type D3ChartProps, type RenderContext } from '@/lib/d3-chart/D3Chart';
import { escapeHtml } from '@/lib/utils';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    request: 'request',
    requests: 'requests',
    noData: 'No data',
    above: (count: number, formatted: string) => `+${count} above ${formatted} →`,
  },
  zh: {
    request: '请求',
    requests: '请求',
    noData: '暂无数据',
    above: (count: number, formatted: string) => `+${count} 超出 ${formatted} →`,
  },
} as const;

export interface HistogramEntry {
  request: number;
  requestId?: string;
  value: number;
}

export interface HistogramBucket {
  min: number;
  max: number;
  entries: HistogramEntry[];
}

export interface Percentile {
  label: string;
  value: number;
}

const GUIDE_COLORS: Record<string, string> = {
  p50: '#3b82f6',
  p75: '#22c55e',
  p90: '#f59e0b',
  p95: '#ef4444',
};

/** Keep the existing p95 + 10% cutoff; the omitted tail is reported below the chart. */
export function buildHistogram(entries: HistogramEntry[], bucketCount: number): HistogramBucket[] {
  if (entries.length === 0) return [];
  const sorted = [...entries].toSorted((a, b) => a.value - b.value);
  if (sorted[0].value === sorted.at(-1)!.value) {
    return [{ min: sorted[0].value, max: sorted[0].value, entries: sorted }];
  }
  const min = sorted[0].value;
  const p95Val = sorted[Math.min(Math.floor(0.95 * sorted.length), sorted.length - 1)].value;
  const max = p95Val + (p95Val - min) * 0.1 || sorted.at(-1)!.value;
  const step = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    min: min + i * step,
    max: min + (i + 1) * step,
    entries: [] as HistogramEntry[],
  }));
  for (const entry of entries) {
    if (entry.value > max) continue;
    buckets[Math.min(Math.floor((entry.value - min) / step), bucketCount - 1)].entries.push(entry);
  }
  return buckets;
}

export function DistributionHistogram({
  buckets,
  percentiles,
  format,
  axisLabel,
  total,
  expanded = false,
  selectedIdx = null,
  onBucketClick,
}: {
  buckets: HistogramBucket[];
  percentiles: Percentile[];
  format: (v: number) => string;
  axisLabel: string;
  total?: number;
  expanded?: boolean;
  selectedIdx?: number | null;
  onBucketClick?: (idx: number) => void;
}) {
  const id = useId().replaceAll(/[^a-zA-Z0-9_-]/g, '');
  const t = STRINGS[useLocale()];
  const chart = useMemo<Omit<D3ChartProps<HistogramBucket>, 'chartId'>>(() => {
    const min = buckets[0]?.min ?? 0;
    const max = buckets.at(-1)?.max ?? 1;
    const degenerate = min === max;
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    const maxCount = Math.max(1, ...buckets.map((b) => b.entries.length));
    const indices = new Map(buckets.map((bucket, i) => [bucket, i]));
    const opacityFor = (bucket: HistogramBucket) =>
      indices.get(bucket) === selectedIdx ? 0.9 : selectedIdx === null ? 0.55 : 0.3;
    const render = (
      group: d3.Selection<SVGGElement, unknown, null, undefined>,
      ctx: RenderContext,
    ) => {
      const sx = (ctx.renderedXScale ?? ctx.xScale) as d3.ScaleLinear<number, number>;
      const sy = (ctx.renderedYScale ?? ctx.yScale) as d3.ScaleLinear<number, number>;
      const bars = group
        .selectAll<SVGRectElement, HistogramBucket>('.histogram-bar')
        .data(buckets.filter((b) => b.entries.length > 0))
        .join('rect')
        .attr('class', 'histogram-bar')
        .attr('x', (b) => (degenerate ? sx(min) - 16 : sx(b.min)))
        .attr('width', (b) => (degenerate ? 32 : Math.max(1, sx(b.max) - sx(b.min) - 1)))
        .attr('y', (b) => sy(b.entries.length))
        .attr('height', (b) => Math.max(0, sy(0) - sy(b.entries.length)))
        .attr('fill', 'currentColor')
        .attr('opacity', opacityFor)
        .style('cursor', onBucketClick ? 'pointer' : 'default');
      group
        .selectAll<SVGLineElement, Percentile>('.histogram-guide')
        .data(percentiles.filter((p) => GUIDE_COLORS[p.label] && p.value >= min && p.value <= max))
        .join('line')
        .attr('class', 'histogram-guide')
        .attr('x1', (p) => sx(p.value))
        .attr('x2', (p) => sx(p.value))
        .attr('y1', 0)
        .attr('y2', ctx.height)
        .attr('stroke', (p) => GUIDE_COLORS[p.label])
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 3')
        .style('pointer-events', 'none');
      return bars;
    };
    return {
      data: buckets,
      height: expanded ? 460 : 220,
      margin: { top: 14, right: 12, bottom: 55, left: 50 },
      watermark: 'none',
      grabCursor: expanded,
      instructions: expanded ? undefined : '',
      xScale: {
        type: 'linear',
        domain: degenerate ? [min - padding, max + padding] : [min, max],
        nice: false,
      },
      yScale: { type: 'linear', domain: [0, maxCount], nice: true },
      xAxis: {
        label: axisLabel,
        tickCount: expanded ? 8 : 4,
        tickValues: degenerate ? [min] : undefined,
        tickFormat: (value) => format(Number(value)).replace(/\.0(?=\D|$)/u, ''),
      },
      yAxis: {
        tickCount: Math.min(5, maxCount),
        tickFormat: (value) => (Number.isInteger(Number(value)) ? String(value) : ''),
      },
      layers: [
        {
          type: 'custom',
          key: 'histogram',
          render,
          onZoom: (group, ctx) => {
            render(group, { ...ctx, renderedXScale: ctx.newXScale, renderedYScale: ctx.newYScale });
          },
        },
      ],
      zoom: { enabled: expanded },
      tooltip: {
        rulerType: 'none',
        attachToLayer: 0,
        onHoverStart: (selection, bucket) => {
          selection.attr('opacity', Math.max(0.75, opacityFor(bucket)));
        },
        onHoverEnd: (selection, bucket) => {
          selection.attr('opacity', opacityFor(bucket));
        },
        content: (b) =>
          `${escapeHtml(format(b.min))} – ${escapeHtml(format(b.max))}: ${b.entries.length} ${b.entries.length === 1 ? t.request : t.requests}`,
        onPointClick: onBucketClick ? (b) => onBucketClick(indices.get(b)!) : undefined,
      },
      noDataOverlay:
        buckets.length === 0 ? <p className="p-8 text-center">{t.noData}</p> : undefined,
    };
  }, [buckets, percentiles, format, axisLabel, expanded, selectedIdx, onBucketClick, t]);
  const beyondAxis = (total ?? 0) - buckets.reduce((n, b) => n + b.entries.length, 0);

  return (
    <div className="w-full">
      <D3Chart {...chart} chartId={`agentic-histogram-${id}`} />
      {beyondAxis > 0 && buckets.length > 0 && (
        <p className="text-right text-xs text-muted-foreground">
          {t.above(beyondAxis, format(buckets.at(-1)!.max).replace(/\.0(?=\D|$)/u, ''))}
        </p>
      )}
      <div className="mt-3 grid grid-cols-5 gap-1.5 border-t border-border pt-3">
        {percentiles.map((p) => (
          <div
            key={p.label}
            className="min-w-0 rounded-md border border-border bg-surface-hover px-1 py-1.5 text-center"
          >
            <div className="flex items-center justify-center gap-1 text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
              {GUIDE_COLORS[p.label] && (
                <span
                  className="inline-block h-0.5 w-2.5"
                  style={{ backgroundColor: GUIDE_COLORS[p.label] }}
                />
              )}
              {p.label}
            </div>
            <div
              className={`mt-0.5 truncate font-mono font-bold tracking-tight ${expanded ? 'text-sm' : 'text-xs'}`}
            >
              {format(p.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
