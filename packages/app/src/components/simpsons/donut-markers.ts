import { useEffect } from 'react';
import {
  canvasPointLayerOf,
  CANVAS_POINT_LAYER_SELECTOR as LAYER,
} from '@/lib/d3-chart/layers/canvas-point-registry';
import {
  classifyPointShape,
  hookPointFill,
  isPlainTransform,
  measurePointExtent,
  POINT_HOVER_EXTENT,
  type PointShape,
} from '@/components/effects/canvas-point-paint';
import type { Copy } from './strings';
import { decorateDonut, donutRadius, ns, paintDonut, swatchSelector } from './donut-glyph';

const POINT = '.dot-group,.unofficial-overlay-pt',
  BAR = 'rect.bar',
  EMPTY = '[data-testid="scatter-empty-state"],[data-testid="chart-empty-state"]',
  S404 = 'p[data-slot="eyebrow"]:has(+ h1)';
const TRACK = `${LAYER},canvas.canvas-point-surface,${POINT},${BAR},${EMPTY},${S404},.visible-shape,${swatchSelector}`;
export function useDonutMarkers(on: boolean, copy: Copy) {
  useEffect(() => {
    const marks = new Map<Element, SVGElement>(),
      bars = new Map<SVGRectElement, SVGPathElement>(),
      notes = new Map<Element, HTMLElement>();
    const hooks = new Map<HTMLCanvasElement, { off: () => void; layer: Element }>(),
      forced = matchMedia('(forced-colors: active)');
    const cache = new WeakMap<Path2D, { shape: PointShape; extent: number }>();
    let paper = '';
    let raf = 0,
      disposed = false;
    function unhook(c: HTMLCanvasElement) {
      const old = hooks.get(c);
      old?.off();
      if (old) canvasPointLayerOf(old.layer)?.invalidate();
      hooks.delete(c);
    }
    function marker(surface: HTMLCanvasElement, layer: Element) {
      if (hooks.has(surface)) return;
      const off = hookPointFill(surface, (ctx, path, fill) => {
        const t = ctx.getTransform();
        if (!isPlainTransform(t)) return fill(path);
        let key = cache.get(path);
        if (!key) {
          const extent = measurePointExtent(ctx, path, t);
          if (extent <= 0) return fill(path);
          key = { extent, shape: classifyPointShape(ctx, path, t, extent) };
          cache.set(path, key);
        }
        const picked = key.extent >= POINT_HOVER_EXTENT[key.shape];
        paintDonut(ctx, fill, key.shape, donutRadius(key.extent, picked), paper, picked);
      });
      if (off) {
        hooks.set(surface, { off, layer });
        canvasPointLayerOf(layer)?.invalidate();
      }
    }
    const create = (cl: string) => {
      const el = document.createElementNS(ns, 'path');
      el.setAttribute('class', cl);
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('pointer-events', 'none');
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
      return el;
    };
    const set = (el: Element, k: string, v: string) => {
      if (el.getAttribute(k) !== v) el.setAttribute(k, v);
    };
    const svgPoint = (group: Element) => {
      const base = group.querySelector<SVGGraphicsElement>(':scope > .visible-shape');
      if (!base) return;
      const shape = base.dataset.shapeKey as PointShape;
      if (!['circle', 'square', 'triangle', 'diamond'].includes(shape)) return;
      let detail = marks.get(group) ?? group.querySelector<SVGGElement>(':scope > .simpsons-point');
      if (!detail) {
        detail = document.createElementNS(ns, 'g');
        detail.setAttribute('class', 'simpsons-point');
        detail.setAttribute('pointer-events', 'none');
        detail.setAttribute('aria-hidden', 'true');
        base.after(detail);
      }
      marks.set(group, detail);
      const bounds = base.getBBox();
      if (!bounds.width) return;
      const extent = bounds.width * (shape === 'triangle' ? 0.32 : 0.5);
      const picked = extent >= POINT_HOVER_EXTENT[shape];
      set(detail, 'transform', `scale(${donutRadius(extent, picked)})`);
      decorateDonut(detail, shape, base.getAttribute('fill') || 'currentColor', paper, picked);
      if (detail.previousElementSibling !== base) base.after(detail);
    };
    const rod = (bar: SVGRectElement) => {
      const x = bar.x.baseVal.value,
        y = bar.y.baseVal.value,
        w = bar.width.baseVal.value,
        h = bar.height.baseVal.value;
      let cap = bars.get(bar);
      if (!cap) {
        cap = create('simpsons-carbon-rim');
        cap.setAttribute('stroke', '#fff5ab');
        cap.setAttribute('stroke-width', '1.3');
        cap.setAttribute('opacity', '.8');
        bar.after(cap);
        bars.set(bar, cap);
      }
      set(
        cap,
        'd',
        w < 6 || h < 6
          ? ''
          : w >= h
            ? `M${x + 2},${y + 2}h${w - 4}m-2,1v${Math.max(0, h - 6)}`
            : `M${x + 2},${y + h - 3}v-${h - 5}h${w - 4}`,
      );
      set(cap, 'transform', bar.getAttribute('transform') ?? '');
    };
    const sign = (el: Element, text: string, cl: string) => {
      if (notes.has(el)) return;
      const item = document.createElement('span');
      item.className = cl;
      item.textContent = text;
      el.prepend(item);
      notes.set(el, item);
    };
    const scan = () => {
      raf = 0;
      if (disposed) return;
      const active = on && !forced.matches;
      for (const [el, m] of marks)
        if (!active || !el.isConnected || !m.isConnected) {
          m.remove();
          marks.delete(el);
        }
      for (const c of hooks.keys()) if (!active || !c.isConnected) unhook(c);
      for (const [el, b] of bars)
        if (!el.isConnected || !b.isConnected || forced.matches) {
          b.remove();
          bars.delete(el);
        }
      for (const [el, b] of notes)
        if (!el.isConnected) {
          b.remove();
          notes.delete(el);
        }
      if (active) {
        const next = getComputedStyle(document.body).getPropertyValue('--sp-marker-hole').trim();
        if (next !== paper) {
          paper = next;
          for (const { layer } of hooks.values()) canvasPointLayerOf(layer)?.invalidate();
        }
        for (const g of document.querySelectorAll(POINT)) svgPoint(g);
        for (const list of document.querySelectorAll('[data-testid="chart-legend"]')) {
          const figure = list.closest('figure') ?? list.closest('[id$="-export"]');
          const series = new Map<string, Set<PointShape>>();
          const add = (hw: string | undefined, key: PointShape) => {
            if (!hw || !['circle', 'square', 'triangle', 'diamond'].includes(key)) return;
            if (!series.has(hw)) series.set(hw, new Set());
            series.get(hw)?.add(key);
          };
          const layer = canvasPointLayerOf(figure);
          if (layer) {
            for (const point of layer.snapshot()) add(point.attrs['hw-key'], point.shape);
          } else {
            for (const base of figure?.querySelectorAll<SVGElement>(
              '.dot-group > .visible-shape',
            ) ?? [])
              add(
                base.parentElement?.dataset.hwKey || getComputedStyle(base).fill,
                base.dataset.shapeKey as PointShape,
              );
          }
          for (const sw of list.querySelectorAll<HTMLElement>(swatchSelector)) {
            let glyph = sw.querySelector<SVGSVGElement>(':scope > .simpsons-swatch');
            if (!glyph) {
              glyph = document.createElementNS(ns, 'svg');
              glyph.setAttribute('class', 'simpsons-swatch');
              glyph.setAttribute('aria-hidden', 'true');
              sw.append(glyph);
            }
            const keys =
              series.get(sw.closest('label')?.htmlFor.replace(/^checkbox-/, '') ?? '') ??
              series.get(sw.style.backgroundColor);
            const shapes: PointShape[] = keys
              ? (['circle', 'square', 'triangle', 'diamond'] as const).filter((k) => keys.has(k))
              : ['circle'];
            marks.set(sw, glyph);
            set(glyph, 'viewBox', `-1.25 -1.25 ${2.5 * shapes.length} 2.5`);
            set(glyph, 'width', String(15 * shapes.length));
            set(glyph, 'height', '15');
            while (glyph.children.length > shapes.length) glyph.lastElementChild?.remove();
            for (const [i, k] of shapes.entries()) {
              let cell = glyph.children.item(i) as SVGGElement | null;
              if (!cell) {
                cell = document.createElementNS(ns, 'g');
                glyph.append(cell);
              }
              set(cell, 'transform', `translate(${2.5 * i} 0)`);
              decorateDonut(cell, k, sw.style.backgroundColor, paper);
            }
          }
        }
        for (const layer of document.querySelectorAll(LAYER)) {
          const c = layer
            .closest('svg')
            ?.parentElement?.querySelector<HTMLCanvasElement>('canvas.canvas-point-surface');
          if (c) marker(c, layer);
        }
      }
      if (!forced.matches) document.querySelectorAll<SVGRectElement>(BAR).forEach(rod);
      for (const frame of document.querySelectorAll<HTMLElement>(
        'figure[data-testid="chart-figure"] figcaption',
      )) {
        if (notes.has(frame) || frame.querySelector('.sp-export-imprint')) continue;
        const stamp = document.createElement('div');
        stamp.className = 'sp-export-imprint sp-print-stamp export-only';
        const bug = document.createElement('img');
        bug.src = '/decorative/simpsons/art/six.webp';
        bug.alt = '';
        stamp.append(
          bug,
          document.createTextNode(
            copy.stationFoot +
              (document.documentElement.lang.startsWith('zh')
                ? '  /  第六频道 · 完整播出记录'
                : '  /  CHANNEL 6 · BROADCAST MASTER'),
          ),
        );
        const legend = document.createElement('div');
        legend.className = 'sp-prop-key';
        legend.setAttribute(
          'aria-label',
          document.documentElement.lang.startsWith('zh')
            ? '精度图例：四种点形'
            : 'Precision key: four point shapes',
        );
        for (const [shape, en, cn] of [
          ['circle', 'Donut', '甜甜圈'],
          ['square', 'Duff', '达夫罐'],
          ['triangle', 'Squishee', '冰沙杯'],
          ['diamond', 'Krusty Burger', '小丑汉堡'],
        ] as const) {
          const cell = document.createElement('span'),
            icon = document.createElementNS(ns, 'svg');
          icon.setAttribute('viewBox', '-1.4 -1.4 2.8 2.8');
          icon.setAttribute('width', '16');
          icon.setAttribute('height', '16');
          icon.setAttribute('aria-hidden', 'true');
          decorateDonut(
            icon,
            shape,
            { circle: '#ff698f', square: '#d64049', triangle: '#46ab88', diamond: '#d59036' }[
              shape
            ],
            paper || '#fff5d1',
          );
          cell.append(
            icon,
            document.createTextNode(document.documentElement.lang.startsWith('zh') ? cn : en),
          );
          legend.append(cell);
        }
        const group = document.createElement('div');
        group.className = 'sp-print-and-key';
        group.append(legend, stamp);
        frame.append(group);
        notes.set(frame, group);
      }
      document.querySelectorAll(EMPTY).forEach((el) => sign(el, copy.empty, 'sp-plot-sign'));
      document.querySelectorAll(S404).forEach((el) => {
        if (el.textContent?.trim() === '404' && el.parentElement)
          sign(el.parentElement, copy.missing, 'sp-404-sign');
      });
    };
    const schedule = () => {
      if (!disposed && !raf) raf = requestAnimationFrame(scan);
    };
    const observer = new MutationObserver((records) => {
      if (
        records.some((r) =>
          r.type === 'attributes'
            ? r.target === document.documentElement ||
              (r.target instanceof Element &&
                r.target.matches(`${BAR},.visible-shape,${LAYER},${swatchSelector}`))
            : [...r.addedNodes, ...r.removedNodes].some(
                (n) => n instanceof Element && (n.matches(TRACK) || n.querySelector(TRACK)),
              ),
        )
      )
        schedule();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'data-shape-key',
        'width',
        'height',
        'x',
        'y',
        'r',
        'd',
        'transform',
        'fill',
        'style',
        'data-points-joined',
      ],
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-simpsons-channel'],
    });
    scan();
    forced.addEventListener('change', schedule);
    return () => {
      disposed = true;
      observer.disconnect();
      forced.removeEventListener('change', schedule);
      cancelAnimationFrame(raf);
      for (const c of hooks.keys()) unhook(c);
      for (const el of [...marks.values(), ...bars.values(), ...notes.values()]) el.remove();
    };
  }, [on, copy]);
}
