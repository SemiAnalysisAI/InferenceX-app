'use client';

import { useMemo } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { InferenceData } from '@/components/inference/types';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  BarLayerConfig,
  ScatterLayerConfig,
  ScaleConfig,
  AxisConfig,
} from '@/lib/d3-chart/D3Chart';

import type { AiChartBarPoint, AiChartSpec } from './types';

interface AiChartResultProps {
  spec: AiChartSpec;
  barData: AiChartBarPoint[];
  scatterData: InferenceData[];
  colorMap: Record<string, string>;
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
  const bottomMargin = Math.max(50, Math.min(maxLabelLen * 4.5, 120));

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

  return (
    <D3Chart
      chartId="ai-chart-bar"
      data={data}
      height={450}
      margin={{ top: 24, right: 10, bottom: bottomMargin, left: 60 }}
      xScale={xScale}
      yScale={yScale}
      xAxis={xAxis}
      yAxis={yAxis}
      layers={layers}
      watermark="logo"
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
      watermark="logo"
      zoom={{ enabled: true, axes: 'both' }}
    />
  );
}

export default function AiChartResult({
  spec,
  barData,
  scatterData,
  colorMap,
  summary,
}: AiChartResultProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{spec.title}</CardTitle>
          <CardDescription>{spec.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {spec.chartType === 'bar' && barData.length > 0 && (
            <BarChart data={barData} spec={spec} />
          )}
          {spec.chartType === 'scatter' && scatterData.length > 0 && (
            <ScatterChart data={scatterData} spec={spec} colorMap={colorMap} />
          )}
        </CardContent>
      </Card>

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
