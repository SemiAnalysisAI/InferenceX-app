'use client';

import { useState } from 'react';

import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

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

function SpeedupVsBaseline({ model }: { model: ComparisonModel }) {
  const strings = STRINGS[useLocale()];
  const { baseline, view } = model;
  const [grouping, setGrouping] = useState<Grouping>('none');
  if (!baseline) return <EmptyChart>{strings.pick}</EmptyChart>;
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
  return (
    <div className="space-y-3">
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
      {bars.length === 0 ? (
        <EmptyChart>{strings.none}</EmptyChart>
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
            label: strings.axis(hardwareLabel(baseline)),
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
                  `${grouped ? `${grouping === 'size' ? `${sizeLabel} ` : ''}${b.group} · ` : ''}${strings.shared(b.cases)}`,
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
  title: { en: 'Advantage over baseline', zh: '相对基线的优势' },
  needsBaseline: true,
  ops: ['gemm', 'moe', 'attention'],
  Component: SpeedupVsBaseline,
};
