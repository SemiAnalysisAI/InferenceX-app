'use client';

import type { ScaleBand, ScaleContinuousNumeric } from 'd3';
import { type ReactNode, useRef } from 'react';

import { EmptyState } from '@/components/ui/empty-state';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import { readableTextColor } from '@/lib/d3-chart/contrast-colors';
import { type CustomLayerConfig, D3Chart, type D3ChartHandle } from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { useLocale } from '@/lib/i18n/use-locale';
import type { RooflineSummary, RooflineSummaryBar } from '@/lib/operatorx/roofline-summary';
import { VizFooter, inspectCase } from '../charts/ChartChrome';
import { hardwareLabel } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';

const STRINGS = {
  en: {
    noData: 'No compute-bound measurements for this precision',
    empty: 'No shared compute-bound cases. Try selecting fewer accelerators or another precision.',
    missing: 'A compute or bandwidth reference is unavailable for',
    median: 'Median',
    best: 'Best',
    absolute: 'Achieved throughput (TFLOPS)',
    normalized: 'Share of peak compute (%)',
  },
  zh: {
    noData: '此精度没有计算受限的实测用例',
    empty: '没有共同的计算受限用例。请减少所选加速器，或切换精度。',
    missing: '以下硬件缺少计算峰值或带宽参考值',
    median: '中位数',
    best: '最佳值',
    absolute: '实测吞吐量（TFLOPS）',
    normalized: '计算峰值占比（%）',
  },
};

export function RooflineBars({
  model,
  summary,
  caption,
  legend,
}: {
  model: ComparisonModel;
  summary: RooflineSummary;
  caption: ReactNode;
  legend: ReactNode;
}) {
  const strings = STRINGS[useLocale()];
  const chart = useRef<D3ChartHandle>(null);
  const format = (value: number) =>
    summary.normalized
      ? `${(value * 100).toFixed(1)}%`
      : value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 1 : 0 });
  const labelWidth = (value: number) => format(value).length * 7;

  const layer: CustomLayerConfig = {
    type: 'custom',
    key: 'median-best',
    render: (group, ctx) => {
      const x = ctx.xScale as ScaleContinuousNumeric<number, number>;
      const y = ctx.yScale as ScaleBand<string>;
      const rows = group
        .selectAll<SVGGElement, RooflineSummaryBar>('.summary-row')
        .data(summary.bars, (d) => d.hardware)
        .join((enter) => {
          const row = enter.append('g').attr('class', 'summary-row');
          row
            .append('rect')
            .attr('class', 'summary-best')
            .attr('fill', 'none')
            .attr('stroke-width', 2);
          row.append('rect').attr('class', 'summary-median');
          row
            .append('text')
            .attr('class', 'summary-median-label text-xs')
            .attr('dy', '0.35em')
            .style('pointer-events', 'none');
          row
            .append('text')
            .attr('class', 'summary-best-label text-xs')
            .attr('dy', '0.35em')
            .style('fill', 'var(--muted-foreground)')
            .style('pointer-events', 'none');
          row
            .append('rect')
            .attr('class', 'summary-hit')
            .attr('fill', 'transparent')
            .attr('cursor', 'pointer');
          return row;
        })
        .attr('transform', (d) => `translate(0,${y(d.hardware) ?? 0})`);
      rows
        .select('.summary-best')
        .attr('x', x(0))
        .attr('y', 0)
        .attr('width', (d) => Math.max(0, x(d.best) - x(0)))
        .attr('height', y.bandwidth())
        .attr('stroke', (d) => model.colors[d.hardware]);
      rows
        .select('.summary-median')
        .attr('x', x(0))
        .attr('y', 0)
        .attr('width', (d) => Math.max(0, x(d.median) - x(0)))
        .attr('height', y.bandwidth())
        .attr('fill', (d) => model.colors[d.hardware]);
      const fits = (d: RooflineSummaryBar) => x(d.median) - x(0) > labelWidth(d.median) + 12;
      // A median label that does not fit inside its bar sits just after it on the same row,
      // so tight rows never stack it onto the next bar; the best label moves past it.
      const medianEnd = (d: RooflineSummaryBar) =>
        fits(d) ? x(d.median) : x(d.median) + 4 + labelWidth(d.median);
      rows
        .select<SVGTextElement>('.summary-median-label')
        .attr('x', (d) => (fits(d) ? x(d.median) - 6 : x(d.median) + 4))
        .attr('y', y.bandwidth() / 2)
        .attr('text-anchor', (d) => (fits(d) ? 'end' : 'start'))
        .style('fill', function (d) {
          const bar = this.parentElement?.querySelector('.summary-median');
          return fits(d)
            ? readableTextColor(bar ? getComputedStyle(bar).fill : model.colors[d.hardware])
            : 'var(--foreground)';
        })
        .text((d) => format(d.median));
      rows
        .select('.summary-best-label')
        .attr('x', (d) => Math.max(x(d.best), medianEnd(d)) + 7)
        .attr('y', y.bandwidth() / 2)
        .text((d) => format(d.best));
      return rows
        .select<SVGRectElement>('.summary-hit')
        .attr('x', x(0))
        .attr('y', 0)
        .attr('width', (d) => Math.max(1, x(d.best) - x(0)))
        .attr('height', y.bandwidth());
    },
  };
  return (
    <D3Chart<RooflineSummaryBar>
      ref={chart}
      chartId="operatorx-roofline-summary"
      testId="operatorx-roofline-summary"
      caption={caption}
      footer={<VizFooter />}
      watermark={getChartWatermark()}
      grabCursor={false}
      data={summary.bars}
      height={Math.max(120, summary.bars.length * 32 + 52)}
      clipContent={false}
      margin={{ top: 4, right: 64, bottom: 48, left: 140 }}
      xScale={{
        type: 'linear',
        domain: [0, Math.max(0, ...summary.bars.map((b) => b.best)) * 1.04 || 1],
        nice: true,
      }}
      yScale={{
        type: 'band',
        domain: summary.bars.map((b) => b.hardware).toReversed(),
        padding: 0.35,
      }}
      xAxis={{
        label: summary.normalized ? strings.normalized : strings.absolute,
        tickCount: 4,
        tickFormat: (v) =>
          summary.normalized
            ? `${Math.round(Number(v) * 100)}%`
            : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }),
      }}
      yAxis={{
        tickFormat: (v) =>
          `${hardwareLabel(String(v))} (n=${summary.bars.find((b) => b.hardware === v)?.n ?? 0})`,
        grid: false,
      }}
      layers={[layer]}
      tooltip={{
        attachToLayer: 0,
        rulerType: 'none',
        ...inspectCase(model, (d: RooflineSummaryBar) => d.bestCaseIndex, chart),
        content: (d) =>
          chartHoverCard({
            title: hardwareLabel(d.hardware),
            color: model.colors[d.hardware],
            metrics: [
              { value: format(d.median), label: strings.median },
              { value: format(d.best), label: strings.best },
            ],
          }),
      }}
      noDataOverlay={
        summary.bars.length === 0 ? (
          <EmptyState bare className="absolute inset-0 pointer-events-none">
            {summary.missingReferences.length > 0
              ? `${strings.missing}: ${summary.missingReferences.map(hardwareLabel).join(', ')}`
              : summary.sharedOnly
                ? strings.empty
                : strings.noData}
          </EmptyState>
        ) : undefined
      }
      legendElement={legend}
    />
  );
}
