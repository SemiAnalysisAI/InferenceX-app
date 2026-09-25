'use client';

import { useState } from 'react';

import { SegmentedToggle } from '@/components/ui/segmented-toggle';

import { EmptyChart } from '../charts/empty';
import { HardwareLegend, OpxChart, tooltipHtml } from '../charts/kit';
import { originBarsLayer } from '../charts/layers';
import { formatRatio, ratioScale } from '../charts/scales';
import { hardwareLabel } from '../compare/hardware';
import { type ComparisonModel, geomeanAdvantage } from '../compare/model';
import { SIZE_BUCKETS, sizeBucket } from '../compare/slices';
import type { VizDefinition } from './types';

type Grouping = 'none' | 'precision' | 'size';

const PRECISIONS = ['fp4', 'fp8', 'bf16', 'other'];

interface Bar {
  group: string;
  hw: string;
  value: number;
  cases: number;
}

/** Case indices per group, in display order. */
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

function SpeedupVsBaseline({ model }: { model: ComparisonModel }) {
  const { baseline, metric, view } = model;
  const [grouping, setGrouping] = useState<Grouping>('none');
  if (!baseline) return <EmptyChart>Pick a baseline GPU.</EmptyChart>;
  const grouped = grouping !== 'none';
  const series = grouped ? model.hardware.filter((hw) => hw !== baseline) : model.hardware;
  const bars: Bar[] = groupCases(model, grouping).flatMap(([group, idx]) =>
    series.flatMap((hw) => {
      const g = geomeanAdvantage(model, hw, baseline, idx);
      return g ? [{ group, hw, value: g.value, cases: g.cases }] : [];
    }),
  );
  const groups = [...new Set(bars.map((b) => b.group))];
  const sizeLabel = view.op === 'gemm' ? 'M' : 'Tokens';
  const xScale = ratioScale(bars.map((b) => b.value));
  return (
    <div className="space-y-3">
      <SegmentedToggle
        value={grouping}
        onValueChange={setGrouping}
        ariaLabel="Group by"
        options={[
          { value: 'none', label: 'Overall' },
          { value: 'precision', label: 'By precision' },
          { value: 'size', label: `By ${sizeLabel}` },
        ]}
      />
      {bars.length === 0 ? (
        <EmptyChart>No cases shared with the baseline.</EmptyChart>
      ) : (
        <OpxChart<Bar>
          chartId="operatorx-speedup-vs-baseline"
          data={bars}
          height={
            (grouped ? groups.length * Math.max(36, series.length * 12 + 12) : bars.length * 36) +
            60
          }
          margin={{ top: 8, right: 56, bottom: 44, left: 84 }}
          xScale={xScale}
          yScale={{
            type: 'band',
            domain: grouped ? groups : bars.map((b) => b.hw),
            padding: grouped ? 0.2 : 0.3,
          }}
          xAxis={{
            label: `Advantage over ${hardwareLabel(baseline)}`,
            tickFormat: (v) => formatRatio(Number(v)),
          }}
          yAxis={{
            tickFormat: (v) => (grouped ? String(v) : hardwareLabel(String(v))),
            grid: false,
          }}
          layers={[
            originBarsLayer({
              key: `bars-${grouping}`,
              data: bars,
              band: (b) => (grouped ? b.group : b.hw),
              sub: grouped ? { of: (b) => b.hw, domain: series } : undefined,
              value: (b) => b.value,
              color: (b) => model.colors[b.hw],
              label: (b) => formatRatio(b.value),
              origin: 1,
            }),
          ]}
          tooltip={{
            rulerType: 'none',
            content: (b) =>
              tooltipHtml({
                title: hardwareLabel(b.hw),
                color: model.colors[b.hw],
                rows: [
                  `<strong>${formatRatio(b.value)}</strong> vs ${hardwareLabel(baseline)} (geomean)`,
                  `${grouped ? `${grouping === 'size' ? `${sizeLabel} ` : ''}${b.group} · ` : ''}${b.cases} shared cases · ${metric.label.toLowerCase()}`,
                ],
              }),
          }}
          legendElement={grouped ? <HardwareLegend model={model} hardware={series} /> : undefined}
        />
      )}
    </div>
  );
}

export const speedupVsBaseline: VizDefinition = {
  id: 'speedup-vs-baseline',
  title: 'Advantage over baseline',
  ops: ['gemm', 'moe'],
  Component: SpeedupVsBaseline,
};
