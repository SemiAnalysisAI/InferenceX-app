'use client';

import type { ScaleBand, ScaleContinuousNumeric } from 'd3';
import { useId, useState } from 'react';

import ChartLegend from '@/components/ui/chart-legend';
import { ChartSection } from '@/components/ui/chart-section';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import { type CustomLayerConfig, D3Chart } from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';

import { VizCaption, VizFooter, hardwareLegend } from '../charts/ChartChrome';
import { formatRatio, logAxisTicks, ratioScale } from '../charts/scales';
import { hardwareLabel } from '../compare/hardware';
import { type ComparisonModel, geomeanAdvantage } from '../compare/model';
import { SIZE_BUCKETS, sizeBucket } from '../compare/slices';
import type { VizDefinition } from './types';

type Grouping = 'none' | 'precision' | 'size';

const PRECISIONS = ['fp4', 'fp8', 'bf16', 'other'];
const TITLE: Record<Locale, string> = { en: 'Advantage over baseline', zh: '相对基线的优势' };
const CHART_ID = 'operatorx-speedup-vs-baseline';

const STRINGS = {
  en: {
    pick: 'Pick a baseline GPU',
    groupBy: 'Group by',
    overall: 'Overall',
    byPrecision: 'By precision',
    bySize: (size: string) => `By ${size}`,
    tokens: 'Tokens',
    none: 'No cases shared with the baseline',
    axis: (hw: string) => `Geomean Advantage over ${hw}`,
    shared: (n: number) => `${n} shared cases`,
  },
  zh: {
    pick: '请选择基线 GPU',
    groupBy: '分组方式',
    overall: '总体',
    byPrecision: '按精度',
    bySize: (size: string) => `按 ${size}`,
    tokens: 'Token 数',
    none: '没有与基线共同的用例',
    axis: (hw: string) => `相对 ${hw} 的几何平均优势`,
    shared: (n: number) => `${n} 个共同用例`,
  },
};

interface Bar {
  group: string;
  hw: string;
  value: number;
  cases: number;
}

function groupCases(model: ComparisonModel, grouping: Grouping): [string, number[]][] {
  const all = model.view.cases.map((_, i) => i);
  if (grouping === 'none') return [['All', all]];
  const key = (i: number) =>
    grouping === 'precision'
      ? model.view.cases[i].computePrecision
      : sizeBucket(model.view.cases[i].x);
  const order = grouping === 'precision' ? PRECISIONS : SIZE_BUCKETS.map((b) => b.label);
  return order
    .map((g): [string, number[]] => [g, all.filter((i) => key(i) === g)])
    .filter(([, idx]) => idx.length > 0);
}

/** Bars from 1× (the baseline) to each GPU's advantage, one sub-band per GPU when grouped. */
function advantageBars(
  bars: Bar[],
  grouping: Grouping,
  series: string[],
  colors: Record<string, string>,
): CustomLayerConfig {
  const grouped = grouping !== 'none';
  return {
    type: 'custom',
    key: `bars-${grouping}`,
    render: (group, ctx) => {
      const x = ctx.xScale as ScaleContinuousNumeric<number, number>;
      const y = ctx.yScale as ScaleBand<string>;
      const x0 = x(1);
      const n = grouped ? series.length : 1;
      const h = y.bandwidth() / n;
      const top = (b: Bar) =>
        (y(grouped ? b.group : b.hw) ?? 0) + (grouped ? series.indexOf(b.hw) * h : 0);
      group
        .selectAll<SVGTextElement, Bar>('.bar-note')
        .data(bars)
        .join('text')
        .attr('class', 'bar-note')
        .attr('x', (b) => (b.value >= 1 ? x(b.value) + 6 : x(b.value) - 6))
        .attr('y', (b) => top(b) + h / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', (b) => (b.value >= 1 ? 'start' : 'end'))
        .attr('font-size', '11px')
        .style('fill', 'var(--muted-foreground)')
        .style('pointer-events', 'none')
        .text((b) => formatRatio(b.value));
      return group
        .selectAll<SVGRectElement, Bar>('.bar')
        .data(bars)
        .join('rect')
        .attr('class', 'bar')
        .attr('x', (b) => Math.min(x0, x(b.value)))
        .attr('y', (b) => top(b) + (n > 1 ? 1 : 0))
        .attr('width', (b) => Math.max(1, Math.abs(x(b.value) - x0)))
        .attr('height', n > 1 ? Math.max(1, h - 2) : h)
        .attr('rx', 2)
        .attr('fill', (b) => colors[b.hw])
        .attr('cursor', 'pointer');
    },
  };
}

function SpeedupVsBaseline({ model }: { model: ComparisonModel }) {
  const locale = useLocale();
  const strings = STRINGS[locale];
  const { baseline, view } = model;
  const [grouping, setGrouping] = useState<Grouping>('none');
  const [legendExpanded, setLegendExpanded] = useState(true);
  const legendId = useId();
  if (!baseline) return <EmptyState title={TITLE[locale]}>{strings.pick}</EmptyState>;
  const grouped = grouping !== 'none';
  const series = grouped ? model.hardware.filter((hw) => hw !== baseline) : model.hardware;
  const bars: Bar[] = groupCases(model, grouping).flatMap(([group, idx]) =>
    series.flatMap((hw) => {
      const g = geomeanAdvantage(model, hw, baseline, idx);
      return g ? [{ group, hw, value: g.value, cases: g.cases }] : [];
    }),
  );
  const groups = [...new Set(bars.map((b) => b.group))];
  const sizeLabel = view.op === 'gemm' ? 'M' : strings.tokens;
  const xScale = ratioScale(bars.map((b) => b.value));
  if (bars.length === 0) return <EmptyState title={TITLE[locale]}>{strings.none}</EmptyState>;
  return (
    <ChartSection
      chartId={CHART_ID}
      analyticsPrefix="operatorx"
      exportFileName={`InferenceX_${CHART_ID}`}
      setIsLegendExpanded={setLegendExpanded}
    >
      <D3Chart<Bar>
        chartId={CHART_ID}
        caption={
          <VizCaption title={TITLE[locale]}>
            <SegmentedToggle
              value={grouping}
              onValueChange={(value) => {
                track('operatorx_speedup_grouping_selected', { grouping: value });
                setGrouping(value);
              }}
              ariaLabel={strings.groupBy}
              options={[
                { value: 'none', label: strings.overall },
                { value: 'precision', label: strings.byPrecision },
                { value: 'size', label: strings.bySize(sizeLabel) },
              ]}
            />
          </VizCaption>
        }
        footer={<VizFooter />}
        watermark={getChartWatermark()}
        grabCursor={false}
        data={bars}
        height={
          (grouped ? groups.length * Math.max(36, series.length * 12 + 12) : bars.length * 36) + 60
        }
        margin={{ top: 8, right: 56, bottom: 44, left: 84 }}
        xScale={xScale}
        yScale={{
          type: 'band',
          domain: grouped ? groups : bars.map((b) => b.hw),
          padding: grouped ? 0.2 : 0.3,
        }}
        xAxis={{
          label: strings.axis(hardwareLabel(baseline)),
          tickValues: logAxisTicks,
          tickFormat: (v) => formatRatio(Number(v)),
        }}
        yAxis={{
          tickFormat: (v) => (grouped ? String(v) : hardwareLabel(String(v))),
          grid: false,
        }}
        layers={[advantageBars(bars, grouping, series, model.colors)]}
        tooltip={{
          rulerType: 'none',
          content: (b) =>
            chartHoverCard({
              title: hardwareLabel(b.hw),
              subtitle: grouped
                ? `${grouping === 'size' ? `${sizeLabel} ` : ''}${b.group}`
                : undefined,
              color: model.colors[b.hw],
              metrics: [
                { value: formatRatio(b.value), label: strings.axis(hardwareLabel(baseline)) },
              ],
              summary: strings.shared(b.cases),
            }),
        }}
        legendElement={
          grouped ? (
            <ChartLegend
              variant="sidebar"
              isLegendExpanded={legendExpanded}
              onExpandedChange={setLegendExpanded}
              {...hardwareLegend(
                model,
                legendId,
                undefined,
                model.available.filter((hw) => hw !== baseline),
              )}
            />
          ) : undefined
        }
      />
    </ChartSection>
  );
}

export const speedupVsBaseline: VizDefinition = {
  id: 'speedup-vs-baseline',
  title: TITLE,
  skeletonClassName: 'h-80',
  needsBaseline: true,
  ops: ['gemm', 'moe', 'attention'],
  Component: SpeedupVsBaseline,
};
