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
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { computeLeftMargin } from '@/lib/d3-chart/dynamic-margins';
import { twoRowYAxisLabels } from '@/lib/d3-chart/axis-labels';
import { axisLabelUnit, chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { ChartPointDetails } from '@/components/ui/chart-point-details';

import { ChartButtons } from '@/components/ui/chart-buttons';
import { selectionAnalyticsContext } from '@/lib/analytics/selection-context';
import { getHardwareConfig } from '@/lib/catalog/constants';
import DOMPurify from 'dompurify';
import { useLocale } from '@/lib/i18n/use-locale';

import type { AiChartBarPoint, AiChartSpec } from './types';
import type { AiSingleChartResult, AiRadarItem } from '@/hooks/api/use-ai-chart';

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

const STRINGS = {
  en: {
    interactivityAxis: 'Interactivity (tok/s/user)',
    interactivity: 'Interactivity',
    instructions: 'Shift+Scroll to zoom · Drag to pan · Double-click to reset',
    summary: 'AI summary',
    noData: 'No data matched this chart specification',
    chartAria: {
      bar: 'AI-generated bar chart',
      scatter: 'AI-generated scatter chart',
      line: 'AI-generated line chart',
      radar: 'AI-generated radar chart',
    },
  },
  zh: {
    interactivityAxis: '交互性（tok/s/user）',
    interactivity: '交互性',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置',
    summary: 'AI 总结',
    noData: '当前图表配置没有匹配的数据',
    chartAria: {
      bar: 'AI 生成的条形图',
      scatter: 'AI 生成的散点图',
      line: 'AI 生成的折线图',
      radar: 'AI 生成的雷达图',
    },
  },
} as const;

function BarChart({ data, spec }: { data: AiChartBarPoint[]; spec: AiChartSpec }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const numberLocale = locale === 'zh' ? 'zh-CN' : undefined;
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

  const tooltip = useMemo<TooltipConfig<AiChartBarPoint>>(() => {
    const metrics = (d: AiChartBarPoint, unitsOnly: boolean) => [
      {
        value: d.value.toLocaleString(numberLocale, { maximumFractionDigits: 2 }),
        label: unitsOnly ? axisLabelUnit(spec.yAxisLabel) : spec.yAxisLabel,
      },
    ];
    return {
      rulerType: 'none',
      content: (d) =>
        sanitize(chartHoverCard({ title: d.label, color: d.color, metrics: metrics(d, true) })),
      details: (d, _isOverlay, close) => (
        <ChartPointDetails
          title={d.label}
          color={d.color}
          metrics={metrics(d, false)}
          onClose={close}
        />
      ),
    };
  }, [numberLocale, spec.yAxisLabel]);

  return (
    <div role="img" aria-label={t.chartAria.bar}>
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
    </div>
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
  const locale = useLocale();
  const t = STRINGS[locale];
  const numberLocale = locale === 'zh' ? 'zh-CN' : undefined;
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

  const xAxis = useMemo<AxisConfig>(() => ({ label: t.interactivityAxis }), [t.interactivityAxis]);
  const yAxis = useMemo<AxisConfig>(() => ({ label: spec.yAxisLabel }), [spec.yAxisLabel]);

  const layers = useMemo(() => {
    const scatterLayer: ScatterLayerConfig<InferenceData> = {
      type: 'scatter',
      data,
      config: { getColor: (d) => colorMap[d.hwKey ?? ''] ?? '#888' },
    };
    return [scatterLayer];
  }, [data, colorMap]);

  const tooltip = useMemo<TooltipConfig<InferenceData>>(() => {
    const metrics = (d: InferenceData, unitsOnly: boolean) => [
      {
        value: d.y.toLocaleString(numberLocale, { maximumFractionDigits: 2 }),
        label: unitsOnly ? axisLabelUnit(spec.yAxisLabel) : spec.yAxisLabel,
      },
      { value: d.x.toFixed(1), label: unitsOnly ? 'tok/s/user' : t.interactivityAxis },
    ];
    return {
      rulerType: 'crosshair',
      content: (d) =>
        sanitize(
          chartHoverCard({
            title: d.hwKey ?? '',
            color: colorMap[d.hwKey ?? ''] ?? '#888',
            metrics: metrics(d, true),
          }),
        ),
      details: (d, _isOverlay, close) => (
        <ChartPointDetails
          title={d.hwKey ?? ''}
          color={colorMap[d.hwKey ?? ''] ?? '#888'}
          metrics={metrics(d, false)}
          onClose={close}
        />
      ),
      getRulerX: (d, xS) => (xS as ContinuousScale)(d.x),
      getRulerY: (d, yS) => yS(d.y),
    };
  }, [colorMap, numberLocale, spec.yAxisLabel, t.interactivityAxis]);

  return (
    <div role="group" aria-label={t.chartAria.scatter}>
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
        instructions={t.instructions}
        zoom={{
          enabled: true,
          axes: 'both',
          scaleExtent: [0.7, 20],
          resetEventName: 'ai_chart_zoom_reset_ai-chart-scatter',
        }}
      />
    </div>
  );
}

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
  const locale = useLocale();
  const t = STRINGS[locale];
  const numberLocale = locale === 'zh' ? 'zh-CN' : undefined;
  const flatPoints = useMemo<LinePoint[]>(
    () =>
      Object.entries(lineData).flatMap(([hwKey, pts]) =>
        pts
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
          .map((p) => ({ hwKey, precision: 'fp8', x: p.x, y: p.y })),
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

  const xAxis = useMemo<AxisConfig>(() => ({ label: t.interactivityAxis }), [t.interactivityAxis]);
  const yAxis = useMemo<AxisConfig>(() => ({ label: spec.yAxisLabel }), [spec.yAxisLabel]);

  const layers = useMemo(() => {
    const lineLayer: LineLayerConfig = {
      type: 'line',
      lines: lineData,
      config: {
        getColor: (key) => colorMap[key] ?? '#888',
        strokeWidth: 2.5,
        isDefined: ({ x, y }) => Number.isFinite(x) && Number.isFinite(y),
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

  const tooltip = useMemo<TooltipConfig<LinePoint>>(() => {
    const label = (d: LinePoint) => {
      const config = getHardwareConfig(d.hwKey);
      return config ? `${config.label}${config.suffix ? ` ${config.suffix}` : ''}` : d.hwKey;
    };
    const metrics = (d: LinePoint, unitsOnly: boolean) => [
      {
        value: d.y.toLocaleString(numberLocale, { maximumFractionDigits: 2 }),
        label: unitsOnly ? axisLabelUnit(spec.yAxisLabel) : spec.yAxisLabel,
      },
      { value: d.x.toFixed(1), label: unitsOnly ? 'tok/s/user' : t.interactivityAxis },
    ];
    return {
      rulerType: 'crosshair',
      content: (d) =>
        sanitize(
          chartHoverCard({
            title: label(d),
            color: colorMap[d.hwKey] ?? '#888',
            metrics: metrics(d, true),
          }),
        ),
      details: (d, _isOverlay, close) => (
        <ChartPointDetails
          title={label(d)}
          color={colorMap[d.hwKey] ?? '#888'}
          metrics={metrics(d, false)}
          onClose={close}
        />
      ),
      getRulerX: (d, xS) => (xS as ContinuousScale)(d.x),
      getRulerY: (d, yS) => yS(d.y),
      attachToLayer: 1,
    };
  }, [colorMap, numberLocale, spec.yAxisLabel, t.interactivityAxis]);

  return (
    <div role="group" aria-label={t.chartAria.line}>
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
        instructions={t.instructions}
        zoom={{
          enabled: true,
          axes: 'both',
          scaleExtent: [0.7, 20],
          resetEventName: 'ai_chart_zoom_reset_ai-chart-line',
        }}
      />
    </div>
  );
}

function RadarChart({
  data,
  axes,
}: {
  data: AiRadarItem[];
  axes: { label: string; unit?: string }[];
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const numberLocale = locale === 'zh' ? 'zh-CN' : undefined;
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

  const tooltip = useMemo<TooltipConfig<AiRadarItem>>(() => {
    const metrics = (d: AiRadarItem) =>
      axes.flatMap((axis, i) => {
        const raw = d.rawValues[i];
        return raw === null || raw === undefined
          ? []
          : [
              {
                value: raw.toLocaleString(numberLocale, { maximumFractionDigits: 2 }),
                label: axis.label,
              },
            ];
      });
    return {
      rulerType: 'none',
      content: (d) =>
        sanitize(chartHoverCard({ title: d.label, color: d.color, metrics: metrics(d) })),
      details: (d, _isOverlay, close) => (
        <ChartPointDetails title={d.label} color={d.color} metrics={metrics(d)} onClose={close} />
      ),
    };
  }, [axes, numberLocale]);

  const dummyScale = useMemo<ScaleConfig>(() => ({ type: 'linear', domain: [0, 1] }), []);

  return (
    <div role="img" aria-label={t.chartAria.radar}>
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
    </div>
  );
}

function InlineLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 mb-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block size-2.5 rounded-sm shrink-0"
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

export default function AiChartResult({ charts, summary }: AiChartResultProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  return (
    <div className="flex flex-col gap-4">
      {charts.map((chart, i) => {
        const chartId = `ai-chart-${chart.spec.chartType}`;
        const hasZoom = chart.spec.chartType === 'scatter' || chart.spec.chartType === 'line';
        const hasData =
          chart.barData.length > 0 ||
          chart.scatterData.length > 0 ||
          Object.keys(chart.lineData).length > 0 ||
          chart.radarData.length > 0;
        return (
          <figure key={i} className="relative">
            <ChartButtons
              chartId={chartId}
              analyticsPrefix="ai_chart"
              analyticsContext={selectionAnalyticsContext({
                model: chart.spec.model,
                sequence: chart.spec.sequence,
                precisions: chart.spec.precisions,
                // No hardware keys means every GPU, so the count is unknown.
                gpuCount:
                  chart.spec.hardwareKeys.length > 0 ? chart.spec.hardwareKeys.length : undefined,
              })}
              hideZoomReset={!hasZoom}
            />
            <Card id={`${chartId}-export`}>
              <CardHeader>
                <CardTitle>{chart.spec.title}</CardTitle>
                <CardDescription>{chart.spec.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {!hasData && (
                  <p className="py-16 text-center text-sm text-muted-foreground">{t.noData}</p>
                )}
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
            <CardTitle className="text-sm">{t.summary}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{summary}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
