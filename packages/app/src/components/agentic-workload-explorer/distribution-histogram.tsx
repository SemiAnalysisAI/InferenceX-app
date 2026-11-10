'use client';

import { useId, useMemo } from 'react';
import * as d3 from 'd3';
import { D3Chart, type D3ChartProps, type RenderContext } from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { localeTag } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { Stat } from '@/components/ui/stat';
import { CHART_COLORS } from '@/components/agentic-workload-explorer/series-colors';
import { formatAxisNumber } from '@/components/agentic-workload-explorer/trends-charts';

const STRINGS = {
  en: {
    request: 'request',
    requests: 'requests',
    noData: 'No data',
    above: (count: string, formatted: string) => `+${count} above ${formatted}`,
  },
  zh: {
    request: '请求',
    requests: '请求',
    noData: '暂无数据',
    above: (count: string, formatted: string) => `+${count} 超出 ${formatted}`,
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

/** A pre-binned bucket whose size is known without the individual entries. */
export interface CountBucket {
  min: number;
  max: number;
  count: number;
}

type AnyBucket = HistogramBucket | CountBucket;

function bucketSize(bucket: AnyBucket): number {
  return 'count' in bucket ? bucket.count : bucket.entries.length;
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
  p99: CHART_COLORS[4],
};

const UNIT_BASES = [1, 60, 3600, 86400];

/**
 * Raw units per displayed unit, read off the formatter's output at `v`, so seconds printed as
 * hours give 3600. Snapped to a power of ten times a time base, or 1 when nothing fits.
 */
function displayUnit(format: (v: number) => string, v: number): number {
  const shown = Math.abs(Number(/\d+(?:\.\d+)?/u.exec(format(v).replaceAll(',', ''))?.[0]));
  if (!(shown > 0) || v === 0) return 1;
  const estimate = Math.abs(v) / shown;
  for (const base of UNIT_BASES) {
    const unit = base * 10 ** Math.round(Math.log10(estimate / base));
    if (Math.abs(estimate / unit - 1) < 0.06) return unit;
  }
  return 1;
}

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
  color,
  countLabel,
}: {
  buckets: readonly (HistogramBucket | CountBucket)[];
  percentiles: Percentile[];
  format: (v: number) => string;
  axisLabel: string;
  total?: number;
  expanded?: boolean;
  selectedIdx?: number | null;
  onBucketClick?: (idx: number) => void;
  /** Bar fill; defaults to the inherited text color. */
  color?: string;
  /** Hover-card noun for one item and for several; defaults to request(s). */
  countLabel?: { one: string; other: string };
}) {
  const id = useId().replaceAll(/[^a-zA-Z0-9_-]/g, '');
  const locale = useLocale();
  const t = STRINGS[locale];
  const chart = useMemo<Omit<D3ChartProps<AnyBucket>, 'chartId'>>(() => {
    const min = buckets[0]?.min ?? 0;
    const max = buckets.at(-1)?.max ?? 1;
    const degenerate = min === max;
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    const maxCount = Math.max(1, ...buckets.map(bucketSize));
    const indices = new Map(buckets.map((bucket, i) => [bucket, i]));
    const opacityFor = (bucket: AnyBucket) =>
      indices.get(bucket) === selectedIdx ? 0.9 : selectedIdx === null ? 0.55 : 0.3;
    const render = (
      group: d3.Selection<SVGGElement, unknown, null, undefined>,
      ctx: RenderContext,
    ) => {
      const sx = (ctx.renderedXScale ?? ctx.xScale) as d3.ScaleLinear<number, number>;
      const sy = (ctx.renderedYScale ?? ctx.yScale) as d3.ScaleLinear<number, number>;
      const bars = group
        .selectAll<SVGRectElement, AnyBucket>('.histogram-bar')
        .data(buckets.filter((b) => bucketSize(b) > 0))
        .join('rect')
        .attr('class', 'histogram-bar')
        .attr('x', (b) => (degenerate ? sx(min) - 16 : sx(b.min)))
        .attr('width', (b) => (degenerate ? 32 : Math.max(1, sx(b.max) - sx(b.min) - 1)))
        .attr('y', (b) => sy(bucketSize(b)))
        .attr('height', (b) => Math.max(0, sy(0) - sy(bucketSize(b))))
        .attr('fill', color ?? 'currentColor')
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
      data: [...buckets],
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
        tickValues: degenerate
          ? [min]
          : (scale) => {
              const [lo, hi] = (scale as d3.ScaleLinear<number, number>).domain();
              const unit = displayUnit(format, Math.max(Math.abs(lo), Math.abs(hi)));
              return d3.ticks(lo / unit, hi / unit, expanded ? 8 : 4).map((tick) => tick * unit);
            },
        tickFormat: (value) => format(Number(value)).replace(/\.0(?=\D|$)/u, ''),
      },
      yAxis: {
        tickValues: (scale) =>
          (scale as d3.ScaleLinear<number, number>)
            .ticks(Math.min(5, maxCount))
            .filter(Number.isInteger),
        tickFormat: (value) => formatAxisNumber(Number(value)),
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
          chartHoverCard({
            title: `${format(b.min)} – ${format(b.max)}`,
            metrics: [
              {
                value: bucketSize(b).toLocaleString(),
                label:
                  bucketSize(b) === 1
                    ? (countLabel?.one ?? t.request)
                    : (countLabel?.other ?? t.requests),
              },
            ],
          }),
        onPointClick: onBucketClick ? (b) => onBucketClick(indices.get(b)!) : undefined,
      },
      noDataOverlay:
        buckets.length === 0 ? <p className="p-8 text-center">{t.noData}</p> : undefined,
    };
  }, [
    buckets,
    percentiles,
    format,
    axisLabel,
    expanded,
    selectedIdx,
    onBucketClick,
    color,
    countLabel,
    t,
  ]);
  const beyondAxis = (total ?? 0) - buckets.reduce((n, b) => n + bucketSize(b), 0);

  return (
    <div className="w-full">
      <D3Chart {...chart} chartId={`agentic-histogram-${id}`} />
      {beyondAxis > 0 && buckets.length > 0 && (
        <p className="text-right text-xs text-muted-foreground">
          {t.above(
            beyondAxis.toLocaleString(localeTag(locale)),
            format(buckets.at(-1)!.max).replace(/\.0(?=\D|$)/u, ''),
          )}
        </p>
      )}
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/20 pt-3">
        {percentiles.map((p) => (
          <Stat
            key={p.label}
            size={expanded ? 'md' : 'sm'}
            label={
              <span className="inline-flex items-center gap-1.5">
                {GUIDE_COLORS[p.label] && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-0.5 w-2.5"
                    style={{ backgroundColor: GUIDE_COLORS[p.label] }}
                  />
                )}
                {p.label}
              </span>
            }
            value={format(p.value)}
          />
        ))}
      </dl>
    </div>
  );
}
