'use client';

import * as d3 from 'd3';
import { Pin } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics/analytics';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import { useUnofficialRun } from '@/providers/unofficial-run-provider';
import type { AggDataEntry, InferenceData } from '../types';
import { swatchStyle } from './power-layer-style';
import { usePowerLayerHighlight } from './power-layer-highlight';
import {
  bandPartsAt,
  bandTarget,
  bandWattsPerGpu,
  breakdownItWattsPerGpu,
  breakdownSeriesAtBoundary,
  buildPowerBreakdownsWithOverlays,
  compareBreakdownsAt,
  defaultComparisonInteractivity,
  MEASURED_POWER_BANDS,
  POWER_BANDS,
  powerBreakdownInteractivity,
  powerLayerEmphasis,
  type PowerBand,
  type PowerBreakdownDisplaySeries,
  type PowerComparedPoints,
  type PowerLayerHighlight,
  type SystemPowerCategory,
} from '../utils/power-breakdown';
import { chipsWithoutSystemModel } from '../utils/power-chip-coverage';
import { formatInteractivity } from '../utils/interactivity-format';
import { PowerBasisPill } from '../powerx/PowerBasisPill';
import { FACILITY_PUE_NOTE } from '@/lib/power/system-power-model';
import {
  usePowerXCompareTarget,
  usePowerXIncludeFacility,
  usePowerXSurface,
  useSetPowerXCompareTarget,
} from './powerx-surface';

const STRINGS = {
  en: {
    target: 'Interactivity',
    unit: 'tok/s/user',
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    gpuShare: (pct: string) => `GPU ${pct}`,
    outOfRange: (labels: string) => `Not benchmarked near this interactivity: ${labels}`,
    measured: 'Measured',
    modeled: 'Modeled (hatched)',
    pinned: 'Pinned',
    pinnedPoint: (conc: number) => `Pinned to c${conc} · click to follow the slider`,
    comparedAt: (x: string, slider: string) =>
      `Compared at ${x} tok/s/user · slider at ${slider} tok/s/user`,
    legend: 'Power layers',
    bands: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      server: 'Server parts',
      fansPsu: 'Fans + PSU loss',
      network: 'Network share',
      facility: 'Facility (PUE)',
    } satisfies Record<PowerBand, string>,
    perGpu: 'W per GPU, all-in',
    perGpuIt: 'W per GPU, IT (no PUE)',
    itSubtotal: (watts: string) => `IT ${watts} W`,
    empty: 'No chip has a benchmark point near this interactivity.',
    noModel: (labels: string) =>
      `Not shown: ${labels}. Its GPU power is measured, but there is no whole-system model for this setup yet.`,
    categories: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      cpu: 'CPU',
      memory: 'Memory',
      nic: 'NICs',
      nvswitch: 'NVSwitch',
      storage: 'Storage',
      other: 'PCIe & misc',
      fans: 'Fans',
      psuLoss: 'PSU loss',
      network: 'Network share',
      facility: 'Facility (PUE)',
    } satisfies Record<SystemPowerCategory, string>,
  },
  zh: {
    target: '交互性',
    unit: 'tok/s/user',
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    gpuShare: (pct: string) => `GPU ${pct}`,
    outOfRange: (labels: string) => `未在该交互性附近测试：${labels}`,
    measured: '实测',
    modeled: '建模（斜线）',
    pinned: '已固定',
    pinnedPoint: (conc: number) => `已固定在 c${conc} · 点击后跟随滑块`,
    comparedAt: (x: string, slider: string) =>
      `对比点 ${x} tok/s/user · 滑块位于 ${slider} tok/s/user`,
    legend: '功耗分层',
    bands: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      server: '服务器部件',
      fansPsu: '风扇 + 电源损耗',
      network: '网络分摊',
      facility: '机房开销（PUE）',
    } satisfies Record<PowerBand, string>,
    perGpu: '每 GPU 整体功耗（W）',
    perGpuIt: '每 GPU IT 功耗（W，不含 PUE）',
    itSubtotal: (watts: string) => `IT ${watts} W`,
    empty: '没有芯片在该交互性附近有基准测试点。',
    noModel: (labels: string) => `未显示：${labels}。其 GPU 功耗为实测，但该配置暂无整机功耗模型。`,
    categories: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      cpu: 'CPU',
      memory: '内存',
      nic: '网卡',
      nvswitch: 'NVSwitch',
      storage: '存储',
      other: 'PCIe 及其他',
      fans: '风扇',
      psuLoss: '电源损耗',
      network: '网络分摊',
      facility: '机房开销（PUE）',
    } satisfies Record<SystemPowerCategory, string>,
  },
};

const watts = d3.format(',.0f');
const pct = d3.format('.0%');
/** The slider, the rows and the drill-down print interactivity alike. */
const rate = formatInteractivity;
const SLIDER_STEPS = 200;
const MIN_LABEL_SHARE = 0.08;

/** One hue for the shared legend: the stack's steps and hatches on the muted foreground. */
const LEGEND_COLOR = 'var(--muted-foreground)';
/** The slider's accent, on the pin glyph and the pinned row's point so both read as "off the slider". */
export const PIN_ACCENT_CLASS = 'text-secondary dark:text-primary';

export default function PowerChipCompare({
  data,
  overlayData = [],
  xField,
  selectedKey,
  onSelectKey,
  expandedKey,
  renderExpanded,
  onNearestKeyChange,
  layerHighlight,
  onLayerHighlight,
  comparedPoints = {},
  onUnpinComparedPoint,
  onTargetChange,
}: {
  data: InferenceData[];
  /** Unofficial-run overlay points within `data`: their bars take the run's colour. */
  overlayData?: readonly InferenceData[];
  xField?: keyof AggDataEntry;
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  /** Series whose drill-down renders inline under its bar. */
  expandedKey: string | null;
  renderExpanded: (key: string) => React.ReactNode;
  /** Reports the chip whose point sits nearest the slider; the drill-down opens under it. */
  onNearestKeyChange: (key: string | null) => void;
  /** Shared with the drill-down's plot on the Where view. */
  layerHighlight: PowerLayerHighlight | null;
  onLayerHighlight: (next: PowerLayerHighlight | null) => void;
  /** Chips compared at a pinned point (series key → concurrency) instead of the slider's. */
  comparedPoints?: PowerComparedPoints;
  /** The row's pin marker was clicked: that chip follows the slider again. */
  onUnpinComparedPoint?: (series: PowerBreakdownDisplaySeries) => void;
  /** The slider moved (the global control): the owner drops every pinned point. */
  onTargetChange?: () => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const interactivity = useMemo(() => powerBreakdownInteractivity(xField), [xField]);
  // PowerX phones: 44 px legend and chip rows, a 28 px slider thumb (globals.css).
  const powerX = usePowerXSurface();
  // PowerX under `md`: 56 px chip cards with an 8 px bar and no in-bar watt labels (the
  // readout and the parts rows carry the numbers); from `md` up the rows are unchanged.
  const mobile = useIsMobileViewport();
  const compactRows = powerX && mobile;
  // PowerX counts IT only until Include facility is on; elsewhere the facility meter.
  const includeFacility = usePowerXIncludeFacility();
  const { runIndexByUrl, unofficialRunInfos } = useUnofficialRun();
  const series = useMemo(
    () =>
      buildPowerBreakdownsWithOverlays(
        data,
        overlayData.length > 0
          ? { points: overlayData, runIndexByUrl, runInfos: unofficialRunInfos ?? [] }
          : undefined,
        locale,
        interactivity,
      ).map((entry): PowerBreakdownDisplaySeries => ({
        ...breakdownSeriesAtBoundary(entry, includeFacility),
        overlayRunIndex: entry.overlayRunIndex,
      })),
    [data, overlayData, runIndexByUrl, unofficialRunInfos, locale, interactivity, includeFacility],
  );
  const layers = usePowerLayerHighlight(layerHighlight, onLayerHighlight);
  const unmodeled = useMemo(() => chipsWithoutSystemModel(data, series), [data, series]);
  const hwKeys = useMemo(() => [...new Set(series.map((entry) => entry.hwKey))], [series]);
  const { resolveColor } = useThemeColors({
    highContrast: false,
    identifiers: hwKeys,
    activeKeys: hwKeys,
  });

  const [lo, hi] = useMemo(() => {
    const xs = series.flatMap((entry) => entry.points.map((point) => point.interactivity));
    return xs.length > 0 ? [Math.min(...xs), Math.max(...xs)] : [1, 1];
  }, [series]);
  const fallback = useMemo(() => defaultComparisonInteractivity(series), [series]);
  // The target is shared with the drill-down and the main chart.
  const target = usePowerXCompareTarget();
  const setTarget = useSetPowerXCompareTarget();
  // A new model or scenario changes the range; return to the shared middle.
  useEffect(() => setTarget?.(null), [lo, hi, setTarget]);
  const value = target ?? fallback;

  // Rows keep the series order (registry order, overlays last) whatever the slider reads.
  const { rows, outOfRange } = useMemo(
    () =>
      value
        ? compareBreakdownsAt(series, value, undefined, comparedPoints)
        : { rows: [], outOfRange: [] },
    [series, value, comparedPoints],
  );
  // The compared chip: the one whose point is closest to the slider interactivity. A
  // pinned chip counts by its slider-nearest point, not its pin, so pinning never moves
  // the drill-down to another chip.
  const nearestKey = useMemo(() => {
    if (value === null) return null;
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const row of compareBreakdownsAt(series, value).rows) {
      const distance = Math.abs(Math.log(row.entry.interactivity / value));
      if (distance < bestDistance) {
        best = row.series.key;
        bestDistance = distance;
      }
    }
    return best;
  }, [series, value]);
  useEffect(() => onNearestKeyChange(nearestKey), [nearestKey, onNearestKeyChange]);
  const maxTotal = Math.max(1, ...rows.map((row) => row.entry.totalWattsPerGpu));
  const bands = POWER_BANDS.filter((band) =>
    rows.some((row) => bandWattsPerGpu(row.entry, band) > 0),
  );
  /** A segment's hover text: the layer, its watts and, when it folds several parts, each part. */
  const segmentTitle = (entry: (typeof rows)[number]['entry'], band: PowerBand) => {
    const parts = bandPartsAt(entry, band);
    const head = `${t.bands[band]}: ${watts(bandWattsPerGpu(entry, band))} W`;
    if (parts.length <= 1) return head;
    return `${head} · ${parts.map((part) => `${t.categories[part.category]} ${watts(part.watts)} W`).join(' · ')}`;
  };
  // No chip in this selection has a whole-system model: say so instead of leaving a gap.
  if (series.length === 0 || value === null) {
    return (
      <section className="min-w-0 space-y-3" data-testid="power-chip-compare">
        <p className="py-4 text-sm text-muted-foreground">{t.empty}</p>
        {unmodeled.length > 0 && (
          <p
            className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
            data-testid="power-chip-compare-unmodeled"
          >
            {t.noModel(unmodeled.join(', '))}
          </p>
        )}
      </section>
    );
  }

  const toStep = (x: number) =>
    hi > lo ? Math.round((Math.log(x / lo) / Math.log(hi / lo)) * SLIDER_STEPS) : 0;
  const fromStep = (step: number) => lo * (hi / lo) ** (step / SLIDER_STEPS);

  return (
    <section className="min-w-0 space-y-3" data-testid="power-chip-compare">
      <div className="no-export flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex min-w-0 flex-1 basis-72 items-center gap-3 text-sm">
          <span className="shrink-0 font-medium text-muted-foreground">{t.target}</span>
          <input
            type="range"
            min={0}
            max={SLIDER_STEPS}
            value={toStep(value)}
            onChange={(event) => {
              setTarget?.(fromStep(Number(event.target.value)));
              onTargetChange?.();
            }}
            onPointerUp={() => track('inference_power_compare_target_changed')}
            className={cn(
              'min-w-0 flex-1 accent-secondary dark:accent-primary',
              powerX && 'powerx-range text-secondary dark:text-primary',
            )}
            data-testid="power-chip-compare-target"
            aria-valuetext={`${rate(value)} ${t.unit}`}
          />
          <span
            className="shrink-0 tabular-nums font-medium"
            data-testid="power-chip-compare-value"
          >
            {rate(value)} {t.unit}
          </span>
        </label>
      </div>

      <ul
        className="flex flex-wrap gap-x-1 gap-y-0.5 text-xs text-muted-foreground"
        aria-label={t.legend}
        data-testid="power-chip-compare-legend"
      >
        {bands.map((band) => {
          const pinned =
            layers.highlight?.pinned === true &&
            layers.highlight.band === band &&
            layers.highlight.category === null;
          const emphasis = powerLayerEmphasis(band, layers.highlight);
          const basis = MEASURED_POWER_BANDS.has(band) ? t.measured : t.modeled;
          return (
            <li key={band} className="flex min-w-0">
              <button
                type="button"
                data-testid="power-chip-compare-legend-item"
                data-band={band}
                data-emphasis={emphasis}
                aria-pressed={pinned}
                onMouseEnter={() => layers.hover(bandTarget(band))}
                onMouseLeave={() => layers.hover(null)}
                onFocus={() => layers.hover(bandTarget(band))}
                onBlur={() => layers.hover(null)}
                onClick={() => layers.togglePin(bandTarget(band))}
                className={cn(
                  'flex min-h-7 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left hover:bg-muted/60',
                  powerX && 'max-md:min-h-11',
                  pinned && 'bg-muted ring-1 ring-border',
                )}
              >
                <span
                  aria-hidden
                  className="inline-block size-3 shrink-0 rounded-[2px]"
                  title={`${basis}${pinned ? ` · ${t.pinned}` : ''}`}
                  style={swatchStyle(band, LEGEND_COLOR, layers.highlight)}
                />
                <span
                  className={`whitespace-nowrap ${
                    emphasis === 'faded' ? '' : 'font-medium text-foreground'
                  }`}
                >
                  {t.bands[band]}
                </span>
                <span className="whitespace-nowrap opacity-70">· {basis}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ol className="space-y-1.5" data-testid="power-chip-compare-rows">
          {rows.map(({ series: entry, entry: point, pinned: pinnedPoint }) => {
            const color =
              entry.overlayRunIndex === undefined
                ? resolveColor(entry.hwKey)
                : overlayRunColor(entry.overlayRunIndex);
            const rowBands = bands.filter((band) => bandWattsPerGpu(point, band) > 0);
            const expanded = entry.key === expandedKey;
            // The bar whose drill-down is open is the active one.
            const active = entry.key === (expandedKey ?? selectedKey);
            const gpuShare = point.wattsPerGpu.gpu / point.totalWattsPerGpu;
            const chipName = (
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{entry.label}</span>
              </span>
            );
            // A pinned row is off the slider: its point reads in the pin's accent and
            // its title says where the slider is.
            const pointLine = (
              <span
                className={`flex items-center gap-1 pl-4.5 text-xs ${
                  pinnedPoint ? PIN_ACCENT_CLASS : 'text-muted-foreground'
                }`}
              >
                {pinnedPoint && onUnpinComparedPoint && (
                  <span
                    data-testid="power-chip-compare-unpin"
                    title={t.pinnedPoint(point.concurrency)}
                    className={cn(
                      'inline-flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted hover:text-foreground',
                      powerX && 'max-md:-m-2 max-md:size-8',
                    )}
                  >
                    <Pin className="size-3" fill="currentColor" aria-hidden />
                  </span>
                )}
                <span
                  data-testid="power-chip-compare-point"
                  title={
                    pinnedPoint ? t.comparedAt(rate(point.interactivity), rate(value)) : undefined
                  }
                >
                  {t.at(point.concurrency, rate(point.interactivity))}
                </span>
              </span>
            );
            // The stacked bar's segments: the layer steps and hatches; the watt labels only
            // in the 28 px desktop bar, never in the 8 px phone bar.
            const segments = (labels: boolean) =>
              rowBands.map((band) => {
                const w = bandWattsPerGpu(point, band);
                const share = w / maxTotal;
                return (
                  <span
                    key={band}
                    title={segmentTitle(point, band)}
                    data-testid="power-chip-compare-segment"
                    data-band={band}
                    data-emphasis={powerLayerEmphasis(band, layers.highlight)}
                    onMouseEnter={() => layers.hover(bandTarget(band))}
                    onMouseLeave={() => layers.hover(null)}
                    className="flex h-full items-center justify-center border-r border-background/70 text-2xs font-medium tabular-nums text-foreground last:border-r-0"
                    style={{
                      width: `${(w / point.totalWattsPerGpu) * 100}%`,
                      ...swatchStyle(band, color, layers.highlight),
                    }}
                  >
                    {labels && share >= MIN_LABEL_SHARE ? watts(w) : ''}
                  </span>
                );
              });
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={(event) => {
                    // The pin marker sits inside the row: a click on it unpins, nothing else.
                    if (
                      pinnedPoint &&
                      onUnpinComparedPoint &&
                      event.target instanceof Element &&
                      event.target.closest('[data-testid="power-chip-compare-unpin"]')
                    ) {
                      onUnpinComparedPoint(entry);
                      return;
                    }
                    onSelectKey(entry.key);
                    track('inference_power_compare_chip_selected');
                  }}
                  aria-pressed={active}
                  aria-expanded={expanded}
                  data-testid="power-chip-compare-row"
                  data-pinned={pinnedPoint ? 'true' : undefined}
                  data-layout={compactRows ? 'compact' : undefined}
                  className={cn(
                    compactRows
                      ? 'grid min-h-14 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-1 text-left transition-colors'
                      : 'grid w-full grid-cols-1 items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-left transition-colors sm:grid-cols-[12rem_minmax(0,1fr)_5.5rem]',
                    powerX && !compactRows && 'max-md:min-h-11',
                    active ? 'bg-muted/60 ring-1 ring-border' : 'hover:bg-muted/40',
                  )}
                >
                  {compactRows ? (
                    <>
                      {chipName}
                      <span className="text-right text-sm font-semibold tabular-nums">
                        {watts(point.totalWattsPerGpu)} W
                        <PowerBasisPill tag={includeFacility ? 'facility' : 'it'} />
                      </span>
                      {pointLine}
                      <span className="text-right text-xs tabular-nums text-muted-foreground">
                        {includeFacility
                          ? `${t.itSubtotal(watts(breakdownItWattsPerGpu(point)))} · `
                          : ''}
                        {t.gpuShare(pct(gpuShare))}
                      </span>
                      <span className="col-span-2 flex h-2 min-w-0 items-stretch overflow-hidden rounded-sm">
                        <span
                          className="flex h-full"
                          style={{ width: `${(point.totalWattsPerGpu / maxTotal) * 100}%` }}
                        >
                          {segments(false)}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex min-w-0 flex-col">
                        {chipName}
                        {pointLine}
                      </span>
                      <span className="flex h-7 min-w-0 items-stretch overflow-hidden rounded-sm">
                        <span
                          className="flex h-full"
                          style={{ width: `${(point.totalWattsPerGpu / maxTotal) * 100}%` }}
                        >
                          {segments(true)}
                        </span>
                      </span>
                      <span className="flex flex-col text-right sm:items-end">
                        <span className="text-sm font-semibold tabular-nums">
                          {watts(point.totalWattsPerGpu)} W
                          <PowerBasisPill tag={includeFacility ? 'facility' : 'it'} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {includeFacility
                            ? `${t.itSubtotal(watts(breakdownItWattsPerGpu(point)))} · `
                            : ''}
                          {t.gpuShare(pct(gpuShare))}
                        </span>
                      </span>
                    </>
                  )}
                </button>
                {expanded && (
                  <div
                    className="mt-1.5 mb-3 rounded-md border border-border/60 p-3"
                    data-testid="power-chip-compare-drilldown"
                  >
                    {renderExpanded(entry.key)}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {/* A chip picked in the drill-down's Hardware select may have no bar near this
          interactivity; its drill-down then follows the list instead of vanishing. */}
      {expandedKey !== null && !rows.some((row) => row.series.key === expandedKey) && (
        <div
          className="rounded-md border border-border/60 p-3"
          data-testid="power-chip-compare-drilldown"
        >
          {renderExpanded(expandedKey)}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {includeFacility ? t.perGpu : t.perGpuIt}
        {outOfRange.length > 0 &&
          ` · ${t.outOfRange(outOfRange.map((entry) => entry.label).join(', '))}`}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="power-chip-compare-facility-note">
        {FACILITY_PUE_NOTE[locale]}
      </p>
      {unmodeled.length > 0 && (
        <p
          className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
          data-testid="power-chip-compare-unmodeled"
        >
          {t.noModel(unmodeled.join(', '))}
        </p>
      )}
    </section>
  );
}
