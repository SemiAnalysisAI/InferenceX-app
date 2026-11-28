'use client';

import { useEffect } from 'react';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  canvasPointLayerOf,
  CANVAS_POINT_LAYER_SELECTOR,
  CANVAS_UNDERLAY_ATTRIBUTE,
} from '@/lib/d3-chart/layers/canvas-point-registry';
import {
  classifyPointShape,
  hookPointFill,
  isPlainTransform,
  measurePointExtent,
  POINT_HOVER_EXTENT,
  type PointShape,
} from '../effects/canvas-point-paint';
import { HALO_TRACE } from './halo-archive';
import {
  frontierPaths,
  laneSelector,
  legendPlate,
  liveCharts,
  noticesSelector,
  placeNotices,
  populateTrace,
  visor,
} from './halo-visor';
import { mountHaloTelemetry } from './halo-telemetry';

function redraw() {
  for (const layer of document.querySelectorAll(CANVAS_POINT_LAYER_SELECTOR)) {
    canvasPointLayerOf(layer)?.invalidate();
  }
}

const dots = 'svg[data-testid="d3-chart-svg"] .dot-group';
const legend = '[data-slot="chart-legend-wrapper"]';
const svgNs = 'http://www.w3.org/2000/svg';
const shapes: readonly PointShape[] = ['circle', 'square', 'triangle', 'diamond'];
const iconLabels = {
  circle: ['Motion tracker', '动态追踪器'],
  square: ['UNSC crate', 'UNSC 补给箱'],
  triangle: ['Plasma chevron', '等离子箭头'],
  diamond: ['Forerunner glyph', '先行者符文'],
} as const;

function geometry(shape: PointShape, r: number) {
  const h = r * 0.72;
  switch (shape) {
    case 'circle': {
      return `M${r} 0A${r} ${r} 0 1 0 ${-r} 0A${r} ${r} 0 1 0 ${r} 0M${r - 1.2} 0H${r + 1.4}M${-r - 1.4} 0H${-r + 1.2}M0 ${r - 1.2}V${r + 1.4}M0 ${-r - 1.4}V${-r + 1.2}`;
    }
    case 'square': {
      return `M${-h} ${-r}H${h}L${r} ${-h}V${h}L${h} ${r}H${-h}L${-r} ${h}V${-h}ZM-2 ${-r}v1.8m4-1.8v1.8M-2 ${r}v-1.8m4 1.8v-1.8`;
    }
    case 'triangle': {
      return `M${-r} ${h}L${-h} 0L0 ${-r}L${h} 0L${r} ${h}L${h * 0.42} ${h * 0.73}M${-h * 0.42} ${h * 0.73}L${-r} ${h}M-1.9 ${r}H1.9`;
    }
    case 'diamond': {
      return `M0 ${-r - 1}L${r} 0L0 ${r + 1}L${-r} 0ZM${-r - 1.2} -2.6v5.2M${r + 1.2} -2.6v5.2M-2.2 ${-h}H2.2M-2.2 ${h}H2.2`;
    }
  }
}

// Four helmet-lock corners, capped at two pixels beyond the native marker on each side.
function selectedGeometry(extent: number) {
  const r = extent + 1.25;
  const arm = 2.5;
  return `M${-r} ${-r + arm}V${-r}h${arm}M${r - arm} ${-r}h${arm}v${arm}M${r} ${r - arm}V${r}h${-arm}M${-r + arm} ${r}H${-r}v${-arm}`;
}

function svgMark(shape: PointShape, radius: number) {
  const path = document.createElementNS(svgNs, 'path');
  path.setAttribute('class', 'halo-export-reticle');
  path.dataset.haloShape = shape;
  path.setAttribute('d', geometry(shape, radius));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#a7edff');
  path.setAttribute('opacity', '0.89');
  path.setAttribute('stroke-width', shape === 'triangle' ? '1.5' : '1.35');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('pointer-events', 'none');
  path.setAttribute('aria-hidden', 'true');
  return path;
}

function decorateDots() {
  for (const dot of document.querySelectorAll<SVGGElement>(dots)) {
    const mark = dot.querySelector<SVGGraphicsElement>(':scope > .visible-shape');
    const shape = mark?.dataset.shapeKey as PointShape;
    if (!mark || !shapes.includes(shape)) continue;
    const existing = dot.querySelector<SVGPathElement>(':scope > .halo-export-reticle');
    const bounds = mark.getBBox();
    const extent = Math.max(bounds.x + bounds.width, -bounds.x);
    const selected = extent >= POINT_HOVER_EXTENT[shape];
    const reach = selected ? extent : Math.max(6, extent + 2.8);
    if (
      existing?.dataset.haloShape === shape &&
      existing.dataset.haloReach === String(reach) &&
      (existing.dataset.haloLocked === 'true') === selected
    )
      continue;
    existing?.remove();
    const reticle = svgMark(shape, reach);
    reticle.dataset.haloReach = String(reach);
    if (selected) {
      reticle.dataset.haloLocked = 'true';
      reticle.setAttribute('d', selectedGeometry(reach));
      reticle.setAttribute('stroke', '#ffbc75');
    }
    mark.before(reticle);
  }
}

function decorateLegends(zh: boolean) {
  for (const host of document.querySelectorAll<HTMLElement>(legend)) {
    const panel = host.querySelector('[data-testid="chart-legend"]');
    if (
      !panel ||
      panel.querySelector('.halo-shape-key') ||
      !panel.querySelector('label[for^="checkbox-"]')
    )
      continue;
    const key = document.createElement('div');
    key.className = 'halo-shape-key no-export';
    key.setAttribute('role', 'group');
    key.setAttribute('aria-label', zh ? '精度标记形状' : 'Precision marker shapes');
    for (const shape of shapes) {
      const item = document.createElement('span');
      const icon = document.createElementNS(svgNs, 'svg');
      icon.setAttribute('viewBox', '-9 -9 18 18');
      icon.setAttribute('aria-hidden', 'true');
      icon.append(svgMark(shape, 5.9));
      item.append(icon, iconLabels[shape][zh ? 1 : 0]);
      key.append(item);
    }
    panel.prepend(legendPlate(), key);
  }
}

export function HaloCharts() {
  const zh = useLocale() === 'zh';
  useEffect(() => {
    const contrast = matchMedia('(forced-colors: active)');
    const telemetry = mountHaloTelemetry(zh);
    const surfaces = new Map<HTMLCanvasElement, () => void>();
    const lanes = new Map<SVGSVGElement, HTMLElement>();
    const noticeRails = new Map<SVGSVGElement, HTMLElement>();
    let traceActive = false;
    let frame: number | undefined;
    let disposed = false;
    function syncNotices() {
      for (const [chart, row] of noticeRails) {
        if (chart.isConnected) continue;
        row.remove();
        noticeRails.delete(chart);
      }
      for (const annotation of document.querySelectorAll(noticesSelector)) {
        const chart = annotation.closest<SVGSVGElement>(liveCharts);
        if (!chart) continue;
        if (chart.closest('[id$="-export"]')) {
          if (chart.matches('.halo-chart-notices ~ * > svg[data-testid="d3-chart-svg"]')) {
            annotation.classList.add('no-export');
            chart.querySelector('.known-issue-arrows')?.classList.add('no-export');
          }
          continue;
        }
        let row = noticeRails.get(chart);
        if (!row) {
          row = document.createElement('div');
          row.className = 'halo-chart-notices';
          noticeRails.set(chart, row);
        }
        placeNotices(chart, row, zh);
      }
      for (const [chart, row] of noticeRails) {
        if (!chart.querySelector(noticesSelector)) placeNotices(chart, row, zh);
      }
    }
    const markers = new WeakMap<
      Path2D,
      { shape: PointShape; reticle: Path2D; selected: boolean }
    >();
    function syncLanes() {
      for (const [chart, lane] of lanes) {
        if (chart.isConnected && !contrast.matches) continue;
        lane.remove();
        lanes.delete(chart);
      }
      if (contrast.matches) return;
      for (const chart of document.querySelectorAll<SVGSVGElement>(liveCharts)) {
        const host = chart.parentElement;
        if (!host || chart.closest('[id$="-export"]') || chart.getBoundingClientRect().height < 140)
          continue;
        if (!chart.querySelector(`${frontierPaths}, .canvas-point-layer`)) continue;
        let lane = lanes.get(chart);
        if (!lane) {
          lane = visor(zh);
          host.before(lane);
          lanes.set(chart, lane);
        }
        if (traceActive) populateTrace(chart, lane);
        else if (lane.dataset.haloTraceSource) delete lane.dataset.haloTraceSource;
      }
    }
    function sync() {
      frame = undefined;
      if (disposed) return;
      let changed = false;
      syncNotices();
      syncLanes();
      for (const [surface, release] of surfaces) {
        if (surface.isConnected && !contrast.matches) continue;
        release();
        surfaces.delete(surface);
        changed = true;
      }
      if (contrast.matches) {
        document
          .querySelectorAll('.halo-export-reticle, .halo-shape-key, .halo-legend-plate')
          .forEach((mark) => mark.remove());
        if (changed) redraw();
        return;
      }
      for (const surface of document.querySelectorAll<HTMLCanvasElement>('.canvas-point-surface')) {
        if (surfaces.has(surface)) continue;
        const release = hookPointFill(surface, (context, path, fill) => {
          const { strokeStyle, lineWidth, globalAlpha, lineCap, lineJoin } = context;
          try {
            const transform = context.getTransform();
            if (!isPlainTransform(transform)) {
              fill(path);
              return;
            }
            let marker = markers.get(path);
            if (!marker) {
              const extent = measurePointExtent(context, path, transform);
              if (extent <= 0) {
                fill(path);
                return;
              }
              const shape = classifyPointShape(context, path, transform, extent);
              const selected = extent >= POINT_HOVER_EXTENT[shape];
              const reticle = new Path2D(
                selected ? selectedGeometry(extent) : geometry(shape, Math.max(6, extent + 2.8)),
              );
              marker = { shape, reticle, selected };
              markers.set(path, marker);
            }
            const light = document.documentElement.dataset.haloMode === 'reclaim';
            context.strokeStyle = light ? '#ffffff' : '#06101b';
            context.lineWidth = 2.6;
            context.stroke(path);
            fill(path);
            context.strokeStyle = marker.selected
              ? light
                ? '#a04408'
                : '#ffbc75'
              : light
                ? '#07516a'
                : '#a7edff';
            context.globalAlpha = globalAlpha * 0.89;
            context.lineWidth = marker.shape === 'triangle' ? 1.5 : 1.35;
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.stroke(marker.reticle);
          } finally {
            context.strokeStyle = strokeStyle;
            context.lineWidth = lineWidth;
            context.globalAlpha = globalAlpha;
            context.lineCap = lineCap;
            context.lineJoin = lineJoin;
          }
        });
        if (release) {
          surfaces.set(surface, release);
          changed = true;
        }
      }
      if (changed) redraw();
      decorateDots();
      decorateLegends(zh);
      telemetry.refresh();
    }
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(sync);
    };
    const trace = (event: Event) => {
      traceActive = Boolean((event as CustomEvent<boolean>).detail);
      schedule();
    };
    const observer = new MutationObserver((records) => {
      if (
        records.some(({ addedNodes, removedNodes }) =>
          [...addedNodes, ...removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches(noticesSelector) || node.querySelector(noticesSelector)),
          ),
        )
      )
        syncNotices();
      // PNG export snapshots a fresh SVG; decorate the vector layer in this microtask.
      if (
        !contrast.matches &&
        records.some(
          ({ addedNodes, attributeName, target }) =>
            attributeName === 'data-shape-key' ||
            (attributeName !== null &&
              target instanceof SVGElement &&
              target.matches(`${dots} > .visible-shape`)) ||
            [...addedNodes].some(
              (node) =>
                node instanceof Element &&
                (node.matches(`${dots}, ${dots} > .visible-shape`) ||
                  Boolean(node.querySelector(dots))),
            ),
        )
      )
        decorateDots();
      if (
        !contrast.matches &&
        records.some(({ addedNodes }) =>
          [...addedNodes].some(
            (node) =>
              node instanceof Element &&
              !node.closest('[id$="-export"]') &&
              !node.closest('.halo-shape-key') &&
              (node.matches(`${legend}, ${legend} label`) || Boolean(node.querySelector(legend))),
          ),
        )
      )
        decorateLegends(zh);
      if (
        records.some(({ target, addedNodes, removedNodes, type, attributeName }) => {
          if (!(target instanceof Element) || target.closest(`${laneSelector}, [id$="-export"]`))
            return false;
          if (type === 'attributes')
            return (
              (attributeName === 'd' ||
                (traceActive && attributeName === CANVAS_UNDERLAY_ATTRIBUTE)) &&
              target.matches(frontierPaths)
            );
          return [...addedNodes, ...removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches(`canvas, ${liveCharts}, ${frontierPaths}, ${telemetry.selector}`) ||
                node.querySelector(`canvas, ${liveCharts}, ${telemetry.selector}`)),
          );
        })
      )
        schedule();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-shape-key',
        'd',
        'r',
        'width',
        'height',
        'points',
        CANVAS_UNDERLAY_ATTRIBUTE,
      ],
    });
    const modeObserver = new MutationObserver(redraw);
    modeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-halo-mode'],
    });
    contrast.addEventListener('change', schedule);
    window.addEventListener(HALO_TRACE, trace);
    window.addEventListener('resize', schedule);
    sync();
    return () => {
      disposed = true;
      observer.disconnect();
      telemetry.close();
      modeObserver.disconnect();
      contrast.removeEventListener('change', schedule);
      window.removeEventListener(HALO_TRACE, trace);
      window.removeEventListener('resize', schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
      document
        .querySelectorAll('.halo-export-reticle, .halo-shape-key, .halo-legend-plate')
        .forEach((mark) => mark.remove());
      surfaces.forEach((release) => release());
      lanes.forEach((lane) => lane.remove());
      noticeRails.forEach((row, chart) => {
        row.remove();
        delete chart.dataset.haloNoticeRail;
      });
      if (surfaces.size > 0) redraw();
    };
  }, [zh]);
  return null;
}
