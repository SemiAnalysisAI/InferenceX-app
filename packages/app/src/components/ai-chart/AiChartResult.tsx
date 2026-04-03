'use client';

import { useMemo } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { InferenceData } from '@/components/inference/types';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  BarLayerConfig,
  ScatterLayerConfig,
  TooltipConfig,
  ScaleConfig,
  AxisConfig,
} from '@/lib/d3-chart/D3Chart';

import DOMPurify from 'dompurify';

import type { AiChartBarPoint, AiChartSpec } from './types';
import type { AiSingleChartResult } from '@/hooks/api/use-ai-chart';

/** Sanitize tooltip HTML that may contain LLM-generated strings. */
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'span', 'strong', 'br'],
    ALLOWED_ATTR: ['style'],
  });
}

const CHART_INSTRUCTIONS = 'Hover for details';

interface AiChartResultProps {
  charts: AiSingleChartResult[];
  summary: string | null;
}

function BarChart({ data, spec }: { data: AiChartBarPoint[]; spec: AiChartSpec }) {
  const xScale = useMemo<ScaleConfig>(
    () => ({
      type: 'band',
      domain: data.map((d) => d.label),
      padding: 0.3,
    }),
    [data],
  );

  const yMax = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);

  const yScale = useMemo<ScaleConfig>(
    () => ({
      type: 'linear',
      domain: [0, yMax * 1.15],
      nice: true,
    }),
    [yMax],
  );

  const maxLabelLen = useMemo(() => Math.max(...data.map((d) => d.label.length), 0), [data]);
  const firstLabelLen = data[0]?.label.length ?? 0;
  const sin32 = Math.sin((32 * Math.PI) / 180);
  const charWidth = 6.5;
  const bottomMargin = Math.max(50, Math.min(maxLabelLen * charWidth * sin32, 120));
  const leftMargin = Math.max(60, Math.min(firstLabelLen * charWidth * sin32 + 20, 140));

  const xAxis = useMemo<AxisConfig>(
    () => ({
      label: '',
      customize: (g) => {
        g.selectAll('text')
          .attr('transform', 'rotate(-32)')
          .attr('text-anchor', 'end')
          .attr('dx', '-0.5em')
          .attr('dy', '0.25em');
      },
    }),
    [],
  );
  const yAxis = useMemo<AxisConfig>(() => ({ label: spec.yAxisLabel }), [spec.yAxisLabel]);

  const layers = useMemo(() => {
    const barLayer: BarLayerConfig<AiChartBarPoint> = {
      type: 'bar',
      data,
      config: {
        getX: (d) => d.label,
        getY: (d) => d.value,
        getColor: (d) => d.color,
        getForeground: () => 'var(--foreground)',
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
      height={Math.max(300, data.length * 40 + bottomMargin + 24)}
      margin={{ top: 24, right: 10, bottom: bottomMargin, left: leftMargin }}
      xScale={xScale}
      yScale={yScale}
      xAxis={xAxis}
      yAxis={yAxis}
      layers={layers}
      tooltip={tooltip}
      watermark="logo"
      instructions={CHART_INSTRUCTIONS}
    />
  );
}

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
      config: {
        getColor: (d) => colorMap[d.hwKey ?? ''] ?? '#888',
      },
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
      instructions={`${CHART_INSTRUCTIONS} • Scroll to zoom • Drag to pan`}
      zoom={{ enabled: true, axes: 'both', scaleExtent: [0.7, 20] }}
    />
  );
}

export default function AiChartResult({ charts, summary }: AiChartResultProps) {
  return (
    <div className="flex flex-col gap-4">
      {charts.map((chart, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle>{chart.spec.title}</CardTitle>
            <CardDescription>{chart.spec.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {chart.spec.chartType === 'bar' && chart.barData.length > 0 && (
              <BarChart data={chart.barData} spec={chart.spec} />
            )}
            {chart.spec.chartType === 'scatter' && chart.scatterData.length > 0 && (
              <ScatterChart data={chart.scatterData} spec={chart.spec} colorMap={chart.colorMap} />
            )}
          </CardContent>
        </Card>
      ))}

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
