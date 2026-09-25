'use client';

import { EmptyChart } from '../../charts/empty';
import { OpxChart, tooltipHtml } from '../../charts/kit';
import { originBarsLayer } from '../../charts/layers';
import { hardwareLabel } from '../../compare/hardware';
import { best, type ComparisonModel } from '../../compare/model';
import type { VizDefinition } from '../types';

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

interface Bar {
  hw: string;
  wins: number;
  share: number;
}

function WinShare({ model }: { model: ComparisonModel }) {
  const wins = new Map<string, number>();
  let contested = 0;
  model.view.cases.forEach((_, i) => {
    if (model.hardware.filter((hw) => model.value(hw, i) !== null).length < 2) return;
    const b = best(model, i);
    if (!b) return;
    contested++;
    wins.set(b.hardware, (wins.get(b.hardware) ?? 0) + 1);
  });
  if (contested === 0)
    return <EmptyChart>No case was measured on two or more selected GPUs.</EmptyChart>;
  const bars: Bar[] = model.hardware.map((hw) => ({
    hw,
    wins: wins.get(hw) ?? 0,
    share: (wins.get(hw) ?? 0) / contested,
  }));
  return (
    <OpxChart<Bar>
      chartId="operatorx-win-share"
      data={bars}
      height={bars.length * 36 + 60}
      margin={{ top: 8, right: 72, bottom: 44, left: 84 }}
      xScale={{
        type: 'linear',
        domain: [0, Math.max(...bars.map((b) => b.share)) * 1.05],
        nice: true,
      }}
      yScale={{ type: 'band', domain: bars.map((b) => b.hw), padding: 0.3 }}
      xAxis={{
        label: `Share of ${contested} contested cases`,
        tickCount: 5,
        tickFormat: (v) => pct(Number(v)),
      }}
      yAxis={{ tickFormat: (v) => hardwareLabel(String(v)), grid: false }}
      layers={[
        originBarsLayer({
          key: 'bars',
          data: bars,
          band: (b) => b.hw,
          value: (b) => b.share,
          color: (b) => model.colors[b.hw],
          label: (b) => `${pct(b.share)} (${b.wins})`,
          origin: 0,
        }),
      ]}
      tooltip={{
        rulerType: 'none',
        content: (b) =>
          tooltipHtml({
            title: hardwareLabel(b.hw),
            color: model.colors[b.hw],
            rows: [`Best on <strong>${b.wins}</strong> of ${contested} cases`],
          }),
      }}
    />
  );
}

export const winShare: VizDefinition = {
  id: 'win-share',
  title: 'Who wins',
  description:
    'Share of cases where each GPU has the best value on the selected metric, among cases two or more selected GPUs ran.',
  ops: ['gemm', 'moe'],
  Component: WinShare,
};
