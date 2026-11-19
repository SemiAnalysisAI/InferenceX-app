'use client';

import * as d3 from 'd3';
import { ChevronDown, Pin } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';

import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useInferenceAnalyticsContext } from '@/components/inference/InferenceContext';
import { track } from '@/lib/analytics/analytics';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
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
  GPU_POOL_DIMMED_OPACITY,
  GPU_POOLS,
  gpuPoolEmphasis,
  gpuPoolSegments,
  type GpuPool,
  type GpuPoolSegment,
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
import { FACILITY_PUE_NOTE } from '@/lib/power/facility-pue';
import { powerXRolePools, type PowerXRole } from '../powerx/powerx-role';
import {
  usePowerXCompareTarget,
  usePowerXIncludeFacility,
  usePowerXSurface,
} from './powerx-surface';

const STRINGS = {
  en: {
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    gpuShare: (pct: string) => `GPU ${pct}`,
    outOfRange: (labels: string) => `Not benchmarked near this interactivity: ${labels}`,
    measured: 'Measured',
    modeled: 'Modeled (hatched)',
    pinned: 'Pinned',
    pinnedPoint: (conc: number) => `Pinned to c${conc} · click to follow Compare at`,
    comparedAt: (x: string, at: string) =>
      `Pinned point at ${x} tok/s/user · Compare at ${at} tok/s/user`,
    legend: 'Power layers',
    key: 'Key',
    ofTotal: 'of total',
    bands: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      server: 'Server parts',
      fansPsu: 'Fans + PSU loss',
      network: 'Network share',
      facility: 'Facility (PUE)',
    } satisfies Record<PowerBand, string>,
    pools: { prefill: 'Prefill GPUs', decode: 'Decode GPUs' } satisfies Record<GpuPool, string>,
    poolShare: (prefill: string, decode: string) => `Prefill ${prefill} · Decode ${decode}`,
    poolCount: (gpus: number, w: string) => `${gpus} × ${w} W`,
    aggregated: 'Aggregated',
    aggregatedNote:
      'Aggregated: every GPU does both prefill and decode, so its GPU layer stays whole.',
    noPoolTelemetry: 'No pool telemetry',
    noPoolTelemetryNote: 'No per-pool GPU telemetry for this run, so its GPU layer stays whole.',
    roleNote:
      'Only the measured GPU layer splits by role; server, network and facility are modeled for the whole deployment.',
    perGpu: 'W per GPU, all-in',
    perGpuIt: 'W per GPU, IT (no PUE)',
    itSubtotal: (watts: string) => `IT ${watts} W`,
    empty: 'No GPU has a benchmark point near Compare at',
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
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    gpuShare: (pct: string) => `GPU ${pct}`,
    outOfRange: (labels: string) => `未在该交互性附近测试：${labels}`,
    measured: '实测',
    modeled: '建模（斜线）',
    pinned: '已固定',
    pinnedPoint: (conc: number) => `已固定在 c${conc} · 点击后跟随对比点`,
    comparedAt: (x: string, at: string) => `固定点 ${x} tok/s/user · 对比点 ${at} tok/s/user`,
    legend: '功耗分层',
    key: '图例',
    ofTotal: '占总功耗',
    bands: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      server: '服务器部件',
      fansPsu: '风扇 + 电源损耗',
      network: '网络分摊',
      facility: '机房开销（PUE）',
    } satisfies Record<PowerBand, string>,
    pools: { prefill: '预填充 GPU', decode: '解码 GPU' } satisfies Record<GpuPool, string>,
    poolShare: (prefill: string, decode: string) => `预填充 ${prefill} · 解码 ${decode}`,
    poolCount: (gpus: number, w: string) => `${gpus} × ${w} W`,
    aggregated: '聚合',
    aggregatedNote: '聚合部署：每个 GPU 同时承担预填充和解码，因此其 GPU 层保持完整。',
    noPoolTelemetry: '无分池遥测',
    noPoolTelemetryNote: '该运行没有按 GPU 池的遥测数据，因此其 GPU 层保持完整。',
    roleNote: '只有实测的 GPU 层按角色拆分；服务器、网络和机房开销均按整个部署建模。',
    perGpu: '每 GPU 整体功耗（W）',
    perGpuIt: '每 GPU IT 功耗（W，不含 PUE）',
    itSubtotal: (watts: string) => `IT ${watts} W`,
    empty: '没有 GPU 在对比点附近有基准测试点',
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
/** The rows and the drill-down print interactivity alike. */
const rate = formatInteractivity;
const MIN_LABEL_SHARE = 0.08;

/** One hue for the shared legend: the stack's steps and hatches on the muted foreground. */
const LEGEND_COLOR = 'var(--muted-foreground)';
/** The pin accent, on the pin glyph and the pinned row's point so both read as "off Compare at". */
export const PIN_ACCENT_CLASS = 'text-secondary dark:text-primary';

/**
 * A GPU pool as a CSS box: the GPU layer's solid step, outlined dashed (prefill) or
 * dotted (decode) like the chart's role lines, and faded when the role leaves it out.
 */
export function gpuPoolSwatchStyle(
  pool: GpuPool,
  color: string,
  dimmed: boolean,
  highlight: PowerLayerHighlight | null = null,
): React.CSSProperties {
  const base = swatchStyle('gpu', color, highlight);
  return {
    ...base,
    border: `1px ${pool === 'prefill' ? 'dashed' : 'dotted'} ${color}`,
    opacity: Number(base.opacity ?? 1) * (dimmed ? GPU_POOL_DIMMED_OPACITY : 1),
  };
}

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
  role = 'all',
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
  /** Reports the chip whose point sits nearest Compare at; the drill-down opens under it. */
  onNearestKeyChange: (key: string | null) => void;
  /** Shared with the drill-down's plot on the Breakdown view. */
  layerHighlight: PowerLayerHighlight | null;
  onLayerHighlight: (next: PowerLayerHighlight | null) => void;
  /** Chips compared at a pinned point (series key → concurrency) instead of Compare at. */
  comparedPoints?: PowerComparedPoints;
  /** The row's pin marker was clicked: that chip follows Compare at again. */
  onUnpinComparedPoint?: (series: PowerBreakdownDisplaySeries) => void;
  /** Compare at moved (the global control): the owner drops every pinned point. */
  onTargetChange?: () => void;
  /**
   * The PowerX GPU role. Off All GPUs, each disaggregated chip's measured GPU layer splits
   * into its prefill and decode pools (the pool the role leaves out dimmed); aggregated
   * chips stay listed with their GPU layer whole and dimmed.
   */
  role?: PowerXRole;
}) {
  const locale = useLocale();
  const analyticsContext = useInferenceAnalyticsContext();
  const t = STRINGS[locale];
  const interactivity = useMemo(() => powerBreakdownInteractivity(xField), [xField]);
  // PowerX phones: 44 px legend and chip rows (globals.css).
  const powerX = usePowerXSurface();
  // PowerX under `md`: 56 px chip cards with an 8 px bar and no in-bar watt labels (the
  // readout and the parts rows carry the numbers); from `md` up the rows are unchanged.
  const mobile = useIsMobileViewport();
  const compactRows = powerX && mobile;
  // PowerX phones fold the layer key behind one toggle, closed by default, so the bars come first.
  const [keyOpen, setKeyOpen] = useState(false);
  const keyId = useId();
  const showKey = !compactRows || keyOpen;
  // PowerX counts IT only until Include facility is on; elsewhere the facility meter.
  const includeFacility = usePowerXIncludeFacility();
  const { runIndexByUrl, unofficialRunInfos } = useUnofficialRun();
  const series = useMemo(
    () =>
      buildPowerBreakdownsWithOverlays(
        data,
        overlayData.length > 0
          ? {
              points: overlayData,
              runIndexByUrl,
              runInfos: unofficialRunInfos ?? [],
            }
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
  const pools = powerXRolePools(role);
  const splitByRole = pools.length > 0;
  const unmodeled = useMemo(() => chipsWithoutSystemModel(data, series), [data, series]);
  const hwKeys = useMemo(() => [...new Set(series.map((entry) => entry.hwKey))], [series]);
  const { resolveColor } = useThemeColors({
    highContrast: false,
    identifiers: hwKeys,
    activeKeys: hwKeys,
  });

  const fallback = useMemo(() => defaultComparisonInteractivity(series), [series]);
  // Compare at (the shell's control) is shared with the drill-down and the other tabs; the
  // geometric middle is only a fallback outside PowerX.
  const target = usePowerXCompareTarget();
  const value = target ?? fallback;
  // A new Compare at drops every pinned point, as the old slider did.
  const previousTarget = useRef(target);
  useEffect(() => {
    if (previousTarget.current === target) return;
    previousTarget.current = target;
    onTargetChange?.();
  }, [target, onTargetChange]);

  // Rows keep the series order (registry order, overlays last) whatever Compare at reads.
  const { rows, outOfRange } = useMemo(
    () =>
      value
        ? compareBreakdownsAt(series, value, undefined, comparedPoints)
        : { rows: [], outOfRange: [] },
    [series, value, comparedPoints],
  );
  // The compared chip: the one whose point is closest to Compare at. A
  // pinned chip counts by its point nearest Compare at, not its pin, so pinning never moves
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
  // The right readout's second line: IT subtotal (facility basis), then the GPU share, or
  // the prefill / decode shares when the GPU layer splits by pool.
  const readoutLine = (point: (typeof rows)[number]['entry']) => {
    const poolSegments = splitByRole ? gpuPoolSegments(point) : null;
    const share = poolSegments
      ? t.poolShare(
          pct(poolSegments[0].layerWatts / point.totalWattsPerGpu),
          pct(poolSegments[1].layerWatts / point.totalWattsPerGpu),
        )
      : t.gpuShare(pct(point.wattsPerGpu.gpu / point.totalWattsPerGpu));
    return includeFacility
      ? `${t.itSubtotal(watts(breakdownItWattsPerGpu(point)))} · ${share}`
      : share;
  };
  // ~0.45rem per character of text-xs tabular figures, never under the old 5.5rem.
  const readoutWidth = `max(5.5rem, ${(
    Math.max(0, ...rows.map((row) => readoutLine(row.entry).length)) * 0.45
  ).toFixed(2)}rem)`;
  const bands = POWER_BANDS.filter((band) =>
    rows.some((row) => bandWattsPerGpu(row.entry, band) > 0),
  );
  const [segmentHover, setSegmentHover] = useState<{
    x: number;
    y: number;
    label: string;
    color: string;
    band: PowerBand;
    point: (typeof rows)[number]['entry'];
    pool?: GpuPoolSegment;
  } | null>(null);
  const hoveredParts = segmentHover ? bandPartsAt(segmentHover.point, segmentHover.band) : [];
  // No chip in this selection has a whole-system model: say so instead of leaving a gap.
  if (series.length === 0 || value === null) {
    return (
      <section className="min-w-0 space-y-3" data-testid="power-chip-compare">
        <p className="py-4 text-sm text-muted-foreground">{t.empty}</p>
        {unmodeled.length > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="power-chip-compare-unmodeled">
            {t.noModel(unmodeled.join(', '))}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-3" data-testid="power-chip-compare">
      {compactRows && (
        <button
          type="button"
          aria-expanded={keyOpen}
          aria-controls={keyId}
          data-testid="power-chip-compare-key-toggle"
          onClick={() => {
            const open = !keyOpen;
            setKeyOpen(open);
            track('powerx_breakdown_key_toggled', { open });
          }}
          className="-mx-1.5 flex min-h-11 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          {t.key}
          <ChevronDown
            aria-hidden
            className={cn('size-3.5 transition-transform', keyOpen && 'rotate-180')}
          />
        </button>
      )}
      <ul
        id={keyId}
        hidden={!showKey}
        className="flex flex-wrap gap-x-1 gap-y-0.5 text-xs text-muted-foreground"
        aria-label={t.legend}
        data-testid="power-chip-compare-legend"
      >
        {bands.flatMap((band) => {
          const pinned =
            layers.highlight?.pinned === true &&
            layers.highlight.band === band &&
            layers.highlight.category === null;
          const emphasis = powerLayerEmphasis(band, layers.highlight);
          const basis = MEASURED_POWER_BANDS.has(band) ? t.measured : t.modeled;
          const items: { key: string; pool: GpuPool | null }[] =
            band === 'gpu' && splitByRole
              ? GPU_POOLS.map((pool) => ({ key: `gpu-${pool}`, pool }))
              : [{ key: band, pool: null }];
          return items.map(({ key, pool }) => (
            <li key={key} className="flex min-w-0">
              <button
                type="button"
                data-testid="power-chip-compare-legend-item"
                data-band={band}
                data-pool={pool ?? undefined}
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
                  style={
                    pool
                      ? gpuPoolSwatchStyle(
                          pool,
                          LEGEND_COLOR,
                          gpuPoolEmphasis(pools, pool) === 'dimmed',
                          layers.highlight,
                        )
                      : swatchStyle(band, LEGEND_COLOR, layers.highlight)
                  }
                />
                <span
                  className={`whitespace-nowrap ${
                    emphasis === 'faded' || (pool && gpuPoolEmphasis(pools, pool) === 'dimmed')
                      ? ''
                      : 'font-medium text-foreground'
                  }`}
                >
                  {pool ? t.pools[pool] : t.bands[band]}
                </span>
                <span className="whitespace-nowrap opacity-70">· {basis}</span>
              </button>
            </li>
          ));
        })}
      </ul>

      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ol
          className="space-y-1.5"
          data-testid="power-chip-compare-rows"
          // One readout column for every row, as wide as the longest line, so no row wraps
          // and every bar spans the same track.
          style={{ '--power-readout-w': readoutWidth } as CSSProperties}
        >
          {rows.map(({ series: entry, entry: point, pinned: pinnedPoint }) => {
            const color =
              entry.overlayRunIndex === undefined
                ? resolveColor(entry.hwKey)
                : overlayRunColor(entry.overlayRunIndex);
            const rowBands = bands.filter((band) => bandWattsPerGpu(point, band) > 0);
            const expanded = entry.key === expandedKey;
            // The bar whose drill-down is open is the active one.
            const active = entry.key === (expandedKey ?? selectedKey);
            // Off All GPUs the GPU layer splits by pool; a chip that cannot split (aggregated,
            // or no per-pool telemetry) stays listed with its layer whole, dimmed.
            const poolSegments = splitByRole ? gpuPoolSegments(point) : null;
            const unsplit = splitByRole && poolSegments === null;
            const shareLine = readoutLine(point);
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
            // A pinned row is off Compare at: its point reads in the pin's accent and
            // its title says where Compare at is.
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
                {unsplit && (
                  <span
                    data-testid="power-chip-compare-unsplit"
                    data-reason={point.point.disagg ? 'no-pool-telemetry' : 'aggregated'}
                    title={point.point.disagg ? t.noPoolTelemetryNote : t.aggregatedNote}
                    className="rounded-sm border border-border/70 px-1 text-2xs text-muted-foreground"
                  >
                    {point.point.disagg ? t.noPoolTelemetry : t.aggregated}
                  </span>
                )}
              </span>
            );
            // The stacked bar's segments: the layer steps and hatches; the watt labels only
            // in the 28 px desktop bar, never in the 8 px phone bar.
            const poolSpans = (labels: boolean) =>
              (poolSegments ?? []).map((segment) => {
                const dimmed = gpuPoolEmphasis(pools, segment.pool) === 'dimmed';
                return (
                  <span
                    key={`gpu-${segment.pool}`}
                    data-testid="power-chip-compare-segment"
                    data-band="gpu"
                    data-pool={segment.pool}
                    data-pool-emphasis={dimmed ? 'dimmed' : 'shown'}
                    data-emphasis={powerLayerEmphasis('gpu', layers.highlight)}
                    onMouseEnter={(event) => {
                      layers.hover(bandTarget('gpu'));
                      setSegmentHover({
                        x: event.clientX,
                        y: event.clientY,
                        label: entry.label,
                        color,
                        band: 'gpu',
                        point,
                        pool: segment,
                      });
                    }}
                    onMouseMove={(event) =>
                      setSegmentHover(
                        (prev) =>
                          prev && {
                            ...prev,
                            x: event.clientX,
                            y: event.clientY,
                          },
                      )
                    }
                    onMouseLeave={() => {
                      layers.hover(null);
                      setSegmentHover(null);
                    }}
                    className="flex h-full items-center justify-center text-2xs font-medium tabular-nums text-foreground"
                    style={{
                      width: `${(segment.layerWatts / point.totalWattsPerGpu) * 100}%`,
                      ...gpuPoolSwatchStyle(segment.pool, color, dimmed, layers.highlight),
                    }}
                  >
                    {labels && !dimmed && segment.layerWatts / maxTotal >= MIN_LABEL_SHARE
                      ? watts(segment.layerWatts)
                      : ''}
                  </span>
                );
              });
            const segments = (labels: boolean) =>
              rowBands.flatMap((band) => {
                if (band === 'gpu' && poolSegments) return poolSpans(labels);
                const w = bandWattsPerGpu(point, band);
                const share = w / maxTotal;
                return (
                  <span
                    key={band}
                    data-testid="power-chip-compare-segment"
                    data-band={band}
                    data-emphasis={powerLayerEmphasis(band, layers.highlight)}
                    onMouseEnter={(event) => {
                      layers.hover(bandTarget(band));
                      setSegmentHover({
                        x: event.clientX,
                        y: event.clientY,
                        label: entry.label,
                        color,
                        band,
                        point,
                      });
                    }}
                    onMouseMove={(event) =>
                      setSegmentHover(
                        (prev) =>
                          prev && {
                            ...prev,
                            x: event.clientX,
                            y: event.clientY,
                          },
                      )
                    }
                    onMouseLeave={() => {
                      layers.hover(null);
                      setSegmentHover(null);
                    }}
                    className="flex h-full items-center justify-center border-r border-background/70 text-2xs font-medium tabular-nums text-foreground last:border-r-0"
                    style={{
                      width: `${(w / point.totalWattsPerGpu) * 100}%`,
                      ...swatchStyle(band, color, layers.highlight),
                      ...(unsplit && band === 'gpu' ? { opacity: GPU_POOL_DIMMED_OPACITY } : {}),
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
                    track('inference_power_compare_chip_selected', {
                      ...analyticsContext,
                    });
                  }}
                  aria-pressed={active}
                  aria-expanded={expanded}
                  data-testid="power-chip-compare-row"
                  data-pinned={pinnedPoint ? 'true' : undefined}
                  data-role-split={splitByRole ? (poolSegments ? 'split' : 'whole') : undefined}
                  data-layout={compactRows ? 'compact' : undefined}
                  className={cn(
                    compactRows
                      ? 'grid min-h-14 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-1 text-left transition-colors'
                      : 'grid w-full grid-cols-1 items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-left transition-colors sm:grid-cols-[12rem_minmax(0,1fr)_var(--power-readout-w)]',
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
                      <span className="text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                        {shareLine}
                      </span>
                      <span className="col-span-2 flex h-2 min-w-0 items-stretch overflow-hidden rounded-sm">
                        <span
                          className="flex h-full"
                          style={{
                            width: `${(point.totalWattsPerGpu / maxTotal) * 100}%`,
                          }}
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
                          style={{
                            width: `${(point.totalWattsPerGpu / maxTotal) * 100}%`,
                          }}
                        >
                          {segments(true)}
                        </span>
                      </span>
                      <span className="flex flex-col text-right sm:items-end">
                        <span className="text-sm font-semibold tabular-nums">
                          {watts(point.totalWattsPerGpu)} W
                          <PowerBasisPill tag={includeFacility ? 'facility' : 'it'} />
                        </span>
                        <span className="text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                          {shareLine}
                        </span>
                      </span>
                    </>
                  )}
                </button>
                {expanded && (
                  <div
                    className="mt-1.5 mb-3 rounded-lg border border-border/30 p-3"
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
      {segmentHover && (
        <FloatingTooltip
          x={segmentHover.x}
          y={segmentHover.y}
          data-testid="power-chip-compare-hover-card"
        >
          <ChartHoverCardBody
            title={segmentHover.label}
            subtitle={`${
              segmentHover.pool ? t.pools[segmentHover.pool.pool] : t.bands[segmentHover.band]
            } · ${MEASURED_POWER_BANDS.has(segmentHover.band) ? t.measured : t.modeled}`}
            color={segmentHover.color}
            metrics={[
              {
                value: watts(
                  segmentHover.pool?.layerWatts ??
                    bandWattsPerGpu(segmentHover.point, segmentHover.band),
                ),
                label: 'W/GPU',
              },
              {
                value: pct(
                  (segmentHover.pool?.layerWatts ??
                    bandWattsPerGpu(segmentHover.point, segmentHover.band)) /
                    segmentHover.point.totalWattsPerGpu,
                ),
                label: t.ofTotal,
              },
            ]}
            summary={[
              ...(segmentHover.pool
                ? [t.poolCount(segmentHover.pool.gpus, watts(segmentHover.pool.watts))]
                : []),
              ...(!segmentHover.pool && hoveredParts.length > 1
                ? hoveredParts.map(
                    (part) => `${t.categories[part.category]} ${watts(part.watts)} W`,
                  )
                : []),
              t.at(segmentHover.point.concurrency, rate(segmentHover.point.interactivity)),
            ].join(' · ')}
          />
        </FloatingTooltip>
      )}
      {/* A chip picked in the drill-down's Hardware select may have no bar near this
          interactivity; its drill-down then follows the list instead of vanishing. */}
      {expandedKey !== null && !rows.some((row) => row.series.key === expandedKey) && (
        <div
          className="rounded-lg border border-border/30 p-3"
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
      {splitByRole && rows.some((row) => !row.entry.point.disagg) && (
        <p className="text-xs text-muted-foreground" data-testid="power-chip-compare-unsplit-note">
          {t.aggregatedNote}
        </p>
      )}
      {splitByRole &&
        rows.some((row) => row.entry.point.disagg && gpuPoolSegments(row.entry) === null) && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="power-chip-compare-unsplit-note"
          >
            {t.noPoolTelemetryNote}
          </p>
        )}
      {splitByRole && (
        <p className="text-xs text-muted-foreground" data-testid="power-chip-compare-role-note">
          {t.roleNote}
        </p>
      )}
      <p className="text-xs text-muted-foreground" data-testid="power-chip-compare-facility-note">
        {FACILITY_PUE_NOTE[locale]}
      </p>
      {unmodeled.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="power-chip-compare-unmodeled">
          {t.noModel(unmodeled.join(', '))}
        </p>
      )}
    </section>
  );
}
