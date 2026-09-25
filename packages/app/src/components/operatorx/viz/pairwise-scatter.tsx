'use client';

import * as d3 from 'd3';
import { useMemo, useState } from 'react';

import { SearchableSelect } from '@/components/ui/searchable-select';

import { EmptyChart } from '../charts/empty';
import { OpxChart, esc, HardwareLegend, tooltipHtml } from '../charts/kit';
import { valueScale } from '../charts/scales';
import { hardwareLabel } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';
import { caseLabel } from '../compare/slices';
import type { VizDefinition } from './types';

interface Pair {
  i: number;
  x: number;
  y: number;
}

/** Number of cases both GPUs measured. */
function shared(model: ComparisonModel, a: string | undefined, b: string): number {
  return a
    ? model.view.cases.filter((_, i) => model.value(a, i) !== null && model.value(b, i) !== null)
        .length
    : 0;
}

function PairwiseScatter({ model }: { model: ComparisonModel }) {
  const { view, metric, hardware } = model;
  const [pickA, setA] = useState<string | null>(null);
  const [pickB, setB] = useState<string | null>(null);
  const a = pickA && hardware.includes(pickA) ? pickA : (model.baseline ?? hardware[0]);
  const b =
    pickB && hardware.includes(pickB) && pickB !== a
      ? pickB
      : hardware
          .filter((h) => h !== a)
          .toSorted((p, q) => shared(model, a, q) - shared(model, a, p))[0];
  const pairs = useMemo<Pair[]>(
    () =>
      a && b
        ? view.cases.flatMap((_, i) => {
            const x = model.value(a, i);
            const y = model.value(b, i);
            return x !== null && y !== null ? [{ i, x, y }] : [];
          })
        : [],
    [model, view, a, b],
  );
  if (!a || !b) return <EmptyChart>Select two GPUs.</EmptyChart>;
  const options = [
    { label: '', options: hardware.map((h) => ({ value: h, label: hardwareLabel(h) })) },
  ];
  const winner = (p: Pair) => (model.better(p.y, p.x) ? b : a);
  const bWins = pairs.filter((p) => winner(p) === b).length;
  const scale = valueScale(
    metric.log,
    pairs.flatMap((p) => [p.x, p.y]),
  );
  const [d0, d1] = scale.domain as [number, number];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <SearchableSelect
          size="sm"
          value={a}
          onValueChange={setA}
          groups={options}
          triggerAriaLabel="X axis GPU"
        />
        <span>vs</span>
        <SearchableSelect
          size="sm"
          value={b}
          onValueChange={setB}
          groups={options}
          triggerAriaLabel="Y axis GPU"
        />
        <span className="ml-auto">
          {hardwareLabel(b)} better on {bWins} of {pairs.length}
        </span>
      </div>
      {pairs.length === 0 ? (
        <EmptyChart>No case was measured on both.</EmptyChart>
      ) : (
        <OpxChart<Pair>
          chartId="operatorx-pairwise"
          data={pairs}
          height={380}
          margin={{ top: 16, right: 16, bottom: 56, left: 72 }}
          xScale={scale}
          yScale={scale}
          xAxis={{
            label: `${hardwareLabel(a)} ${metric.label.toLowerCase()} (${metric.unit})`,
            tickCount: 5,
            tickFormat: (v) => metric.format(Number(v)),
          }}
          yAxis={{
            label: `${hardwareLabel(b)} (${metric.unit})`,
            tickCount: 5,
            tickFormat: (v) => metric.format(Number(v)),
          }}
          layers={[
            {
              type: 'line',
              key: 'parity',
              lines: {
                parity: [
                  { x: d0, y: d0 },
                  { x: d1, y: d1 },
                ],
              },
              config: {
                getColor: () => 'var(--muted-foreground)',
                getStrokeDasharray: () => '4 4',
                strokeWidth: 1.5,
                curve: d3.curveLinear,
              },
            },
            {
              type: 'point',
              key: 'points',
              data: pairs,
              config: {
                getCx: () => 0,
                getCy: () => 0,
                getX: (p) => p.x,
                getY: (p) => p.y,
                getColor: (p) => model.colors[winner(p)],
                getRadius: () => 3,
                keyFn: (p) => String(p.i),
                maxPoints: Infinity,
              },
            },
          ]}
          tooltip={{
            rulerType: 'none',
            attachToLayer: 1,
            content: (p) =>
              tooltipHtml({
                title: caseLabel(view.cases[p.i]),
                rows: [
                  esc(view.cases[p.i].precision),
                  `${hardwareLabel(a)} <strong>${metric.format(p.x)}</strong>`,
                  `${hardwareLabel(b)} <strong>${metric.format(p.y)}</strong>`,
                ],
              }),
          }}
          legendElement={<HardwareLegend model={model} hardware={[a, b]} />}
        />
      )}
    </div>
  );
}

export const pairwiseScatter: VizDefinition = {
  id: 'pairwise-scatter',
  title: 'Head to head',
  ops: ['gemm', 'moe'],
  Component: PairwiseScatter,
};
