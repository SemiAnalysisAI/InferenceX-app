/**
 * Chart integration for the Orange Chicken theme. Everything here decorates what the charts
 * already draw and never changes data, scales, hit areas or event handlers:
 *
 * - canvas scatter points are painted by the chart's own draw loop (its `fill` call is wrapped),
 *   so they keep their position, opacity, fade and hover size. Each point shape becomes its own
 *   dish on a saucer in the series colour: circle = chicken, square = takeout box, triangle =
 *   dumpling, diamond = fortune cookie. Colour and shape both stay readable;
 * - SVG points (`.dot-group`, small charts and PNG export) get the same dish;
 * - bars get a bamboo-steamer weave;
 * - tooltips get an order number that climbs with each one shown.
 *
 * `mountChickenCharts` returns a cleanup that removes every node, attribute and wrapper.
 */
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { pointLabelAnchor } from '@/lib/d3-chart/layers/point-label-order';
import {
  CANVAS_POINT_LAYER_SELECTOR,
  canvasPointLayerOf,
} from '@/lib/d3-chart/layers/canvas-point-registry';
import {
  CANVAS_POINT_SURFACE_CLASS,
  type CanvasPointLayerElement,
} from '@/lib/d3-chart/layers/canvas-points';
import {
  classifyPointShape,
  hookPointFill,
  isPlainTransform,
  measurePointExtent,
  POINT_HOVER_EXTENT,
  type PointShape,
} from '@/components/effects/canvas-point-paint';
import { INK, MARKS, SERIES, STEAM, STEAMER_PATTERN, type ArtStroke } from './orange-chicken-art';
import { calmEnabled } from './orange-chicken-store';

const SVG_NS = 'http://www.w3.org/2000/svg';
const KEY_CLASS = 'oc-shape-key';
const SWEEP_CLASS = 'oc-sweep';
const FRAME_CLASS = 'oc-receipt';
const SWEEP_MS = 1300;
const HOLD_CLASS = 'oc-hold-skeleton';

/** Capture-only flag (?oc_hold=loading or ?oc_hold=sweep). Without it nothing here does anything. */
function holdFlag(): string {
  try {
    return new URLSearchParams(window.location.search).get('oc_hold') ?? '';
  } catch {
    return '';
  }
}
const POINT_SELECTOR = '.dot-group, .unofficial-overlay-pt';
const RING_COLOR = '#ffd23f';
const BAR_SELECTOR = 'rect.bar';
const TOOLTIP_SELECTOR = '[data-chart-tooltip]';
const TRACKED_SELECTOR = `${CANVAS_POINT_LAYER_SELECTOR}, ${POINT_SELECTOR}, ${BAR_SELECTOR}`;
const MARKER_CLASS = 'oc-marker';
const WEAVE_CLASS = 'oc-bar-weave';
const DEFS_CLASS = 'oc-defs';
const DECORATED = 'data-oc-decorated';
const EXPORT_SELECTOR = "[id$='-export']";
/** The selected form stays within a few pixels of the stock hover size: it lifts, it does not swell. */
const HOVER_SCALE = 1.04;
const HOVER_LIFT = 1.1;
const SELECT_GOLD = '#ffd23f';
const POP_MS = 700;
/** Plots narrower than this get smaller dishes so crowded points stay separate. */
const SMALL_PLOT = 460;
const BASE_SCALE = 1.05;
const SMALL_SCALE = 0.8;
/** Beyond this many points per frame the dishes drop their fine detail. */
const DETAIL_LIMIT = 1600;

export interface ChickenChartCallbacks {
  /** Localised label for the Nth tooltip a chart shows ("ORDER 12"). */
  orderLabel?: (n: number) => string;
  /** Localised wording for the menu key in the legend and the receipt frame on the PNG export. */
  words?: ChartWords;
  /** Called when the chart's highest series changes after the first draw (the leader). */
  onLeader?: (leader: { name: string; first: boolean }) => void;
  /** Called when a chart is exported as a PNG. */
  onExport?: () => void;
  /** Called when a chart shows its empty state. */
  onEmpty?: () => void;
}

export interface ChartWords {
  keyTitle: string;
  keyItems: [string, string, string, string];
  receiptTitle: string;
  receiptOrder: string;
  receiptThanks: string;
  receiptStamp: string;
}

interface Overlay {
  layer: CanvasPointLayerElement;
  host: HTMLElement;
  surface: HTMLCanvasElement | null;
  release: (() => void) | null;
  popAt: number;
  frameNow: number | undefined;
  frameActive: boolean;
  scale: number;
  count: number;
  lastCount: number;
  /** Highest point of the previous frame in canvas coordinates, and of the frame being drawn. */
  best: { e: number; f: number } | null;
  next: { e: number; f: number; extent: number } | null;
}

/** "Order up": a ring drawn around the highest point of the chart's canvas for a few seconds. */
const RING_MS = 3200;
let ringUntil = 0;
let ringKick: (() => void) | null = null;

/** Rings the highest canvas point of every chart on the page. False when no canvas chart is up. */
export function ringBestOrder(): boolean {
  if (!ringKick) return false;
  ringUntil = performance.now() + RING_MS;
  ringKick();
  return true;
}

function isActive(): boolean {
  const root = document.documentElement;
  return (
    root.classList.contains('orange-chicken') &&
    !Object.hasOwn(root.dataset, 'inferencexEmbed') &&
    !isEmbedPathname(window.location.pathname)
  );
}

function isMine(node: Node): boolean {
  return (
    node instanceof Element &&
    (node.classList.contains(MARKER_CLASS) ||
      node.classList.contains(WEAVE_CLASS) ||
      node.classList.contains(DEFS_CLASS) ||
      node.classList.contains(KEY_CLASS) ||
      node.classList.contains(SWEEP_CLASS) ||
      node.classList.contains(FRAME_CLASS) ||
      node.closest('.orange-chicken-scene, [data-testid="orange-chicken-theme-banner"]') !== null)
  );
}

const easeOutBack = (t: number) => {
  const c = 1.9;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

interface DishPaths {
  parts: { path: Path2D; stroke: ArtStroke }[];
  steam: Path2D[];
}

function strokeNode(stroke: ArtStroke): SVGPathElement {
  const node = document.createElementNS(SVG_NS, 'path');
  node.setAttribute('d', stroke.d);
  node.setAttribute('fill', stroke.fill ?? 'none');
  node.setAttribute('stroke', stroke.stroke ?? 'none');
  node.setAttribute('stroke-width', String(stroke.width ?? 0));
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  return node;
}

// Capture-only: a copy of the stock skeleton (same attributes and classes) held in front of the
// chart so the steam-table styling can be seen. It takes no pointer input and goes with the flag.
function holdLoading() {
  const held = document.querySelector(`.${HOLD_CLASS}`);
  const figure = document.querySelector('[data-testid="chart-figure"]');
  if (holdFlag() !== 'loading' || !figure?.parentElement) {
    held?.remove();
    return;
  }
  if (held) return;
  const copy = document.createElement('div');
  copy.dataset.slot = 'skeleton';
  copy.className = `bg-accent animate-pulse rounded-md h-[600px] w-full ${HOLD_CLASS}`;
  copy.setAttribute('aria-hidden', 'true');
  copy.style.pointerEvents = 'none';
  figure.parentElement.insertBefore(copy, figure);
}

export function mountChickenCharts(callbacks: ChickenChartCallbacks = {}): () => void {
  const overlays = new Map<Element, Overlay>();
  const markers = new Map<Element, SVGGElement>();
  const weaves = new Map<Element, SVGRectElement>();
  const defs = new Set<SVGDefsElement>();
  const tooltips = new Map<HTMLElement, number>();
  const extents = new WeakMap<Path2D, number>();
  const kinds = new WeakMap<Path2D, PointShape>();
  const dishes = new Map<PointShape, DishPaths>();
  let frame: number | undefined;
  let scanFrame: number | undefined;
  let disposed = false;

  const dishOf = (kind: PointShape): DishPaths => {
    let dish = dishes.get(kind);
    if (!dish) {
      dish = {
        parts: MARKS[kind].map((stroke) => ({ path: new Path2D(stroke.d), stroke })),
        steam: STEAM.map((d) => new Path2D(d)),
      };
      dishes.set(kind, dish);
    }
    return dish;
  };

  // --------------------------------------------------------------- canvas dishes
  const paintDish = (
    overlay: Overlay,
    context: CanvasRenderingContext2D,
    path: Path2D,
    fill: (path: Path2D) => void,
  ) => {
    if (overlay.frameNow === undefined) {
      overlay.frameNow = performance.now();
      overlay.frameActive = isActive();
      overlay.scale =
        (overlay.surface?.clientWidth ?? SMALL_PLOT) < SMALL_PLOT ? SMALL_SCALE : BASE_SCALE;
      queueMicrotask(() => {
        overlay.best = overlay.next ? { e: overlay.next.e, f: overlay.next.f } : null;
        overlay.next = null;
        overlay.lastCount = overlay.count;
        overlay.count = 0;
        overlay.frameNow = undefined;
      });
    }
    const t = context.getTransform();
    if (!overlay.frameActive || !isPlainTransform(t)) {
      fill(path);
      return;
    }
    overlay.count++;
    let extent = extents.get(path);
    if (extent === undefined) {
      extent = measurePointExtent(context, path, t);
      if (extent > 0) extents.set(path, extent);
    }
    if (extent <= 0) {
      fill(path);
      return;
    }
    let kind = kinds.get(path);
    if (kind === undefined) {
      kind = classifyPointShape(context, path, t, extent);
      kinds.set(path, kind);
    }
    const dish = dishOf(kind);
    const hovered = extent >= POINT_HOVER_EXTENT[kind];
    let pop = 1;
    let slide = 0;
    const elapsed = overlay.frameNow - overlay.popAt;
    if (elapsed < POP_MS + 400) {
      const width = overlay.surface?.width || 1;
      const progress = (elapsed - Math.min(1, Math.max(0, t.e / width)) * 400) / POP_MS;
      if (progress <= 0) return;
      pop = Math.max(0.01, easeOutBack(Math.min(1, progress)));
      slide = -((1 - Math.min(1, progress)) ** 2) * 22;
    }
    const scale = overlay.scale * (hovered ? HOVER_SCALE : 1) * pop;
    if (!overlay.next || t.f < overlay.next.f) overlay.next = { e: t.e, f: t.f, extent };
    const ringing =
      overlay.best !== null &&
      overlay.frameNow < ringUntil &&
      Math.abs(overlay.best.e - t.e) < 0.5 &&
      Math.abs(overlay.best.f - t.f) < 0.5;
    const { lineWidth, lineJoin, lineCap, strokeStyle, fillStyle } = context;
    const detail = overlay.lastCount <= DETAIL_LIMIT;
    // A new order arriving on the line: the dish slides in from the left on a short trail of steam.
    const arriving = elapsed < POP_MS + 400 && !calmEnabled();
    const lift = hovered ? HOVER_LIFT * scale : 0;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    if (hovered) {
      // Selected: the dish lifts off the counter, a soft shadow stays behind and a gold rim
      // marks it. The series colour is still the container.
      context.setTransform(t.a, 0, 0, t.d, t.e, t.f + 7.4 * scale);
      context.beginPath();
      context.ellipse(0, 0, 6 * scale, 1.6 * scale, 0, 0, Math.PI * 2);
      context.fillStyle = 'rgba(74, 30, 10, 0.32)';
      context.fill();
    }
    context.setTransform(t.a * scale, 0, 0, t.d * scale, t.e + slide, t.f - lift);
    context.fillStyle = fillStyle;
    for (const [index, { path: part, stroke }] of dish.parts.entries()) {
      if (!detail && !stroke.fill) continue;
      if (stroke.fill) {
        context.fillStyle = stroke.fill === SERIES ? fillStyle : stroke.fill;
        fill(part);
      }
      if (hovered && index === dish.parts.findIndex((entry) => entry.stroke.fill === SERIES)) {
        context.lineWidth = 2.1 / scale;
        context.strokeStyle = SELECT_GOLD;
        context.stroke(part);
      }
      if (stroke.stroke) {
        context.lineWidth = (stroke.width ?? 1) / scale;
        context.strokeStyle = stroke.stroke;
        context.stroke(part);
      }
    }
    if (hovered && detail) {
      context.lineWidth = 0.9 / scale;
      context.strokeStyle = 'rgba(255, 252, 240, 0.95)';
      for (const curl of dish.steam) context.stroke(curl);
    } else if (arriving && detail) {
      context.lineWidth = 0.8 / scale;
      context.strokeStyle = 'rgba(255, 252, 240, 0.8)';
      for (const curl of dish.steam) context.stroke(curl);
    }
    context.setTransform(t);
    if (ringing) {
      // Only an outline around the point: nothing under it or beside it is covered.
      const pulse = calmEnabled() ? 0 : (Math.sin(overlay.frameNow / 120) + 1) * 1.6;
      context.setTransform(t.a, 0, 0, t.d, t.e, t.f);
      context.beginPath();
      context.arc(0, 0, extent * scale + 5 + pulse, 0, Math.PI * 2);
      context.lineWidth = 2.5;
      context.strokeStyle = RING_COLOR;
      context.stroke();
      context.beginPath();
      context.arc(0, 0, extent * scale + 8.5 + pulse, 0, Math.PI * 2);
      context.lineWidth = 1;
      context.strokeStyle = INK;
      context.stroke();
    }
    context.fillStyle = fillStyle;
    context.lineWidth = lineWidth;
    context.lineJoin = lineJoin;
    context.lineCap = lineCap;
    context.strokeStyle = strokeStyle;
    context.setTransform(t);
  };

  const unhook = (overlay: Overlay) => {
    overlay.release?.();
    overlay.release = null;
    overlay.surface = null;
  };

  const redraw = (overlay: Overlay) => canvasPointLayerOf(overlay.layer)?.invalidate();

  const hook = (overlay: Overlay) => {
    const surface = overlay.host.querySelector<HTMLCanvasElement>(`.${CANVAS_POINT_SURFACE_CLASS}`);
    if (surface === overlay.surface) return;
    unhook(overlay);
    if (!surface) return;
    const release = hookPointFill(surface, (context, path, fill) =>
      paintDish(overlay, context, path, fill),
    );
    if (!release) return;
    overlay.surface = surface;
    overlay.release = release;
  };

  const tick = (now: number) => {
    frame = undefined;
    if (disposed) return;
    let again = false;
    for (const overlay of overlays.values()) {
      if (!overlay.layer.isConnected) continue;
      if (now - overlay.popAt > POP_MS + 500 && now > ringUntil) continue;
      hook(overlay);
      redraw(overlay);
      again = true;
    }
    if (again) frame = requestAnimationFrame(tick);
  };

  const kick = (overlay: Overlay) => {
    hook(overlay);
    redraw(overlay);
    if (frame === undefined && !disposed) frame = requestAnimationFrame(tick);
  };

  const addOverlay = (layer: CanvasPointLayerElement) => {
    const host = layer.ownerSVGElement?.parentElement;
    if (!host || typeof layer.scatterPoints !== 'function') return;
    const overlay: Overlay = {
      layer,
      host,
      surface: null,
      release: null,
      popAt: calmEnabled() ? -Infinity : performance.now(),
      frameNow: undefined,
      frameActive: false,
      scale: BASE_SCALE,
      count: 0,
      lastCount: 0,
      best: null,
      next: null,
    };
    overlays.set(layer, overlay);
    kick(overlay);
  };

  const removeOverlay = (overlay: Overlay) => {
    unhook(overlay);
    overlays.delete(overlay.layer);
    if (overlay.layer.isConnected) redraw(overlay);
  };

  // ------------------------------------------------------------------ SVG dishes
  const removeMarker = (point: Element) => {
    markers.get(point)?.remove();
    markers.delete(point);
    point.removeAttribute(DECORATED);
  };

  const decoratePoint = (point: Element) => {
    if (!(point instanceof SVGGElement)) return;
    const shape = point.querySelector<SVGElement>(':scope > .visible-shape');
    const existing = markers.get(point);
    if (existing?.parentNode === point && (!shape || existing.previousElementSibling === shape)) {
      return;
    }
    if (existing) removeMarker(point);
    const kind = (shape?.dataset.shapeKey as PointShape | undefined) ?? 'circle';
    const safe: PointShape = kind in MARKS ? kind : 'circle';
    const marker = document.createElementNS(SVG_NS, 'g');
    marker.setAttribute('class', MARKER_CLASS);
    marker.setAttribute('aria-hidden', 'true');
    marker.setAttribute('pointer-events', 'none');
    const fill = shape ? getComputedStyle(shape).fill : '';
    const series = fill && fill !== 'none' ? fill : 'currentColor';
    const art = document.createElementNS(SVG_NS, 'g');
    art.setAttribute('class', 'oc-marker-art');
    art.setAttribute('transform', `scale(${BASE_SCALE})`);
    for (const stroke of MARKS[safe]) {
      art.append(strokeNode(stroke.fill === SERIES ? { ...stroke, fill: series } : stroke));
    }
    marker.append(art);
    // Keep the chart's own shape, hit circle, data and handlers; draw the dish right above
    // the shape and below any label.
    if (shape) shape.after(marker);
    else {
      const anchor = point.querySelector(':scope > text') ?? pointLabelAnchor(point);
      if (anchor) anchor.before(marker);
      else point.append(marker);
    }
    point.setAttribute(DECORATED, '');
    markers.set(point, marker);
  };

  // ------------------------------------------------------------------ steamer bars
  let weaveSerial = 0;
  const ensureWeave = (svg: SVGSVGElement): string => {
    const existing = svg.querySelector(`:scope > defs.${DEFS_CLASS} > pattern`);
    if (existing) return existing.id;
    const holder = document.createElementNS(SVG_NS, 'defs');
    holder.setAttribute('class', DEFS_CLASS);
    const pattern = document.createElementNS(SVG_NS, 'pattern');
    const id = `oc-steamer-weave-${++weaveSerial}`;
    pattern.setAttribute('id', id);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', String(STEAMER_PATTERN.size));
    pattern.setAttribute('height', String(STEAMER_PATTERN.size));
    pattern.setAttribute('patternTransform', 'rotate(45)');
    for (const part of STEAMER_PATTERN.paths) {
      pattern.append(strokeNode({ d: part.d, stroke: part.stroke, width: part.width }));
    }
    holder.append(pattern);
    svg.prepend(holder);
    defs.add(holder);
    return id;
  };

  const syncBar = (bar: Element) => {
    const weave = weaves.get(bar);
    if (!weave) return;
    for (const name of ['x', 'y', 'width', 'height', 'rx', 'transform']) {
      const value = bar.getAttribute(name);
      if (value === null) weave.removeAttribute(name);
      else if (weave.getAttribute(name) !== value) weave.setAttribute(name, value);
    }
  };

  const decorateBar = (bar: Element) => {
    if (!(bar instanceof SVGRectElement) || !bar.ownerSVGElement) return;
    const existing = weaves.get(bar);
    if (existing?.previousElementSibling === bar) return;
    existing?.remove();
    const id = ensureWeave(bar.ownerSVGElement);
    const weave = document.createElementNS(SVG_NS, 'rect');
    weave.setAttribute('class', WEAVE_CLASS);
    weave.setAttribute('aria-hidden', 'true');
    weave.setAttribute('pointer-events', 'none');
    weave.setAttribute('fill', `url(#${id})`);
    weave.setAttribute('stroke', 'none');
    bar.after(weave);
    weaves.set(bar, weave);
    syncBar(bar);
  };

  const decorateWithin = (node: Element) => {
    if (node.matches(POINT_SELECTOR)) decoratePoint(node);
    else if (node.matches(BAR_SELECTOR)) decorateBar(node);
    if (node.firstElementChild) {
      node.querySelectorAll(POINT_SELECTOR).forEach(decoratePoint);
      node.querySelectorAll(BAR_SELECTOR).forEach(decorateBar);
    }
  };

  // ------------------------------------------------------------------ export
  // PNG export renders a clone that sits in the page for a moment and only copies a few
  // presentation attributes, so carry the gridline and axis styling across as inline styles.
  const EXPORT_STYLES: [string, string[]][] = [
    [
      '.chart-root :is(.grid, .grid-h, .grid-v) line',
      ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-opacity'],
    ],
    ['.chart-root .domain', ['stroke', 'stroke-width', 'stroke-linecap']],
    ['.chart-root .tick line', ['stroke', 'stroke-width']],
    [BAR_SELECTOR, ['stroke', 'stroke-width']],
  ];

  const styleExport = (root: Element) => {
    try {
      for (const [selector, properties] of EXPORT_STYLES) {
        root.querySelectorAll<SVGElement>(selector).forEach((element) => {
          const computed = getComputedStyle(element);
          for (const property of properties) {
            const value = computed.getPropertyValue(property);
            if (value) element.style.setProperty(property, value);
          }
        });
      }
    } catch {
      // Export still works without the extra styling.
    }
  };

  // ------------------------------------------------------------------ update sweep
  // When the points of a chart change (model, metric, filter) a warm band sweeps the plot once,
  // like the heat lamp passing along the line, and the new dishes slide in behind it.
  const sweeps = new Set<HTMLElement>();
  const sweep = (overlay: Overlay) => {
    const surface = overlay.surface;
    if (calmEnabled() || !surface) return;
    const hostBox = overlay.host.getBoundingClientRect();
    const box = surface.getBoundingClientRect();
    if (box.width < 220 || box.height < 140) return;
    for (const old of sweeps) old.remove();
    sweeps.clear();
    const band = document.createElement('div');
    band.className = `${SWEEP_CLASS} no-export`;
    band.setAttribute('aria-hidden', 'true');
    band.style.left = `${box.left - hostBox.left}px`;
    band.style.top = `${box.top - hostBox.top}px`;
    band.style.width = `${box.width}px`;
    band.style.height = `${box.height}px`;
    overlay.host.append(band);
    sweeps.add(band);
    const done = () => {
      band.remove();
      sweeps.delete(band);
    };
    if (holdFlag() === 'sweep') {
      // Capture flag: the band stays frozen halfway across the plot until the next change.
      band.dataset.hold = 'true';
      return;
    }
    band.addEventListener('animationend', done, { once: true });
    window.setTimeout(done, SWEEP_MS + 300);
  };

  // ------------------------------------------------------------------ legend key
  const keys = new Set<HTMLElement>();
  const decorateLegends = () => {
    const words = callbacks.words;
    if (!words) return;
    for (const panel of document.querySelectorAll<HTMLElement>(
      '[data-slot="chart-legend-wrapper"] [data-testid="chart-legend"]',
    )) {
      if (panel.closest(EXPORT_SELECTOR) || panel.querySelector(`:scope > .${KEY_CLASS}`)) continue;
      const key = document.createElement('div');
      key.className = `${KEY_CLASS} no-export`;
      key.setAttribute('role', 'group');
      key.setAttribute('aria-label', words.keyTitle);
      const title = document.createElement('span');
      title.className = 'oc-shape-key-title';
      title.textContent = words.keyTitle;
      key.append(title);
      for (const [index, shape] of (
        ['circle', 'square', 'triangle', 'diamond'] as const
      ).entries()) {
        const item = document.createElement('span');
        const icon = document.createElementNS(SVG_NS, 'svg');
        icon.setAttribute('viewBox', '-10 -10 20 20');
        icon.setAttribute('width', '22');
        icon.setAttribute('height', '22');
        icon.setAttribute('aria-hidden', 'true');
        for (const stroke of MARKS[shape]) {
          icon.append(strokeNode(stroke.fill === SERIES ? { ...stroke, fill: '#8a8f96' } : stroke));
        }
        item.append(icon, document.createTextNode(words.keyItems[index] ?? ''));
        key.append(item);
      }
      panel.prepend(key);
      keys.add(key);
    }
    for (const key of keys) if (!key.isConnected) keys.delete(key);
  };

  // ------------------------------------------------------------------ leader
  // The legend lists series from best to worst, so the first entry is the chart's leader.
  let leader: string | null = null;
  const checkLeader = () => {
    if (!callbacks.onLeader || document.hidden) return;
    const first = document.querySelector<HTMLElement>(
      '[data-slot="chart-legend-wrapper"] [data-testid^="legend-points-"]',
    );
    const id = first?.dataset.testid?.slice('legend-points-'.length);
    if (!id) return;
    const name = (id.split('_')[0] ?? id).toUpperCase();
    if (leader === name) return;
    const initial = leader === null;
    leader = name;
    if (!initial) callbacks.onLeader({ name, first: false });
  };
  const leaderTimer = window.setInterval(checkLeader, 1500);

  // Points that leave or return (a filter, a precision, a metric) change the count drawn on the
  // plot without any new point entering, so the sweep also follows the drawn count.
  let drawn = -1;
  const checkDrawn = () => {
    if (document.hidden || overlays.size === 0) return;
    let count = 0;
    for (const hit of document.querySelectorAll('path.dot-hit-area')) {
      count += ((hit.getAttribute('d') ?? '').match(/a/gu) ?? []).length;
    }
    const before = drawn;
    drawn = count;
    const first = overlays.values().next().value;
    if (before >= 0 && before !== count && first) sweep(first);
  };
  const drawnTimer = window.setInterval(checkDrawn, 400);

  // ------------------------------------------------------------------ receipt frame (PNG export)
  let exporting: Element | null = null;
  const frameExport = (clone: Element) => {
    const words = callbacks.words;
    if (!words || !(clone instanceof HTMLElement) || clone.querySelector(`.${FRAME_CLASS}`)) return;
    const now = new Date();
    const order = String((now.getMinutes() * 60 + now.getSeconds()) % 1000).padStart(3, '0');
    const stamp = `${words.receiptOrder} ${order} · ${now.toISOString().slice(0, 10)}`;
    const zigzag =
      'linear-gradient(135deg, var(--oc-lacquer, #a82a14) 25%, transparent 25%) -6px 0 / 12px 12px, linear-gradient(225deg, var(--oc-lacquer, #a82a14) 25%, transparent 25%) -6px 0 / 12px 12px';
    const head = document.createElement('div');
    head.className = FRAME_CLASS;
    head.setAttribute('aria-hidden', 'true');
    head.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px;padding:8px 14px;background:#a82a14;color:#fff6e6;border-radius:8px;font:700 13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;';
    const left = document.createElement('span');
    left.textContent = words.receiptTitle;
    const right = document.createElement('span');
    right.style.cssText = 'display:flex;align-items:center;gap:10px;white-space:nowrap;';
    const seal = document.createElement('span');
    seal.textContent = words.receiptStamp;
    seal.style.cssText =
      'display:inline-block;padding:2px 8px;border:2px solid #ffd23f;border-radius:6px;color:#ffd23f;transform:rotate(-4deg);';
    const num = document.createElement('span');
    num.textContent = stamp;
    right.append(num, seal);
    head.append(left, right);
    const foot = document.createElement('div');
    foot.className = FRAME_CLASS;
    foot.setAttribute('aria-hidden', 'true');
    foot.style.cssText =
      'margin:12px 0 0;padding:8px 0 0;border-top:2px dashed #a82a14;text-align:center;color:#a82a14;font:700 12px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;';
    foot.textContent = words.receiptThanks;
    const edge = document.createElement('div');
    edge.className = FRAME_CLASS;
    edge.setAttribute('aria-hidden', 'true');
    edge.style.cssText = `height:10px;margin-top:6px;background:${zigzag};background-repeat:repeat-x;background-position:0 0;`;
    clone.prepend(head);
    clone.append(foot, edge);
    exporting = clone;
  };

  // ------------------------------------------------------------------ scanning
  const scan = () => {
    scanFrame = undefined;
    if (disposed) return;
    const active = isActive();
    for (const overlay of overlays.values()) {
      if (!overlay.layer.isConnected || !active) removeOverlay(overlay);
    }
    for (const [point] of markers) if (!point.isConnected || !active) removeMarker(point);
    for (const [bar, weave] of weaves) {
      if (!bar.isConnected || !active) {
        weave.remove();
        weaves.delete(bar);
      }
    }
    for (const holder of defs) if (!holder.isConnected) defs.delete(holder);
    for (const [tooltip] of tooltips) if (!tooltip.isConnected) tooltips.delete(tooltip);
    if (!active) return;
    document
      .querySelectorAll<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR)
      .forEach((layer) => {
        if (!overlays.has(layer)) addOverlay(layer);
      });
    decorateWithin(document.body);
    decorateLegends();
    holdLoading();
  };

  const scheduleScan = () => {
    if (scanFrame === undefined && !disposed) scanFrame = requestAnimationFrame(scan);
  };

  const bumpTooltip = (tooltip: HTMLElement) => {
    const step = (tooltips.get(tooltip) ?? 0) + 1;
    tooltips.set(tooltip, step);
    const label = (callbacks.orderLabel?.(step) ?? `ORDER ${step}`).replaceAll(/["\\]/gu, '');
    tooltip.style.setProperty('--oc-order', `"${label}"`);
  };

  const observer = new MutationObserver((records) => {
    if (!isActive()) {
      scheduleScan();
      return;
    }
    let rescan = false;
    const bumped = new Set<HTMLElement>();
    for (const record of records) {
      const { target } = record;
      if (record.type === 'attributes') {
        if (!(target instanceof Element)) continue;
        if (record.attributeName === 'data-points-joined') {
          const overlay = overlays.get(target);
          if (overlay) {
            overlay.popAt = calmEnabled() ? -Infinity : performance.now();
            kick(overlay);
            sweep(overlay);
          } else {
            rescan = true;
          }
        } else if (record.attributeName === 'fill') {
          if (weaves.has(target)) continue;
          const point = target.parentElement;
          if (point && markers.has(point) && target.classList.contains('visible-shape')) {
            removeMarker(point);
            decoratePoint(point);
          }
        } else if (weaves.has(target)) syncBar(target);
        continue;
      }
      // Decorate inserted SVG points in this same task: PNG export renders its clone and
      // captures it before the next animation frame.
      for (const node of record.addedNodes) {
        if (!(node instanceof Element) || isMine(node)) continue;
        decorateWithin(node);
        if (node.closest(EXPORT_SELECTOR)) styleExport(node);
        if (node.parentElement?.matches(EXPORT_SELECTOR) && node.matches('figure, div')) {
          frameExport(node);
        }
        if (
          node.matches('[data-testid="scatter-empty-state"]') ||
          node.querySelector('[data-testid="scatter-empty-state"]')
        ) {
          callbacks.onEmpty?.();
        }
        if (
          node.matches('[data-slot="chart-legend-wrapper"]') ||
          node.querySelector('[data-slot="chart-legend-wrapper"]')
        ) {
          rescan = true;
        }
        if (
          node.matches(CANVAS_POINT_LAYER_SELECTOR) ||
          node.querySelector(CANVAS_POINT_LAYER_SELECTOR)
        ) {
          rescan = true;
        }
        if (target instanceof Element) {
          if (target.matches(POINT_SELECTOR)) decoratePoint(target);
          const tooltip = target.closest<HTMLElement>(TOOLTIP_SELECTOR);
          if (tooltip) bumped.add(tooltip);
        }
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) continue;
        if (exporting && node === exporting) {
          exporting = null;
          callbacks.onExport?.();
        }
        if (
          node.classList.contains(MARKER_CLASS) ||
          node.classList.contains(WEAVE_CLASS) ||
          node.classList.contains(DEFS_CLASS)
        ) {
          // The chart re-rendered a point or bar and dropped our node with it.
          if (target instanceof Element && target.isConnected) decorateWithin(target);
        } else if (
          !isMine(node) &&
          (node.matches(TRACKED_SELECTOR) || node.querySelector(TRACKED_SELECTOR) !== null)
        ) {
          rescan = true;
        }
      }
    }
    for (const tooltip of bumped) bumpTooltip(tooltip);
    if (rescan) scheduleScan();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-points-joined', 'fill', 'x', 'y', 'width', 'height'],
  });

  const themeObserver = new MutationObserver(scheduleScan);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-inferencex-embed'],
  });

  scan();
  ringKick = () => {
    for (const overlay of overlays.values()) kick(overlay);
  };

  return () => {
    disposed = true;
    ringKick = null;
    ringUntil = 0;
    observer.disconnect();
    themeObserver.disconnect();
    window.clearInterval(leaderTimer);
    window.clearInterval(drawnTimer);
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (scanFrame !== undefined) cancelAnimationFrame(scanFrame);
    for (const overlay of overlays.values()) removeOverlay(overlay);
    for (const [point] of markers) removeMarker(point);
    for (const band of sweeps) band.remove();
    sweeps.clear();
    document.querySelector(`.${HOLD_CLASS}`)?.remove();
    for (const key of keys) key.remove();
    keys.clear();
    for (const [, weave] of weaves) weave.remove();
    weaves.clear();
    for (const holder of defs) holder.remove();
    defs.clear();
    for (const [tooltip] of tooltips) tooltip.style.removeProperty('--oc-order');
    tooltips.clear();
  };
}
