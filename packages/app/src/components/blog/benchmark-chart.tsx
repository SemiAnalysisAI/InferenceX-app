'use client';

import { useMemo, useState, useEffect } from 'react';
import * as d3 from 'd3';
import type { HorizontalBarLayerConfig, CustomLayerConfig } from '@/lib/d3-chart/D3Chart/types';
import type { ContinuousScale } from '@/lib/d3-chart/types';

interface BenchmarkEntry {
  gpu: string;
  value: number;
  vendor: 'nvidia' | 'amd' | 'other';
}

interface BenchmarkChartProps {
  /** JSON-encoded array of { gpu, value, vendor } entries. */
  data: string;
  /** X-axis label */
  metric?: string;
}

const VENDOR_COLORS: Record<string, string> = {
  nvidia: 'oklch(0.72 0.17 145)',
  amd: 'oklch(0.68 0.19 25)',
  other: 'oklch(0.7 0.1 260)',
};

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/**
 * Interactive horizontal bar chart for SEO blog articles.
 *
 * Usage in MDX:
 * ```mdx
 * <BenchmarkChart
 *   metric="Throughput/GPU (tok/s)"
 *   data='[{"gpu":"NVIDIA B200","value":18131.6,"vendor":"nvidia"},{"gpu":"AMD MI355X","value":4222.8,"vendor":"amd"}]'
 * />
 * ```
 */
export function BenchmarkChart({
  data: dataJson,
  metric = 'Throughput/GPU (tok/s)',
}: BenchmarkChartProps) {
  const data = useMemo<BenchmarkEntry[]>(() => {
    try {
      const parsed = JSON.parse(dataJson) as BenchmarkEntry[];
      return parsed.toSorted((a, b) => b.value - a.value);
    } catch {
      return [];
    }
  }, [dataJson]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (data.length === 0) return null;

  const dynamicHeight = Math.max(200, data.length * 44 + 64);

  if (!mounted) {
    return <div className="my-6 not-prose" style={{ height: dynamicHeight }} />;
  }

  return <BenchmarkChartClient data={data} metric={metric} height={dynamicHeight} />;
}

function BenchmarkChartClient({
  data,
  metric,
  height,
}: {
  data: BenchmarkEntry[];
  metric: string;
  height: number;
}) {
  const [D3ChartMod, setD3ChartMod] = useState<{
    D3Chart: typeof import('@/lib/d3-chart/D3Chart').D3Chart;
  } | null>(null);

  useEffect(() => {
    import('@/lib/d3-chart/D3Chart').then((mod) => {
      setD3ChartMod({ D3Chart: mod.D3Chart });
    });
  }, []);

  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value)), [data]);
  const yDomain = useMemo(() => data.map((d) => d.gpu), [data]);

  const barLayer: HorizontalBarLayerConfig<BenchmarkEntry> = useMemo(
    () => ({
      type: 'horizontalBar',
      data,
      config: {
        getY: (d) => d.gpu,
        getX: (d) => d.value,
        getColor: (d) => VENDOR_COLORS[d.vendor] ?? VENDOR_COLORS.other,
        rx: 3,
        opacity: 0.9,
        keyFn: (d) => d.gpu,
      },
    }),
    [data],
  );

  const labelLayer: CustomLayerConfig = useMemo(
    () => ({
      type: 'custom',
      key: 'bar-value-labels',
      render: (group, ctx) => {
        const yScale = ctx.yScale as d3.ScaleBand<string>;
        const xScale = ctx.xScale as ContinuousScale;

        group
          .selectAll<SVGTextElement, BenchmarkEntry>('.bar-value')
          .data(data, (d: BenchmarkEntry) => d.gpu)
          .join('text')
          .attr('class', 'bar-value')
          .attr('x', (d) => xScale(d.value) + 6)
          .attr('y', (d) => (yScale(d.gpu) ?? 0) + yScale.bandwidth() / 2)
          .attr('dy', '0.35em')
          .attr('font-size', '12px')
          .attr('fill', 'var(--foreground)')
          .text((d) => formatNumber(d.value));
      },
    }),
    [data],
  );

  if (!D3ChartMod) {
    return <div className="my-6 not-prose" style={{ height }} />;
  }

  const { D3Chart } = D3ChartMod;

  return (
    <div className="my-6 not-prose">
      <D3Chart<BenchmarkEntry>
        chartId="benchmark-bar"
        data={data}
        height={height}
        margin={{ top: 8, right: 90, bottom: 48, left: 100 }}
        watermark="logo"
        clipContent={false}
        instructions=""
        xScale={{ type: 'linear', domain: [0, maxValue * 1.15], nice: true }}
        yScale={{ type: 'band', domain: yDomain, padding: 0.2 }}
        xAxis={{
          label: metric,
          tickFormat: (d: d3.AxisDomain) => formatNumber(d as number),
          tickCount: 5,
        }}
        yAxis={{
          customize: (axisGroup) => {
            axisGroup.selectAll('.tick text').each(function () {
              const el = d3.select(this as SVGTextElement);
              const fullLabel = el.text();
              const lastSpace = fullLabel.lastIndexOf(' ');
              el.text(null);
              el.attr('transform', 'translate(0, 5)');
              if (lastSpace > 0) {
                el.append('tspan')
                  .text(fullLabel.slice(0, lastSpace))
                  .attr('x', -8)
                  .attr('dy', '-0.4em')
                  .attr('font-size', '12px')
                  .attr('font-weight', '600');
                el.append('tspan')
                  .text(fullLabel.slice(lastSpace + 1))
                  .attr('x', -8)
                  .attr('dy', '1.2em')
                  .attr('font-size', '10px')
                  .style('fill', 'var(--muted-foreground)');
              } else {
                el.append('tspan')
                  .text(fullLabel)
                  .attr('x', -8)
                  .attr('font-size', '12px')
                  .attr('font-weight', '600');
              }
              el.attr('text-anchor', 'end');
            });
          },
        }}
        layers={[barLayer, labelLayer]}
      />
    </div>
  );
}
