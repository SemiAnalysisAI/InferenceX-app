'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useState } from 'react';

import { SearchableSelect } from '@/components/ui/searchable-select';
import { track } from '@/lib/analytics/analytics';

import { EmptyChart } from '../charts/empty';
import { OpxChart, esc, tooltipHtml } from '../charts/kit';
import { valueScale } from '../charts/scales';
import { hardwareLabel } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';
import { originRows } from '../compare/slices';
import type { VizDefinition } from './types';

interface Pair {
  i: number;
  x: number;
  y: number;
}

function shared(model: ComparisonModel, a: string | undefined, b: string): number {
  return a
    ? model.view.cases.filter((_, i) => model.value(a, i) !== null && model.value(b, i) !== null)
        .length
    : 0;
}

function measured(model: ComparisonModel, hw: string): number {
  return model.view.cases.filter((_, i) => model.value(hw, i) !== null).length;
}

function PairwiseScatter({ model }: { model: ComparisonModel }) {
  const { view, metric, hardware } = model;
  const [pickA, setA] = useState<string | null>(null);
  const [pickB, setB] = useState<string | null>(null);
  // The plot fills whatever height the row leaves, so it never pads the card beside it.
  const [plotBox, setPlotBox] = useState<HTMLDivElement | null>(null);
  const [plotHeight, setPlotHeight] = useState(0);
  useEffect(() => {
    if (!plotBox) return;
    const observer = new ResizeObserver(([entry]) =>
      setPlotHeight(Math.round(entry.contentRect.height)),
    );
    observer.observe(plotBox);
    return () => observer.disconnect();
  }, [plotBox]);
  const a =
    pickA && hardware.includes(pickA)
      ? pickA
      : (model.baseline ?? hardware.toSorted((p, q) => measured(model, q) - measured(model, p))[0]);
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
  const swatch = (hw: string) => (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: model.colors[hw] }}
    />
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {swatch(a)}
        <SearchableSelect
          size="sm"
          value={a}
          onValueChange={(value) => {
            track('operatorx_pairwise_gpu_selected', { axis: 'x', gpu: value });
            setA(value);
          }}
          groups={options}
          triggerAriaLabel="X axis GPU"
        />
        <span>vs</span>
        {swatch(b)}
        <SearchableSelect
          size="sm"
          value={b}
          onValueChange={(value) => {
            track('operatorx_pairwise_gpu_selected', { axis: 'y', gpu: value });
            setB(value);
          }}
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
        <div ref={setPlotBox} className="relative min-h-72 flex-1">
          <div className="absolute inset-0">
            <OpxChart<Pair>
              inspect={{ model, caseOf: (p) => p.i }}
              chartId="operatorx-pairwise"
              data={pairs}
              height={Math.max(plotHeight, 288)}
              margin={{ top: 16, right: 16, bottom: 56, left: 72 }}
              xScale={scale}
              yScale={scale}
              xAxis={{
                label: `${hardwareLabel(a)} ${metric.label.toLowerCase()} (${metric.unit})`,
                tickCount: 5,
                tickFormat: (v) => metric.tick(Number(v)),
              }}
              yAxis={{
                label: `${hardwareLabel(b)} (${metric.unit})`,
                tickCount: 5,
                tickFormat: (v) => metric.tick(Number(v)),
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
                    title: view.cases[p.i].shape,
                    rows: [
                      esc(view.cases[p.i].precision),
                      ...originRows(view, p.i),
                      `${hardwareLabel(a)} ${esc(view.measurements[a].backend?.[p.i] ?? '')} <strong>${metric.format(p.x)}</strong>`,
                      `${hardwareLabel(b)} ${esc(view.measurements[b].backend?.[p.i] ?? '')} <strong>${metric.format(p.y)}</strong>`,
                    ],
                    footer: 'Click for kernel timeline',
                  }),
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export const pairwiseScatter: VizDefinition = {
  id: 'pairwise-scatter',
  title: 'Head to head',
  ops: ['gemm', 'moe'],
  span: 5,
  Component: PairwiseScatter,
};
