'use client';

import * as d3 from 'd3';
import { comparisonDefaults } from '@semianalysisai/inferencex-db/operatorx/visualization';
import { useId, useMemo, useRef, useState } from 'react';

import ChartLegend from '@/components/ui/chart-legend';
import { ChartSection } from '@/components/ui/chart-section';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { track } from '@/lib/analytics/analytics';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import { D3Chart, type D3ChartHandle } from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  SCATTER_MARGIN,
  VizCaption,
  VizFooter,
  hardwareLegend,
  inspectCase,
} from '../charts/ChartChrome';
import { formatCompact, logAxisTicks, valueScale } from '../charts/scales';
import { hardwareLabel } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';
import { originText, rankedSlices } from '../compare/slices';
import type { VizDefinition } from './types';

const TITLE: Record<Locale, string> = { en: 'Metric vs size', zh: '指标随尺寸变化' };
const CHART_ID = 'operatorx-metric-vs-size';

const STRINGS = {
  en: {
    empty: 'No shape has more than one size',
    tokens: 'Tokens',
    shape: 'Shape',
    axis: (label: string, unit: string) => `${label} (${unit})`,
  },
  zh: {
    empty: '没有包含多个尺寸的形状',
    tokens: 'Token 数',
    shape: '形状',
    axis: (label: string, unit: string) => `${label}（${unit}）`,
  },
};

interface Point {
  hw: string;
  i: number;
  x: number;
  y: number;
}

function MetricVsSize({ model }: { model: ComparisonModel }) {
  const locale = useLocale();
  const strings = STRINGS[locale];
  const { view, metric } = model;
  const groups = useMemo(
    () => rankedSlices(view.op, view.cases).filter(([, idx]) => idx.length > 1),
    [view],
  );
  const [slice, setSlice] = useState<string | null>(null);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const legendId = useId();
  const chart = useRef<D3ChartHandle>(null);
  const defaults = view.defaults ?? comparisonDefaults(view);
  const current =
    groups.find(([k]) => k === slice) ??
    groups.find(([k]) => k === defaults.metricVsSizeSlice) ??
    groups[0];
  const points = useMemo<Point[]>(
    () =>
      current
        ? model.hardware.flatMap((hw) =>
            current[1].flatMap((i) => {
              const x = view.cases[i].x;
              const y = model.value(hw, i);
              return x && y !== null ? [{ hw, i, x, y }] : [];
            }),
          )
        : [],
    [current, model, view],
  );
  if (!current) return <EmptyState title={TITLE[locale]}>{strings.empty}</EmptyState>;
  const lines: Record<string, { x: number; y: number }[]> = {};
  for (const p of points) (lines[p.hw] ??= []).push({ x: p.x, y: p.y });
  for (const l of Object.values(lines)) l.sort((a, b) => a.x - b.x);
  const xs = [...new Set(current[1].map((i) => view.cases[i].x ?? 0))]
    .filter((x) => x > 0)
    .toSorted((a, b) => a - b);
  const sizeLabel = view.op === 'gemm' ? 'M' : strings.tokens;
  const yScale = valueScale(
    metric.log,
    points.map((p) => p.y),
  );
  return (
    <ChartSection
      chartId={CHART_ID}
      analyticsPrefix="operatorx"
      exportFileName={`InferenceX_${CHART_ID}`}
      setIsLegendExpanded={setLegendExpanded}
      zoomResetEvent={`d3chart_zoom_reset_${CHART_ID}`}
    >
      <D3Chart<Point>
        ref={chart}
        chartId={CHART_ID}
        caption={
          <VizCaption title={TITLE[locale]}>
            {/* One shape needs no picker; the Model View op detail picks it for both charts */}
            {groups.length > 1 && (
              <SearchableSelect
                size="sm"
                searchable
                value={current[0]}
                onValueChange={(value) => {
                  track('operatorx_metric_vs_size_slice_selected', {
                    slice: value,
                    metric: metric.id,
                  });
                  setSlice(value);
                }}
                triggerAriaLabel={strings.shape}
                groups={[{ label: '', options: groups.map(([k]) => ({ value: k, label: k })) }]}
              />
            )}
          </VizCaption>
        }
        footer={<VizFooter />}
        watermark={getChartWatermark()}
        data={points}
        margin={SCATTER_MARGIN}
        zoom={{ enabled: true }}
        xScale={{ type: 'log', domain: [xs[0] / 1.2, xs.at(-1)! * 1.2], nice: false }}
        yScale={yScale}
        xAxis={{
          label: sizeLabel,
          tickValues: xs.length <= 12 ? xs : logAxisTicks,
          tickFormat: (v) => formatCompact(Number(v)),
        }}
        yAxis={{
          label: strings.axis(metric.label[locale], metric.unit),
          tickCount: 5,
          tickValues: yScale.type === 'log' ? logAxisTicks : undefined,
          tickFormat: (v) => metric.tick(Number(v)),
        }}
        layers={[
          {
            type: 'line',
            key: 'lines',
            lines,
            config: { getColor: (hw) => model.colors[hw], strokeWidth: 2, curve: d3.curveLinear },
          },
          {
            type: 'point',
            key: 'points',
            data: points,
            config: {
              getCx: () => 0,
              getCy: () => 0,
              getX: (p) => p.x,
              getY: (p) => p.y,
              getColor: (p) => model.colors[p.hw],
              getRadius: () => 4,
              stroke: 'var(--background)',
              strokeWidth: 1,
              keyFn: (p) => `${p.hw}-${p.i}`,
              maxPoints: Infinity,
            },
          },
        ]}
        tooltip={{
          rulerType: 'crosshair',
          attachToLayer: 1,
          ...inspectCase(model, (p: Point) => p.i, chart),
          content: (p) =>
            chartHoverCard({
              title: hardwareLabel(p.hw),
              subtitle: view.cases[p.i].shape,
              color: model.colors[p.hw],
              metrics: [
                { value: metric.format(p.y), label: metric.label[locale] },
                { value: formatCompact(p.x), label: sizeLabel },
              ],
              summary: originText(view, p.i, locale),
            }),
          getRulerX: (p, s) => (s as d3.ScaleLogarithmic<number, number>)(p.x),
          getRulerY: (p, s) => s(p.y),
        }}
        legendElement={
          <ChartLegend
            variant="sidebar"
            isLegendExpanded={legendExpanded}
            onExpandedChange={setLegendExpanded}
            {...hardwareLegend(model, legendId, 'none')}
          />
        }
      />
    </ChartSection>
  );
}

export const metricVsSize: VizDefinition = {
  id: 'metric-vs-size',
  title: TITLE,
  skeletonClassName: 'h-[600px]',
  ops: ['gemm', 'moe', 'attention'],
  Component: MetricVsSize,
};
