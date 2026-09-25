'use client';

import * as d3 from 'd3';
import { useMemo, useState } from 'react';

import { SearchableSelect } from '@/components/ui/searchable-select';

import { EmptyChart } from '../charts/empty';
import { OpxChart, esc, HardwareLegend, tooltipHtml } from '../charts/kit';
import { formatCompact, valueScale } from '../charts/scales';
import { hardwareLabel } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';
import { caseLabel, rankedSlices } from '../compare/slices';
import type { VizDefinition } from './types';

interface Point {
  hw: string;
  i: number;
  x: number;
  y: number;
}

function MetricVsSize({ model }: { model: ComparisonModel }) {
  const { view, metric } = model;
  const groups = useMemo(
    () => rankedSlices(view.op, view.cases).filter(([, idx]) => idx.length > 1),
    [view],
  );
  const [slice, setSlice] = useState<string | null>(null);
  const current = groups.find(([k]) => k === slice) ?? groups[0];
  const points = useMemo<Point[]>(
    () =>
      current
        ? model.hardware.flatMap((hw) =>
            current[1].flatMap((i) => {
              const x = view.cases[i].x;
              const y = model.value(hw, i);
              return x && y !== null ? [{ hw, i, x, y }] : [];
            }),
          )
        : [],
    [current, model, view],
  );
  if (!current) return <EmptyChart>No shape has more than one size.</EmptyChart>;
  const lines: Record<string, { x: number; y: number }[]> = {};
  for (const p of points) (lines[p.hw] ??= []).push({ x: p.x, y: p.y });
  for (const l of Object.values(lines)) l.sort((a, b) => a.x - b.x);
  const xs = [...new Set(current[1].map((i) => view.cases[i].x ?? 0))]
    .filter((x) => x > 0)
    .toSorted((a, b) => a - b);
  const sizeLabel = view.op === 'gemm' ? 'M' : 'Tokens';
  return (
    <div className="space-y-3">
      <SearchableSelect
        size="sm"
        searchable
        value={current[0]}
        onValueChange={setSlice}
        triggerAriaLabel="Shape"
        groups={[
          {
            label: '',
            options: groups.map(([k]) => ({ value: k, label: k })),
          },
        ]}
      />
      <OpxChart<Point>
        inspect={{ model, caseOf: (p) => p.i }}
        chartId="operatorx-metric-vs-size"
        data={points}
        height={340}
        margin={{ top: 16, right: 16, bottom: 56, left: 72 }}
        xScale={{ type: 'log', domain: [xs[0] / 1.2, xs.at(-1)! * 1.2], nice: false }}
        yScale={valueScale(
          metric.log,
          points.map((p) => p.y),
        )}
        xAxis={{
          label: sizeLabel,
          tickValues: xs.length <= 12 ? xs : undefined,
          tickFormat: (v) => formatCompact(Number(v)),
        }}
        yAxis={{
          label: `${metric.label} (${metric.unit})`,
          tickCount: 5,
          tickFormat: (v) => metric.format(Number(v)),
        }}
        layers={[
          {
            type: 'line',
            key: 'lines',
            lines,
            config: { getColor: (hw) => model.colors[hw], strokeWidth: 2, curve: d3.curveLinear },
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
              getRadius: () => 4,
              stroke: 'var(--background)',
              strokeWidth: 1,
              keyFn: (p) => `${p.hw}-${p.i}`,
              maxPoints: Infinity,
            },
          },
        ]}
        tooltip={{
          rulerType: 'crosshair',
          attachToLayer: 1,
          content: (p) =>
            tooltipHtml({
              title: hardwareLabel(p.hw),
              color: model.colors[p.hw],
              rows: [esc(caseLabel(view.cases[p.i])), `<strong>${metric.format(p.y)}</strong>`],
              footer: 'Click for kernel timeline',
            }),
          getRulerX: (p, s) => (s as d3.ScaleLogarithmic<number, number>)(p.x),
          getRulerY: (p, s) => s(p.y),
        }}
        legendElement={<HardwareLegend model={model} />}
      />
    </div>
  );
}

export const metricVsSize: VizDefinition = {
  id: 'metric-vs-size',
  title: 'Metric vs size',
  wide: true,
  ops: ['gemm', 'moe'],
  Component: MetricVsSize,
};
