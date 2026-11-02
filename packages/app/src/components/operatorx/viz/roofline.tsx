'use client';

import { curveLinear } from 'd3';
import { comparisonDefaults } from '@semianalysisai/inferencex-db/operatorx/visualization';
import { useMemo, useState } from 'react';

import type { ComputePrecision } from '@semianalysisai/inferencex-db/operatorx/compare';
import { Label } from '@/components/ui/label';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { Switch } from '@/components/ui/switch';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { rooflineSummary } from '@/lib/operatorx/roofline-summary';

import { EmptyChart } from '../charts/empty';
import { OpxChart, esc, HardwareLegend, tooltipHtml } from '../charts/kit';
import { formatCompact } from '../charts/scales';
import { hardwareLabel, peakBandwidthTBs, peakTflops } from '../compare/hardware';
import { type RooflineBound, rooflineBound, ridgeShare } from '../compare/roofline-bound';
import type { ComparisonModel } from '../compare/model';
import { originRows } from '../compare/slices';
import type { VizDefinition } from './types';
import { RooflineBars } from './roofline-bars';

const ORDER: ComputePrecision[] = ['fp4', 'fp8', 'bf16'];

const STRINGS = {
  en: { sharedOnly: 'Shared cases only' },
  zh: { sharedOnly: '仅共同用例' },
};

interface Point {
  hw: string;
  i: number;
  x: number;
  y: number;
  ai: number;
  tflops: number;
  us: number;
  bound: RooflineBound | null;
}

const SHARED = 'shared';
const ratio = (v: number) => String(Number(v.toPrecision(2)));
const share = (v: number, of: number | null, what: string) =>
  of ? ` · ${ratio((v / of) * 100)}% of peak ${what}` : '';

/** `37% of roofline (88 µs · compute 41%, memory 59%)`. */
function boundRow(b: RooflineBound, us: number): string {
  const parts = (
    [
      ['compute', b.compute],
      ['memory', b.memory],
      ['link', b.link],
    ] as const
  ).filter(([, t]) => t > 0);
  const split =
    parts.length > 1
      ? ` · ${parts.map(([name, t]) => `${name} ${ratio((t / b.us) * 100)}%`).join(', ')}`
      : ` · ${parts[0]?.[0] ?? 'compute'}-bound`;
  return `<strong>${ratio((b.us / us) * 100)}% of roofline</strong> (${ratio(b.us)} µs${split})`;
}

export function Roofline({
  model,
  summaryOnly = false,
}: {
  model: ComparisonModel;
  summaryOnly?: boolean;
}) {
  const strings = STRINGS[useLocale()];
  const { view } = model;
  const counts = useMemo(() => {
    const m = new Map<ComputePrecision, number>();
    for (const c of view.cases)
      if (c.flops && c.bytes) m.set(c.computePrecision, (m.get(c.computePrecision) ?? 0) + 1);
    return m;
  }, [view]);
  const precisions = ORDER.filter((p) => counts.has(p));
  const defaults = view.defaults ?? comparisonDefaults(view);
  const [picked, setPicked] = useState<ComputePrecision | null>(null);
  const [sharedOnly, setSharedOnly] = useState(true);
  const [normalized, setNormalized] = useState(defaults.rooflineNormalized);
  const precision = picked && precisions.includes(picked) ? picked : defaults.rooflinePrecision;
  // Each stage hits its own roof, so a case sits at its effective intensity: where the
  // device's roofline reaches the case's bound, F / t_roof (plain FLOP/byte for one stage).
  const points = useMemo<Point[]>(
    () =>
      model.hardware.flatMap((hw) => {
        const peak = precision ? peakTflops(hw, precision) : null;
        const bw = peakBandwidthTBs(hw);
        if (normalized && (!peak || !bw)) return [];
        return view.cases.flatMap((c, i) => {
          const us = model.latency(hw, i);
          if (c.computePrecision !== precision || !us || !c.flops || !c.bytes) return [];
          const bound = rooflineBound(c, hw);
          const tflops = c.flops / (us * 1e6);
          const ridged = ridgeShare(c, hw, precision);
          const ai = ridged === null ? c.flops / c.bytes : (ridged * peak!) / bw!;
          return [
            normalized
              ? { hw, i, ai, tflops, us, bound, x: ridged!, y: tflops / peak! }
              : { hw, i, ai, tflops, us, bound, x: ai, y: tflops },
          ];
        });
      }),
    [model, view, precision, normalized],
  );
  const summary = useMemo(
    () => rooflineSummary(view, { precision, hardware: model.hardware, sharedOnly, normalized }),
    [view, precision, model.hardware, normalized, sharedOnly],
  );
  if (!precision) return <EmptyChart>No case has FLOP and byte counts.</EmptyChart>;
  const composite = view.cases.some(
    (c) => (c.work?.parts.length ?? 0) > 1 || (c.work?.links.length ?? 0) > 0,
  );
  const xs = points.map((p) => p.x);
  const [a0, a1] =
    xs.length > 0
      ? [
          Math.min(...xs, normalized ? 1 : Infinity) / 1.5,
          Math.max(...xs, normalized ? 1 : -Infinity) * 1.5,
        ]
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
          onValueChange={(value) => {
            track('operatorx_roofline_precision_selected', { precision: value });
            setPicked(value);
          }}
          ariaLabel="Compute precision"
          options={precisions.map((p) => ({ value: p, label: p }))}
        />
        <div className="flex items-center gap-2">
          <Switch
            id={summaryOnly ? 'opx-summary-normalized' : 'opx-roofline-normalized'}
            checked={normalized}
            onCheckedChange={(enabled) => {
              track('operatorx_roofline_normalized_toggled', { enabled });
              setNormalized(enabled);
            }}
          />
          <Label
            htmlFor={summaryOnly ? 'opx-summary-normalized' : 'opx-roofline-normalized'}
            className="text-sm font-normal text-muted-foreground"
          >
            Normalized
          </Label>
        </div>
        {summaryOnly && (
          <div className="flex items-center gap-2">
            <Switch
              id="opx-summary-shared"
              checked={sharedOnly}
              onCheckedChange={(enabled) => {
                track('operatorx_summary_shared_toggled', { enabled });
                setSharedOnly(enabled);
              }}
            />
            <Label
              htmlFor="opx-summary-shared"
              className="text-sm font-normal text-muted-foreground"
            >
              {strings.sharedOnly}
            </Label>
          </div>
        )}
      </div>
      {summaryOnly ? (
        <RooflineBars model={model} summary={summary} />
      ) : (
        <div className="min-w-0">
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
                ? {
                    label: `${composite ? 'Effective intensity' : 'Arithmetic intensity'} / ridge point`,
                    tickFormat: (v) => ratio(Number(v)),
                  }
                : {
                    label: `${composite ? 'Effective intensity' : 'Arithmetic intensity'} (FLOP/byte)`,
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
                const c = view.cases[p.i];
                const tbs = c.bytes! / (p.us * 1e6);
                return tooltipHtml({
                  title: hardwareLabel(p.hw),
                  color: model.colors[p.hw],
                  rows: [
                    esc(`${view.cases[p.i].shape} · ${view.cases[p.i].precision}`),
                    ...originRows(view, p.i),
                    `<strong>${p.tflops.toFixed(1)} TFLOPS</strong>${share(p.tflops, peak, 'compute')}`,
                    `<strong>${tbs.toFixed(2)} TB/s</strong>${share(tbs, bw, 'bandwidth')}`,
                    `${(c.flops! / c.bytes!).toFixed(0)} FLOP/byte${composite ? ` · ${p.ai.toFixed(0)} effective` : ''}`,
                    ...(p.bound ? [boundRow(p.bound, p.us)] : []),
                  ],
                  footer: 'Click for kernel timeline',
                });
              },
            }}
            legendElement={<HardwareLegend model={model} />}
          />
        </div>
      )}
    </div>
  );
}

export const roofline: VizDefinition = {
  id: 'roofline',
  title: 'Roofline',
  ops: ['gemm', 'moe', 'attention'],
  wide: true,
  Component: Roofline,
};
