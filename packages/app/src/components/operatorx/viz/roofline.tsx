'use client';

import { curveLinear } from 'd3';
import { useMemo, useState } from 'react';

import type { ComputePrecision } from '@semianalysisai/inferencex-db/operatorx/compare';
import { Label } from '@/components/ui/label';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { Switch } from '@/components/ui/switch';

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
  /** FLOP/byte and TFLOPS, as measured; x/y are these or their normalized forms. */
  ai: number;
  tflops: number;
}

/** Key of the one roofline every device shares once normalized. */
const SHARED = 'shared';
const ratio = (v: number) => String(Number(v.toPrecision(2)));
/** ` · 42% of peak compute`, or nothing when the device's peak is unknown. */
const share = (v: number, of: number | null, what: string) =>
  of ? ` · ${ratio((v / of) * 100)}% of peak ${what}` : '';

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
  const [normalized, setNormalized] = useState(true);
  const precision =
    picked && precisions.includes(picked)
      ? picked
      : precisions.toSorted((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0];
  // Normalized, each device's intensity is divided by its ridge point (peak / bandwidth)
  // and its throughput by its peak, so every roofline becomes min(1, x).
  const points = useMemo<Point[]>(
    () =>
      model.hardware.flatMap((hw) => {
        const peak = precision ? peakTflops(hw, precision) : null;
        const bw = peakBandwidthTBs(hw);
        if (normalized && (!peak || !bw)) return [];
        return view.cases.flatMap((c, i) => {
          const us = model.latency(hw, i);
          if (c.computePrecision !== precision || !us || !c.flops || !c.bytes) return [];
          const ai = c.flops / c.bytes;
          const tflops = c.flops / (us * 1e6);
          return [
            normalized
              ? { hw, i, ai, tflops, x: (ai * bw!) / peak!, y: tflops / peak! }
              : { hw, i, ai, tflops, x: ai, y: tflops },
          ];
        });
      }),
    [model, view, precision, normalized],
  );
  if (!precision) return <EmptyChart>No case has FLOP and byte counts.</EmptyChart>;
  const xs = normalized
    ? points.map((p) => p.x)
    : view.cases.flatMap((c) =>
        c.computePrecision === precision && c.flops && c.bytes ? [c.flops / c.bytes] : [],
      );
  const [a0, a1] =
    xs.length > 0
      ? [Math.min(...xs, normalized ? 1 : Infinity) / 1.5, Math.max(...xs) * 1.5]
      : [0.1, 10];
  const rooflines: Record<string, { x: number; y: number }[]> = {};
  const roof = (peak: number, knee: number) => [
    { x: a0, y: Math.min(peak, (peak / knee) * a0) },
    ...(knee > a0 && knee < a1 ? [{ x: knee, y: peak }] : []),
    { x: a1, y: Math.min(peak, (peak / knee) * a1) },
  ];
  if (normalized) rooflines[SHARED] = roof(1, 1);
  else
    for (const hw of model.hardware) {
      const peak = peakTflops(hw, precision);
      const bw = peakBandwidthTBs(hw);
      if (peak && bw) rooflines[hw] = roof(peak, peak / bw);
    }
  const ys = [
    ...points.map((p) => p.y),
    ...Object.values(rooflines).flatMap((r) => r.map((p) => p.y)),
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <SegmentedToggle
          value={precision}
          onValueChange={setPicked}
          ariaLabel="Compute precision"
          options={precisions.map((p) => ({ value: p, label: p }))}
        />
        <div className="flex items-center gap-2">
          <Switch
            id="opx-roofline-normalized"
            checked={normalized}
            onCheckedChange={setNormalized}
          />
          <Label
            htmlFor="opx-roofline-normalized"
            className="text-sm font-normal text-muted-foreground"
          >
            Normalized
          </Label>
        </div>
      </div>
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
        xAxis={
          normalized
            ? { label: 'Arithmetic intensity / ridge point', tickFormat: (v) => ratio(Number(v)) }
            : {
                label: 'Arithmetic intensity (FLOP/byte)',
                tickFormat: (v) => formatCompact(Number(v)),
              }
        }
        yAxis={
          normalized
            ? {
                label: 'Share of peak compute (%)',
                tickCount: 6,
                tickFormat: (v) => ratio(Number(v) * 100),
              }
            : {
                label: 'Achieved TFLOPS',
                tickCount: 6,
                tickFormat: (v) => formatCompact(Number(v)),
              }
        }
        layers={[
          {
            type: 'roofline',
            key: 'roofs',
            rooflines,
            config: {
              getColor: (hw) =>
                hw === SHARED
                  ? 'var(--muted-foreground)'
                  : (model.colors[hw] ?? 'var(--muted-foreground)'),
              strokeWidth: 2,
              strokeDasharray: '6 4',
              curve: curveLinear,
            },
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
          content: (p) => {
            const peak = peakTflops(p.hw, precision);
            const bw = peakBandwidthTBs(p.hw);
            const tbs = p.tflops / p.ai;
            return tooltipHtml({
              title: hardwareLabel(p.hw),
              color: model.colors[p.hw],
              rows: [
                esc(`${caseLabel(view.cases[p.i])} · ${view.cases[p.i].precision}`),
                `<strong>${p.tflops.toFixed(1)} TFLOPS</strong>${share(p.tflops, peak, 'compute')}`,
                `<strong>${tbs.toFixed(2)} TB/s</strong>${share(tbs, bw, 'bandwidth')}`,
                `${p.ai.toFixed(0)} FLOP/byte`,
              ],
              footer: 'Click for kernel timeline',
            });
          },
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
