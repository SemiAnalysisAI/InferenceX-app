'use client';

import { color, type ScaleBand, type ScaleContinuousNumeric } from 'd3';

import type { CustomLayerConfig } from '@/lib/d3-chart/D3Chart';
import { useLocale } from '@/lib/i18n/use-locale';
import type { RooflineSummary, RooflineSummaryBar } from '@/lib/operatorx/roofline-summary';
import { OpxChart, esc, tooltipHtml } from '../charts/kit';
import { EmptyChart } from '../charts/empty';
import { hardwareLabel } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';

const STRINGS = {
  en: {
    title: 'Median (fill) and best (outline)',
    individual:
      'Each accelerator uses its own compute-bound cases; case sets and quantization formats may differ. Counts are shown per bar.',
    noData: 'No compute-bound measurements for this precision.',
    cohort: 'Shared cases at or above every selected accelerator’s ridge point',
    empty: 'No shared compute-bound cases. Try selecting fewer accelerators or another precision.',
    missing: 'A compute or bandwidth reference is unavailable for',
    median: 'Median',
    best: 'Best',
    cases: 'cases',
    absolute: 'Achieved throughput (TFLOPS)',
    normalized: 'Share of peak compute (%)',
    inspect: 'Click for the best case’s kernel timeline',
  },
  zh: {
    title: '中位数（填充）与最佳值（轮廓）',
    individual: '各加速器使用各自的计算受限用例，用例集合和量化格式可能不同。每条柱显示用例数量。',
    noData: '此精度没有计算受限的实测用例。',
    cohort: '算术强度不低于每个所选加速器 roofline 拐点的共同实测用例',
    empty: '没有共同的计算受限用例。请减少所选加速器，或切换精度。',
    missing: '以下硬件缺少计算峰值或带宽参考值',
    median: '中位数',
    best: '最佳值',
    cases: '个用例',
    absolute: '实测吞吐量（TFLOPS）',
    normalized: '计算峰值占比（%）',
    inspect: '点击查看最佳用例的 kernel 时间线',
  },
};

const linear = (v: number) =>
  v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;

function foreground(fill: string): string {
  const rgb = color(fill)?.rgb();
  let channels: number[];
  if (rgb) channels = [rgb.r, rgb.g, rgb.b];
  else {
    // The shared palette uses OKLCH, which d3-color cannot parse.
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) return '#ffffff';
    context.fillStyle = fill;
    context.fillRect(0, 0, 1, 1);
    channels = [...context.getImageData(0, 0, 1, 1).data];
  }
  const luminance =
    0.2126 * linear(channels[0]) + 0.7152 * linear(channels[1]) + 0.0722 * linear(channels[2]);
  return luminance > 0.179 ? '#111827' : '#ffffff';
}

export function RooflineBars({
  model,
  summary,
}: {
  model: ComparisonModel;
  summary: RooflineSummary;
}) {
  const strings = STRINGS[useLocale()];
  const format = (value: number) =>
    summary.normalized
      ? `${(value * 100).toFixed(1)}%`
      : value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 1 : 0 });
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
      const fits = (d: RooflineSummaryBar) => x(d.median) - x(0) > format(d.median).length * 7 + 12;
      rows
        .select<SVGTextElement>('.summary-median-label')
        .attr('x', (d) => (fits(d) ? x(d.median) - 6 : x(0) + 4))
        .attr('y', (d) => (fits(d) ? y.bandwidth() / 2 : y.bandwidth() + 7))
        .attr('text-anchor', (d) => (fits(d) ? 'end' : 'start'))
        .style('fill', function (d) {
          const bar = this.parentElement?.querySelector('.summary-median');
          return fits(d)
            ? foreground(bar ? getComputedStyle(bar).fill : model.colors[d.hardware])
            : 'var(--foreground)';
        })
        .text((d) => format(d.median));
      rows
        .select('.summary-best-label')
        .attr('x', (d) => x(d.best) + 7)
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
    <section className="min-w-0 space-y-2" data-testid="operatorx-roofline-summary">
      <h3 className="text-sm font-medium">{strings.title}</h3>
      <p className="text-xs text-muted-foreground">
        {summary.sharedOnly
          ? `${strings.cohort}: ${summary.caseIndices.length}.`
          : strings.individual}
      </p>
      {summary.bars.length === 0 ? (
        <EmptyChart>
          {summary.missingReferences.length > 0
            ? `${strings.missing}: ${summary.missingReferences.map(hardwareLabel).join(', ')}.`
            : summary.sharedOnly
              ? strings.empty
              : strings.noData}
        </EmptyChart>
      ) : (
        <OpxChart<RooflineSummaryBar>
          chartId="operatorx-roofline-summary"
          data={summary.bars}
          inspect={{ model, caseOf: (d) => d.bestCaseIndex }}
          height={Math.max(160, summary.bars.length * 44 + 64)}
          clipContent={false}
          margin={{ top: 12, right: 64, bottom: 48, left: 160 }}
          xScale={{
            type: 'linear',
            domain: [0, Math.max(...summary.bars.map((b) => b.best)) * 1.04],
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
            content: (d) =>
              tooltipHtml({
                title: hardwareLabel(d.hardware),
                color: model.colors[d.hardware],
                rows: [
                  esc(`${strings.median}: ${format(d.median)}`),
                  esc(`${strings.best}: ${format(d.best)}`),
                  esc(`${d.n} ${strings.cases}`),
                ],
                footer: strings.inspect,
              }),
          }}
        />
      )}
    </section>
  );
}
