'use client';

import { EmptyChart } from '../../charts/empty';
import { OpxChart, HardwareLegend, tooltipHtml } from '../../charts/kit';
import { type GroupedDatum, groupedBarsLayer } from '../../charts/layers';
import { formatRatio, ratioScale } from '../../charts/scales';
import { hardwareLabel } from '../../compare/hardware';
import { type ComparisonModel, geomeanAdvantage } from '../../compare/model';
import type { VizDefinition } from '../types';

const ORDER = ['fp4', 'fp8', 'bf16', 'other'];

function PrecisionAdvantage({ model }: { model: ComparisonModel }) {
  const { view, baseline } = model;
  if (!baseline) return <EmptyChart>Pick a baseline GPU.</EmptyChart>;
  const series = model.hardware.filter((hw) => hw !== baseline);
  if (series.length === 0) return <EmptyChart>Select a GPU besides the baseline.</EmptyChart>;
  const byPrecision = new Map<string, number[]>();
  view.cases.forEach((c, i) =>
    byPrecision.set(c.computePrecision, [...(byPrecision.get(c.computePrecision) ?? []), i]),
  );
  const groups = ORDER.filter((p) => byPrecision.has(p));
  const data: (GroupedDatum & { cases: number })[] = groups.flatMap((group) =>
    series.flatMap((hw) => {
      const g = geomeanAdvantage(model, hw, baseline, byPrecision.get(group));
      return g ? [{ group, series: hw, value: g.value, cases: g.cases }] : [];
    }),
  );
  if (data.length === 0) return <EmptyChart>No cases shared with the baseline.</EmptyChart>;
  return (
    <OpxChart<GroupedDatum & { cases: number }>
      chartId="operatorx-precision-advantage"
      data={data}
      height={320}
      margin={{ top: 16, right: 16, bottom: 56, left: 72 }}
      xScale={{ type: 'band', domain: groups, padding: 0.2 }}
      yScale={ratioScale(data.map((d) => d.value))}
      xAxis={{ label: 'Compute precision', grid: false }}
      yAxis={{
        label: `Advantage over ${hardwareLabel(baseline)}`,
        tickCount: 5,
        tickFormat: (v) => formatRatio(Number(v)),
      }}
      layers={[groupedBarsLayer({ key: 'bars', data, series, colors: model.colors, origin: 1 })]}
      tooltip={{
        rulerType: 'none',
        content: (d) =>
          tooltipHtml({
            title: hardwareLabel(d.series),
            color: model.colors[d.series],
            rows: [
              `${d.group} vs ${hardwareLabel(baseline)}`,
              `<strong>${formatRatio(d.value)}</strong> geomean over ${d.cases} cases`,
            ],
          }),
      }}
      legendElement={<HardwareLegend model={model} />}
    />
  );
}

export const precisionAdvantage: VizDefinition = {
  id: 'precision-advantage',
  title: 'Advantage over baseline by precision',
  description:
    'Geomean advantage over the baseline split by compute precision; a missing bar means no shared cases at that precision.',
  ops: ['gemm', 'moe'],
  Component: PrecisionAdvantage,
};
