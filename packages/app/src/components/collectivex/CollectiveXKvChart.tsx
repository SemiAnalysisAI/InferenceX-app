'use client';

import * as d3 from 'd3';
import { useMemo, useRef } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  type CollectiveXKvChartPoint,
  type CollectiveXKvChartSelection,
  type CollectiveXKvRangeBand,
  type CollectiveXKvRunCase,
  collectiveXKvChartPoints,
  collectiveXRunDasharray,
} from './data';

interface CollectiveXKvChartProps {
  chartId: string;
  cases: CollectiveXKvRunCase[];
  colors: Record<string, string>;
  selection: CollectiveXKvChartSelection;
  /** When set, draw one band per SKU and fabric across libraries instead of one line per case. */
  ranges?: CollectiveXKvRangeBand[];
  /** `range` draws each band and its median; `best` draws only the best library at each point. */
  rangeMode?: 'range' | 'best';
  xLogScale: boolean;
  yLogScale: boolean;
  caption?: React.ReactNode;
  legendElement?: React.ReactNode;
  testId?: string;
}

const STRINGS = {
  en: {
    xAxis: (axis: CollectiveXKvChartSelection['x'], logScale: boolean) =>
      `${axis === 'batch' ? 'Requests per burst' : 'Input sequence length, tokens'}${logScale ? ' (log)' : ''}`,
    yAxis: (selection: CollectiveXKvChartSelection, logScale: boolean) =>
      selection.y === 'bandwidth'
        ? `Aggregate ${selection.op} bandwidth at p50 (GB/s${logScale ? ', log' : ''})`
        : selection.x === 'isl'
          ? `Request latency p50, batch 1 (ms${logScale ? ', log' : ''})`
          : `Burst completion latency p50 (ms${logScale ? ', log' : ''})`,
    noData: 'No measured KV rows match the selected direction.',
    instructions:
      'Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    dismiss: 'Click elsewhere to dismiss',
    point: (op: string, batch: number, isl: string) => `${op} · batch ${batch} · ISL ${isl}`,
    latency: 'Burst p50 / p95 / min / max',
    requestLatency: 'Per request p50 / p95',
    details: (descs: string, bytes: string) => `${descs} entries/request · ${bytes} MB/request`,
    posted: (bytes: string) => `${bytes} MB posted/request`,
    build: (version: string, maturity: string) => `${version} · ${maturity}`,
    maturity: { production: 'production', candidate: 'candidate' },
    verify: (passed: boolean) => `verify: ${passed ? 'passed' : 'FAILED'}`,
    rangeHeading: 'Range across libraries',
    rangeMedian: 'Median',
    rangeCount: (n: number) => `${n} librar${n === 1 ? 'y' : 'ies'} at this point`,
    best: 'Best',
    aria: 'CollectiveX KV-cache transfer chart',
  },
  zh: {
    xAxis: (axis: CollectiveXKvChartSelection['x'], logScale: boolean) =>
      `${axis === 'batch' ? '每次突发的请求数' : '输入序列长度（token）'}${logScale ? '（对数）' : ''}`,
    yAxis: (selection: CollectiveXKvChartSelection, logScale: boolean) =>
      selection.y === 'bandwidth'
        ? `p50 聚合 ${selection.op} 带宽（GB/s${logScale ? '，对数' : ''}）`
        : selection.x === 'isl'
          ? `单请求延迟 p50，batch 1（ms${logScale ? '，对数' : ''}）`
          : `突发完成延迟 p50（ms${logScale ? '，对数' : ''}）`,
    noData: '所选传输方向下暂无实测 KV 数据。',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    dismiss: '点击其他区域关闭',
    point: (op: string, batch: number, isl: string) => `${op} · batch ${batch} · ISL ${isl}`,
    latency: '突发 p50 / p95 / 最小值 / 最大值',
    requestLatency: '单请求 p50 / p95',
    details: (descs: string, bytes: string) => `每个请求 ${descs} 个条目 · 每个请求 ${bytes} MB`,
    posted: (bytes: string) => `每个请求实际提交 ${bytes} MB`,
    build: (version: string, maturity: string) => `${version} · ${maturity}`,
    maturity: { production: '生产可用', candidate: '候选' },
    verify: (passed: boolean) => `校验：${passed ? '通过' : '失败'}`,
    rangeHeading: '各传输库的范围',
    rangeMedian: '中位数',
    rangeCount: (n: number) => `该点共 ${n} 个传输库`,
    best: '最佳',
    aria: 'CollectiveX KV 缓存传输图表',
  },
} as const;

function paddedDomain(values: number[]): [number, number] {
  if (values.length === 0) return [1, 10];
  const min = d3.min(values) ?? 1;
  const max = d3.max(values) ?? 1;
  return min === max ? [min / 2, max * 2] : [min / 1.15, max * 1.15];
}

function formatCompact(value: number): string {
  if (value >= 1e3) return `${(value / 1e3).toFixed(value < 1e4 ? 1 : 0)}k`;
  if (value >= 10) return value.toFixed(0);
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

// Light enough that overlapping SKUs stay readable; a hovered or pinned point lifts its own band
// and fades the rest.
const BAND_FILL = 0.16;
const BAND_STROKE = 0.6;
const BAND_FOCUS_FILL = 0.3;
const BAND_FOCUS_STROKE = 0.95;
const BAND_FADED_FILL = 0.03;
const BAND_FADED_STROKE = 0.15;

/** Lift the band `focusId` and fade the others; null restores every band. */
function highlightBands(root: Element | null, focusId: string | null): void {
  if (!root) return;
  d3.select(root)
    .selectAll<SVGPathElement, { id: string }>('path.collectivex-kv-range-band')
    .attr('fill-opacity', (band) =>
      focusId === null ? BAND_FILL : band.id === focusId ? BAND_FOCUS_FILL : BAND_FADED_FILL,
    )
    .attr('stroke-opacity', (band) =>
      focusId === null ? BAND_STROKE : band.id === focusId ? BAND_FOCUS_STROKE : BAND_FADED_STROKE,
    )
    .attr('data-focused', (band) => (focusId !== null && band.id === focusId ? 'true' : null));
}

function formatMs(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 2);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function CollectiveXKvChart({
  chartId,
  cases,
  colors,
  selection,
  ranges,
  rangeMode = 'range',
  xLogScale,
  yLogScale,
  caption,
  legendElement,
  testId,
}: CollectiveXKvChartProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const numberLocale = locale === 'zh' ? 'zh-CN' : 'en-US';
  const points = useMemo(
    () =>
      ranges ? ranges.flatMap((band) => band.points) : collectiveXKvChartPoints(cases, selection),
    [ranges, cases, selection],
  );
  const caseBySeries = useMemo(
    () => new Map(cases.map((kase) => [`${kase.run_id}:${kase.case_id}`, kase])),
    [cases],
  );
  const runIndexBySeries = useMemo(
    () =>
      new Map([
        ...cases.map((kase) => [`${kase.run_id}:${kase.case_id}`, kase.run_index] as const),
        ...(ranges ?? []).map((band) => [band.id, band.runIndex] as const),
      ]),
    [cases, ranges],
  );
  const lines = useMemo(() => {
    const result: Record<string, { x: number; y: number }[]> = {};
    for (const point of points) {
      (result[point.seriesId] ??= []).push({ x: point.x, y: point.y });
    }
    for (const line of Object.values(result)) {
      line.sort((a, b) => a.x - b.x);
    }
    return result;
  }, [points]);
  const colorBySeries = useMemo(
    () => new Map(points.map((point) => [point.seriesId, point.colorKey])),
    [points],
  );

  const xDomain = useMemo(() => paddedDomain(points.map((point) => point.x)), [points]);
  const yDomain = useMemo(
    () =>
      paddedDomain(
        points.flatMap((point) =>
          point.range && rangeMode === 'range' ? [point.range.lo, point.range.hi] : [point.y],
        ),
      ),
    [points, rangeMode],
  );
  const chartSvgRef = useRef<SVGSVGElement | null>(null);
  // Always mounted, so leaving the range view redraws it empty: D3Chart keeps a removed custom
  // layer's elements on screen.
  const rangeLayer = useMemo(() => {
    const bands = rangeMode === 'range' ? (ranges ?? []) : [];
    const draw = (
      group: d3.Selection<SVGGElement, unknown, null, undefined>,
      xScale: unknown,
      yScale: unknown,
    ) => {
      const x = xScale as d3.ScaleLinear<number, number>;
      const y = yScale as d3.ScaleLinear<number, number>;
      const area = d3
        .area<CollectiveXKvChartPoint>()
        .x((point) => x(point.x))
        .y0((point) => y(point.range!.lo))
        .y1((point) => y(point.range!.hi))
        .curve(d3.curveLinear);
      group
        .selectAll<SVGPathElement, CollectiveXKvRangeBand>('path.collectivex-kv-range-band')
        .data(bands, (band) => band.id)
        .join('path')
        .attr('class', 'collectivex-kv-range-band')
        .attr('data-testid', 'collectivex-kv-range-band')
        .attr('fill', (band) => colors[band.colorKey] ?? '#888')
        .attr('fill-opacity', BAND_FILL)
        .attr('stroke', (band) => colors[band.colorKey] ?? '#888')
        .attr('stroke-opacity', BAND_STROKE)
        .attr('stroke-width', 1)
        .attr('pointer-events', 'none')
        .attr('d', (band) => area(band.points));
    };
    return {
      type: 'custom' as const,
      key: 'collectivex-kv-range-bands',
      render: (
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        ctx: { xScale: unknown; yScale: unknown; tooltipElement: HTMLDivElement },
      ) => {
        draw(group, ctx.xScale, ctx.yScale);
        // Dismissing a pinned tooltip (a click elsewhere) fires no hover end, so restore the
        // bands once the click has dismissed it.
        const svg = group.node()?.ownerSVGElement ?? null;
        chartSvgRef.current = svg;
        d3.select(svg).on('click.collectivex-kv-range', () => {
          setTimeout(() => {
            const shown =
              ctx.tooltipElement.style.display !== 'none' &&
              ctx.tooltipElement.style.opacity !== '0';
            if (!shown) highlightBands(svg, null);
          }, 0);
        });
      },
      onZoom: (
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        ctx: { newXScale: unknown; newYScale: unknown },
      ) => {
        draw(group, ctx.newXScale, ctx.newYScale);
      },
    };
  }, [ranges, rangeMode, colors]);
  const xTickValues = useMemo(
    () => [...new Set(points.map((point) => point.x))].toSorted((a, b) => a - b),
    [points],
  );

  const noDataOverlay =
    points.length === 0 ? (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <p className="text-sm text-muted-foreground">{t.noData}</p>
      </div>
    ) : undefined;

  return (
    <div role="group" aria-label={t.aria}>
      <D3Chart<CollectiveXKvChartPoint>
        chartId={chartId}
        data={points}
        height={420}
        margin={{ top: 24, right: 20, bottom: 62, left: 78 }}
        watermark="logo"
        testId={testId}
        grabCursor
        instructions={t.instructions}
        xScale={{ type: xLogScale ? 'log' : 'linear', domain: xDomain, nice: false }}
        yScale={{ type: yLogScale ? 'log' : 'linear', domain: yDomain, nice: false }}
        xAxis={{
          label: t.xAxis(selection.x, xLogScale),
          tickCount: 6,
          tickValues: xTickValues,
          tickFormat: (value) => formatCompact(Number(value)),
        }}
        yAxis={{
          label: t.yAxis(selection, yLogScale),
          tickCount: 5,
          tickFormat: (value) => formatCompact(Number(value)),
        }}
        layers={[
          rangeLayer,
          {
            type: 'line',
            key: 'collectivex-kv-lines',
            lines,
            config: {
              getColor: (key) => colors[colorBySeries.get(key) ?? ''] ?? '#888',
              getStrokeDasharray: (key) => collectiveXRunDasharray(runIndexBySeries.get(key) ?? 0),
              strokeWidth: 1.75,
              curve: d3.curveLinear,
            },
          },
          {
            type: 'point',
            key: 'collectivex-kv-points',
            data: points,
            config: {
              getCx: () => 0,
              getCy: () => 0,
              getX: (point) => point.x,
              getY: (point) => point.y,
              getColor: (point) => colors[point.colorKey] ?? '#888',
              getRadius: () => 3.5,
              stroke: 'var(--background)',
              strokeWidth: 1,
              keyFn: (point) => `${point.seriesId}-${point.x}`,
              maxPoints: Infinity,
            },
          },
        ]}
        zoom={{
          enabled: true,
          axes: 'both',
          scaleExtent: [1, 20],
          resetEventName: `collectivex_zoom_reset_${chartId}`,
        }}
        tooltip={{
          rulerType: 'crosshair',
          attachToLayer: 2,
          content: (point, isPinned) => {
            const color = colors[point.colorKey] ?? '#888';
            const { row } = point;
            const format = (value: number) =>
              selection.y === 'bandwidth'
                ? `${value.toFixed(value >= 100 ? 0 : 2)} GB/s`
                : `${value.toFixed(value >= 100 ? 0 : 2)} ms`;
            const pinnedNote = isPinned
              ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>`
              : '';
            const where = t.point(row.op, row.batch, row.isl.toLocaleString(numberLocale));
            const shell = (body: string) =>
              `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 230px; max-width: 380px; user-select: ${isPinned ? 'text' : 'none'}">
            ${pinnedNote}
            <div class="font-semibold mb-1" style="color: ${color}">${escapeHtml(point.seriesLabel)}</div>
            ${body}
          </div>`;
            if (point.range) {
              const rows = point.range.members
                .map(
                  (member) =>
                    `<span>${escapeHtml(member.label)}</span><span>${format(member.y)}</span>`,
                )
                .join('');
              return shell(`<div>${where}</div>
            ${
              rangeMode === 'best'
                ? `<div>${t.best}: <strong>${format(point.y)}</strong> · ${escapeHtml(point.range.members[0].label)}</div>`
                : `<div>${t.rangeMedian}: <strong>${format(point.y)}</strong></div>`
            }
            <div>${t.rangeHeading}: ${format(point.range.lo)} – ${format(point.range.hi)}</div>
            <div class="mt-1 text-muted-foreground">${t.rangeCount(point.range.members.length)}</div>
            <div class="grid text-muted-foreground" style="grid-template-columns: max-content max-content; column-gap: 1.5rem">${rows}</div>`);
            }
            const kase = caseBySeries.get(point.seriesId);
            const details = [
              `<div>${where}: <strong>${format(point.y)}</strong></div>`,
              `<div class="text-muted-foreground">${t.latency}: ${formatMs(row.latency_ms.p50)} / ${formatMs(row.latency_ms.p95)} / ${formatMs(row.latency_ms.min)} / ${formatMs(row.latency_ms.max)} ms</div>`,
              row.request_ms
                ? `<div class="text-muted-foreground">${t.requestLatency}: ${formatMs(row.request_ms.p50)} / ${formatMs(row.request_ms.p95)} ms</div>`
                : '',
              `<div class="text-muted-foreground">${t.details(row.descs.toLocaleString(numberLocale), (row.req_bytes / 1e6).toFixed(1))}</div>`,
              row.posted_bytes !== undefined && row.posted_bytes !== row.req_bytes
                ? `<div class="text-muted-foreground">${t.posted((row.posted_bytes / 1e6).toFixed(1))}</div>`
                : '',
              kase?.library_version && kase.maturity
                ? `<div class="text-muted-foreground">${escapeHtml(t.build(kase.library_version, t.maturity[kase.maturity]))}</div>`
                : '',
              `<div class="text-muted-foreground">${t.verify(row.verify_passed)}${row.verify_detail ? ` · ${escapeHtml(row.verify_detail)}` : ''}</div>`,
            ];
            return shell(details.filter(Boolean).join('\n            '));
          },
          getRulerX: (point, scale) =>
            (scale as d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>)(
              point.x,
            ),
          getRulerY: (point, scale) => scale(point.y),
          onHoverStart: (selectionEl, point) => {
            selectionEl.attr('r', 6);
            if (point.range)
              highlightBands(selectionEl.node()?.ownerSVGElement ?? null, point.seriesId);
          },
          onHoverEnd: (selectionEl, point) => {
            selectionEl.attr('r', 3.5);
            if (point.range) highlightBands(selectionEl.node()?.ownerSVGElement ?? null, null);
          },
          // Hover callbacks stop while a point is pinned, so pinning another point focuses its
          // band here.
          onPointClick: (point) => {
            highlightBands(chartSvgRef.current, point.range ? point.seriesId : null);
          },
        }}
        transitionDuration={200}
        legendElement={legendElement}
        noDataOverlay={noDataOverlay}
        caption={caption}
      />
    </div>
  );
}
