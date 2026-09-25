'use client';

import { useMemo, useState } from 'react';

import type { ComputePrecision } from '@semianalysisai/inferencex-db/operatorx/compare';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';

import { EmptyChart } from '../charts/empty';
import { OpxChart, esc, HardwareLegend, tooltipHtml } from '../charts/kit';
import { formatCompact } from '../charts/scales';
import { hardwareLabel, peakBandwidthTBs, peakTflops } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';
import { caseLabel } from '../compare/slices';
import type { VizDefinition } from './types';

const ORDER: ComputePrecision[] = ['fp4', 'fp8', 'bf16'];

interface Point {
  hw: string;
  i: number;
  x: number;
  y: number;
}

function Roofline({ model }: { model: ComparisonModel }) {
  const { view } = model;
  const counts = useMemo(() => {
    const m = new Map<ComputePrecision, number>();
    for (const c of view.cases)
      if (c.flops && c.bytes) m.set(c.computePrecision, (m.get(c.computePrecision) ?? 0) + 1);
    return m;
  }, [view]);
  const precisions = ORDER.filter((p) => counts.has(p));
  const [picked, setPicked] = useState<ComputePrecision | null>(null);
  const precision =
    picked && precisions.includes(picked)
      ? picked
      : precisions.toSorted((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0];
  const points = useMemo<Point[]>(
    () =>
      model.hardware.flatMap((hw) =>
        view.cases.flatMap((c, i) => {
          const us = model.latency(hw, i);
          return c.computePrecision === precision && us && c.flops && c.bytes
            ? [{ hw, i, x: c.flops / c.bytes, y: c.flops / (us * 1e6) }]
            : [];
        }),
      ),
    [model, view, precision],
  );
  if (!precision) return <EmptyChart>No case has FLOP and byte counts.</EmptyChart>;
  const ais = view.cases.flatMap((c) =>
    c.computePrecision === precision && c.flops && c.bytes ? [c.flops / c.bytes] : [],
  );
  const [a0, a1] = [Math.min(...ais) / 1.5, Math.max(...ais) * 1.5];
  const rooflines: Record<string, { x: number; y: number }[]> = {};
  for (const hw of model.hardware) {
    const peak = peakTflops(hw, precision);
    const bw = peakBandwidthTBs(hw);
    if (!peak || !bw) continue;
    const knee = peak / bw;
    rooflines[hw] = [
      { x: a0, y: Math.min(peak, bw * a0) },
      ...(knee > a0 && knee < a1 ? [{ x: knee, y: peak }] : []),
      { x: a1, y: Math.min(peak, bw * a1) },
    ];
  }
  const ys = [
    ...points.map((p) => p.y),
    ...Object.values(rooflines).flatMap((r) => r.map((p) => p.y)),
  ];
  return (
    <div className="space-y-3">
      <SegmentedToggle
        value={precision}
        onValueChange={setPicked}
        ariaLabel="Compute precision"
        options={precisions.map((p) => ({ value: p, label: p }))}
      />
      <OpxChart<Point>
        inspect={{ model, caseOf: (p) => p.i }}
        chartId="operatorx-roofline"
        data={points}
        height={400}
        margin={{ top: 16, right: 16, bottom: 56, left: 72 }}
        xScale={{ type: 'log', domain: [a0, a1], nice: false }}
        yScale={{
          type: 'log',
          domain: [Math.max(1e-3, Math.min(...ys) / 1.5), Math.max(...ys) * 1.3],
          nice: false,
        }}
        xAxis={{
          label: 'Arithmetic intensity (FLOP/byte)',
          tickFormat: (v) => formatCompact(Number(v)),
        }}
        yAxis={{
          label: 'Achieved TFLOPS',
          tickCount: 6,
          tickFormat: (v) => formatCompact(Number(v)),
        }}
        layers={[
          {
            type: 'roofline',
            key: 'roofs',
            rooflines,
            config: { getColor: (hw) => model.colors[hw], strokeWidth: 2, strokeDasharray: '6 4' },
          },
          {
            type: 'point',
            key: 'points',
            data: points,
            config: {
              getCx: () => 0,
              getCy: () => 0,
              getX: (p) => p.x,
              getY: (p) => p.y,
              getColor: (p) => model.colors[p.hw],
              getRadius: () => 3,
              keyFn: (p) => `${p.hw}-${p.i}`,
              maxPoints: Infinity,
            },
          },
        ]}
        tooltip={{
          rulerType: 'none',
          attachToLayer: 1,
          content: (p) =>
            tooltipHtml({
              title: hardwareLabel(p.hw),
              color: model.colors[p.hw],
              rows: [
                esc(`${caseLabel(view.cases[p.i])} · ${view.cases[p.i].precision}`),
                `<strong>${p.y.toFixed(1)} TFLOPS</strong> at ${p.x.toFixed(0)} FLOP/B`,
              ],
              footer: 'Click for kernel timeline',
            }),
        }}
        legendElement={<HardwareLegend model={model} />}
      />
    </div>
  );
}

export const roofline: VizDefinition = {
  id: 'roofline',
  title: 'Roofline',
  ops: ['gemm', 'moe'],
  wide: true,
  Component: Roofline,
};
