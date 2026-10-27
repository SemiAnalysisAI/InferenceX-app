'use client';

import * as d3 from 'd3';

import { PowerBasisPill } from '../powerx/PowerBasisPill';
import { swatchStyle } from './power-layer-style';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  bandTarget,
  bandWattsPerGpu,
  MEASURED_POWER_BANDS,
  powerBandsOf,
  powerLayerEmphasis,
  type PowerBand,
  type PowerBreakdownPoint,
  type PowerBreakdownSeries,
  type PowerLayerHighlight,
  type PowerLayerTarget,
} from '../utils/power-breakdown';

/** Where the readout's point comes from: the finger, this chip's pin, or the slider. */
export type PowerBreakdownReadoutSource = 'scrub' | 'pinned' | 'compared';

const STRINGS = {
  en: {
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    wPerGpu: 'W/GPU',
    measured: 'Measured',
    modeled: 'Modeled',
    pinned: 'Pinned',
    source: {
      scrub: 'Drag to read · tap to hold',
      pinned: 'Pinned · tap the pin in its row to follow the slider',
      compared: 'Compared point · drag across the chart to read others',
    } satisfies Record<PowerBreakdownReadoutSource, string>,
    parts: 'Power layers at this point',
    bands: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      server: 'Server',
      fansPsu: 'Fans + PSU',
      network: 'Network',
      facility: 'Facility',
    } satisfies Record<PowerBand, string>,
    bandTitles: {
      gpu: 'Measured GPU',
      measuredCpu: 'Measured Grace CPU',
      server: 'Server parts',
      fansPsu: 'Fans + PSU loss',
      network: 'Network share',
      facility: 'Facility overhead',
    } satisfies Record<PowerBand, string>,
  },
  zh: {
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    wPerGpu: 'W/GPU',
    measured: '实测',
    modeled: '建模',
    pinned: '已固定',
    source: {
      scrub: '拖动读取 · 点按固定',
      pinned: '已固定 · 点按该行的固定标记可重新跟随滑块',
      compared: '当前对比点 · 在图上拖动可读取其他数据点',
    } satisfies Record<PowerBreakdownReadoutSource, string>,
    parts: '该点的功耗分层',
    bands: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      server: '服务器',
      fansPsu: '风扇 + 电源',
      network: '网络',
      facility: '机房',
    } satisfies Record<PowerBand, string>,
    bandTitles: {
      gpu: '实测 GPU',
      measuredCpu: '实测 Grace CPU',
      server: '服务器部件',
      fansPsu: '风扇 + 电源损耗',
      network: '网络分摊',
      facility: '机房开销',
    } satisfies Record<PowerBand, string>,
  },
};

const watts = d3.format(',.0f');
const rate = d3.format(',.0f');

/**
 * The touch readout above the drill-down plot (PowerX on coarse pointers): the
 * column under the finger, held by a tap, or the compared one, as the chip row
 * reads it (total W/GPU with its basis pill, `c<N> · <interactivity>`) plus one
 * chip per layer in stack order with the plot's swatch language. It sits in
 * normal flow, so unlike the cursor label it never clips at the plot's edge.
 * Tapping a layer chip isolates that layer, as the legend does.
 */
export default function PowerBreakdownReadout({
  series,
  entry,
  color,
  includeFacility,
  source,
  highlight,
  onTogglePin,
}: {
  series: PowerBreakdownSeries;
  entry: PowerBreakdownPoint;
  color: string;
  /** Whether the stack counts the facility (PUE) part; names the total's basis pill. */
  includeFacility: boolean;
  source: PowerBreakdownReadoutSource;
  highlight: PowerLayerHighlight | null;
  onTogglePin: (target: PowerLayerTarget) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  // Stack order, bottom first, like the chip comparison's segments.
  const bands = powerBandsOf(series.categories).filter((band) => bandWattsPerGpu(entry, band) > 0);
  return (
    <div
      className="mb-2 min-w-0 space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
      data-testid="power-breakdown-readout"
      data-source={source}
      data-concurrency={entry.concurrency}
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span
          className="text-base font-semibold tabular-nums"
          data-testid="power-breakdown-readout-total"
        >
          {watts(entry.totalWattsPerGpu)} {t.wPerGpu}
          <PowerBasisPill tag={includeFacility ? 'facility' : 'it'} />
        </span>
        <span
          className="text-sm font-medium text-muted-foreground"
          data-testid="power-breakdown-readout-point"
        >
          {t.at(entry.concurrency, rate(entry.interactivity))}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1" aria-label={t.parts}>
        {bands.map((band) => {
          const emphasis = powerLayerEmphasis(band, highlight);
          const pinned =
            highlight?.pinned === true && highlight.band === band && highlight.category === null;
          const basis = MEASURED_POWER_BANDS.has(band) ? t.measured : t.modeled;
          return (
            <li key={band} className="flex min-w-0">
              <button
                type="button"
                data-testid="power-breakdown-readout-part"
                data-band={band}
                data-emphasis={emphasis}
                aria-pressed={pinned}
                title={`${t.bandTitles[band]} · ${basis}${pinned ? ` · ${t.pinned}` : ''}`}
                onClick={() => onTogglePin(bandTarget(band))}
                className={`flex min-h-10 items-center gap-1.5 rounded-md border border-border/60 px-2 text-xs tabular-nums ${
                  pinned ? 'bg-muted ring-1 ring-border' : ''
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block size-3 shrink-0 rounded-[2px]"
                  style={swatchStyle(band, color, highlight)}
                />
                <span className={emphasis === 'faded' ? 'text-muted-foreground' : ''}>
                  {t.bands[band]}
                </span>
                <span className={emphasis === 'faded' ? 'text-muted-foreground' : 'font-semibold'}>
                  {watts(bandWattsPerGpu(entry, band))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-2xs text-muted-foreground" data-testid="power-breakdown-readout-source">
        {t.source[source]}
      </p>
    </div>
  );
}
