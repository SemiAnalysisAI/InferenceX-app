'use client';

import { curveLinear } from 'd3';
import { comparisonDefaults } from '@semianalysisai/inferencex-db/operatorx/visualization';
import { useId, useMemo, useRef, useState } from 'react';

import { useClientSearch } from '@/hooks/useClientSearch';
import { shareBoolean, sharePrecision } from '@/lib/operatorx/share-state';

import type { ComputePrecision } from '@semianalysisai/inferencex-db/operatorx/compare';
import ChartLegend, { type LegendSwitchConfig } from '@/components/ui/chart-legend';
import { ChartSection } from '@/components/ui/chart-section';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import { D3Chart, type D3ChartHandle } from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { rooflineSummary } from '@/lib/operatorx/roofline-summary';

import { SCATTER_MARGIN, VizCaption, VizFooter, hardwareLegend, inspectCase } from '../charts/kit';
import { formatCompact, logAxisTicks } from '../charts/scales';
import { hardwareLabel, peakBandwidthTBs, peakTflops } from '../compare/hardware';
import { type RooflineBound, rooflineBound, ridgeShare } from '../compare/roofline-bound';
import type { ComparisonModel } from '../compare/model';
import { originText } from '../compare/slices';
import { setSearchParam } from '../compare/url-selection';
import type { VizDefinition } from './types';
import { RooflineBars } from './roofline-bars';

const ORDER: ComputePrecision[] = ['fp4', 'fp8', 'bf16'];
const ROOF_DASH = '6 4';
const ROOF_SAMPLES = 64;

export const ROOFLINE_TITLE: Record<Locale, string> = { en: 'Roofline', zh: 'Roofline' };
export const SUMMARY_TITLE: Record<Locale, string> = {
  en: 'Median and best throughput',
  zh: '吞吐量中位数与最佳值',
};

const STRINGS = {
  en: {
    sharedOnly: 'Shared cases only',
    empty: 'No case has FLOP and byte counts',
    precision: 'Compute precision',
    normalized: 'Normalized',
    logScale: 'Log Scale',
    summaryKey: 'Median (fill) and best (outline)',
    summaryInfo:
      'With Shared cases only, every bar uses the cases measured on every selected accelerator and compute-bound on each. Without it, each accelerator uses its own compute-bound cases, so the case sets differ.',
    intensityAxis: 'Arithmetic intensity',
    shareAxis: 'Share of peak compute (%)',
    tflopsAxis: 'Achieved TFLOPS',
    share: (pct: string, what: 'compute' | 'bandwidth') => ` · ${pct}% of peak ${what}`,
    effective: (ai: string) => ` · ${ai} effective`,
    stage: { compute: 'compute', memory: 'memory', link: 'link' },
    bound: (stage: string) => `${stage}-bound`,
    ofRoofline: (pct: string) => `${pct}% of roofline`,
    listSeparator: ', ',
    aside: (text: string) => ` (${text})`,
  },
  zh: {
    sharedOnly: '仅共同用例',
    empty: '没有同时带 FLOP 和字节数的用例',
    precision: '计算精度',
    normalized: '归一化',
    logScale: '对数缩放',
    summaryKey: '中位数（填充）与最佳值（轮廓）',
    summaryInfo:
      '开启“仅共同用例”时，所有柱使用在每个所选加速器上都有实测值、且在各加速器上均为计算受限的用例；关闭后，各加速器使用各自的计算受限用例，用例集合可能不同。',
    intensityAxis: '算术强度',
    shareAxis: '计算峰值占比（%）',
    tflopsAxis: '实测 TFLOPS',
    share: (pct: string, what: 'compute' | 'bandwidth') =>
      ` · ${what === 'compute' ? '计算' : '带宽'}峰值的 ${pct}%`,
    effective: (ai: string) => ` · 有效 ${ai}`,
    stage: { compute: '计算', memory: '访存', link: '互联' },
    bound: (stage: string) => `${stage}受限`,
    ofRoofline: (pct: string) => `达到 roofline 的 ${pct}%`,
    listSeparator: '，',
    aside: (text: string) => `（${text}）`,
  },
};

type Strings = (typeof STRINGS)['en' | 'zh'];

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

/** `37% of roofline (88 µs · compute 41%, memory 59%)`. */
function boundText(b: RooflineBound, us: number, strings: Strings): string {
  const parts = (['compute', 'memory', 'link'] as const).filter((stage) => b[stage] > 0);
  const split =
    parts.length > 1
      ? ` · ${parts.map((stage) => `${strings.stage[stage]} ${ratio((b[stage] / b.us) * 100)}%`).join(strings.listSeparator)}`
      : ` · ${strings.bound(strings.stage[parts[0] ?? 'compute'])}`;
  return `${strings.ofRoofline(ratio((b.us / us) * 100))}${strings.aside(`${ratio(b.us)} µs${split}`)}`;
}

export function Roofline({
  model,
  summaryOnly = false,
}: {
  model: ComparisonModel;
  summaryOnly?: boolean;
}) {
  const locale = useLocale();
  const strings = STRINGS[locale];
  const share = (v: number, of: number | null, what: 'compute' | 'bandwidth') =>
    of ? strings.share(ratio((v / of) * 100), what) : '';
  const { view } = model;
  const counts = useMemo(() => {
    const m = new Map<ComputePrecision, number>();
    for (const c of view.cases)
      if (c.flops && c.bytes) m.set(c.computePrecision, (m.get(c.computePrecision) ?? 0) + 1);
    return m;
  }, [view]);
  const precisions = ORDER.filter((p) => counts.has(p));
  const defaults = view.defaults ?? comparisonDefaults(view);
  const search = new URLSearchParams(useClientSearch());
  const prefix = summaryOnly ? 'summary' : 'scatter';
  const picked = sharePrecision(search.get(`${prefix}Precision`));
  const sharedOnly = shareBoolean(search.get('summarySharedOnly'), true);
  const normalized = shareBoolean(search.get(`${prefix}Normalized`), defaults.rooflineNormalized);
  const logY = shareBoolean(search.get('scatterLog'), false);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const legendId = useId();
  const chart = useRef<D3ChartHandle>(null);
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
  if (!precision)
    return (
      <EmptyState title={(summaryOnly ? SUMMARY_TITLE : ROOFLINE_TITLE)[locale]}>
        {strings.empty}
      </EmptyState>
    );
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
  // The y axis is sqrt over a log x axis, so the bandwidth slope bends on screen: sample it.
  const roof = (peak: number, knee: number) => {
    const end = Math.min(knee, a1);
    const slope =
      end > a0
        ? Array.from({ length: ROOF_SAMPLES + 1 }, (_, i) => {
            const x = a0 * (end / a0) ** (i / ROOF_SAMPLES);
            return { x, y: (peak / knee) * x };
          })
        : [{ x: a0, y: peak }];
    return knee < a1 ? [...slope, { x: a1, y: peak }] : slope;
  };
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
  const yHi = Math.max(...ys) * 1.1;
  // Log y: the original full-range axis (all values, /1.5 below, *1.5 above) spent half its
  // height on near-zero values. Raise the floor so that old midpoint sits a quarter of the
  // way up, then clip roofline slopes; never above the lowest measured point, so none is hidden.
  const yPos = ys.filter((y) => y > 0);
  const yMid = Math.sqrt((Math.min(...yPos) / 1.5) * (Math.max(...yPos) * 1.5));
  const ptPos = points.map((p) => p.y).filter((y) => y > 0);
  const yLo = Math.min(
    Math.exp((Math.log(yMid) - 0.25 * Math.log(yHi)) / 0.75),
    ...(ptPos.length > 0 ? [Math.min(...ptPos) / 1.2] : []),
  );
  const shown = logY ? points.filter((p) => p.y > 0) : points;
  if (logY)
    for (const [hw, line] of Object.entries(rooflines)) {
      const cut = line.findIndex((p) => p.y >= yLo);
      if (cut <= 0) continue;
      const below = line[cut - 1];
      rooflines[hw] = [{ x: (below.x * yLo) / below.y, y: yLo }, ...line.slice(cut)];
    }
  const chartId = summaryOnly ? 'operatorx-roofline-summary' : 'operatorx-roofline';
  const switches: LegendSwitchConfig[] = [
    {
      id: summaryOnly ? 'opx-summary-normalized' : 'opx-roofline-normalized',
      label: strings.normalized,
      checked: normalized,
      onCheckedChange: (enabled) => {
        track('operatorx_roofline_normalized_toggled', { enabled });
        setSearchParam(`${prefix}Normalized`, String(enabled));
      },
    },
    summaryOnly
      ? {
          id: 'opx-summary-shared',
          label: strings.sharedOnly,
          checked: sharedOnly,
          onCheckedChange: (enabled) => {
            track('operatorx_summary_shared_toggled', { enabled });
            setSearchParam('summarySharedOnly', String(enabled));
          },
        }
      : {
          id: 'opx-roofline-log',
          label: strings.logScale,
          checked: logY,
          onCheckedChange: (enabled) => {
            track('operatorx_roofline_log_toggled', { enabled });
            setSearchParam('scatterLog', String(enabled));
          },
        },
  ];
  const legend = (
    <ChartLegend
      variant="sidebar"
      isLegendExpanded={legendExpanded}
      onExpandedChange={setLegendExpanded}
      switches={switches}
      // Scatter points without a connecting line keep dot swatches.
      {...hardwareLegend(model, legendId, summaryOnly || normalized ? undefined : ROOF_DASH)}
    />
  );
  const caption = (
    <VizCaption
      title={(summaryOnly ? SUMMARY_TITLE : ROOFLINE_TITLE)[locale]}
      qualifier={summaryOnly ? strings.summaryKey : undefined}
      info={summaryOnly ? strings.summaryInfo : undefined}
    >
      <SegmentedToggle
        value={precision}
        onValueChange={(value) => {
          track('operatorx_roofline_precision_selected', { precision: value });
          setSearchParam(`${prefix}Precision`, value);
        }}
        ariaLabel={strings.precision}
        options={precisions.map((p) => ({ value: p, label: p }))}
      />
    </VizCaption>
  );
  return (
    <ChartSection
      chartId={chartId}
      analyticsPrefix="operatorx"
      exportFileName={`InferenceX_${chartId}`}
      setIsLegendExpanded={setLegendExpanded}
      zoomResetEvent={`d3chart_zoom_reset_${chartId}`}
    >
      {summaryOnly ? (
        <RooflineBars model={model} summary={summary} caption={caption} legend={legend} />
      ) : (
        <D3Chart<Point>
          ref={chart}
          chartId={chartId}
          caption={caption}
          footer={<VizFooter />}
          watermark={getChartWatermark()}
          data={shown}
          margin={SCATTER_MARGIN}
          zoom={{ enabled: true }}
          xScale={{ type: 'log', domain: [a0, a1], nice: false }}
          yScale={
            logY
              ? { type: 'log', domain: [yLo, yHi], nice: false }
              : { type: 'sqrt', domain: [0, yHi], nice: false }
          }
          xAxis={
            normalized
              ? {
                  label: strings.intensityAxis,
                  tickValues: logAxisTicks,
                  tickFormat: (v) => ratio(Number(v)),
                }
              : {
                  label: `${strings.intensityAxis}${strings.aside('FLOP/byte')}`,
                  tickValues: logAxisTicks,
                  tickFormat: (v) => formatCompact(Number(v)),
                }
          }
          yAxis={{
            label: normalized ? strings.shareAxis : strings.tflopsAxis,
            tickCount: 6,
            tickValues: logY ? logAxisTicks : undefined,
            tickFormat: (v) => (normalized ? ratio(Number(v) * 100) : formatCompact(Number(v))),
          }}
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
                strokeDasharray: ROOF_DASH,
                curve: curveLinear,
              },
            },
            {
              type: 'point',
              key: 'points',
              data: shown,
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
            ...inspectCase(model, (p: Point) => p.i, chart),
            content: (p) => {
              const peak = peakTflops(p.hw, precision);
              const bw = peakBandwidthTBs(p.hw);
              const c = view.cases[p.i];
              const tbs = c.bytes! / (p.us * 1e6);
              return chartHoverCard({
                title: hardwareLabel(p.hw),
                subtitle: `${c.shape} · ${c.precision}`,
                color: model.colors[p.hw],
                metrics: [
                  {
                    value: p.tflops.toFixed(1),
                    label: `TFLOPS${share(p.tflops, peak, 'compute')}`,
                  },
                  { value: tbs.toFixed(2), label: `TB/s${share(tbs, bw, 'bandwidth')}` },
                ],
                summary: [
                  originText(view, p.i, locale),
                  `${(c.flops! / c.bytes!).toFixed(0)} FLOP/byte${composite ? strings.effective(p.ai.toFixed(0)) : ''}`,
                  ...(p.bound ? [boundText(p.bound, p.us, strings)] : []),
                ].join(' · '),
              });
            },
          }}
          legendElement={legend}
        />
      )}
    </ChartSection>
  );
}

export const roofline: VizDefinition = {
  id: 'roofline',
  title: ROOFLINE_TITLE,
  ops: ['gemm', 'moe', 'attention'],
  skeletonClassName: 'h-[600px]',
  Component: Roofline,
};
