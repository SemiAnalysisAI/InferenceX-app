import { useEffect } from 'react';
import { sampleFromChart } from './benchmark';
import {
  canvasPointLayerOf,
  CANVAS_POINT_LAYER_SELECTOR as LAYER,
} from '@/lib/d3-chart/layers/canvas-point-registry';
import {
  hookPointFill,
  isPlainTransform,
  measurePointExtent,
  classifyPointShape,
  POINT_HOVER_EXTENT,
  type PointShape,
} from '@/components/effects/canvas-point-paint';
import {
  ns,
  paintStamp,
  releaseStampTiles,
  stamp,
  stampScale,
  stamps,
  swatches,
} from './uac-glyph';
const svg = (cls: string) => {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('class', cls);
  p.setAttribute('fill', 'none');
  p.setAttribute('pointer-events', 'none');
  p.setAttribute('aria-hidden', 'true');
  return p;
};
function attr(el: Element, k: string, v: string) {
  if (el.getAttribute(k) !== v) el.setAttribute(k, v);
}
export function useTelemetry(on: boolean, zh: boolean) {
  useEffect(() => {
    const signs = new Map<Element, HTMLElement>(),
      scanners = new Map<Element, HTMLElement>(),
      seals = new Set<HTMLElement>(),
      ink = new Map<Element, SVGElement>(),
      hooks = new Map<HTMLCanvasElement, () => void>(),
      cache = new WeakMap<Path2D, [PointShape, number]>(),
      forced = matchMedia('(forced-colors: active)');
    let raf = 0,
      scanTimer = 0,
      lastStatus: Element | null = null,
      reticle: SVGSVGElement | null = null,
      pointRing: SVGPathElement | null = null,
      dead = false;
    const flash = (owner: Element, point: { x: number; y: number }, rail: HTMLElement) => {
      reticle?.remove();
      pointRing?.remove();
      if (lastStatus) lastStatus.textContent = zh ? '信号已捕获' : 'SIGNAL ACQUIRED';
      lastStatus = rail.querySelector('[role="status"]');
      clearTimeout(scanTimer);
      const graph = owner.closest('svg'),
        matrix = (owner as SVGGraphicsElement).getScreenCTM();
      if (!graph || !matrix) return;
      const rect = graph.getBoundingClientRect(),
        project = (p: DOMPoint) => ({
          x: 5 + ((p.x - rect.left) / rect.width) * 90,
          y: 3 + ((p.y - rect.top) / rect.height) * 30,
        });
      reticle = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      attr(reticle, 'class', 'uac-breach-map no-export');
      attr(reticle, 'viewBox', '0 0 100 36');
      attr(reticle, 'aria-hidden', 'true');
      for (const path of graph.querySelectorAll<SVGPathElement>('path.roofline-path')) {
        const m = path.getScreenCTM(),
          len = path.getTotalLength();
        if (!m || !len || getComputedStyle(path).display === 'none') continue;
        const track = svg('uac-automap-track');
        attr(
          track,
          'd',
          Array.from({ length: 15 }, (_, j) => {
            const p = project(path.getPointAtLength((len * j) / 14).matrixTransform(m));
            return `${j ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
          }).join(' '),
        );
        attr(track, 'stroke', path.getAttribute('stroke') || '#b0afa1');
        attr(track, 'stroke-width', '.7');
        reticle.append(track);
      }
      const p = project(new DOMPoint(point.x, point.y).matrixTransform(matrix)),
        mark = svg('uac-reticle');
      attr(mark, 'd', 'M-4 -1v-3h3m2 0h3v3m0 2v3H1m-2 0h-3V1');
      attr(mark, 'stroke', '#d6ffac');
      attr(mark, 'transform', `translate(${p.x} ${p.y})`);
      reticle.append(mark);
      rail.append(reticle);
      // No label or fill on the plot: a brief four-corner sight brackets the
      // real plotted coordinates rather than replacing or moving a data mark.
      if (!forced.matches) {
        pointRing = svg('uac-point-sight no-export');
        attr(pointRing, 'd', 'M-12 -6v-6h6m12 0h6v6m0 12v6h-6m-12 0h-6v-6');
        attr(pointRing, 'stroke', '#ffdc76');
        attr(pointRing, 'stroke-width', '2');
        attr(pointRing, 'vector-effect', 'non-scaling-stroke');
        const inverse = graph.getScreenCTM()?.inverse();
        if (inverse) {
          const mapped = new DOMPoint(point.x, point.y)
            .matrixTransform(matrix)
            .matrixTransform(inverse);
          attr(pointRing, 'transform', `translate(${mapped.x} ${mapped.y})`);
          graph.append(pointRing);
        }
      }
      scanTimer = window.setTimeout(() => {
        reticle?.remove();
        pointRing?.remove();
        pointRing = null;
        reticle = null;
        if (lastStatus) lastStatus.textContent = zh ? '信号已捕获' : 'SIGNAL ACQUIRED';
        lastStatus = null;
      }, 4600);
    };
    const sign = (el: Element, cl: string, text: string, after?: Element) => {
      if (signs.has(el)) return;
      const s = document.createElement('span');
      s.className = cl;
      s.textContent = text;
      if (after) after.after(s);
      else el.prepend(s);
      signs.set(el, s);
    };
    const scan = () => {
      raf = 0;
      if (dead) return;
      const active = on && !forced.matches;
      for (const seal of seals) if (!seal.isConnected) seals.delete(seal);
      for (const [e, p] of ink)
        if (!active || !e.isConnected || !p.isConnected) {
          p.remove();
          ink.delete(e);
        }
      for (const [c, off] of hooks)
        if (!active || !c.isConnected) {
          off();
          hooks.delete(c);
        }
      for (const [e, p] of signs)
        if (!e.isConnected || !p.isConnected) {
          p.remove();
          signs.delete(e);
        }
      for (const [e, h] of scanners)
        if (!e.isConnected || !h.isConnected) {
          h.remove();
          scanners.delete(e);
        }
      if (active) {
        for (const layer of document.querySelectorAll(LAYER)) {
          const c = layer
            .closest('svg')
            ?.parentElement?.querySelector('canvas.canvas-point-surface');
          if (!(c instanceof HTMLCanvasElement) || hooks.has(c)) continue;
          const off = hookPointFill(c, (ctx, path, fill) => {
            const t = ctx.getTransform();
            if (!isPlainTransform(t)) return fill(path);
            let data = cache.get(path);
            if (!data) {
              const r = measurePointExtent(ctx, path, t);
              if (r <= 0) return fill(path);
              data = [classifyPointShape(ctx, path, t, r), r];
              cache.set(path, data);
            }
            const [key, r] = data;
            const picked = r >= POINT_HOVER_EXTENT[key];
            paintStamp(ctx, fill, key, stampScale(r, picked), picked);
          });
          if (off) {
            hooks.set(c, () => {
              off();
              canvasPointLayerOf(layer)?.invalidate();
            });
            canvasPointLayerOf(layer)?.invalidate();
          }
        }
        for (const g of document.querySelectorAll('.dot-group,.unofficial-overlay-pt')) {
          const base = g.querySelector<SVGGraphicsElement>('.visible-shape');
          if (!base) continue;
          const key = (base.dataset.shapeKey || 'circle') as PointShape;
          if (!stamps[key]) continue;
          const r = base.getBBox().width * (key === 'triangle' ? 0.32 : 0.5);
          if (!r) continue;
          let p = ink.get(g) ?? g.querySelector<SVGGElement>(':scope > .uac-point');
          if (!p) {
            p = document.createElementNS(ns, 'g');
            attr(p, 'class', 'uac-point');
            attr(p, 'pointer-events', 'none');
            attr(p, 'aria-hidden', 'true');
          }
          if (p.previousElementSibling !== base) base.after(p);
          ink.set(g, p);
          const picked = r >= POINT_HOVER_EXTENT[key];
          stamp(p, key, base.getAttribute('fill') || 'currentColor', picked);
          attr(p, 'transform', `scale(${stampScale(r, picked)})`);
        }
        // Hardware rows can represent several precisions. Show only the shapes actually
        // reported for that series, in chart order, without adding labels or hit targets.
        for (const list of document.querySelectorAll('[data-testid="chart-legend"]')) {
          const figure = list.closest('figure') ?? list.closest('[id$="-export"]');
          const keys = new Map<string, Set<PointShape>>();
          const add = (hw: string | undefined, key: PointShape) => {
            if (!hw || !Object.hasOwn(stamps, key)) return;
            if (!keys.has(hw)) keys.set(hw, new Set());
            keys.get(hw)?.add(key);
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
          for (const sw of list.querySelectorAll<HTMLElement>(swatches)) {
            let glyph = sw.querySelector<SVGSVGElement>(':scope > .uac-swatch');
            if (!glyph) {
              glyph = document.createElementNS(ns, 'svg');
              attr(glyph, 'class', 'uac-swatch');
              attr(glyph, 'aria-hidden', 'true');
              sw.append(glyph);
            }
            ink.set(sw, glyph);
            const id = sw.closest('label')?.htmlFor.replace(/^checkbox-/, '') ?? '';
            const shapes = keys.get(id) ?? keys.get(sw.style.backgroundColor);
            const series: PointShape[] = shapes
              ? (Object.keys(stamps) as PointShape[]).filter((k) => shapes.has(k))
              : ['circle'];
            attr(glyph, 'viewBox', `-8 -8 ${16 * series.length} 16`);
            attr(glyph, 'width', String(15 * series.length));
            attr(glyph, 'height', '15');
            while (glyph.children.length > series.length) glyph.lastElementChild?.remove();
            series.forEach((k, i) => {
              let cell = glyph.children.item(i) as SVGGElement | null;
              if (!cell) {
                cell = document.createElementNS(ns, 'g');
                glyph.append(cell);
              }
              attr(cell, 'transform', `translate(${i * 16} 0)`);
              stamp(cell, k, sw.style.backgroundColor);
            });
          }
        }
      }
      for (const el of document.querySelectorAll('[data-testid="scatter-empty-state"]')) {
        if (!el.closest('[id$="-export"]'))
          sign(
            el,
            'uac-empty no-export',
            zh ? '需要蓝色门卡 // 零个匹配项' : 'BLUE KEYCARD REQUIRED // 0 MATCHES',
          );
      }
      for (const el of document.querySelectorAll('p[data-slot="eyebrow"]:has(+h1)'))
        if (el.textContent?.trim() === '404' && el.parentElement)
          sign(el.parentElement, 'uac-empty', zh ? '404 / 迷失之魂' : '404 / LOST SOUL');
      for (const graph of document.querySelectorAll('svg[data-testid="d3-chart-svg"]')) {
        const surface = graph.closest('figure') || graph.closest('[data-slot="card"]');
        if (
          !surface?.parentElement ||
          surface.closest('[id$="-export"]') ||
          graph.closest('[id$="-export"]')
        )
          continue;
        const caption = surface.querySelector('figcaption');
        if (caption && !caption.querySelector('.uac-output-stamp')) {
          // The exporter clones the inner chart ID, not the outer figure/scanner rail.
          // Use its reserved export-only flow so no live heading, axis or plot is covered.
          const seal = document.createElement('span'),
            logo = document.createElement('img');
          seal.className = 'uac-output-stamp export-only';
          logo.src = '/decorative/doom/doom-logo.webp';
          logo.alt = '';
          seal.append(
            logo,
            zh
              ? '关卡结算 // 火卫一遥测 · 完整记录'
              : 'INTERMISSION // PHOBOS TELEMETRY · ALL RUNS',
          );
          caption.prepend(seal);
          seals.add(seal);
          const key = document.createElement('div');
          key.className = 'uac-pickup-key';
          for (const [shape, en, cn, color] of [
            ['circle', 'Imp fireball', '火球', '#c84938'],
            ['square', 'Keycard', '门卡', '#467acf'],
            ['triangle', 'Shell', '弹壳', '#be3737'],
            ['diamond', 'Medkit', '医疗十字', '#72b694'],
          ] as const) {
            const s = document.createElement('span'),
              icon = document.createElementNS(ns, 'svg');
            attr(icon, 'viewBox', '-8 -8 16 16');
            attr(icon, 'width', '15');
            attr(icon, 'height', '15');
            attr(icon, 'aria-hidden', 'true');
            stamp(icon, shape, color);
            s.append(icon, zh ? cn : en);
            key.append(s);
          }
          caption.append(key);
          seals.add(key);
        }
        const s = signs.get(surface) ?? document.createElement('div');
        const feed = sampleFromChart(graph);
        if (feed.live && !scanners.has(surface)) {
          const rail = document.createElement('div');
          rail.className = 'uac-scan-rail';
          const insignia = document.createElement('img');
          insignia.src = '/decorative/doom/doom-logo.webp';
          insignia.alt = '';
          insignia.className = 'uac-scan-logo';
          const tag = document.createElement('strong');
          tag.textContent = zh ? 'UAC / 前沿扫描仪' : 'UAC / FRONTIER SCANNER';
          const info = document.createElement('span');
          info.setAttribute('role', 'status');
          info.textContent = zh ? '信号已捕获' : 'SIGNAL ACQUIRED';
          const portrait = document.createElement('i');
          portrait.className = 'uac-rail-face';
          portrait.setAttribute('aria-hidden', 'true');
          const access = document.createElement('button');
          access.type = 'button';
          access.className = 'uac-field-open uac-scanner-open no-export';
          access.setAttribute('aria-controls', 'uac-field-console');
          access.textContent = zh ? '战地控制台' : 'Field console';
          access.addEventListener('click', () =>
            window.dispatchEvent(new CustomEvent('doom-field-open', { detail: access })),
          );
          const button = document.createElement('button');
          button.className = 'no-export';
          button.type = 'button';
          button.textContent = zh ? '定位峰值 ⌖' : 'Locate peak ⌖';
          button.addEventListener('click', () => {
            const layers = [...graph.querySelectorAll(LAYER)];
            let hi = 0,
              owner: Element | null = null,
              point = { x: 0, y: 0 },
              name = '';
            for (const layer of layers) {
              const data =
                canvasPointLayerOf<{
                  x: number;
                  y: number;
                  precision: string;
                  output_tput_per_gpu?: number;
                  hw?: string;
                }>(layer)?.snapshot() || [];
              for (const dot of data) {
                const v = dot.datum.output_tput_per_gpu || 0;
                if (dot.interactive && dot.opacity > 0.1 && v > hi) {
                  hi = v;
                  owner = layer;
                  point = dot;
                  name = `${dot.datum.hw || 'GPU'} ${dot.datum.precision}`.toUpperCase();
                }
              }
            }
            if (!owner) return;
            flash(owner, point, rail);
            info.textContent = `${name} / ${Math.round(hi).toLocaleString(zh ? 'zh' : 'en')} tok/s`;
            window.dispatchEvent(new Event('doom-peak'));
          });
          rail.append(insignia, portrait, tag, info, button, access);
          surface.prepend(rail);
          scanners.set(surface, rail);
        }
        const label = zh
          ? ['遥测链路', '峰值输出/GPU', '信号完整', '可见运行']
          : ['TELEMETRY LINK', 'PEAK OUTPUT/GPU', 'SIGNAL HEALTH', 'VISIBLE RUNS'];
        const values = [
          label[0],
          feed.live
            ? `${Math.round(feed.sample.tps).toLocaleString(zh ? 'zh' : 'en')} tok/s`
            : 'N/A',
          graph.isConnected ? '100%' : '0%',
          String(feed.count),
        ];
        const sig = values.join('|');
        if (s.dataset.values === sig) continue;
        s.dataset.values = sig;
        s.className = 'uac-chart-hud no-export';
        s.setAttribute('role', 'group');
        s.title = feed.live ? feed.sample.name : 'UAC';
        s.replaceChildren();
        for (const [j, val] of values.entries()) {
          const a = document.createElement(j ? 'span' : 'strong');
          if (j) {
            const b = document.createElement('small');
            b.textContent = label[j];
            a.append(b);
          }
          a.append(val);
          s.append(a);
        }
        if (!s.isConnected) surface.after(s);
        signs.set(surface, s);
      }
    };
    const schedule = () => {
      if (!raf && !dead) raf = requestAnimationFrame(scan);
    };
    const tracked = `${LAYER},canvas.canvas-point-surface,.dot-group,.visible-shape,.unofficial-overlay-pt,svg[data-testid="d3-chart-svg"],[data-testid="scatter-empty-state"],p[data-slot="eyebrow"],${swatches}`;
    const obs = new MutationObserver((rs) => {
      if (
        rs.some((r) =>
          r.type === 'attributes'
            ? r.target instanceof Element && r.target.matches(`.visible-shape,${LAYER},${swatches}`)
            : [...r.addedNodes, ...r.removedNodes].some(
                (n) => n instanceof Element && (n.matches(tracked) || n.querySelector(tracked)),
              ),
        )
      )
        schedule();
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'd',
        'r',
        'x',
        'y',
        'width',
        'height',
        'data-shape-key',
        'transform',
        'fill',
        'style',
        'data-points-joined',
      ],
    });
    forced.addEventListener('change', schedule);
    const retry = window.setTimeout(schedule, 600);
    window.addEventListener('resize', schedule);
    scan();
    return () => {
      dead = true;
      obs.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(scanTimer);
      reticle?.remove();
      pointRing?.remove();
      for (const rail of scanners.values()) rail.remove();
      for (const seal of seals) seal.remove();
      clearTimeout(retry);
      window.removeEventListener('resize', schedule);
      forced.removeEventListener('change', schedule);
      for (const off of hooks.values()) off();
      releaseStampTiles();
      for (const el of [...ink.values(), ...signs.values()]) el.remove();
    };
  }, [on, zh]);
}
