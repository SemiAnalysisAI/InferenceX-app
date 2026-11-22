'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useInferenceAnalyticsContext } from '@/components/inference/InferenceContext';
import ChartLegend from '@/components/ui/chart-legend';
import type { CommonLegendItemProps } from '@/components/ui/chart-legend-item';
import { DisclosureToggle } from '@/components/ui/disclosure-toggle';
import { track } from '@/lib/analytics/analytics';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  CustomLayerConfig,
  D3ChartHandle,
  HorizontalBarLayerConfig,
  RenderContext,
  TooltipConfig,
} from '@/lib/d3-chart/D3Chart/types';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { useLocale } from '@/lib/i18n/use-locale';
import { useUnofficialRun } from '@/providers/unofficial-run-provider';
import type { AggDataEntry, InferenceData } from '../types';
import { layerStyle } from './power-layer-style';
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
  HATCH_ANGLE,
  isHatchedBand,
  MEASURED_POWER_BANDS,
  POWER_BANDS,
  powerBandFillOpacity,
  powerBreakdownInteractivity,
  powerLayerEmphasis,
  type PowerBand,
  type PowerBreakdownDisplaySeries,
  type PowerBreakdownPoint,
  type PowerComparedPoints,
  type PowerLayerHighlight,
  type SystemPowerCategory,
} from '../utils/power-breakdown';
import { chipsWithoutSystemModel } from '../utils/power-chip-coverage';
import { formatInteractivity } from '../utils/interactivity-format';
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
    unpin: 'Follow Compare at again',
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
    unpin: '重新跟随对比点',
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

/** One hue for the shared legend: the layers are told apart by name, not by chip colour. */
const LEGEND_COLOR = 'var(--muted-foreground)';
/** The pin accent, on the pin glyph and the pinned row's point so both read as "off Compare at". */
export const PIN_ACCENT_CLASS = 'text-secondary dark:text-primary';

/** Prefill dashed, decode dotted, like the chart's role lines. */
const POOL_DASH: Record<GpuPool, string> = { prefill: '4 2', decode: '1.5 1.5' };
/** Lucide's pin glyph, drawn in the row label so the SVG carries it into PNG exports. */
const PIN_PATH =
  'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z';

/** Row geometry: the band step and the bar's height inside it. */
const ROW = {
  desktop: { step: 52, bar: 28, labelWidth: 192 },
  compact: { step: 64, bar: 16, labelWidth: 132 },
} as const;
const MARGIN_TOP = 4;
const MARGIN_BOTTOM = 40;
/** Rough tabular-figure widths, so the readout margin fits its longest line. */
const TOTAL_CHAR_PX = 7.6;
const SHARE_CHAR_PX = 6;
const NAME_CHAR_PX = 7;

type ComparePoint = PowerBreakdownPoint;

/** One stacked segment: a layer (or a GPU pool) of one chip's bar. */
interface Segment {
  id: string;
  rowKey: string;
  band: PowerBand;
  pool: GpuPoolSegment | null;
  x0: number;
  watts: number;
  color: string;
  label: string;
  point: ComparePoint;
  dimmed: boolean;
  fill: string;
}

/** One chip row: the label column, the hit target and the right-side readout. */
interface ChipRow {
  key: string;
  series: PowerBreakdownDisplaySeries;
  point: ComparePoint;
  color: string;
  pinned: boolean;
  active: boolean;
  expanded: boolean;
  unsplit: boolean;
  roleSplit: 'split' | 'whole' | undefined;
  total: string;
  shareLine: string;
}

const safeId = (value: string) => value.replaceAll(/[^a-zA-Z0-9_-]/g, '_');

/** Legend item id → band (the GPU pools share the GPU band). */
const bandOfItem = (id: string): PowerBand => (id.startsWith('gpu') ? 'gpu' : (id as PowerBand));

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
  /** Series whose drill-down renders under the chart. */
  expandedKey: string | null;
  renderExpanded: (key: string) => React.ReactNode;
  /** Reports the chip whose point sits nearest Compare at; the drill-down opens on it. */
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
  const powerX = usePowerXSurface();
  // PowerX under `md`: a narrower label column, the share line under the point, no in-bar
  // watt labels.
  const mobile = useIsMobileViewport();
  const compactRows = powerX && mobile;
  // PowerX phones fold the layer key behind one toggle, closed by default, so the bars come first.
  const [keyOpen, setKeyOpen] = useState(false);
  const keyId = useId();
  const chartId = `power-chip-compare-${safeId(useId())}`;
  const showKey = !compactRows || keyOpen;
  const chartRef = useRef<D3ChartHandle>(null);
  // PowerX counts IT only until Include facility is on; elsewhere the facility meter.
  const includeFacility = usePowerXIncludeFacility();
  const { runIndexByUrl, unofficialRunInfos, isUnofficialRun } = useUnofficialRun();
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
  // Compare at (a Chart Config control) is shared with the drill-down and the other tabs; the
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
  // The readout's second line: IT subtotal (facility basis), then the GPU share, or
  // the prefill / decode shares when the GPU layer splits by pool.
  const readoutLine = (point: ComparePoint) => {
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
  const bands = POWER_BANDS.filter((band) =>
    rows.some((row) => bandWattsPerGpu(row.entry, band) > 0),
  );

  const chipRows: ChipRow[] = rows.map(({ series: entry, entry: point, pinned }) => {
    const poolSegments = splitByRole ? gpuPoolSegments(point) : null;
    return {
      key: entry.key,
      series: entry,
      point,
      color:
        entry.overlayRunIndex === undefined
          ? resolveColor(entry.hwKey)
          : overlayRunColor(entry.overlayRunIndex),
      pinned,
      // The bar whose drill-down is open is the active one.
      active: entry.key === (expandedKey ?? selectedKey),
      expanded: entry.key === expandedKey,
      unsplit: splitByRole && poolSegments === null,
      roleSplit: splitByRole ? (poolSegments ? 'split' : 'whole') : undefined,
      total: `${watts(point.totalWattsPerGpu)} W`,
      shareLine: readoutLine(point),
    };
  });

  const highlight = layers.highlight;
  const segments: Segment[] = chipRows.flatMap((row) => {
    let x0 = 0;
    const poolSegments = splitByRole ? gpuPoolSegments(row.point) : null;
    return bands.flatMap((band): Segment[] => {
      const w = bandWattsPerGpu(row.point, band);
      if (w <= 0) return [];
      const fill = isHatchedBand(band)
        ? `url(#${safeId(`${chartId}-${row.key}-${band}`)})`
        : row.color;
      const parts =
        band === 'gpu' && poolSegments
          ? poolSegments.map((pool) => ({
              pool,
              watts: pool.layerWatts,
              dimmed: gpuPoolEmphasis(pools, pool.pool) === 'dimmed',
            }))
          : [{ pool: null, watts: w, dimmed: band === 'gpu' && row.unsplit }];
      return parts.map((part) => {
        const segment: Segment = {
          id: `${row.key}|${band}${part.pool ? `|${part.pool.pool}` : ''}`,
          rowKey: row.key,
          band,
          pool: part.pool,
          x0,
          watts: part.watts,
          color: row.color,
          label: row.series.label,
          point: row.point,
          dimmed: part.dimmed,
          fill,
        };
        x0 += part.watts;
        return segment;
      });
    });
  });

  const geometry = compactRows ? ROW.compact : ROW.desktop;
  const padding = 1 - geometry.bar / geometry.step;
  const marginRight = Math.ceil(
    Math.max(
      48,
      ...chipRows.map((row) =>
        compactRows
          ? row.total.length * TOTAL_CHAR_PX
          : Math.max(row.total.length * TOTAL_CHAR_PX, row.shareLine.length * SHARE_CHAR_PX),
      ),
    ) + 16,
  );
  const margin = {
    top: MARGIN_TOP,
    right: marginRight,
    bottom: MARGIN_BOTTOM,
    left: geometry.labelWidth,
  };
  const chartHeight = Math.round(
    geometry.step * (chipRows.length + padding) + MARGIN_TOP + MARGIN_BOTTOM,
  );

  const selectRow = useCallback(
    (row: ChipRow, clicked: EventTarget | null) => {
      // The pin marker sits inside the row: a click on it unpins, nothing else.
      if (
        row.pinned &&
        onUnpinComparedPoint &&
        clicked instanceof Element &&
        clicked.closest('[data-testid="power-chip-compare-unpin"]')
      ) {
        onUnpinComparedPoint(row.series);
        return;
      }
      onSelectKey(row.key);
      track('inference_power_compare_chip_selected', { ...analyticsContext });
    },
    [onUnpinComparedPoint, onSelectKey, analyticsContext],
  );
  const rowByKey = new Map(chipRows.map((row) => [row.key, row]));

  // Hatch patterns per chip and modeled layer, in the chip's colour at the layer's step.
  const defsLayer: CustomLayerConfig = {
    type: 'custom',
    key: 'hatch-defs',
    render: (group) => {
      const hatches = chipRows.flatMap((row) =>
        bands.filter(isHatchedBand).map((band) => ({ row, band })),
      );
      const pattern = group
        .selectAll<SVGPatternElement, (typeof hatches)[number]>('pattern.chip-compare-hatch')
        .data(hatches, (d) => `${d.row.key}|${d.band}`)
        .join((enter) => {
          const created = enter
            .append('pattern')
            .attr('class', 'chip-compare-hatch')
            .attr('patternUnits', 'userSpaceOnUse')
            .attr('width', 6)
            .attr('height', 6);
          created.append('rect').attr('class', 'hatch-bg').attr('width', 6).attr('height', 6);
          created
            .append('line')
            .attr('class', 'hatch-line')
            .attr('x1', 0)
            .attr('y1', 0)
            .attr('x2', 0)
            .attr('y2', 6)
            .attr('stroke-width', 2);
          return created;
        })
        .attr('id', (d) => safeId(`${chartId}-${d.row.key}-${d.band}`))
        .attr('patternTransform', (d) => `rotate(${HATCH_ANGLE[d.band]})`);
      pattern
        .select('.hatch-bg')
        .attr('fill', (d) => d.row.color)
        .attr('fill-opacity', (d) => powerBandFillOpacity(d.band));
      pattern.select('.hatch-line').attr('stroke', (d) => d.row.color);
    },
  };

  // Each chip row: a full-width hit target (role=button) under the bar, the two-line label
  // in the left column and the total readout in the right margin.
  const rowsLayer: CustomLayerConfig = {
    type: 'custom',
    key: 'chip-rows',
    render: (group, ctx: RenderContext) => {
      const yScale = ctx.yScale as d3.ScaleBand<string>;
      const step = yScale.step();
      const rowGroups = group
        .selectAll<SVGGElement, ChipRow>('g.chip-compare-row')
        .data(chipRows, (d) => d.key)
        .join('g')
        .attr('class', 'chip-compare-row')
        .attr('role', 'button')
        .attr('tabindex', 0)
        .attr('data-testid', 'power-chip-compare-row')
        .attr('data-key', (d) => d.key)
        .attr('aria-pressed', (d) => String(d.active))
        .attr('aria-expanded', (d) => String(d.expanded))
        .attr('aria-label', (d) => `${d.series.label} · ${d.total} · ${d.shareLine}`)
        .attr('data-pinned', (d) => (d.pinned ? 'true' : null))
        .attr('data-role-split', (d) => d.roleSplit ?? null)
        .attr('data-layout', compactRows ? 'compact' : null)
        .style('cursor', 'pointer')
        .style('outline', 'none')
        .on('click', (event: MouseEvent, d) => {
          selectRow(rowByKey.get(d.key) ?? d, event.target);
        })
        .on('keydown', (event: KeyboardEvent, d) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          selectRow(rowByKey.get(d.key) ?? d, event.target);
        })
        .on('focus', function () {
          d3.select(this).select('rect.chip-compare-row-hit').attr('stroke', 'var(--ring)');
        })
        .on('blur', function (_event, d) {
          d3.select(this)
            .select('rect.chip-compare-row-hit')
            .attr('stroke', d.active ? 'var(--border)' : 'none');
        });
      // Rows go under the bars; lower() reverses them, so re-order to keep DOM (and Tab)
      // order top to bottom.
      rowGroups.lower();
      rowGroups.order();
      rowGroups.each(function (row) {
        const g = d3.select(this);
        g.selectAll('*').remove();
        const top = (yScale(row.key) ?? 0) - (step - yScale.bandwidth()) / 2;
        const mid = top + step / 2;
        g.append('rect')
          .attr('class', 'chip-compare-row-hit')
          .attr('x', -margin.left + 2)
          .attr('y', top + 1)
          .attr('width', ctx.width + margin.left + margin.right - 4)
          .attr('height', step - 2)
          .attr('rx', 6)
          .attr('fill', row.active ? 'var(--muted)' : 'transparent')
          .attr('fill-opacity', row.active ? 0.6 : 1)
          .attr('stroke', row.active ? 'var(--border)' : 'none');
        const labelX = -margin.left + 10;
        const lineGap = compactRows ? 14 : 15;
        const firstLine = compactRows ? mid - lineGap : mid - lineGap / 2;
        g.append('circle')
          .attr('data-testid', 'power-chip-compare-swatch')
          .attr('cx', labelX + 4)
          .attr('cy', firstLine - 4)
          .attr('r', 4)
          .attr('fill', row.color);
        const maxChars = Math.max(6, Math.floor((margin.left - 32) / NAME_CHAR_PX));
        const name =
          row.series.label.length > maxChars
            ? `${row.series.label.slice(0, maxChars - 1)}…`
            : row.series.label;
        const nameG = g.append('g');
        nameG
          .append('text')
          .attr('data-testid', 'power-chip-compare-name')
          .attr('data-label', row.series.label)
          .attr('x', labelX + 14)
          .attr('y', firstLine)
          .attr('font-size', 13)
          .attr('font-weight', 500)
          .attr('fill', 'var(--foreground)')
          .text(name);
        // Titles sit beside the text (in a wrapping g) so textContent stays the label.
        if (name !== row.series.label) nameG.append('title').text(row.series.label);

        // The point line: the pin (a click unpins), then cN · x tok/s/user, then the
        // unsplit tag. A pinned row reads in the pin's accent.
        const pointY = firstLine + lineGap;
        let x = labelX + 14;
        if (row.pinned && onUnpinComparedPoint) {
          const pin = g
            .append('g')
            .attr('data-testid', 'power-chip-compare-unpin')
            .attr('class', PIN_ACCENT_CLASS)
            .attr('transform', `translate(${x - 1},${pointY - 10}) scale(0.5)`)
            .attr('aria-label', t.unpin);
          pin.append('title').text(t.pinnedPoint(row.point.concurrency));
          pin.append('rect').attr('width', 24).attr('height', 24).attr('fill', 'transparent');
          pin
            .append('path')
            .attr('d', PIN_PATH)
            .attr('fill', 'currentColor')
            .attr('stroke', 'currentColor')
            .attr('stroke-width', 2)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round');
          x += 14;
        }
        const pointG = g.append('g');
        pointG
          .append('text')
          .attr('data-testid', 'power-chip-compare-point')
          .attr('class', row.pinned ? PIN_ACCENT_CLASS : null)
          .attr('x', x)
          .attr('y', pointY)
          .attr('font-size', 11)
          .attr('fill', row.pinned ? 'currentColor' : 'var(--muted-foreground)')
          .text(t.at(row.point.concurrency, rate(row.point.interactivity)));
        if (row.pinned) {
          pointG
            .append('title')
            .text(t.comparedAt(rate(row.point.interactivity), rate(value ?? 0)));
        }
        if (row.unsplit) {
          const disagg = row.point.point.disagg;
          const tagX = x + t.at(row.point.concurrency, rate(row.point.interactivity)).length * 5.6;
          const tag = g.append('g');
          tag
            .append('text')
            .attr('data-testid', 'power-chip-compare-unsplit')
            .attr('data-reason', disagg ? 'no-pool-telemetry' : 'aggregated')
            .attr('x', tagX + 6)
            .attr('y', pointY)
            .attr('font-size', 10)
            .attr('fill', 'var(--muted-foreground)')
            .text(disagg ? t.noPoolTelemetry : t.aggregated);
          tag.append('title').text(disagg ? t.noPoolTelemetryNote : t.aggregatedNote);
        }
        const readoutX = ctx.width + margin.right - 10;
        if (compactRows) {
          g.append('text')
            .attr('data-testid', 'power-chip-compare-share')
            .attr('x', labelX + 14)
            .attr('y', pointY + lineGap)
            .attr('font-size', 10)
            .attr('fill', 'var(--muted-foreground)')
            .text(row.shareLine);
        }
        g.append('text')
          .attr('data-testid', 'power-chip-compare-total')
          .attr('x', readoutX)
          .attr('y', compactRows ? mid + 4 : firstLine)
          .attr('text-anchor', 'end')
          .attr('font-size', 13)
          .attr('font-weight', 600)
          .attr('fill', 'var(--foreground)')
          .text(row.total);
        if (!compactRows) {
          g.append('text')
            .attr('data-testid', 'power-chip-compare-share')
            .attr('x', readoutX)
            .attr('y', pointY)
            .attr('text-anchor', 'end')
            .attr('font-size', 11)
            .attr('fill', 'var(--muted-foreground)')
            .text(row.shareLine);
        }
      });
    },
  };

  const barLayer: HorizontalBarLayerConfig<Segment> = {
    type: 'horizontalBar',
    key: 'chip-segments',
    data: segments,
    config: {
      getY: (d) => d.rowKey,
      getX: (d) => d.watts,
      getX0: (d) => d.x0,
      getColor: (d) => d.fill,
      getStroke: (d) => d.color,
      getStrokeDasharray: (d) => (d.pool ? POOL_DASH[d.pool.pool] : null),
      getOpacity: (d) =>
        layerStyle(d.band, highlight).opacity * (d.dimmed ? GPU_POOL_DIMMED_OPACITY : 1),
      getAttrs: (d) => {
        const style = layerStyle(d.band, highlight);
        return {
          'data-testid': 'power-chip-compare-segment',
          // The bar layer sits outside the row groups; data-row names the row (its data-key).
          'data-row': d.rowKey,
          'data-band': d.band,
          'data-pool': d.pool?.pool,
          'data-pool-emphasis': d.pool ? (d.dimmed ? 'dimmed' : 'shown') : undefined,
          'data-emphasis': powerLayerEmphasis(d.band, highlight),
          'fill-opacity': style.fillOpacity,
          'stroke-width': style.strokeWidth,
          'stroke-opacity': style.strokeOpacity,
        };
      },
      rx: 0,
      keyFn: (d) => d.id,
    },
  };

  // In-bar watt labels on the desktop bar only, where the segment is wide enough.
  const labelLayer: CustomLayerConfig = {
    type: 'custom',
    key: 'segment-labels',
    render: (group, ctx: RenderContext) => {
      const xScale = ctx.xScale as d3.ScaleLinear<number, number>;
      const yScale = ctx.yScale as d3.ScaleBand<string>;
      const labelled = compactRows
        ? []
        : segments.filter((d) => !d.dimmed && d.watts / maxTotal >= MIN_LABEL_SHARE);
      group
        .selectAll<SVGTextElement, Segment>('text.chip-compare-segment-label')
        .data(labelled, (d) => d.id)
        .join('text')
        .attr('class', 'chip-compare-segment-label')
        .attr('x', (d) => xScale(d.x0 + d.watts / 2))
        .attr('y', (d) => (yScale(d.rowKey) ?? 0) + yScale.bandwidth() / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('font-weight', 500)
        .attr('fill', 'var(--foreground)')
        .style('pointer-events', 'none')
        .text((d) => watts(d.watts))
        .raise();
    },
  };

  const hoverCard = (d: Segment) => {
    const parts = d.pool ? [] : bandPartsAt(d.point, d.band);
    const layerWatts = d.pool?.layerWatts ?? d.watts;
    const card = chartHoverCard({
      title: d.label,
      subtitle: `${d.pool ? t.pools[d.pool.pool] : t.bands[d.band]} · ${
        MEASURED_POWER_BANDS.has(d.band) ? t.measured : t.modeled
      }`,
      color: d.color,
      metrics: [
        { value: watts(layerWatts), label: 'W/GPU' },
        { value: pct(layerWatts / d.point.totalWattsPerGpu), label: t.ofTotal },
      ],
      summary: [
        ...(d.pool ? [t.poolCount(d.pool.gpus, watts(d.pool.watts))] : []),
        ...(parts.length > 1
          ? parts.map(
              (part: { category: SystemPowerCategory; watts: number }) =>
                `${t.categories[part.category]} ${watts(part.watts)} W`,
            )
          : []),
        t.at(d.point.concurrency, rate(d.point.interactivity)),
      ].join(' · '),
    });
    return `<div data-testid="power-chip-compare-hover-card">${card}</div>`;
  };

  const tooltip: TooltipConfig<Segment> = {
    rulerType: 'none',
    content: hoverCard,
    attachToLayer: 2,
    onHoverStart: (_sel, d) => layers.hover(bandTarget(d.band)),
    onHoverEnd: () => layers.hover(null),
    onPointClick: (d) => {
      // A bar click opens the row like the row itself; no pinned card stays behind.
      chartRef.current?.dismissTooltip();
      const row = rowByKey.get(d.rowKey);
      if (row) selectRow(row, null);
    },
  };

  const legendItems: CommonLegendItemProps[] = bands.flatMap((band) => {
    const basis = MEASURED_POWER_BANDS.has(band) ? t.measured : t.modeled;
    const pinnedBand = highlight?.pinned === true && highlight.category === null;
    const items: { key: string; pool: GpuPool | null }[] =
      band === 'gpu' && splitByRole
        ? GPU_POOLS.map((pool) => ({ key: `gpu-${pool}`, pool }))
        : [{ key: band, pool: null }];
    return items.map(({ key, pool }) => ({
      name: key,
      label: `${pool ? t.pools[pool] : t.bands[band]} · ${basis}`,
      title: basis,
      color: LEGEND_COLOR,
      lineDasharray: pool ? POOL_DASH[pool] : undefined,
      forceLineSwatch: pool !== null,
      // A pinned layer leaves the others unchecked; a click pins or unpins that layer.
      isActive: !pinnedBand || highlight.band === band,
      onClick: () => layers.togglePin(bandTarget(band)),
    }));
  });
  const legend = (
    <div id={keyId} hidden={!showKey} aria-label={t.legend} data-testid="power-chip-compare-legend">
      <ChartLegend
        variant="sidebar"
        collapsible={false}
        disableActiveSort
        hideAtomFootnote
        legendItems={legendItems.map((item) => ({ ...item, idScope: chartId }))}
        isLegendExpanded
        onExpandedChange={() => {}}
        onItemHover={(id) => layers.hover(bandTarget(bandOfItem(id)))}
        onItemHoverEnd={() => layers.hover(null)}
      />
    </div>
  );

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
        <DisclosureToggle
          open={keyOpen}
          aria-controls={keyId}
          data-testid="power-chip-compare-key-toggle"
          onClick={() => {
            const open = !keyOpen;
            setKeyOpen(open);
            track('powerx_breakdown_key_toggled', { enabled: open });
          }}
          className="min-h-11 text-xs"
        >
          {t.key}
        </DisclosureToggle>
      )}

      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <div data-testid="power-chip-compare-rows">
          <D3Chart<Segment>
            ref={chartRef}
            chartId={chartId}
            testId="power-chip-compare-chart"
            data={segments}
            height={chartHeight}
            margin={margin}
            watermark={getChartWatermark(isUnofficialRun)}
            clipContent={false}
            grabCursor={false}
            xScale={{ type: 'linear', domain: [0, maxTotal] }}
            yScale={{ type: 'band', domain: chipRows.map((row) => row.key), padding }}
            xAxis={{
              label: includeFacility ? t.perGpu : t.perGpuIt,
              tickCount: compactRows ? 3 : 6,
              tickFormat: (d) => watts(Number(d)),
            }}
            yAxis={{
              grid: false,
              tickFormat: () => '',
              customize: (axis) => {
                axis.selectAll('.tick').remove();
              },
            }}
            layers={[defsLayer, rowsLayer, barLayer, labelLayer]}
            tooltip={tooltip}
            legendElement={legend}
          />
        </div>
      )}
      {/* The open drill-down sits right under the chart; a chip picked in its Hardware
          select may have no bar near this interactivity and still keeps it. */}
      {expandedKey !== null && (
        <div
          className="rounded-lg border border-border/30 p-3"
          data-testid="power-chip-compare-drilldown"
        >
          {renderExpanded(expandedKey)}
        </div>
      )}
      <p className="text-xs text-muted-foreground" data-testid="power-chip-compare-basis">
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
