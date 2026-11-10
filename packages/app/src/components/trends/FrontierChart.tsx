'use client';

import * as d3 from 'd3';
import React, { useEffect, useMemo, useRef } from 'react';

import {
  placeLineLabels,
  renderLineLabels,
  type LineLabelPlacement,
} from '@/components/inference/ui/line-label-layer';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import { getLineLabelVendorIcon, VENDOR_LOGO_ICONS } from '@/lib/catalog/vendor-logos';
import { formatLargeNumber, logTickFormat } from '@/lib/charts/chart-rendering';
import { D3Chart, type RenderContext } from '@/lib/d3-chart/D3Chart';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import {
  CHART_TOOLTIP_Z_INDEX,
  placeFloatingTooltip,
  stickyHeaderBottom,
} from '@/lib/d3-chart/tooltip-placement';
import { axisLabelUnit, chartHoverCard, chartTooltipDismiss } from '@/lib/d3-chart/tooltip-shell';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { escapeHtml } from '@/lib/shared/utils';

import {
  frontierValueAt,
  pooledFrontier,
  seriesFrontiersAt,
  shortImage,
  type FrontierHistory,
  type FrontierVertex,
} from './frontier-history-core';

export interface FrontierSeriesStyle {
  label: string;
  color: string;
}

/** How a series' curve is marked when it sits well below its own best. */
export interface FrontierRegressionNote {
  /** Appended to the series' line label, e.g. `▼15%`. */
  badge: string;
  /** Shown in the hover of the series' points and starting curve. */
  text: string;
}

export interface FrontierChartProps {
  chartId: string;
  history: FrontierHistory;
  dateIndex: number;
  /** Visible series only, keyed by series key. */
  styles: ReadonlyMap<string, FrontierSeriesStyle>;
  xLabel: string;
  yLabel: string;
  logScale: boolean;
  /** Display name of the hardware + engine configuration that measured a point. */
  configLabel: (config: string) => string;
  /**
   * `pooled` draws the single best frontier, colored by who holds each stretch; `each` draws
   * every visible series' own frontier so they can be compared.
   */
  variant?: 'pooled' | 'each';
  caption?: React.ReactNode;
  /** Result context under the chart: cost tier, TCO prices, date and source. */
  footer?: React.ReactNode;
  /** Series whose current curve sits well below their best, keyed by series key. */
  regressions?: ReadonlyMap<string, FrontierRegressionNote>;
  /** Rendered over the plot area (not the legend), e.g. the meme card. */
  plotOverlay?: React.ReactNode;
  legendElement?: React.ReactNode;
}

const CHART_MARGIN = { top: 24, right: 30, bottom: 50, left: 64 };
/** A point counts as growth only if it beats the previous frontier by more than this. */
const GROWTH_TOLERANCE = 0.01;
/** How close, in pixels, a click must land to a frontier point to pin its card. */
const PIN_REACH_PX = 48;
/**
 * Within this many pixels of a measured point the crosshair shows that point; elsewhere it
 * follows the pointer along the curve. Earlier points crowd the plot on later dates, so they
 * use the same short reach and a click on empty plot dismisses a pin.
 */
const POINT_REACH_PX = 10;
/** Width a line label claims when labels are checked for overlap. */
const LABEL_WIDTH_PX = 150;
/** Shade under the current frontier: the theme's blue, the same in light and dark. */
const FILL_COLOR = 'color-mix(in oklab, var(--secondary) 30%, var(--background))';
/** Pseudo-series that carries the running record into the next date's pooled frontier. */
const RECORD_KEY = '__record__';

const STRINGS = {
  en: {
    aria: 'Pareto frontier over time, colored by the chip or vendor that holds each stretch',
    instructions: 'Scroll to zoom · Drag to pan · Double-click to reset',
    startingCurve: (date: string) => `Starting curve · ${date}`,
    onCurve: 'Frontier curve, interpolated',
    earlierPoint: 'Earlier frontier point',
    openRun: 'Open run',
    dismiss: 'Click elsewhere to dismiss',
    conc: 'Concurrency',
    image: 'Image',
    unknown: 'unknown',
  },
  zh: {
    aria: '帕累托前沿随时间的变化，按占据各区段的芯片或厂商着色',
    instructions: '滚轮缩放 · 拖动平移 · 双击重置',
    startingCurve: (date: string) => `起点曲线 · ${date}`,
    onCurve: '前沿曲线插值',
    earlierPoint: '此前的前沿点',
    openRun: '查看运行记录',
    dismiss: '点击其他位置关闭',
    conc: '并发',
    image: '镜像',
    unknown: '未知',
  },
} as const;

type Scale = (value: number) => number;

type OwnedVertex = FrontierVertex & { key: string };

/** Frontier value at `x`, linear between vertices; null beyond its fastest vertex. */
function valueAt(frontier: readonly FrontierVertex[], x: number): number | null {
  const next = frontier.findIndex((v) => v.x >= x);
  if (next === -1) return null;
  if (next === 0) return frontier[0].y;
  const a = frontier[next - 1];
  const b = frontier[next];
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}

/** Where a curve started, drawn faintly under the current curve. */
interface StartLine {
  key: string;
  /** Snapshot date of the start, for the hover. */
  date: string;
  vertices: readonly OwnedVertex[];
  color: string;
}

/** A series color with less brightness, for where that series started. */
const dimmed = (color: string) => `color-mix(in oklab, ${color} 50%, var(--background))`;

/**
 * The part of a starting curve inside the interactivity range the current curve spans, ending
 * on the drawn curve at both edges. Cutting the points (rather than clipping the drawn path)
 * leaves one smooth line with no stray slivers where a steep stretch crosses the edge.
 */
function startWithin(
  start: readonly OwnedVertex[],
  span: readonly FrontierVertex[],
): OwnedVertex[] {
  if (start.length < 2 || span.length === 0) return [];
  const lo = Math.max(span[0].x, start[0].x);
  const hi = Math.min(span.at(-1)!.x, start.at(-1)!.x);
  if (hi <= lo) return [];
  const inside = start.filter((v) => v.x > lo && v.x < hi);
  const edge = (x: number) => {
    const nearest = d3.least(start, (v) => Math.abs(v.x - x))!;
    return { ...nearest, x, y: frontierValueAt(start, x) ?? nearest.y };
  };
  return [edge(lo), ...inside, edge(hi)];
}

const vertexId = (v: OwnedVertex) => `${v.key}:${v.x}:${v.y}:${v.measured}`;

/** Consecutive frontier vertices held by the same series, each joined to the next stretch. */
function ownedStretches(frontier: readonly OwnedVertex[]) {
  const stretches: { key: string; owned: OwnedVertex[]; path: OwnedVertex[] }[] = [];
  for (const vertex of frontier) {
    const current = stretches.at(-1);
    if (current?.key === vertex.key) current.owned.push(vertex);
    else stretches.push({ key: vertex.key, owned: [vertex], path: [] });
  }
  stretches.forEach((stretch, index) => {
    const next = stretches[index + 1];
    stretch.path = next ? [...stretch.owned, next.owned[0]] : stretch.owned;
  });
  return stretches;
}

const NO_REGRESSIONS: ReadonlyMap<string, FrontierRegressionNote> = new Map();

const FrontierChart = React.memo(
  ({
    chartId,
    history,
    dateIndex,
    styles,
    xLabel,
    yLabel,
    logScale,
    configLabel,
    variant = 'pooled',
    regressions = NO_REGRESSIONS,
    caption,
    footer,
    plotOverlay,
    legendElement,
  }: FrontierChartProps) => {
    const locale = useLocale();
    const t = STRINGS[locale];
    const dateFormatter = useMemo(
      () =>
        new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }),
      [locale],
    );
    const stampFormatter = useMemo(
      () =>
        new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
          year: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        }),
      [locale],
    );
    const formatDate = (date: string) => dateFormatter.format(new Date(`${date}T00:00:00Z`));

    // Axes span every date so the frontier visibly moves instead of rescaling.
    const extent = useMemo(() => {
      const vertices = history.series
        .filter((s) => styles.has(s.key))
        .flatMap((s) => s.changes.flatMap((c) => c.vertices));
      const xs = vertices.map((v) => v.x);
      const ys = vertices.map((v) => v.y).filter((y) => !logScale || y > 0);
      return {
        x: [0, (d3.max(xs) ?? 1) * 1.05] as [number, number],
        y: [logScale ? Math.max((d3.min(ys) ?? 1) * 0.8, 1e-6) : 0, (d3.max(ys) ?? 1) * 1.08] as [
          number,
          number,
        ],
      };
    }, [history, styles, logScale]);

    // Best frontier reached up to each date: the bar a point must clear to count as growth.
    const records = useMemo(() => {
      const result: OwnedVertex[][] = [];
      history.dates.forEach((_, index) => {
        const frontiers = seriesFrontiersAt(history, index);
        for (const key of frontiers.keys()) if (!styles.has(key)) frontiers.delete(key);
        if (index > 0) frontiers.set(RECORD_KEY, result[index - 1]);
        result.push(pooledFrontier(frontiers, history.higherIsBetter));
      });
      return result;
    }, [history, styles]);

    // The point whose hover card is pinned open by a click, if any; a redraw releases it.
    const pinnedRef = useRef<string | null>(null);
    // The chart's own hover card, on the shared tooltip layer of `document.body` so page chrome,
    // overflow and transforms can't clip or cover it. React never restyles it, so a pinned card
    // survives re-renders of the chart around it.
    const cardRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      const card = document.createElement('div');
      card.dataset.testid = 'frontier-hover-card';
      Object.assign(card.style, {
        position: 'fixed',
        display: 'none',
        pointerEvents: 'none',
        zIndex: String(CHART_TOOLTIP_Z_INDEX),
      });
      document.body.append(card);
      cardRef.current = card;
      return () => {
        card.remove();
        cardRef.current = null;
      };
    }, []);
    // The page-wide "click elsewhere" listener goes with the chart.
    useEffect(
      () => () => {
        d3.select(document).on(`click.${chartId}-pin`, null);
      },
      [chartId],
    );

    // The pooled frontier of the visible series on each date, for its earlier points.
    const pooledByDate = useMemo(
      () =>
        history.dates.map((_, index) => {
          const frontiers = seriesFrontiersAt(history, index);
          for (const key of frontiers.keys()) if (!styles.has(key)) frontiers.delete(key);
          return pooledFrontier(frontiers, history.higherIsBetter);
        }),
      [history, styles],
    );

    const styleIdentity = useMemo(
      () =>
        [...styles]
          .map(([key, s]) => `${key}:${s.color}:${regressions.get(key)?.badge ?? ''}`)
          .join(','),
      [styles, regressions],
    );

    const hideTooltip = () => {
      if (cardRef.current) cardRef.current.style.display = 'none';
    };

    const draw = (
      zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
      ctx: RenderContext,
    ) => {
      // The card hangs off the point it describes (plot coordinates), never on top of it.
      const showTooltip = (plotX: number, plotY: number, html: string) => {
        const card = cardRef.current;
        const ctm = zoomGroup.node()?.getScreenCTM();
        if (!card || !ctm) return;
        card.innerHTML = html;
        card.style.display = 'block';
        const anchor = new DOMPoint(plotX, plotY).matrixTransform(ctm);
        const origin = new DOMPoint(0, 0).matrixTransform(ctm);
        const corner = new DOMPoint(ctx.width, ctx.height).matrixTransform(ctm);
        const root = document.documentElement;
        const { left, top } = placeFloatingTooltip({
          x: anchor.x,
          y: anchor.y,
          width: card.offsetWidth,
          height: card.offsetHeight,
          offset: 14,
          placement: 'below',
          bounds: { left: origin.x, top: origin.y, right: corner.x, bottom: corner.y },
          viewportWidth: root.clientWidth || window.innerWidth,
          viewportHeight: root.clientHeight || window.innerHeight,
          headerBottom: stickyHeaderBottom(),
        });
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
      };
      // Every hover uses the dashboard's hover card: the series, what the point is, its value
      // and interactivity, then concurrency, precision, date, serving image and any regression.
      const pointCard = (v: OwnedVertex, subtitle: string, pinned = false) => {
        const style = styles.get(v.key);
        const note = regressions.get(v.key);
        const run =
          pinned && v.runUrl?.startsWith('https://')
            ? `<br /><a href="${escapeHtml(v.runUrl)}" target="_blank" rel="noopener noreferrer" style="color: var(--foreground); text-decoration: underline;">${t.openRun}</a>`
            : '';
        const dismiss = pinned
          ? `<div style="margin-top: 6px;">${chartTooltipDismiss(t.dismiss)}</div>`
          : '';
        return chartHoverCard(
          {
            title: style?.label ?? v.key,
            subtitle,
            color: style?.color,
            metrics: [
              { value: formatLargeNumber(v.y), label: axisLabelUnit(yLabel) },
              { value: v.x.toFixed(1), label: axisLabelUnit(xLabel) },
            ],
            summary: `${t.conc} ${v.conc} · ${v.precision.toUpperCase()} · ${formatDate(v.measured)}`,
            body: `<div style="font-size: 11px; color: var(--muted-foreground);">${t.image} ${escapeHtml(shortImage(v.image, t.unknown))}${note ? `<br />${escapeHtml(note.text)}` : ''}${run}</div>${dismiss}`,
          },
          pinned ? { pinned: true, interactive: true } : {},
        );
      };
      // Points are rebuilt on every redraw, so a tooltip could outlive the point it describes.
      hideTooltip();
      pinnedRef.current = null;
      const svg = ctx.layout.svg.node();
      const transform = svg ? d3.zoomTransform(svg) : d3.zoomIdentity;
      const zoomedX = transform.rescaleX(ctx.xScale as ContinuousScale);
      const x = zoomedX as unknown as Scale;
      const y = transform.rescaleY(ctx.yScale as ContinuousScale) as unknown as Scale;
      const visibleFrontiers = (index: number) => {
        const frontiers = seriesFrontiersAt(history, index);
        for (const key of frontiers.keys()) if (!styles.has(key)) frontiers.delete(key);
        return frontiers;
      };
      const pooled = variant === 'pooled';
      const current = visibleFrontiers(dateIndex);
      const stretches = pooled
        ? ownedStretches(pooledFrontier(current, history.higherIsBetter))
        : [...current].map(([key, vertices]) => {
            const owned = vertices.map((v) => ({ ...v, key }));
            return { key, owned, path: owned };
          });
      const frontier = stretches.flatMap((stretch) => stretch.owned);
      // One chip or vendor on its own reads like the pooled view: shading and growth rings.
      const single = !pooled && current.size === 1;
      const shaded = pooled || single;
      const curve = d3
        .line<FrontierVertex>()
        .x((v) => x(v.x))
        .y((v) => y(v.y))
        .curve(d3.curveMonotoneX);
      const baseline = y((ctx.yScale as ContinuousScale).domain()[0]);
      const area = d3
        .area<FrontierVertex>()
        .x((v) => x(v.x))
        .y0(baseline)
        .y1((v) => y(v.y))
        .curve(d3.curveMonotoneX);
      // Ground a frontier covers: under its curve, plus everything slower than its slowest
      // point, which that point dominates. Filling to the y axis this way keeps every band's
      // left edge on the axis instead of a vertical cut where each curve happens to start.
      const left = x((ctx.xScale as ContinuousScale).domain()[0]);
      const reach = (vertices: readonly FrontierVertex[]) => {
        if (vertices.length === 0) return '';
        const startX = x(vertices[0].x);
        const startY = y(vertices[0].y);
        const slower = `M${left},${baseline}V${startY}H${startX}V${baseline}Z`;
        return `${area(vertices) ?? ''}${startX > left ? slower : ''}`;
      };
      // Points past the best frontier reached before this date, i.e. where it just grew.
      const record = shaded && dateIndex > 0 ? records[dateIndex - 1] : null;
      const isNew = (v: OwnedVertex) => {
        if (!record) return false;
        const prior = valueAt(record, v.x);
        if (prior === null) return true;
        const gain = history.higherIsBetter ? v.y / prior : prior / v.y;
        return gain > 1 + GROWTH_TOLERANCE;
      };

      const root = zoomGroup
        .selectAll<SVGGElement, null>('g.frontier-chart')
        .data([null])
        .join((enter) => {
          const g = enter.append('g').attr('class', 'frontier-chart');
          for (const name of ['stamp', 'fill', 'start', 'past', 'stretches', 'vertices'])
            g.append('g').attr('class', `fr-${name}`);
          return g;
        });

      root
        .select('.fr-stamp')
        .selectAll('text')
        .data([history.dates[dateIndex]])
        .join('text')
        .attr('x', ctx.width - 12)
        .attr('y', CHART_TYPE.dateStamp + 40)
        .attr('text-anchor', 'end')
        .attr('font-size', px(CHART_TYPE.dateStamp))
        .attr('font-weight', 700)
        .attr('fill', 'var(--foreground)')
        .attr('opacity', 0.07)
        .style('pointer-events', 'none')
        .text((date) => stampFormatter.format(new Date(`${date}T00:00:00Z`)));

      // The ground today's curve covers, in one flat shade that meets the line exactly. Only
      // the current curve is shaded, so a regression never shows as covered ground.
      root
        .select('.fr-fill')
        .selectAll<SVGPathElement, OwnedVertex[]>('path.fr-area')
        .data(shaded ? [frontier] : [])
        .join('path')
        .attr('class', 'fr-area')
        .style('fill', FILL_COLOR)
        .attr('d', reach);

      // The pooled frontier is one path, recolored per owner with hard gradient stops, so the
      // line has exactly the geometry of the shaded area beneath it.
      const ownersId = `${chartId}-owners`;
      const offset = (value: number) => Math.min(1, Math.max(0, x(value) / ctx.width));
      const ownerStops = stretches.flatMap((stretch, index) => {
        const color = styles.get(stretch.key)!.color;
        const end = stretches[index + 1]?.owned[0].x;
        return [
          { offset: index === 0 ? 0 : offset(stretch.owned[0].x), color },
          { offset: end === undefined ? 1 : offset(end), color },
        ];
      });
      root
        .select('.fr-stretches')
        .selectAll<SVGLinearGradientElement, null>('linearGradient')
        .data(pooled ? [null] : [])
        .join('linearGradient')
        .attr('id', ownersId)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', 0)
        .attr('x2', ctx.width)
        .attr('y1', 0)
        .attr('y2', 0)
        .selectAll('stop')
        .data(ownerStops)
        .join('stop')
        .attr('offset', (d) => d.offset)
        .attr('stop-color', (d) => d.color);
      const lines = pooled
        ? frontier.length > 1
          ? [{ key: ownersId, path: frontier, stroke: `url(#${ownersId})` }]
          : []
        : stretches
            .filter((stretch) => stretch.path.length > 1)
            .map((stretch) => ({
              key: stretch.key,
              path: stretch.path,
              stroke: styles.get(stretch.key)!.color,
            }));
      root
        .select('.fr-stretches')
        .selectAll<SVGPathElement, (typeof lines)[number]>('path')
        .data(lines, (d) => d.key)
        .join('path')
        .attr('fill', 'none')
        .attr('stroke', (d) => d.stroke)
        .attr('stroke-width', 3)
        .attr('stroke-linecap', 'round')
        .attr('d', (d) => curve(d.path));

      // Where each curve started: the first frontier in the pooled view, or each chip's or
      // vendor's own first run, as a thin dashed line in its color dimmed (neutral for the
      // pooled frontier of several owners), trimmed to the range today's curve spans.
      const firstFrontier = (() => {
        if (!pooled || dateIndex === 0) return [];
        return pooledFrontier(visibleFrontiers(0), history.higherIsBetter);
      })();
      const startLines: StartLine[] = (
        pooled
          ? [
              {
                key: 'first',
                date: history.dates[0],
                vertices: startWithin(firstFrontier, frontier),
                color:
                  styles.size === 1
                    ? dimmed([...styles.values()][0].color)
                    : 'var(--muted-foreground)',
              },
            ]
          : [...current].map(([key, vertices]) => {
              const first = history.series.find((series) => series.key === key)!.changes[0];
              return {
                key,
                date: first.date,
                vertices: startWithin(
                  first.vertices.map((v) => ({ ...v, key })),
                  vertices,
                ),
                color: dimmed(styles.get(key)!.color),
              };
            })
      ).filter((line) => line.vertices.length > 1);
      const startLine = root
        .select('.fr-start')
        .selectAll<SVGGElement, StartLine>('g.fr-start-curve')
        .data(startLines, (d) => d.key)
        .join((enter) => {
          const g = enter.append('g').attr('class', 'fr-start-curve');
          g.append('path').attr('class', 'fr-start-line');
          // A wide transparent stroke over the thin line makes it easy to hover.
          g.append('path').attr('class', 'fr-start-hit');
          return g;
        });
      startLine
        .select('.fr-start-line')
        .attr('fill', 'none')
        .style('stroke', (d) => d.color)
        .attr('stroke-width', 1.75)
        .attr('stroke-dasharray', '5 4')
        .attr('stroke-linecap', 'round')
        .style('pointer-events', 'none')
        .attr('d', (d) => curve(d.vertices));
      // Hovering a starting curve names the chip it belongs to at the nearest point.
      startLine
        .select('.fr-start-hit')
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 12)
        .style('pointer-events', 'stroke')
        .attr('d', (d) => curve(d.vertices))
        .on('pointermove', (event: PointerEvent, d) => {
          if (pinnedRef.current) return;
          const [pointerX] = d3.pointer(event, root.node());
          const nearest = d3.least(d.vertices, (v) => Math.abs(x(v.x) - pointerX))!;
          showTooltip(
            x(nearest.x),
            y(nearest.y),
            pointCard(
              nearest,
              `${t.startingCurve(formatDate(d.date))} · ${configLabel(nearest.config)}`,
            ),
          );
        })
        .on('pointerleave', () => {
          if (!pinnedRef.current) hideTooltip();
        });

      // The shaded ground left of the slowest point gets a faint dashed edge in its owner's color.
      root
        .select('.fr-fill')
        .selectAll<SVGPathElement, OwnedVertex>('path.fr-reach')
        .data(shaded && frontier.length > 0 && x(frontier[0].x) > left ? [frontier[0]] : [])
        .join('path')
        .attr('class', 'fr-reach')
        .attr('fill', 'none')
        .attr('stroke', (d) => styles.get(d.key)!.color)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 4')
        .attr('stroke-opacity', 0.6)
        .attr('d', (d) => `M${left},${y(d.y)}H${x(d.x)}`)
        .raise();

      // Every point the drawn frontier has held up to this date (the pooled frontier, or each
      // series' own) stays as a small faded dot once the frontier moves past it, so the curves
      // it was pushed out from stay visible.
      const onFrontier = new Set(frontier.map(vertexId));
      const pastById = new Map<string, OwnedVertex>();
      const keep = (v: OwnedVertex) => {
        const id = vertexId(v);
        if (!onFrontier.has(id)) pastById.set(id, v);
      };
      if (pooled) {
        for (const earlier of pooledByDate.slice(0, dateIndex)) for (const v of earlier) keep(v);
      } else {
        for (const series of history.series) {
          if (!styles.has(series.key)) continue;
          for (const change of series.changes) {
            if (change.date > history.dates[dateIndex]) break;
            for (const v of change.vertices) keep({ ...v, key: series.key });
          }
        }
      }
      root
        .select('.fr-past')
        .selectAll<SVGCircleElement, OwnedVertex>('circle')
        .data([...pastById.values()], vertexId)
        .join('circle')
        .attr('cx', (d) => x(d.x))
        .attr('cy', (d) => y(d.y))
        .attr('r', 3)
        .style('fill', (d) => dimmed(styles.get(d.key)!.color))
        .attr('stroke', 'var(--background)')
        .attr('stroke-width', 1);

      const vertices = root
        .select('.fr-vertices')
        .selectAll<SVGGElement, OwnedVertex>('g.fr-vertex')
        .data(frontier, vertexId)
        .join((enter) => {
          const g = enter.append('g').attr('class', 'fr-vertex');
          g.append('circle').attr('class', 'fr-ring');
          g.append('circle').attr('class', 'fr-dot');
          return g;
        })
        .attr('transform', (d) => `translate(${x(d.x)},${y(d.y)})`);
      vertices
        .select('.fr-ring')
        .attr('r', (d) => (isNew(d) ? 10 : 8))
        .attr('fill', (d) => (isNew(d) ? styles.get(d.key)!.color : 'none'))
        .attr('fill-opacity', 0.2)
        .attr('stroke', (d) => (isNew(d) ? styles.get(d.key)!.color : 'var(--foreground)'))
        .attr('stroke-opacity', (d) => (isNew(d) ? 1 : 0.5))
        .attr('stroke-width', (d) => (isNew(d) ? 2 : 1))
        .attr('stroke-dasharray', (d) => (isNew(d) ? null : '2.5 2.5'));
      vertices
        .select('.fr-dot')
        .attr('r', 4)
        .attr('fill', (d) => styles.get(d.key)!.color)
        .attr('stroke', 'var(--background)')
        .attr('stroke-width', 1.5);
      // Like the dashboard's other charts: dashed rulers cross where the pointer meets the
      // curve (or at a measured point right under it) and the hover card follows the pointer.
      // A click pins a point's card (with a link to the run) until the next click.
      const rulers = root
        .selectAll<SVGGElement, null>('g.fr-rulers')
        .data([null])
        .join((enter) => {
          const g = enter.append('g').attr('class', 'fr-rulers').style('pointer-events', 'none');
          g.append('line').attr('class', 'fr-ruler-x');
          g.append('line').attr('class', 'fr-ruler-y');
          return g;
        })
        .style('display', 'none')
        .raise();
      rulers
        .selectAll('line')
        .attr('stroke', 'var(--foreground)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 4')
        .attr('opacity', 0.8);
      const hideCrosshair = () => {
        rulers.style('display', 'none');
        hideTooltip();
      };
      const hoverable = [
        ...frontier.map((v) => ({ v, subtitle: configLabel(v.config), current: true })),
        ...[...pastById.values()].map((v) => ({
          v,
          subtitle: `${t.earlierPoint} · ${configLabel(v.config)}`,
          current: false,
        })),
      ];
      const pointNear = (event: PointerEvent, currentReach: number) => {
        const [pointerX, pointerY] = d3.pointer(event, root.node());
        if (pointerX < 0 || pointerX > ctx.width || pointerY < 0 || pointerY > ctx.height)
          return undefined;
        const distance = ({ v }: (typeof hoverable)[number]) =>
          Math.hypot(x(v.x) - pointerX, y(v.y) - pointerY);
        return d3.least(
          hoverable.filter(
            (point) => distance(point) <= (point.current ? currentReach : POINT_REACH_PX),
          ),
          distance,
        );
      };
      // The drawn curves, vertices carrying their owner, for snapping the crosshair by x.
      const curves = pooled ? [frontier] : stretches.map((stretch) => stretch.owned);
      const curveAt = (event: PointerEvent) => {
        const [pointerX, pointerY] = d3.pointer(event, root.node());
        if (pointerX < 0 || pointerX > ctx.width || pointerY < 0 || pointerY > ctx.height)
          return undefined;
        const at = zoomedX.invert(pointerX);
        const hits = curves.flatMap((owned) => {
          const value = frontierValueAt(owned, at);
          if (value === null) return [];
          const owner = owned.findLast((v) => v.x <= at) ?? owned[0];
          return [{ key: owner.key, value }];
        });
        const hit = d3.least(hits, (h) => Math.abs(y(h.value) - pointerY));
        return hit && { ...hit, at };
      };
      const placeRulers = (rulerX: number, rulerY: number) => {
        rulers.style('display', null);
        rulers
          .select('.fr-ruler-x')
          .attr('x1', rulerX)
          .attr('x2', rulerX)
          .attr('y1', 0)
          .attr('y2', ctx.height);
        rulers
          .select('.fr-ruler-y')
          .attr('x1', 0)
          .attr('x2', ctx.width)
          .attr('y1', rulerY)
          .attr('y2', rulerY);
      };
      const showCrosshair = ({ v, subtitle }: (typeof hoverable)[number], pinned: boolean) => {
        placeRulers(x(v.x), y(v.y));
        showTooltip(x(v.x), y(v.y), pointCard(v, subtitle, pinned));
      };
      const showCurveCrosshair = (hit: { key: string; value: number; at: number }) => {
        placeRulers(x(hit.at), y(hit.value));
        const style = styles.get(hit.key);
        showTooltip(
          x(hit.at),
          y(hit.value),
          chartHoverCard({
            title: style?.label ?? hit.key,
            subtitle: t.onCurve,
            color: style?.color,
            metrics: [
              { value: formatLargeNumber(hit.value), label: axisLabelUnit(yLabel) },
              { value: hit.at.toFixed(1), label: axisLabelUnit(xLabel) },
            ],
          }),
        );
      };
      ctx.layout.svg
        .on('pointermove.frontier', (event: PointerEvent) => {
          if (pinnedRef.current) return;
          if ((event.target as Element | null)?.closest('.fr-start-hit')) {
            rulers.style('display', 'none');
            return;
          }
          const near = pointNear(event, POINT_REACH_PX);
          if (near) {
            showCrosshair(near, false);
            return;
          }
          const hit = curveAt(event);
          if (hit) showCurveCrosshair(hit);
          else hideCrosshair();
        })
        .on('click.frontier', (event: PointerEvent) => {
          const near = pointNear(event, PIN_REACH_PX);
          if (near && pinnedRef.current !== vertexId(near.v)) {
            pinnedRef.current = vertexId(near.v);
            showCrosshair(near, true);
            track('historical_frontier_point_pinned', { gpu: near.v.key });
          } else if (pinnedRef.current) {
            pinnedRef.current = null;
            hideCrosshair();
          }
        })
        .on('pointerleave.frontier', () => {
          if (!pinnedRef.current) hideCrosshair();
        });
      // "Click elsewhere" means anywhere: a click outside the chart and its card unpins too.
      d3.select(document).on(`click.${chartId}-pin`, (event: MouseEvent) => {
        const target = event.target as Node | null;
        if (!pinnedRef.current || !target) return;
        if (svg?.contains(target) || cardRef.current?.contains(target)) return;
        pinnedRef.current = null;
        hideCrosshair();
      });

      // One badge per SKU, on the longest stretch it holds; short stretches keep their color.
      const onScreenLength = (path: readonly OwnedVertex[]) =>
        d3.sum(path.slice(1), (v, i) => Math.hypot(x(v.x) - x(path[i].x), y(v.y) - y(path[i].y)));
      const longest = new Map<string, (typeof stretches)[number]>();
      for (const stretch of stretches) {
        const best = longest.get(stretch.key);
        if (!best || onScreenLength(stretch.path) > onScreenLength(best.path))
          longest.set(stretch.key, stretch);
      }
      const labelSeries = [...longest.values()].map((stretch) => ({
        key: stretch.key,
        seriesId: stretch.key,
        label: [styles.get(stretch.key)!.label, regressions.get(stretch.key)?.badge]
          .filter(Boolean)
          .join(' '),
        color: styles.get(stretch.key)!.color,
        points: stretch.path,
      }));
      // Labels that still overlap after placement step up or down a row; the series holding
      // more of the drawn curve keeps its spot, and a label with no free row is hidden.
      const rank = new Map(
        [...longest].map(([key, stretch]) => [key, onScreenLength(stretch.path)] as const),
      );
      const labelHeight = CHART_TYPE.lineLabel + 8;
      const kept: LineLabelPlacement[] = [];
      const placements = placeLineLabels(labelSeries, x, y, { collisionWidth: LABEL_WIDTH_PX })
        .toSorted((a, b) => (rank.get(b.key) ?? 0) - (rank.get(a.key) ?? 0))
        .map((label) => {
          const spot = [0, -1, 1, -2, 2]
            .map((row) => ({ ...label, y: label.y + row * labelHeight }))
            .find(
              (candidate) =>
                candidate.y >= 0 &&
                candidate.y <= ctx.height &&
                !kept.some(
                  (other) =>
                    Math.abs(other.x - candidate.x) < LABEL_WIDTH_PX &&
                    Math.abs(other.y - candidate.y) < labelHeight,
                ),
            );
          if (!spot) return { ...label, visible: false };
          kept.push(spot);
          return spot;
        });
      renderLineLabels(zoomGroup.select<SVGGElement>('g.frontier-chart'), placements, {
        seriesAttribute: 'data-series-id',
        opacity: 0.95,
        iconFor: (label) =>
          getLineLabelVendorIcon(label.seriesId) ?? VENDOR_LOGO_ICONS[label.seriesId],
      });
      root.selectAll('.line-label').raise();
    };

    const layers = [
      {
        type: 'custom' as const,
        key: 'frontier-chart',
        displayIdentity: `${dateIndex}|${styleIdentity}|${variant}|${locale}`,
        render: draw,
        onDisplayUpdate: draw,
        onZoom: (
          zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
          ctx: RenderContext,
        ) => draw(zoomGroup, ctx),
      },
    ];

    const yAxisConfig = {
      label: yLabel,
      tickFormat: (d: d3.AxisDomain) => formatLargeNumber(d as number),
      tickCount: 8,
    };
    const xAxisConfig = { label: xLabel, tickCount: 10 };
    const dataIdentity = `${history.dates.length}:${history.series.length}:${extent.x.join(',')}:${extent.y.join(',')}`;

    return (
      <div role="group" aria-label={t.aria}>
        <D3Chart<{ x: number; y: number }>
          chartId={chartId}
          data={[
            { x: extent.x[0], y: extent.y[0] },
            { x: extent.x[1], y: extent.y[1] },
          ]}
          dataIdentity={dataIdentity}
          metricIdentity={`${logScale}:${extent.y.join(',')}`}
          height={600}
          margin={CHART_MARGIN}
          watermark={getChartWatermark()}
          testId="frontier-svg"
          instructions={t.instructions}
          xScale={{ type: 'linear', domain: extent.x }}
          yScale={
            logScale
              ? { type: 'log', domain: extent.y, nice: true }
              : { type: 'linear', domain: extent.y, nice: true }
          }
          xAxis={xAxisConfig}
          yAxis={yAxisConfig}
          layers={layers}
          zoom={{ enabled: true, axes: 'both', scaleExtent: [1, 20] }}
          onRender={(ctx) => {
            if (!logScale) return;
            const scale = (ctx.renderedYScale ?? ctx.yScale) as d3.ScaleLogarithmic<number, number>;
            ctx.layout.yAxisGroup.call(
              d3.axisLeft(scale).ticks(8).tickFormat(logTickFormat(scale)),
            );
          }}
          legendElement={legendElement}
          noDataOverlay={plotOverlay}
          caption={caption}
          footer={footer}
        />
      </div>
    );
  },
);

FrontierChart.displayName = 'FrontierChart';

export default FrontierChart;
