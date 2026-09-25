'use client';

import { EmptyChart } from '../../charts/empty';
import { OpxChart, HardwareLegend, tooltipHtml } from '../../charts/kit';
import { type GroupedDatum, groupedBarsLayer } from '../../charts/layers';
import { valueScale } from '../../charts/scales';
import { hardwareLabel } from '../../compare/hardware';
import { type ComparisonModel, fairCases, geomean } from '../../compare/model';
import { SIZE_BUCKETS, sizeBucket } from '../../compare/slices';
import type { VizDefinition } from '../types';

function SizeBuckets({ model }: { model: ComparisonModel }) {
  const { view, metric } = model;
  const byBucket = new Map<string, number[]>();
  const fair = fairCases(model);
  for (const i of fair.indices) {
    const b = sizeBucket(view.cases[i].x);
    if (b) byBucket.set(b, [...(byBucket.get(b) ?? []), i]);
  }
  const groups = SIZE_BUCKETS.map((b) => b.label).filter((b) => byBucket.has(b));
  if (groups.length === 0) return <EmptyChart>No measured cases.</EmptyChart>;
  const data: (GroupedDatum & { cases: number })[] = groups.flatMap((group) =>
    model.hardware.flatMap((series) => {
      const values = (byBucket.get(group) ?? []).flatMap((i) => model.value(series, i) ?? []);
      const value = geomean(values);
      return value === null ? [] : [{ group, series, value, cases: values.length }];
    }),
  );
  const size = view.op === 'gemm' ? 'M' : 'Tokens';
  return (
    <div className="space-y-3">
      {!fair.shared && (
        <p className="text-sm text-muted-foreground">
          No case is shared by every selected GPU; each bar covers its GPU’s own cases in the
          bucket.
        </p>
      )}
      <OpxChart<GroupedDatum & { cases: number }>
        chartId="operatorx-size-buckets"
        data={data}
        height={320}
        margin={{ top: 16, right: 16, bottom: 56, left: 72 }}
        xScale={{ type: 'band', domain: groups, padding: 0.2 }}
        yScale={valueScale(
          false,
          data.map((d) => d.value),
        )}
        xAxis={{ label: size, grid: false }}
        yAxis={{
          label: `${metric.label} (${metric.unit}, geomean)`,
          tickCount: 5,
          tickFormat: (v) => metric.format(Number(v)),
        }}
        layers={[
          groupedBarsLayer({
            key: 'bars',
            data,
            series: model.hardware,
            colors: model.colors,
            origin: 0,
          }),
        ]}
        tooltip={{
          rulerType: 'none',
          content: (d) =>
            tooltipHtml({
              title: hardwareLabel(d.series),
              color: model.colors[d.series],
              rows: [
                `${size} ${d.group}`,
                `geomean <strong>${metric.format(d.value)}</strong> over ${d.cases} cases`,
              ],
            }),
        }}
        legendElement={<HardwareLegend model={model} />}
      />
    </div>
  );
}

export const sizeBuckets: VizDefinition = {
  id: 'size-buckets',
  title: 'By size bucket',
  description:
    'Geomean of the selected metric per size bucket (M for GEMM, tokens for MoE), over the cases every selected GPU ran.',
  ops: ['gemm', 'moe'],
  Component: SizeBuckets,
};
