import {
  classifyPointShape,
  hookPointFill,
  isPlainTransform,
  measurePointExtent,
  POINT_HOVER_EXTENT,
  type PointShape,
} from '@/components/effects/canvas-point-paint';
import {
  CANVAS_POINT_LAYER_SELECTOR,
  canvasPointLayerOf,
} from '@/lib/d3-chart/layers/canvas-point-registry';
import { CANVAS_POINT_SURFACE_CLASS } from '@/lib/d3-chart/layers/canvas-points';
type Item = PointShape | 'trapper' | 'mitten' | 'hood';
const PAPER: Record<Item, [string, string]> = {
  trapper: ['M-5-3.8Q0-5.3 5-3.8V4.8H2.1V1H-2.1V4.8H-5Z', 'M-4-1.4H4'],
  mitten: [
    'M-3 4.7 -3.3 2 -5 .1Q-5.7-2.7-3.3-1.7L-2.5-1.1 -2.3-3.5Q-1.9-5.4 1-5.2 4.8-5.1 4.6-1.5L3.3 2.8 3.2 4.7Z',
    'M-2.5 2.4 3.2 2.4',
  ],
  hood: [
    'M-4.8 2.5Q-6.2-2.2-2.5-4.7 .1-6.4 3.3-4.4 6.2-1.2 4.7 2.5L2.2 4.9H-2.2Z',
    'M-2.7 0Q-2.6-3.5 0-3.5 2.8-3.5 2.7 0 2.4 2.6 0 2.6 -2.7 2.6-2.7 0Z',
  ],
  circle: [
    'M-4.8 2 -4.2-.9 -2.9-2.8 -1-3.5 -1.4-4.5 -.8-5.4 .5-5.6 1.5-4.8 1.1-3.5 3.4-2.6 4.6-.4 4.9 1.9 5.4 2.1 5.1 4.1 2.2 4.9 -.8 5 -4.9 4.2 -5.3 2.3Z',
    'M-4.3 2.15Q0 3.1 4.4 1.9',
  ],
  square: [
    'M-4.9-4.4 -3.1-4.9 -1.6-4.45 .5-5 2.1-4.5 4.8-5 5 4.4 3.4 4.9 1.7 4.5 -.3 5 -2 4.6 -4.9 5Z',
    'M-3.5-2.9 3.2-3.1 M-1.6 1 0-.9 1.6.7 .2 2.2Z',
  ],
  triangle: [
    'M0-5.8 2.8-1 1.5-1.2 4 2 2.6 1.8 5.4 4.5 1 4.4 1 5.3 -.9 5.3 -.9 4.4 -5.2 4.7 -2.9 1.8 -3.9 2.1 -1.6-1 -2.6-.8Z',
    'M-.1-3.1 -1.3-.8 .2-.95 M-2.5 2.4 -.5 1.9 .6 2.5',
  ],
  diamond: [
    'M0-5.8 1.9-3.3 2.1-2.8 5.3-.1 2.2 2.9 .2 5.9 -2.5 3 -5.3.2 -2.3-2.7Z',
    'M-.2-3.8 .2 3.55 M-3.4.2 .1-1.1 3.2 0',
  ],
};
const NS = 'http://www.w3.org/2000/svg',
  POINT = '.dot-group,.unofficial-overlay-pt',
  BAR = 'rect.bar,rect.breakdown-bar,rect.histogram-bar',
  surface = `canvas.${CANVAS_POINT_SURFACE_CLASS}`;
const line = '#344a40',
  glint = '#fff9df';
// A lifted flap, a dark cut edge and a cream crease, all inside the selected mark.
const flap = 'M1.2-2.8L4.6-4.6 3.7-.55Z';
const SWATCH =
  "[data-testid='chart-legend'] label span.rounded-full[style*='background'], [data-testid='legend-line-swatch']";
function scaleFor(extent: number) {
  return Math.min(2, Math.max(0.85, extent / 4.7));
}
function selectedScale(shape: PointShape, extent: number) {
  // The chart's triangle is wider than it is tall. Constrain the folded silhouette
  // independently of the ray used to recognize its enlarged path.
  return Math.min(
    scaleFor(extent),
    shape === 'triangle' ? 0.76 : shape === 'diamond' ? 1.27 : 1.17,
  );
}
// Default scatter circles support a second, redundant cue for series colour. Preserve
// all non-circle source shapes; canvas canonicalizes its fillStyle to hex.
const families = new Map<string, Item>();
let sampler: CanvasRenderingContext2D | null = null;
function objectFor(shape: PointShape, color: string): Item {
  if (shape !== 'circle') return shape;
  if (color.startsWith('var(')) return 'circle';
  const cached = families.get(color);
  if (cached) return cached;
  if (!sampler) {
    const swatch = document.createElement('canvas');
    swatch.width = 1;
    swatch.height = 1;
    sampler = swatch.getContext('2d', { willReadFrequently: true });
  }
  if (!sampler) return 'circle';
  sampler.fillStyle = color;
  sampler.fillRect(0, 0, 1, 1);
  const [r, g, b] = sampler.getImageData(0, 0, 1, 1).data;
  const item =
    g > r && g > b
      ? g - r > 46
        ? 'trapper'
        : 'circle'
      : r > g * 1.35 && r > b * 1.25
        ? 'mitten'
        : r >= g && g > b * 1.35
          ? 'hood'
          : 'circle';
  families.set(color, item);
  return item;
}
function svgPath(d: string, fill: string, stroke: string, width: string) {
  const el = document.createElementNS(NS, 'path');
  el.setAttribute('d', d);
  el.setAttribute('fill', fill);
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', width);
  el.setAttribute('pointer-events', 'none');
  el.setAttribute('aria-hidden', 'true');
  return el;
}
function redraw() {
  document
    .querySelectorAll(CANVAS_POINT_LAYER_SELECTOR)
    .forEach((l) => canvasPointLayerOf(l)?.invalidate());
}
function plates(kind: PointShape, color: string) {
  const [outline, crease] = PAPER[objectFor(kind, color)];
  return [svgPath(outline, color, line, '.84'), svgPath(crease, 'none', glint, '.92')];
}
export function mountPaperCharts() {
  const pomMarks = new Map<Element, SVGGElement>();
  function frontier(path: Element) {
    const neighbor = path.nextElementSibling;
    let g =
      pomMarks.get(path) ??
      (neighbor instanceof SVGGElement && neighbor.classList.contains('sp-frontier-poms')
        ? neighbor
        : undefined);
    // The exporter rebinds a clone's SVG descendants by index before it reveals and
    // lays out the paths. Do not insert siblings into its still-hidden Canvas underlay.
    if (
      forced.matches ||
      !path.parentNode ||
      (path instanceof SVGElement && path.dataset.canvasUnderlay !== undefined)
    ) {
      g?.remove();
      pomMarks.delete(path);
      return;
    }
    const d = path.getAttribute('d') ?? '';
    if (!g) {
      g = document.createElementNS(NS, 'g');
      g.classList.add('sp-frontier-poms');
      g.setAttribute('pointer-events', 'none');
      g.setAttribute('aria-hidden', 'true');
      path.after(g);
    }
    pomMarks.set(path, g);
    if (path instanceof SVGElement) {
      for (const key of ['opacity', 'display', 'visibility'] as const) {
        const value = path.style[key] || path.getAttribute(key) || '';
        if (g.style[key] !== value) g.style[key] = value;
      }
    }
    if (g.dataset.line === d) return;
    g.dataset.line = d;
    g.replaceChildren();
    let i = 0;
    for (const command of d.matchAll(/[MLC](?<coordinates>[^MLCZ]+)/giu)) {
      const coords = command.groups?.coordinates.match(/-?[\d.]+(?:e[+-]?\d+)?/giu);
      if (!coords || coords.length < 2 || i >= 50) continue;
      const x = Number(coords.at(-2)),
        y = Number(coords.at(-1));
      if (!Number.isFinite(x + y)) continue;
      const tick = svgPath(
        `M${x - 3.5} ${y - 2.7}q3-3.6 6.2-.6`,
        'none',
        ['#9f3832', '#287442', '#1f7889', '#b15323'][i++ % 4],
        '1.15',
      );
      g.append(tick);
    }
  }
  const paths = new Map<Item, [Path2D, Path2D]>(),
    metrics = new WeakMap<Path2D, { extent: number; shape: PointShape }>();
  const surfaces = new Map<HTMLCanvasElement, () => void>(),
    bars = new Map<Element, SVGPathElement>();
  const forced = matchMedia('(forced-colors: active)');
  let frame = 0;
  function swatch(el: Element) {
    if (el instanceof SVGSVGElement) {
      // Keep the line's ends visible: dash pattern is a separate series encoding.
      const old = el.querySelector<SVGGElement>(':scope > .sp-series-swatch');
      const ink = el.querySelector('line')?.getAttribute('stroke');
      if (forced.matches || !ink) {
        old?.remove();
        return;
      }
      if (old?.dataset.ink === ink) return;
      const g = old ?? document.createElementNS(NS, 'g');
      g.classList.add('sp-series-swatch');
      g.dataset.ink = ink;
      g.setAttribute('transform', 'translate(12 6) scale(.9)');
      g.setAttribute('pointer-events', 'none');
      g.setAttribute('aria-hidden', 'true');
      g.replaceChildren(...plates('circle', ink));
      if (!old) el.append(g);
      return;
    }
    if (!(el instanceof HTMLElement)) return;
    const old = el.querySelector<SVGSVGElement>(':scope > .sp-series-swatch');
    if (forced.matches) {
      old?.remove();
      return;
    }
    const color = el.style.backgroundColor;
    if (!color || old?.dataset.ink === color) return;
    const svg = old ?? document.createElementNS(NS, 'svg');
    svg.classList.add('sp-series-swatch');
    svg.setAttribute('viewBox', '-7 -7 14 14');
    svg.setAttribute('width', '19');
    svg.setAttribute('height', '19');
    svg.setAttribute('aria-hidden', 'true');
    svg.dataset.ink = color;
    svg.replaceChildren(...plates('circle', color));
    if (!old) el.append(svg);
  }
  for (const shape of Object.keys(PAPER) as Item[])
    paths.set(shape, [new Path2D(PAPER[shape][0]), new Path2D(PAPER[shape][1])]);
  function point(group: Element) {
    const src = group.querySelector<SVGGraphicsElement>(':scope > .visible-shape');
    // Canvas already paints these source points. Building three invisible SVG paths per
    // sample both forces layout through getBBox() and amplifies shared chart mutations.
    if (!src || src.dataset.canvasUnderlay !== undefined) return;
    let mark = group.querySelector<SVGGElement>(':scope > .sp-paper-mark');
    const kind = (src.dataset.shapeKey ?? 'circle') as PointShape,
      shape = PAPER[kind];
    if (!shape || forced.matches) {
      mark?.remove();
      return;
    }
    const color = src.getAttribute('fill') || getComputedStyle(src).fill;
    if (!color || color === 'none' || color === 'transparent') {
      mark?.remove();
      return;
    }
    if (!mark) {
      mark = document.createElementNS(NS, 'g');
      mark.classList.add('sp-paper-mark');
      mark.setAttribute('pointer-events', 'none');
      mark.setAttribute('aria-hidden', 'true');
      src.after(mark);
    }
    const geometry = src.getAttribute('r') ?? src.getAttribute('width') ?? src.getAttribute('d');
    const signature = `${kind}/${color}/${src.getAttribute('transform') ?? ''}/${geometry ?? ''}`;
    if (mark.dataset.signature === signature) return;
    mark.dataset.signature = signature;
    let width = 8;
    try {
      width = src.getBBox().width || 8;
    } catch {}
    const extent = kind === 'triangle' ? width / 3 : width / 2;
    const raised = extent >= POINT_HOVER_EXTENT[kind];
    mark.setAttribute(
      'transform',
      `scale(${raised ? selectedScale(kind, extent) : scaleFor(extent)})`,
    );
    mark.replaceChildren(...plates(kind, color));
    if (raised) {
      const shadow = svgPath(PAPER[objectFor(kind, color)][0], '#64513d', 'none', '0');
      shadow.setAttribute('transform', 'translate(.8 1.1)');
      mark.prepend(shadow);
      mark.append(svgPath(flap, '#fff3be', line, '.55'));
    }
  }
  // Proximity charts move their rulers, not the underlying SVG dot. Paint the
  // crease at the stock snapped coordinates; let the chart own all hit testing.
  function proximityFold(host: Element, x: number, y: number) {
    if (forced.matches || !Number.isFinite(x) || !Number.isFinite(y)) return;
    let crease = host.querySelector<SVGPathElement>(':scope > .sp-proximity-fold');
    if (!crease) {
      crease = svgPath(flap, '#fff3be', line, '.7');
      crease.classList.add('sp-proximity-fold');
      host.append(crease);
    }
    const transform = `translate(${x},${y})`;
    if (crease.getAttribute('transform') !== transform) crease.setAttribute('transform', transform);
  }
  function proximityMove(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof SVGRectElement) || !target.classList.contains('proximity-overlay'))
      return;
    const rulers = target.parentElement?.querySelector<SVGGElement>(':scope > .ruler-group');
    if (
      !rulers ||
      rulers.style.display === 'none' ||
      !target.ownerSVGElement?.querySelector('.dot-group > .sp-paper-mark')
    )
      return;
    const v = rulers.querySelector<SVGLineElement>('.vertical-ruler');
    const h = rulers.querySelector<SVGLineElement>('.horizontal-ruler');
    if (v?.hasAttribute('x1') && h?.hasAttribute('y1'))
      proximityFold(rulers, v.x1.baseVal.value, h.y1.baseVal.value);
  }
  function proximityPin(el: Element) {
    if (
      el.parentElement?.querySelector(':scope > .proximity-overlay') &&
      el.closest('svg')?.querySelector('.dot-group > .sp-paper-mark')
    )
      proximityFold(el, 0, 0);
  }
  function bar(el: Element) {
    if (!(el instanceof SVGRectElement) || forced.matches) return;
    const x = el.x.baseVal.value,
      y = el.y.baseVal.value,
      w = el.width.baseVal.value,
      h = el.height.baseVal.value;
    if (w < 6 || h < 7 || w > h * 4) {
      bars.get(el)?.remove();
      bars.delete(el);
      return;
    }
    const neighbor = el.nextElementSibling;
    let cap =
      bars.get(el) ??
      (neighbor instanceof SVGPathElement && neighbor.classList.contains('sp-paper-cap')
        ? neighbor
        : undefined);
    if (!cap) {
      cap = svgPath('', '#fcfff5', '#6e8a7d', '.55');
      cap.classList.add('sp-paper-cap');
      el.after(cap);
    }
    bars.set(el, cap);
    const d = `M${x},${y}h${w}v2l${-w * 0.23},1 ${-w * 0.17},-1 ${-w * 0.35},1.6 ${-w * 0.25},-1Z`;
    if (cap.getAttribute('d') !== d) cap.setAttribute('d', d);
    const tr = el.getAttribute('transform');
    if (tr !== cap.getAttribute('transform')) {
      if (tr) cap.setAttribute('transform', tr);
      else cap.removeAttribute('transform');
    }
  }
  function within(el: Element) {
    if (
      !forced.matches &&
      el.parentElement?.matches('[id$="-export"]') &&
      el.querySelector('svg[data-testid="d3-chart-svg"]') &&
      !el.querySelector('.sp-export-id')
    ) {
      const plate = document.createElement('div');
      plate.className = 'sp-export-id';
      plate.setAttribute('aria-hidden', 'true');
      for (const file of ['show-logo', 'school-bus']) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = `/decorative/south-park/art/${file}.webp`;
        plate.append(img);
      }
      const stamp = document.createElement('strong');
      stamp.className = 'sp-county-seal';
      stamp.textContent = document.documentElement.lang.startsWith('zh')
        ? '南方公园县 · 基准档案'
        : 'Park County • Benchmark Records';
      plate.lastElementChild?.before(stamp);
      el.prepend(plate);
    }
    if (el.matches(SWATCH)) swatch(el);
    if (el.matches('.roofline-path')) frontier(el);
    if (el.matches(POINT)) point(el);
    if (el.matches(BAR)) bar(el);
    if (el.matches('.pin-ring')) proximityPin(el);
    if (el.matches('.visible-shape') && el.parentElement) point(el.parentElement);
    if (el.firstElementChild) {
      el.querySelectorAll(SWATCH).forEach(swatch);
      el.querySelectorAll('.roofline-path').forEach(frontier);
      el.querySelectorAll(POINT).forEach(point);
      el.querySelectorAll(BAR).forEach(bar);
      el.querySelectorAll('.pin-ring').forEach(proximityPin);
    }
  }
  function sync() {
    for (const [p, g] of pomMarks)
      if (!p.isConnected) {
        g.remove();
        pomMarks.delete(p);
      }
    frame = 0;
    let changed = false;
    for (const [cv, release] of surfaces)
      if (!cv.isConnected || forced.matches) {
        release();
        delete cv.dataset.spPaper;
        surfaces.delete(cv);
        changed = true;
      }
    for (const [el, cap] of bars)
      if (!el.isConnected || forced.matches) {
        cap.remove();
        bars.delete(el);
      }
    if (!forced.matches)
      for (const cv of document.querySelectorAll<HTMLCanvasElement>(surface)) {
        if (surfaces.has(cv)) continue;
        const fold = new Path2D(flap);
        const unhook = hookPointFill(cv, (ctx, path, fill) => {
          const tr = ctx.getTransform();
          if (!isPlainTransform(tr) || typeof ctx.fillStyle !== 'string') {
            fill(path);
            return;
          }
          let m = metrics.get(path);
          if (!m) {
            const extent = measurePointExtent(ctx, path, tr);
            if (!extent) {
              fill(path);
              return;
            }
            m = { extent, shape: classifyPointShape(ctx, path, tr, extent) };
            metrics.set(path, m);
          }
          const [plate, fiber] = paths.get(objectFor(m.shape, ctx.fillStyle))!;
          ctx.save();
          try {
            const raised = m.extent >= POINT_HOVER_EXTENT[m.shape];
            const s = raised ? selectedScale(m.shape, m.extent) : scaleFor(m.extent);
            ctx.scale(s, s);
            if (raised) {
              ctx.save();
              ctx.translate(0.8, 1.05);
              ctx.fillStyle = '#64513d';
              fill(plate);
              ctx.restore();
            }
            fill(plate);
            ctx.lineWidth = 0.84;
            ctx.strokeStyle = line;
            ctx.stroke(plate);
            ctx.lineWidth = 0.92;
            ctx.strokeStyle = glint;
            ctx.stroke(fiber);
            if (raised) {
              ctx.fillStyle = '#fff3be';
              fill(fold);
              ctx.lineWidth = 0.55;
              ctx.strokeStyle = line;
              ctx.stroke(fold);
            }
          } finally {
            ctx.restore();
          }
        });
        if (unhook) {
          surfaces.set(cv, unhook);
          cv.dataset.spPaper = '';
          changed = true;
        }
      }
    if (changed) redraw();
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(sync);
  };
  function palette() {
    if (forced.matches)
      document.querySelectorAll('.sp-proximity-fold').forEach((el) => el.remove());
    within(document.body);
    sync();
  }
  const decoration =
    '.sp-paper-mark,.sp-paper-cap,.sp-frontier-poms,.sp-series-swatch,.sp-plot-stunt,.sp-proximity-fold';
  const observer = new MutationObserver((records) => {
    let check = false;
    const attrs = new Set<Element>(),
      roots = new Set<Element>();
    for (const rec of records) {
      if (rec.type === 'attributes') {
        const el = rec.target as Element;
        if (
          el instanceof SVGElement ||
          (el instanceof HTMLElement && el.tagName === 'SPAN' && rec.attributeName === 'style')
        )
          attrs.add(el);
        continue;
      }
      if (rec.target instanceof Element && rec.target.closest(decoration)) continue;
      for (const n of rec.addedNodes)
        if (n instanceof Element && n.isConnected && !n.matches(decoration)) roots.add(n);
      for (const n of rec.removedNodes)
        if (
          !check &&
          n instanceof Element &&
          (n.matches(`${surface},${BAR},.roofline-path`) ||
            n.querySelector(`${surface},${BAR},.roofline-path`))
        )
          check = true;
    }
    for (const n of roots) {
      let parent = n.parentElement;
      while (parent && !roots.has(parent)) parent = parent.parentElement;
      if (parent || n.closest(decoration)) continue;
      if (
        n instanceof SVGElement ||
        n.matches(SWATCH) ||
        (n.firstElementChild && n.querySelector(`svg,${SWATCH}`))
      )
        within(n);
      if (!check && (n.matches(surface) || n.querySelector(surface))) check = true;
    }
    for (const el of attrs) {
      if (!el.isConnected || el.closest(decoration)) continue;
      if (el.matches(SWATCH)) swatch(el);
      else if (el instanceof SVGLineElement && el.parentElement?.matches(SWATCH))
        swatch(el.parentElement);
      else if (el.classList.contains('roofline-path')) frontier(el);
      else if (el.classList.contains('visible-shape') && el.parentElement) point(el.parentElement);
      else if (el instanceof SVGRectElement && el.matches(BAR)) bar(el);
    }
    if (check) schedule();
  });
  within(document.body);
  sync();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'd',
      'r',
      'data-shape-key',
      'fill',
      'stroke',
      'x',
      'y',
      'width',
      'height',
      'transform',
      'opacity',
      'display',
      'visibility',
      'style',
    ],
  });
  forced.addEventListener('change', palette);
  document.addEventListener('mousemove', proximityMove, { passive: true });
  return () => {
    observer.disconnect();
    document.removeEventListener('mousemove', proximityMove);
    forced.removeEventListener('change', palette);
    families.clear();
    sampler = null;
    cancelAnimationFrame(frame);
    for (const [cv, release] of surfaces) {
      release();
      delete cv.dataset.spPaper;
    }
    document
      .querySelectorAll(
        '.sp-paper-mark,.sp-paper-cap,.sp-frontier-poms,.sp-series-swatch,.sp-export-id,.sp-proximity-fold',
      )
      .forEach((el) => el.remove());
    redraw();
  };
}
