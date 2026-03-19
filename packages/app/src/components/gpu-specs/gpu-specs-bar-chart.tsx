'use client';

import { type ReactNode, useMemo } from 'react';
import { track } from '@/lib/analytics';

import { select, type Selection, type ScaleLinear, type ScaleBand } from 'd3';

import { contrastColors } from '@/lib/d3-chart/contrast-colors';
import { GPU_SPECS, GPU_CHART_METRICS } from '@/lib/gpu-specs';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  CustomLayerConfig,
  HorizontalBarLayerConfig,
  RenderContext,
} from '@/lib/d3-chart/D3Chart/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NVIDIA_BAR_COLOR = '#76b900';
const AMD_BAR_COLOR = '#ed1c24';

interface ChartDatum {
  name: string;
  vendor: 'nvidia' | 'amd';
  value: number;
}

/** Position value + overlay labels together, flipping both when the longer one doesn't fit. */
function positionLabelPairs(
  group: Selection<SVGGElement, unknown, null, undefined>,
  xScale: ScaleLinear<number, number>,
  getBarColor: (d: ChartDatum) => string,
) {
  const valueLabels = group.selectAll<SVGTextElement, ChartDatum>('.value-label');
  const overlayLabels = group.selectAll<SVGTextElement, ChartDatum>('.overlay-label');

  // Build a map of max text width per name
  const maxWidths = new Map<string, number>();
  valueLabels.each(function (d) {
    maxWidths.set(d.name, this.getComputedTextLength());
  });
  overlayLabels.each(function (d) {
    const prev = maxWidths.get(d.name) ?? 0;
    maxWidths.set(d.name, Math.max(prev, this.getComputedTextLength()));
  });

  const applyOutlined = (sel: Selection<SVGTextElement, ChartDatum, SVGGElement, unknown>) => {
    sel.each(function (d) {
      const barEnd = xScale(d.value);
      const maxW = maxWidths.get(d.name) ?? 0;
      const fitsInside = barEnd > maxW + 24;
      const fill = fitsInside ? contrastColors(getBarColor(d)) : 'var(--foreground)';
      select(this)
        .attr('x', fitsInside ? barEnd - 10 : barEnd + 6)
        .attr('text-anchor', fitsInside ? 'end' : 'start')
        .style('fill', fill)
        .attr('stroke', null);
    });
  };

  applyOutlined(valueLabels);
  applyOutlined(overlayLabels);
}

/** Format a numeric value with commas and up to 2 decimals. */
function formatValue(value: number): string {
  if (value >= 1000 && Number.isInteger(value)) {
    return value.toLocaleString('en-US');
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2).replace(/\.?0+$/, '');
}

interface GpuSpecsBarChartProps {
  selectedMetric: string;
  onMetricChange: (metric: string) => void;
  caption?: ReactNode;
}

export function GpuSpecsBarChart({
  selectedMetric,
  onMetricChange,
  caption,
}: GpuSpecsBarChartProps) {
  const metric = useMemo(
    () => GPU_CHART_METRICS.find((m) => m.key === selectedMetric) ?? GPU_CHART_METRICS[0],
    [selectedMetric],
  );

  const chartData = useMemo(() => {
    return GPU_SPECS.map((spec) => ({
      name: spec.name,
      vendor: spec.vendor,
      value: metric.getValue(spec),
    }))
      .filter((d): d is ChartDatum => d.value !== null)
      .sort((a, b) => b.value - a.value);
  }, [metric]);

  const maxValue = useMemo(() => Math.max(...chartData.map((d) => d.value), 0) * 1.1, [chartData]);

  const barLayer = useMemo(
    (): HorizontalBarLayerConfig<ChartDatum> => ({
      type: 'horizontalBar',
      key: 'gpu-bars',
      data: chartData,
      config: {
        getY: (d) => d.name,
        getX: (d) => d.value,
        getColor: (d) => (d.vendor === 'nvidia' ? NVIDIA_BAR_COLOR : AMD_BAR_COLOR),
        rx: 2,
        opacity: 1,
        keyFn: (d) => d.name,
      },
    }),
    [chartData],
  );

  const unit = metric.unit;
  const labelLayer = useMemo(
    (): CustomLayerConfig => ({
      type: 'custom',
      key: 'value-labels',
      render: (group: Selection<SVGGElement, unknown, null, undefined>, ctx: RenderContext) => {
        const xScale = ctx.xScale as ScaleLinear<number, number>;
        const yScale = ctx.yScale as ScaleBand<string>;
        // Remove stale labels from previous render (e.g. old .bar-value class)
        group.selectAll('.bar-value').remove();

        // Value labels (top line, bold)
        group
          .selectAll<SVGTextElement, ChartDatum>('.value-label')
          .data(chartData, (d) => d.name)
          .join('text')
          .attr('class', 'value-label')
          .attr('y', (d) => (yScale(d.name) ?? 0) + yScale.bandwidth() / 2 - 6)
          .attr('dy', '0.35em')
          .attr('font-size', '12px')
          .attr('font-weight', '600')
          .style('fill', 'var(--foreground)')
          .style('pointer-events', 'none')
          .text((d) => `${formatValue(d.value)} ${unit}`);

        // Subtitle labels (bottom line, muted)
        group
          .selectAll<SVGTextElement, ChartDatum>('.overlay-label')
          .data(chartData, (d) => d.name)
          .join('text')
          .attr('class', 'overlay-label')
          .attr('y', (d) => (yScale(d.name) ?? 0) + yScale.bandwidth() / 2 + 8)
          .attr('dy', '0.35em')
          .attr('font-size', '10px')
          .attr('font-weight', '500')
          .style('fill', 'var(--muted-foreground)')
          .style('pointer-events', 'none')
          .text((d) => (d.vendor === 'nvidia' ? 'NVIDIA' : 'AMD'));

        // Position both labels together using the longer text width
        positionLabelPairs(group, xScale, (d) =>
          d.vendor === 'nvidia' ? NVIDIA_BAR_COLOR : AMD_BAR_COLOR,
        );
      },
    }),
    [chartData, unit],
  );

  const xAxisLabel = `${metric.label} (${metric.unit})`;

  const tooltip = useMemo(
    () => ({
      rulerType: 'vertical' as const,
      content: (d: ChartDatum) => {
        const vendorColor = d.vendor === 'nvidia' ? NVIDIA_BAR_COLOR : AMD_BAR_COLOR;
        const vendorLabel = d.vendor === 'nvidia' ? 'NVIDIA' : 'AMD';
        return `
          <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
              <div style="width: 10px; height: 10px; border-radius: 2px; background: ${vendorColor};"></div>
              <span style="color: var(--foreground); font-size: 12px; font-weight: 600;">${d.name}</span>
              <span style="font-size: 10px; color: ${vendorColor}; font-weight: 500;">${vendorLabel}</span>
            </div>
            <div style="color: var(--muted-foreground); font-size: 11px;">
              <strong>${metric.label}:</strong> ${formatValue(d.value)} ${metric.unit}
            </div>
          </div>`;
      },
      getRulerX: (d: ChartDatum, xs: any) => {
        return (xs as ScaleLinear<number, number>)(d.value);
      },
      getRulerY: (d: ChartDatum, ys: any) => {
        const bandScale = ys as ScaleBand<string>;
        return (bandScale(d.name) ?? 0) + bandScale.bandwidth() / 2;
      },
      onHoverStart: (sel: Selection<any, ChartDatum, any, any>) => {
        sel.attr('stroke', 'var(--foreground)').attr('stroke-width', 1.5);
      },
      onHoverEnd: (sel: Selection<any, ChartDatum, any, any>) => {
        sel.attr('stroke', 'none');
      },
      attachToLayer: 0,
    }),
    [metric],
  );

  const layers = useMemo(() => [barLayer, labelLayer], [barLayer, labelLayer]);

  const xAxisConfig = useMemo(() => ({ label: xAxisLabel, tickCount: 6 }), [xAxisLabel]);

  const yAxisConfig = useMemo(
    () => ({
      customize: (axisGroup: Selection<SVGGElement, unknown, null, undefined>) => {
        axisGroup.selectAll('.tick text').attr('font-size', '12px').attr('font-weight', '500');
      },
    }),
    [],
  );

  const xScaleConfig = useMemo(
    () => ({ type: 'linear' as const, domain: [0, maxValue] as [number, number] }),
    [maxValue],
  );

  const yScaleConfig = useMemo(
    () => ({
      type: 'band' as const,
      domain: chartData.map((d) => d.name),
      padding: 0.2,
    }),
    [chartData],
  );

  if (chartData.length === 0) {
    return (
      <div data-testid="gpu-specs-bar-chart">
        <div className="flex items-center gap-3 mb-4 px-4 md:px-8">
          <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            Metric:
          </label>
          <Select
            value={selectedMetric}
            onValueChange={(value) => {
              onMetricChange(value);
              track('gpu_specs_chart_metric_changed', { metric: value });
            }}
          >
            <SelectTrigger className="w-[240px]" data-testid="gpu-specs-metric-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GPU_CHART_METRICS.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label} ({m.unit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-center h-60 text-muted-foreground">
          No data available for this metric.
        </div>
      </div>
    );
  }

  return (
    <div data-testid="gpu-specs-bar-chart">
      <div className="flex items-center gap-3 mb-4 px-4 md:px-8">
        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          Metric:
        </label>
        <Select
          value={selectedMetric}
          onValueChange={(value) => {
            onMetricChange(value);
            track('gpu_specs_chart_metric_changed', { metric: value });
          }}
        >
          <SelectTrigger className="w-[240px]" data-testid="gpu-specs-metric-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GPU_CHART_METRICS.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                {m.label} ({m.unit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <D3Chart<ChartDatum>
        chartId="gpu-specs-bar-chart"
        testId="gpu-specs-bar-d3-chart"
        data={chartData}
        height={Math.max(600, chartData.length * 45 + 80)}
        margin={{ top: 24, right: 24, bottom: 60, left: 140 }}
        watermark="logo"
        clipContent={false}
        grabCursor={false}
        instructions="Hover over a bar for details"
        xScale={xScaleConfig}
        yScale={yScaleConfig}
        xAxis={xAxisConfig}
        yAxis={yAxisConfig}
        layers={layers as any}
        tooltip={tooltip}
        caption={caption}
      />

      <div className="px-4 md:px-8 pt-2">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: NVIDIA_BAR_COLOR }} />
            NVIDIA
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: AMD_BAR_COLOR }} />
            AMD
          </div>
        </div>
        {metric.key === 'fp4' && (
          <p className="text-xs text-muted-foreground mt-2">
            GPUs without FP4 support (H100, H200, MI300X, MI325X) are excluded.
          </p>
        )}
      </div>
    </div>
  );
}
