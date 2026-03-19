'use client';

import { type ReactNode, useMemo, useState, useCallback } from 'react';
import { track } from '@/lib/analytics';

import type * as d3 from 'd3';

import { GPU_SPECS, GPU_CHART_METRICS, type GpuSpec } from '@/lib/gpu-specs';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LayerConfig } from '@/lib/d3-chart/D3Chart/types';
import type { RadarDot } from '@/lib/d3-chart/layers/radar';
import ChartLegend from '@/components/ui/chart-legend';

const NVIDIA_COLOR = '#76b900';
const AMD_COLOR = '#ed1c24';

/** Metrics to display on the radar chart axes. Excludes worldSize (discrete) and scaleOutBandwidth (nullable). */
const RADAR_METRICS = GPU_CHART_METRICS.filter(
  (m) => m.key !== 'scaleUpWorldSize' && m.key !== 'scaleOutBandwidth',
);

/** Get a unique color per GPU. NVIDIA GPUs get green-ish hues, AMD gets red-ish hues. */
function getGpuColor(spec: GpuSpec, _index: number): string {
  const nvidiaColors = ['#76b900', '#5a9e00', '#8fd400', '#4a8400', '#a0e800', '#3d6e00'];
  const amdColors = ['#ed1c24', '#c41920', '#ff4d52'];

  if (spec.vendor === 'nvidia') {
    const nvidiaGpus = GPU_SPECS.filter((s) => s.vendor === 'nvidia');
    const nvidiaIdx = nvidiaGpus.indexOf(spec);
    return nvidiaColors[nvidiaIdx % nvidiaColors.length];
  }
  const amdGpus = GPU_SPECS.filter((s) => s.vendor === 'amd');
  const amdIdx = amdGpus.indexOf(spec);
  return amdColors[amdIdx % amdColors.length];
}

interface NormalizedGpu {
  gpu: GpuSpec;
  values: (number | null)[];
  color: string;
}

/** Normalize values across all GPUs for each metric to 0-1 range. */
export function normalizeGpuData(specs: GpuSpec[], metrics: typeof RADAR_METRICS): NormalizedGpu[] {
  const maxValues = metrics.map((metric) => {
    const values = specs
      .map((spec) => metric.getValue(spec))
      .filter((v): v is number => v !== null);
    return Math.max(...values, 1);
  });

  return specs.map((spec, idx) => ({
    gpu: spec,
    values: metrics.map((metric, i) => {
      const raw = metric.getValue(spec);
      if (raw === null) return null;
      return raw / maxValues[i];
    }),
    color: getGpuColor(spec, idx),
  }));
}

interface GpuSpecsRadarChartProps {
  caption?: ReactNode;
}

export function GpuSpecsRadarChart({ caption }: GpuSpecsRadarChartProps) {
  const [selectedGpus, setSelectedGpus] = useState<Set<string>>(
    () => new Set(GPU_SPECS.map((s) => s.name)),
  );
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);

  const metrics = RADAR_METRICS;

  const allNormalized = useMemo(() => normalizeGpuData(GPU_SPECS, metrics), [metrics]);

  const visibleData = useMemo(
    () => allNormalized.filter((d) => selectedGpus.has(d.gpu.name)),
    [allNormalized, selectedGpus],
  );

  const toggleGpu = useCallback((name: string) => {
    setSelectedGpus((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      track('gpu_specs_radar_gpu_toggled', { gpu: name, visible: !prev.has(name) });
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedGpus(new Set(GPU_SPECS.map((s) => s.name)));
    track('gpu_specs_radar_select_all');
  }, []);

  const legendItems = useMemo(
    () =>
      GPU_SPECS.map((spec, idx) => ({
        name: spec.name,
        label: spec.name,
        color: getGpuColor(spec, idx),
        isActive: selectedGpus.has(spec.name),
        onClick: () => toggleGpu(spec.name),
      })),
    [selectedGpus, toggleGpu],
  );

  const radarLayer = useMemo(
    (): LayerConfig<NormalizedGpu> => ({
      type: 'radar',
      key: 'gpu-radar',
      data: visibleData,
      config: {
        axes: metrics.map((m) => ({ label: m.label, unit: m.unit })),
        getValue: (d, i) => d.values[i],
        getRawValue: (d, i) => metrics[i].getValue(d.gpu),
        getColor: (d) => d.color,
        getLabel: (d) => d.gpu.name,
        keyFn: (d) => d.gpu.name,
      },
    }),
    [visibleData, metrics],
  );

  const tooltip = useMemo(
    () => ({
      rulerType: 'none' as const,
      content: (dot: RadarDot<NormalizedGpu>, _isPinned: boolean) => {
        const { item, axisIndex } = dot;
        const metric = metrics[axisIndex];
        const rawValue = metric.getValue(item.gpu);
        const vendorColor = item.gpu.vendor === 'nvidia' ? NVIDIA_COLOR : AMD_COLOR;
        const vendorLabel = item.gpu.vendor === 'nvidia' ? 'NVIDIA' : 'AMD';
        return `
          <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
              <div style="width: 10px; height: 10px; border-radius: 2px; background: ${dot.color};"></div>
              <span style="color: var(--foreground); font-size: 12px; font-weight: 600;">${item.gpu.name}</span>
              <span style="font-size: 10px; color: ${vendorColor}; font-weight: 500;">${vendorLabel}</span>
            </div>
            <div style="color: var(--muted-foreground); font-size: 11px;">
              <strong>${metric.label}:</strong> ${rawValue !== null ? rawValue.toLocaleString('en-US') : '—'} ${metric.unit}
            </div>
          </div>`;
      },
      onHoverStart: (sel: d3.Selection<any, RadarDot<NormalizedGpu>, any, any>) => {
        sel.attr('r', 5.5);
      },
      onHoverEnd: (sel: d3.Selection<any, RadarDot<NormalizedGpu>, any, any>) => {
        sel.attr('r', 3.5);
      },
      attachToLayer: 0,
    }),
    [metrics],
  );

  const layers = useMemo(() => [radarLayer], [radarLayer]);

  if (selectedGpus.size === 0) {
    return (
      <div data-testid="gpu-specs-radar-chart">
        <div className="flex items-center justify-center h-60 text-muted-foreground">
          Select at least one GPU to display the radar chart.
        </div>
      </div>
    );
  }

  return (
    <div data-testid="gpu-specs-radar-chart">
      <D3Chart<RadarDot<NormalizedGpu>>
        chartId="gpu-radar-chart"
        data={visibleData as unknown as RadarDot<NormalizedGpu>[]}
        height={520}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        watermark="logo"
        clipContent={false}
        layers={layers as LayerConfig<RadarDot<NormalizedGpu>>[]}
        tooltip={tooltip}
        caption={caption}
        legendElement={
          <ChartLegend
            variant="sidebar"
            legendItems={legendItems}
            isLegendExpanded={isLegendExpanded}
            onExpandedChange={(expanded) => {
              setIsLegendExpanded(expanded);
              track('gpu_specs_radar_legend_expanded', { expanded });
            }}
            grouped={false}
            showResetFilter={true}
            allSelected={selectedGpus.size === GPU_SPECS.length}
            onResetFilter={() => {
              selectAll();
              track('gpu_specs_radar_reset_filter');
            }}
            disableActiveSort={true}
          />
        }
      />
      <div className="px-4 md:px-8 pt-2">
        <p className="text-xs text-muted-foreground">
          Values are normalized to percentages of the maximum across all GPUs for each metric. GPUs
          without FP4 support show 0% on the FP4 axis.
        </p>
      </div>
    </div>
  );
}
