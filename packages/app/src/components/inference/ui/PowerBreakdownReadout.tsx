'use client';

import * as d3 from 'd3';
import { Pin } from 'lucide-react';

import { PowerBasisPill } from '../powerx/PowerBasisPill';
import { swatchStyle } from './power-layer-style';
import { PIN_ACCENT_CLASS } from './PowerChipCompare';

import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import { formatInteractivity } from '../utils/interactivity-format';
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
    shown: 'Shown alone · tap again to show every layer',
    share: (part: string) => `${part} of this point's W/GPU`,
    source: {
      scrub: 'Drag to read · tap to hold',
      pinned: 'Held here, off the slider',
      compared: 'Nearest the slider · drag across the chart to read other points',
    } satisfies Record<PowerBreakdownReadoutSource, string>,
    followSlider: 'Follow slider',
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
    shown: '仅显示该层 · 再次点按可显示全部分层',
    share: (part: string) => `占该点 W/GPU 的 ${part}`,
    source: {
      scrub: '拖动读取 · 点按固定',
      pinned: '已固定，不随滑块移动',
      compared: '最接近滑块的点 · 在图上拖动可读取其他数据点',
    } satisfies Record<PowerBreakdownReadoutSource, string>,
    followSlider: '跟随滑块',
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
const percent = d3.format('.0%');

/**
 * The touch readout above the drill-down plot (PowerX on coarse pointers): the
 * column under the finger, held by a tap, or the compared one. It reads top
 * down: the total W/GPU with its basis pill and the point (`c<N> · <interactivity>`);
 * one full-width bar of the layers in stack order with the plot's swatch
 * language; then one tile per layer (name, W/GPU and share, as the parts list
 * below reads) on an even two-column grid, four across once the card is wide.
 * Tapping a tile isolates that layer, as the legend does; the isolated tile
 * takes the chip's colour as its outline. A held point says so and offers
 * the way back to the slider. It sits in normal flow, so unlike the cursor
 * label it never clips at the plot's edge.
 */
export default function PowerBreakdownReadout({
  series,
  entry,
  color,
  includeFacility,
  source,
  highlight,
  onTogglePin,
  onFollowSlider,
}: {
  series: PowerBreakdownSeries;
  entry: PowerBreakdownPoint;
  color: string;
  /** Whether the stack counts the facility (PUE) part; names the total's basis pill. */
  includeFacility: boolean;
  source: PowerBreakdownReadoutSource;
  highlight: PowerLayerHighlight | null;
  onTogglePin: (target: PowerLayerTarget) => void;
  /** A held point goes back to the slider's nearest point (shown only while held). */
  onFollowSlider?: () => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  // Stack order, bottom first, like the chip comparison's segments.
  const bands = powerBandsOf(series.categories).filter((band) => bandWattsPerGpu(entry, band) > 0);
  const total = Math.max(entry.totalWattsPerGpu, Number.EPSILON);
  const isolated =
    highlight?.pinned === true && highlight.category === null ? highlight.band : null;
  return (
    <div
      className="@container mb-2 min-w-0 space-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5"
      data-testid="power-breakdown-readout"
      data-source={source}
      data-concurrency={entry.concurrency}
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span
          className="text-base font-semibold tabular-nums"
          data-testid="power-breakdown-readout-total"
        >
          {watts(entry.totalWattsPerGpu)} {t.wPerGpu}
          <PowerBasisPill tag={includeFacility ? 'facility' : 'it'} />
        </span>
        <span
          className="text-sm font-medium text-muted-foreground tabular-nums"
          data-testid="power-breakdown-readout-point"
        >
          {t.at(entry.concurrency, formatInteractivity(entry.interactivity))}
        </span>
      </div>
      {/* The layers' proportions at a glance; the tiles below carry the numbers. */}
      <div
        className="flex h-2.5 w-full gap-px overflow-hidden rounded-xs"
        data-testid="power-breakdown-readout-bar"
        aria-hidden
      >
        {bands.map((band) => (
          <span
            key={band}
            data-band={band}
            className="block h-full min-w-0.5 first:rounded-l-xs last:rounded-r-xs"
            style={{
              ...swatchStyle(band, color, highlight),
              flexBasis: `${(bandWattsPerGpu(entry, band) / total) * 100}%`,
              flexGrow: 0,
              flexShrink: 1,
            }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-1.5 @md:grid-cols-4" aria-label={t.parts}>
        {bands.map((band) => {
          const emphasis = powerLayerEmphasis(band, highlight);
          const pressed = isolated === band;
          const faded = emphasis === 'faded';
          const basis = MEASURED_POWER_BANDS.has(band) ? t.measured : t.modeled;
          const share = percent(bandWattsPerGpu(entry, band) / total);
          return (
            <li key={band} className="flex min-w-0">
              <button
                type="button"
                data-testid="power-breakdown-readout-part"
                data-band={band}
                data-emphasis={emphasis}
                aria-pressed={pressed}
                title={`${t.bandTitles[band]} · ${basis}${pressed ? ` · ${t.shown}` : ''}`}
                onClick={() => onTogglePin(bandTarget(band))}
                className={cn(
                  'flex min-h-11 w-full min-w-0 flex-col justify-center gap-0.5 rounded-md border px-2 py-1 text-left tabular-nums',
                  pressed ? 'bg-background' : 'border-border/60',
                )}
                style={
                  pressed
                    ? { borderColor: color, boxShadow: `inset 0 0 0 1px ${color}` }
                    : undefined
                }
              >
                <span className="flex min-w-0 items-center gap-1.5 text-xs">
                  <span
                    aria-hidden
                    className="inline-block size-3 shrink-0 rounded-[2px]"
                    style={swatchStyle(band, color, highlight)}
                  />
                  <span
                    className={cn('truncate', faded ? 'text-muted-foreground' : 'font-medium')}
                    data-testid="power-breakdown-readout-part-name"
                  >
                    {t.bands[band]}
                  </span>
                </span>
                <span className="flex min-w-0 items-baseline justify-between gap-1 pl-4.5">
                  <span
                    className={cn(
                      'text-sm',
                      faded ? 'text-muted-foreground' : 'font-semibold text-foreground',
                    )}
                    data-testid="power-breakdown-readout-part-watts"
                  >
                    {watts(bandWattsPerGpu(entry, band))} W
                  </span>
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid="power-breakdown-readout-part-share"
                    title={t.share(share)}
                  >
                    {share}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p
          className={cn(
            'flex min-w-0 items-center gap-1 text-xs',
            source === 'pinned' ? PIN_ACCENT_CLASS : 'text-muted-foreground',
          )}
          data-testid="power-breakdown-readout-source"
        >
          {source === 'pinned' && (
            <Pin className="size-3 shrink-0" fill="currentColor" aria-hidden />
          )}
          <span>{t.source[source]}</span>
        </p>
        {source === 'pinned' && onFollowSlider && (
          <button
            type="button"
            data-testid="power-breakdown-readout-follow"
            onClick={onFollowSlider}
            className="min-h-11 shrink-0 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
          >
            {t.followSlider}
          </button>
        )}
      </div>
    </div>
  );
}
