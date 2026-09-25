'use client';

import { quantileSorted } from 'd3';
import { useState } from 'react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { EmptyChart } from '../charts/empty';
import { OpxChart, tooltipHtml } from '../charts/kit';
import { type BoxDatum, boxLayer } from '../charts/layers';
import { valueScale } from '../charts/scales';
import { hardwareLabel } from '../compare/hardware';
import { type ComparisonModel, commonCases } from '../compare/model';
import type { VizDefinition } from './types';

function Distribution({ model }: { model: ComparisonModel }) {
  const { metric } = model;
  const [pickedCommon, setCommon] = useState(true);
  const shared = commonCases(model);
  const common = pickedCommon && shared.length > 0;
  const indices = common ? shared : model.view.cases.map((_, i) => i);
  const boxes = model.hardware.flatMap((hw): (BoxDatum & { n: number })[] => {
    const v = indices
      .map((i) => model.value(hw, i))
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    if (v.length === 0) return [];
    const q = (p: number) => quantileSorted(v, p) ?? 0;
    return [
      {
        band: hw,
        color: model.colors[hw],
        n: v.length,
        p5: q(0.05),
        p25: q(0.25),
        p50: q(0.5),
        p75: q(0.75),
        p95: q(0.95),
      },
    ];
  });
  return (
    <div className="space-y-3">
      {shared.length > 0 && (
        <div className="flex items-center gap-2">
          <Switch id="opx-dist-common" checked={common} onCheckedChange={setCommon} />
          <Label htmlFor="opx-dist-common" className="text-sm font-normal text-muted-foreground">
            Only the {shared.length} cases every selected GPU ran
          </Label>
        </div>
      )}
      {boxes.length === 0 ? (
        <EmptyChart>No measured cases.</EmptyChart>
      ) : (
        <OpxChart<BoxDatum & { n: number }>
          chartId="operatorx-distribution"
          data={boxes}
          height={320}
          margin={{ top: 16, right: 16, bottom: 44, left: 72 }}
          xScale={{ type: 'band', domain: boxes.map((b) => b.band), padding: 0.4 }}
          yScale={valueScale(
            metric.log,
            boxes.flatMap((b) => [b.p5, b.p95]),
          )}
          xAxis={{ tickFormat: (v) => hardwareLabel(String(v)), grid: false }}
          yAxis={{
            label: `${metric.label} (${metric.unit})`,
            tickCount: 5,
            tickFormat: (v) => metric.format(Number(v)),
          }}
          layers={[boxLayer({ key: 'boxes', data: boxes })]}
          tooltip={{
            rulerType: 'none',
            content: (b) =>
              tooltipHtml({
                title: hardwareLabel(b.band),
                color: b.color,
                rows: [
                  `${b.n} cases`,
                  `median <strong>${metric.format(b.p50)}</strong>`,
                  `p25–p75 ${metric.format(b.p25)} – ${metric.format(b.p75)}`,
                  `p5–p95 ${metric.format(b.p5)} – ${metric.format(b.p95)}`,
                ],
              }),
          }}
        />
      )}
    </div>
  );
}

export const distribution: VizDefinition = {
  id: 'distribution',
  title: 'Distribution per GPU',
  ops: ['gemm', 'moe'],
  Component: Distribution,
};
