'use client';

import { EmptyChart } from '../../charts/empty';
import { OpxChart, tooltipHtml } from '../../charts/kit';
import { originBarsLayer } from '../../charts/layers';
import { formatRatio, ratioScale } from '../../charts/scales';
import { hardwareLabel } from '../../compare/hardware';
import { type ComparisonModel, geomeanAdvantage } from '../../compare/model';
import type { VizDefinition } from '../types';

interface Bar {
  hw: string;
  value: number;
  cases: number;
}

function SpeedupVsBaseline({ model }: { model: ComparisonModel }) {
  const { baseline, metric } = model;
  if (!baseline) return <EmptyChart>Pick a baseline GPU.</EmptyChart>;
  const bars: Bar[] = model.hardware.flatMap((hw) => {
    const g = geomeanAdvantage(model, hw, baseline);
    return g ? [{ hw, value: g.value, cases: g.cases }] : [];
  });
  if (bars.length === 0) return <EmptyChart>No cases shared with the baseline.</EmptyChart>;
  return (
    <OpxChart<Bar>
      chartId="operatorx-speedup-vs-baseline"
      data={bars}
      height={bars.length * 36 + 60}
      margin={{ top: 8, right: 56, bottom: 44, left: 84 }}
      xScale={ratioScale(bars.map((b) => b.value))}
      yScale={{ type: 'band', domain: bars.map((b) => b.hw), padding: 0.3 }}
      xAxis={{
        label: `Advantage over ${hardwareLabel(baseline)}`,
        tickCount: 5,
        tickFormat: (v) => formatRatio(Number(v)),
      }}
      yAxis={{ tickFormat: (v) => hardwareLabel(String(v)), grid: false }}
      layers={[
        originBarsLayer({
          key: 'bars',
          data: bars,
          band: (b) => b.hw,
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
              `${b.cases} shared cases · ${metric.label.toLowerCase()}`,
            ],
          }),
      }}
    />
  );
}

export const speedupVsBaseline: VizDefinition = {
  id: 'speedup-vs-baseline',
  title: 'Advantage over baseline',
  description:
    'Geomean of each GPU’s per-case advantage over the baseline on the selected metric, across the cases both ran. Right of 1× is better.',
  ops: ['gemm', 'moe'],
  Component: SpeedupVsBaseline,
};
