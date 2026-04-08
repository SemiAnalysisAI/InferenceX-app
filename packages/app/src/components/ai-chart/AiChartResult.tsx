'use client';

import { useMemo } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { InferenceData } from '@/components/inference/types';
import {
  D3Chart,
  type HorizontalBarLayerConfig,
  type ScatterLayerConfig,
  type LineLayerConfig,
  type RadarLayerConfig,
  type TooltipConfig,
  type ScaleConfig,
  type AxisConfig,
} from '@/lib/d3-chart/D3Chart';
import { computeLeftMargin } from '@/lib/d3-chart/dynamic-margins';
import { twoRowYAxisLabels } from '@/lib/d3-chart/axis-labels';

import { ChartButtons } from '@/components/ui/chart-buttons';
import { getHardwareConfig } from '@/lib/constants';
import DOMPurify from 'dompurify';

import type { AiChartBarPoint, AiChartSpec } from './types';
import type { AiSingleChartResult, AiRadarItem } from '@/hooks/api/use-ai-chart';

/** Sanitize tooltip HTML that may contain LLM-generated strings. */
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'span', 'strong', 'br'],
    ALLOWED_ATTR: ['style'],
  });
}

interface AiChartResultProps {
  charts: AiSingleChartResult[];
  summary: string | null;
}

// ---------------------------------------------------------------------------
// Bar Chart (horizontal)
// ---------------------------------------------------------------------------

function BarChart({ data, spec }: { data: AiChartBarPoint[]; spec: AiChartSpec }) {
  const labels = useMemo(() => data.map((d) => d.label), [data]);

  const yScale = useMemo<ScaleConfig>(
    () => ({ type: 'band', domain: labels, padding: 0.3 }),
    [labels],
  );

  const xMax = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);
  const xScale = useMemo<ScaleConfig>(
    () => ({ type: 'linear', domain: [0, xMax * 1.15], nice: true }),
    [xMax],
  );

  const margin = useMemo(
    () => ({
      top: 24,
      right: 24,
      bottom: 48,
      left: computeLeftMargin(labels, { split: 'parens' }),
    }),
    [labels],
  );

  const xAxis = useMemo<AxisConfig>(() => ({ label: spec.yAxisLabel }), [spec.yAxisLabel]);
  const yAxis = useMemo<AxisConfig>(
    () => ({ label: '', customize: twoRowYAxisLabels({ split: 'parens' }) }),
    [],
  );

  const layers = useMemo(() => {
    const barLayer: HorizontalBarLayerConfig<AiChartBarPoint> = {
      type: 'horizontalBar',
      data,
      config: {
        getY: (d) => d.label,
        getX: (d) => d.value,
        getColor: (d) => d.color,
        rx: 4,
      },
    };
    return [barLayer];
  }, [data]);

  const tooltip = useMemo<TooltipConfig<AiChartBarPoint>>(
    () => ({
      rulerType: 'none',
      content: (d) =>
        sanitize(`<div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="width: 10px; height: 10px; border-radius: 2px; background: ${d.color};"></span>
            <span style="color: var(--foreground); font-size: 12px; font-weight: 600;">${d.label}</span>
          </div>
          <div style="color: var(--muted-foreground); font-size: 11px;">
            <strong>${spec.yAxisLabel}:</strong> ${d.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>`),
    }),
    [spec.yAxisLabel],
  );

  return (
    <D3Chart
      chartId="ai-chart-bar"
      data={data}
      height={Math.max(300, data.length * 40 + margin.top + margin.bottom)}
      margin={margin}
      xScale={xScale}
      yScale={yScale}
      xAxis={xAxis}
      yAxis={yAxis}
      layers={layers}
      tooltip={tooltip}
      watermark="logo"
    />
  );
}

// ---------------------------------------------------------------------------
// Scatter Chart
// ---------------------------------------------------------------------------

function ScatterChart({
  data,
  spec,
  colorMap,
}: {
  data: InferenceData[];
  spec: AiChartSpec;
  colorMap: Record<string, string>;
}) {
  const xExtent = useMemo(() => {
    const xs = data.map((d) => d.x);
    return [Math.min(...xs) * 0.9, Math.max(...xs) * 1.1] as [number, number];
  }, [data]);

  const yExtent = useMemo(() => {
    const ys = data.map((d) => d.y);
    return [Math.min(...ys) * 0.9, Math.max(...ys) * 1.1] as [number, number];
  }, [data]);

  const xScale = useMemo<ScaleConfig>(
    () => ({ type: 'linear', domain: xExtent, nice: true }),
    [xExtent],
  );
  const yScale = useMemo<ScaleConfig>(
    () => ({ type: 'linear', domain: yExtent, nice: true }),
    [yExtent],
  );

  const xAxis = useMemo<AxisConfig>(() => ({ label: 'Interactivity (tok/s/user)' }), []);
  const yAxis = useMemo<AxisConfig>(() => ({ label: spec.yAxisLabel }), [spec.yAxisLabel]);

  const layers = useMemo(() => {
    const scatterLayer: ScatterLayerConfig<InferenceData> = {
      type: 'scatter',
      data,
      config: { getColor: (d) => colorMap[d.hwKey ?? ''] ?? '#888' },
    };
    return [scatterLayer];
  }, [data, colorMap]);

  const tooltip = useMemo<TooltipConfig<InferenceData>>(
    () => ({
      rulerType: 'crosshair',
      content: (d) => {
        const hwKey = d.hwKey ?? '';
        const color = colorMap[hwKey] ?? '#888';
        return sanitize(`<div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="width: 10px; height: 10px; border-radius: 2px; background: ${color};"></span>
            <span style="color: var(--foreground); font-size: 12px; font-weight: 600;">${hwKey}</span>
          </div>
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 2px;">
            <strong>Interactivity:</strong> ${d.x.toFixed(1)} tok/s/user
          </div>
          <div style="color: var(--muted-foreground); font-size: 11px;">
            <strong>${spec.yAxisLabel}:</strong> ${d.y.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>`);
      },
    }),
    [colorMap, spec.yAxisLabel],
  );

  return (
    <D3Chart
      chartId="ai-chart-scatter"
      data={data}
      height={500}
      xScale={xScale}
      yScale={yScale}
      xAxis={xAxis}
      yAxis={yAxis}
      layers={layers}
      tooltip={tooltip}
      watermark="logo"
      grabCursor
      instructions="Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip"
      zoom={{
        enabled: true,
        axes: 'both',
        scaleExtent: [0.7, 20],
        resetEventName: 'ai_chart_zoom_reset_ai-chart-scatter',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Line Chart
// ---------------------------------------------------------------------------

interface LinePoint {
  hwKey: string;
  precision: string;
  x: number;
  y: number;
}

function LineChart({
  lineData,
  spec,
  colorMap,
}: {
  lineData: Record<string, { x: number; y: number }[]>;
  spec: AiChartSpec;
  colorMap: Record<string, string>;
}) {
  const flatPoints = useMemo<LinePoint[]>(
    () =>
      Object.entries(lineData).flatMap(([hwKey, pts]) =>
        pts.map((p) => ({ hwKey, precision: 'fp8', x: p.x, y: p.y })),
      ),
    [lineData],
  );

  const xExtent = useMemo(() => {
    const xs = flatPoints.map((d) => d.x);
    return [Math.min(...xs) * 0.95, Math.max(...xs) * 1.05] as [number, number];
  }, [flatPoints]);

  const yExtent = useMemo(() => {
    const ys = flatPoints.map((d) => d.y);
    return [Math.min(...ys, 0) * 0.95, Math.max(...ys) * 1.1] as [number, number];
  }, [flatPoints]);

  const xScale = useMemo<ScaleConfig>(
    () => ({ type: 'linear', domain: xExtent, nice: true }),
    [xExtent],
  );
  const yScale = useMemo<ScaleConfig>(
    () => ({ type: 'linear', domain: yExtent, nice: true }),
    [yExtent],
  );

  const xAxis = useMemo<AxisConfig>(() => ({ label: 'Interactivity (tok/s/user)' }), []);
  const yAxis = useMemo<AxisConfig>(() => ({ label: spec.yAxisLabel }), [spec.yAxisLabel]);

  const layers = useMemo(() => {
    const lineLayer: LineLayerConfig = {
      type: 'line',
      lines: lineData,
      config: {
        getColor: (key) => colorMap[key] ?? '#888',
        strokeWidth: 2.5,
      },
    };
    const scatterLayer: ScatterLayerConfig<LinePoint> = {
      type: 'scatter',
      data: flatPoints,
      config: {
        getColor: (d) => colorMap[d.hwKey] ?? '#888',
        hideLabels: true,
      },
    };
    return [lineLayer, scatterLayer];
  }, [lineData, flatPoints, colorMap]);

  const tooltip = useMemo<TooltipConfig<LinePoint>>(
    () => ({
      rulerType: 'crosshair',
      content: (d) => {
        const color = colorMap[d.hwKey] ?? '#888';
        const config = getHardwareConfig(d.hwKey);
        const label = config
          ? `${config.label}${config.suffix ? ` ${config.suffix}` : ''}`
          : d.hwKey;
        return sanitize(`<div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="width: 10px; height: 10px; border-radius: 2px; background: ${color};"></span>
            <span style="color: var(--foreground); font-size: 12px; font-weight: 600;">${label}</span>
          </div>
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 2px;">
            <strong>Interactivity:</strong> ${d.x.toFixed(1)} tok/s/user
          </div>
          <div style="color: var(--muted-foreground); font-size: 11px;">
            <strong>${spec.yAxisLabel}:</strong> ${d.y.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>`);
      },
      getRulerX: (d, xS) => (xS as any)(d.x),
      getRulerY: (d, yS) => (yS as any)(d.y),
      attachToLayer: 1,
    }),
    [colorMap, spec.yAxisLabel],
  );

  return (
    <D3Chart
      chartId="ai-chart-line"
      data={flatPoints}
      height={500}
      xScale={xScale}
      yScale={yScale}
      xAxis={xAxis}
      yAxis={yAxis}
      layers={layers}
      tooltip={tooltip}
      watermark="logo"
      grabCursor
      instructions="Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip"
      zoom={{
        enabled: true,
        axes: 'both',
        scaleExtent: [0.7, 20],
        resetEventName: 'ai_chart_zoom_reset_ai-chart-line',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Radar Chart
// ---------------------------------------------------------------------------

function RadarChart({
  data,
  axes,
}: {
  data: AiRadarItem[];
  axes: { label: string; unit?: string }[];
}) {
  const layers = useMemo(() => {
    const radarLayer: RadarLayerConfig<AiRadarItem> = {
      type: 'radar',
      data,
      config: {
        axes,
        getValue: (d, i) => d.values[i] ?? null,
        getRawValue: (d, i) => d.rawValues[i] ?? null,
        getColor: (d) => d.color,
        getLabel: (d) => d.label,
        keyFn: (d) => d.hwKey,
        levels: 5,
        labelMargin: 40,
      },
    };
    return [radarLayer];
  }, [data, axes]);

  const tooltip = useMemo<TooltipConfig<AiRadarItem>>(
    () => ({
      rulerType: 'none',
      content: (d) => {
        const metricRows = axes
          .map((axis, i) => {
            const raw = d.rawValues[i];
            return raw !== null
              ? `<div><strong>${axis.label}:</strong> ${raw.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>`
              : '';
          })
          .filter(Boolean)
          .join('');
        return sanitize(`<div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="width: 10px; height: 10px; border-radius: 2px; background: ${d.color};"></span>
            <span style="color: var(--foreground); font-size: 12px; font-weight: 600;">${d.label}</span>
          </div>
          <div style="color: var(--muted-foreground); font-size: 11px;">${metricRows}</div>
        </div>`);
      },
    }),
    [axes],
  );

  // Radar ignores scales/axes — it draws its own grid. Provide dummy scales.
  const dummyScale = useMemo<ScaleConfig>(() => ({ type: 'linear', domain: [0, 1] }), []);

  return (
    <D3Chart
      chartId="ai-chart-radar"
      data={data}
      height={500}
      xScale={dummyScale}
      yScale={dummyScale}
      layers={layers}
      tooltip={tooltip}
      watermark="logo"
    />
  );
}

// ---------------------------------------------------------------------------
// Inline Legend
// ---------------------------------------------------------------------------

function InlineLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 mb-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ background: item.color }}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}

function buildLegendItems(colorMap: Record<string, string>): { label: string; color: string }[] {
  return Object.entries(colorMap).map(([hwKey, color]) => {
    const config = getHardwareConfig(hwKey);
    return {
      label: config ? `${config.label}${config.suffix ? ` ${config.suffix}` : ''}` : hwKey,
      color,
    };
  });
}

// ---------------------------------------------------------------------------
// Main Result Component
// ---------------------------------------------------------------------------

export default function AiChartResult({ charts, summary }: AiChartResultProps) {
  return (
    <div className="flex flex-col gap-4">
      {charts.map((chart, i) => {
        const chartId = `ai-chart-${chart.spec.chartType}`;
        const hasZoom = chart.spec.chartType === 'scatter' || chart.spec.chartType === 'line';
        return (
          <figure key={i} className="relative rounded-lg">
            <ChartButtons chartId={chartId} analyticsPrefix="ai_chart" hideZoomReset={!hasZoom} />
            <Card id={`${chartId}-export`}>
              <CardHeader>
                <CardTitle>{chart.spec.title}</CardTitle>
                <CardDescription>{chart.spec.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {chart.spec.chartType === 'bar' && chart.barData.length > 0 && (
                  <BarChart data={chart.barData} spec={chart.spec} />
                )}
                {chart.spec.chartType === 'scatter' && chart.scatterData.length > 0 && (
                  <>
                    <InlineLegend items={buildLegendItems(chart.colorMap)} />
                    <ScatterChart
                      data={chart.scatterData}
                      spec={chart.spec}
                      colorMap={chart.colorMap}
                    />
                  </>
                )}
                {chart.spec.chartType === 'line' && Object.keys(chart.lineData).length > 0 && (
                  <>
                    <InlineLegend items={buildLegendItems(chart.colorMap)} />
                    <LineChart
                      lineData={chart.lineData}
                      spec={chart.spec}
                      colorMap={chart.colorMap}
                    />
                  </>
                )}
                {chart.spec.chartType === 'radar' && chart.radarData.length > 0 && (
                  <>
                    <InlineLegend
                      items={chart.radarData.map((d) => ({ label: d.label, color: d.color }))}
                    />
                    <RadarChart data={chart.radarData} axes={chart.radarAxes} />
                  </>
                )}
              </CardContent>
            </Card>
          </figure>
        );
      })}

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AI Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{summary}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
