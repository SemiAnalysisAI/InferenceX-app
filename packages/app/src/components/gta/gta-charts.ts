/**
 * Chart integration for the GTA theme. Everything here decorates what the charts already draw
 * and never changes data, scales, hit areas or event handlers:
 *
 * - canvas scatter points are painted as map icons by the chart's own draw loop (its `fill`
 *   call is wrapped), so they keep their colour, opacity and every animated frame. Each point
 *   shape maps to its own icon (mission marker, safehouse, wanted star, weapon pickup), so the
 *   encoding the shape carries survives;
 * - SVG points (`.dot-group`, used by smaller charts and by PNG export) get the same blip;
 * - bars get the segmented look of the pause menu's stat bars;
 * - a chart that mounts or changes subject is swept in from the left like a radar ping;
 * - chart tooltips get a numbered blip tag;
 * - the PNG export clone gets the map grid and frame as inline styles;
 * - `runGtaTrain` sends a freight train along a Pareto frontier line the chart has drawn.
 *
 * `mountGtaCharts` returns a cleanup that removes every node, class, property and listener.
 */
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
  CANVAS_UNDERLAY_ATTRIBUTE,
  canvasPointLayerOf,
} from '@/lib/d3-chart/layers/canvas-point-registry';
import {
  CANVAS_POINT_SURFACE_CLASS,
  type CanvasPointLayerElement,
} from '@/lib/d3-chart/layers/canvas-points';
import { pointLabelAnchor } from '@/lib/d3-chart/layers/point-label-order';
import { plotBounds } from '@/lib/d3-chart/plot-bounds';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { getGtaState, prefersReducedMotion, subscribeGta, type GtaCharacter } from './gta-store';

const SVG_NS = 'http://www.w3.org/2000/svg';
const POINT_SELECTOR = '.dot-group, .unofficial-overlay-pt';
const BAR_SELECTOR = 'rect.bar';
const EMPTY_SELECTOR = "[data-testid='scatter-empty-state']";
const TOOLTIP_SELECTOR = '[data-chart-tooltip]';
const TRACKED_SELECTOR = `${CANVAS_POINT_LAYER_SELECTOR}, ${POINT_SELECTOR}, ${BAR_SELECTOR}`;
const EXPORT_SELECTOR = "[id$='-export']";
const MARKER_CLASS = 'gta-blip-marker';
const SEGMENT_CLASS = 'gta-bar-segments';
const FRAME_CLASS = 'gta-plot-frame';
const DEFS_CLASS = 'gta-defs';
const SWEEP_CLASS = 'gta-sweeping';
const PATTERN_ID = 'gta-stat-segments';
const INK = 'rgba(0, 0, 0, 0.9)';
const HALO = 'rgba(255, 255, 255, 0.28)';
const TRAIN_CLASS = 'gta-train';
const BLIP_RADIUS = 6;
/** Plots narrower than this get smaller blips so crowded points stay separate. */
const SMALL_PLOT = 460;
const SMALL_BLIP_RADIUS = 4.4;
/** The selected blip's white map-selection rim, in px beyond the icon's outline. */
const SELECT_RIM = 2.2;
/** The selected blip may reach this far past the chart's own hovered point, rim included. */
const SELECT_ALLOWANCE = 4;
const SWEEP_CLASS_LINE = 'gta-sweep-line';
const STAMP_CLASS = 'gta-export-stamp';
/** `?gta_hold=sweep` plays the radar sweep five times slower, for a still of it. */
const SWEEP_MS =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('gta_hold') === 'sweep'
    ? 4500
    : 900;
const POP_MS = 240;
const DETAIL_LIMIT = 1800;

/**
 * Map icons drawn around the data point, one per point shape the charts use, so the encoding
 * the shape carries stays readable: the lettered mission marker (circle), the safehouse
 * (square), the wanted star (triangle) and the weapon pickup (diamond). Original outlines in
 * the manner of the game's map legend, sized to read at 1x; each is filled with the series
 * colour and rimmed in black.
 */
const BLIP_OUTLINES: Record<PointShape, string> = {
  circle: 'M0 -6.7A6.7 6.7 0 1 1 0 6.7A6.7 6.7 0 1 1 0 -6.7Z',
  square: 'M0 -7.6L7.8 -1H5.6V6.6H-5.6V-1H-7.8Z',
  triangle:
    'M0 -7.6L2.1 -2.3L7.8 -1.9L3.4 1.7L4.8 7.2L0 4.2L-4.8 7.2L-3.4 1.7L-7.8 -1.9L-2.1 -2.3Z',
  diamond:
    'M-8.2 -5.2H6.8Q8.2 -5.2 8.2 -3.8V-1.2H3.6L5.8 6.2H0.6L-1.2 1H-3.8Q-4.8 1 -5.1 0L-5.5 -1.2H-8.2Z',
};
/** Black detail on each icon: the door, the pistol's slide and trigger guard. */
const BLIP_INKS: Record<Exclude<PointShape, 'circle'>, string> = {
  square: 'M-1.7 6.6V2.2H1.7V6.6',
  triangle: '',
  diamond: 'M-6.6 -3.1H6.6M-0.6 1.2Q0 3.6 2.6 3',
};
/** The mission marker carries the initial of the character in play, as on the game's map. */
const MISSION_LETTERS: Record<GtaCharacter, string> = {
  franklin: 'M-2 3.5V-3.5H2.5M-2 0H1.6',
  michael: 'M-3 3.5V-3.5L0 1L3 -3.5V3.5',
  trevor: 'M-3 -3.5H3M0 -3.5V3.5',
};
/** How far each icon's outline reaches from the data point, in its own units. */
const BLIP_REACH: Record<PointShape, number> = {
  circle: 6.7,
  square: 7.9,
  triangle: 7.9,
  diamond: 9.8,
};
const inkOf = (kind: PointShape, character: GtaCharacter): string =>
  kind === 'circle' ? MISSION_LETTERS[character] : BLIP_INKS[kind];

export interface GtaChartCallbacks {
  /** A chart started its radar sweep. */
  onSweep?: (svg: SVGSVGElement) => void;
  /** A scatter chart with no points scrolled into view. */
  onEmpty?: (element: Element) => void;
  /** Caption for the Nth tooltip a chart shows. */
  blipLabel?: (count: number) => string;
  /** A chart tooltip appeared for a new point. */
  onInspect?: () => void;
  /** A PNG export clone was styled. */
  onExport?: () => void;
  /** Caption of the radar sweep for a chart with that many points. */
  sweepLabel?: (count: number) => string;
  /** The two lines stamped on a PNG export that carries that many points. */
  exportStamp?: (count: number) => readonly [string, string];
}

interface Overlay {
  layer: CanvasPointLayerElement;
  svg: SVGSVGElement;
  host: HTMLElement;
  /** The chart's own point canvas while its context is wrapped. */
  surface: HTMLCanvasElement | null;
  release: (() => void) | null;
  sweepAt: number;
  subject: string;
  /** Points painted in the frame being drawn, and in the frame before it. */
  count: number;
  lastCount: number;
  frameNow: number | undefined;
  frameActive: boolean;
  radius: number;
}

function isActive(): boolean {
  const root = document.documentElement;
  return (
    root.classList.contains('gta') &&
    !Object.hasOwn(root.dataset, 'inferencexEmbed') &&
    !isEmbedPathname(window.location.pathname)
  );
}

function subjectOf(svg: SVGSVGElement): string {
  return svg.closest('figure')?.querySelector('figcaption')?.textContent ?? '';
}

function isMine(node: Node): boolean {
  return (
    node instanceof Element &&
    (node.classList.contains(MARKER_CLASS) ||
      node.classList.contains(SEGMENT_CLASS) ||
      node.classList.contains(FRAME_CLASS) ||
      node.classList.contains(SWEEP_CLASS_LINE) ||
      node.classList.contains(STAMP_CLASS) ||
      node.classList.contains(DEFS_CLASS) ||
      node.classList.contains(TRAIN_CLASS) ||
      node.closest(`.${TRAIN_CLASS}`) !== null ||
      node.closest('.gta-scene, .gta-site-hud, [data-testid="gta-theme-banner"]') !== null)
  );
}

export function mountGtaCharts(callbacks: GtaChartCallbacks = {}): () => void {
  const overlays = new Map<Element, Overlay>();
  const markers = new Map<Element, SVGGElement>();
  const segments = new Map<Element, SVGRectElement>();
  const defs = new Set<SVGDefsElement>();
  const tooltips = new Map<HTMLElement, number>();
  const emptied = new WeakSet<Element>();
  const sweepTimers = new Map<HTMLElement, number>();
  const extents = new WeakMap<Path2D, number>();
  const reaches = new WeakMap<Path2D, number>();
  const sweepLines = new Map<HTMLElement, HTMLElement>();
  const kinds = new WeakMap<Path2D, PointShape>();
  const blips = new Map<PointShape, { outline: Path2D; ink: Path2D }>();
  let character = getGtaState().character;
  const blipOf = (kind: PointShape) => {
    let blip = blips.get(kind);
    if (!blip) {
      blip = { outline: new Path2D(BLIP_OUTLINES[kind]), ink: new Path2D(inkOf(kind, character)) };
      blips.set(kind, blip);
    }
    return blip;
  };
  /** The farthest the chart's own path reaches from the point, in px, in any direction. */
  const reachOf = (context: CanvasRenderingContext2D, path: Path2D, t: DOMMatrix): number => {
    let reach = reaches.get(path);
    if (reach !== undefined) return reach;
    reach = 0;
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (let r = 0.5; r <= 16; r += 0.5) {
        if (!context.isPointInPath(path, t.e + cos * r * t.a, t.f + sin * r * t.d)) break;
        if (r > reach) reach = r;
      }
    }
    reaches.set(path, reach);
    return reach;
  };
  let frame: number | undefined;
  let scanFrame: number | undefined;
  let disposed = false;
  let inspected = 0;

  // ------------------------------------------------------------ canvas blips
  // Painted inside the chart's own draw loop (see canvas-point-paint), so a blip keeps the
  // point's frame, animated position, colour, opacity, fade and hover size.
  const paintBlip = (
    overlay: Overlay,
    context: CanvasRenderingContext2D,
    path: Path2D,
    fill: (path: Path2D) => void,
  ) => {
    if (overlay.frameNow === undefined) {
      overlay.frameNow = performance.now();
      overlay.frameActive = isActive();
      const small = (overlay.surface?.clientWidth ?? SMALL_PLOT) < SMALL_PLOT;
      overlay.radius = small ? SMALL_BLIP_RADIUS : BLIP_RADIUS;
      queueMicrotask(() => {
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
      // A canvas that has no size yet measures nothing; ask again on the next frame.
      if (extent > 0) extents.set(path, extent);
    }
    if (extent <= 0) {
      fill(path);
      return;
    }
    const alpha = context.globalAlpha;
    let shown = alpha;
    let pop = 1;
    const elapsed = overlay.frameNow - overlay.sweepAt;
    if (elapsed < SWEEP_MS + POP_MS) {
      // The sweep crosses the plot left to right; each blip pops as the line passes it.
      const width = overlay.surface?.width || 1;
      const progress = (elapsed - Math.min(1, Math.max(0, t.e / width)) * SWEEP_MS) / POP_MS;
      if (progress <= 0) return;
      const eased = Math.min(1, progress);
      pop = 1 + (1 - eased) * 0.9;
      shown *= eased;
    }
    let kind = kinds.get(path);
    if (kind === undefined) {
      kind = classifyPointShape(context, path, t, extent);
      kinds.set(path, kind);
    }
    const blip = blipOf(kind);
    const hovered = extent >= POINT_HOVER_EXTENT[kind];
    // The hovered or pinned blip is the selected blip of the map screen: the same icon in the
    // series colour inside a white selection rim. Rim included it reaches at most
    // SELECT_ALLOWANCE px past the chart's own hovered point.
    const scale =
      (hovered
        ? Math.max(
            0.6,
            (Math.max(extent, reachOf(context, path, t)) + SELECT_ALLOWANCE - SELECT_RIM) /
              BLIP_REACH[kind],
          )
        : overlay.radius / BLIP_RADIUS) * pop;
    const { lineWidth, lineJoin, lineCap, strokeStyle } = context;
    context.setTransform(t.a * scale, 0, 0, t.d * scale, t.e, t.f);
    context.globalAlpha = shown;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    const detailed = overlay.lastCount <= DETAIL_LIMIT;
    if (hovered) {
      context.lineWidth = (SELECT_RIM * 2) / scale;
      context.strokeStyle = '#ffffff';
      context.stroke(blip.outline);
    } else if (detailed) {
      // A faint light rim keeps the black blip border visible on the dark map.
      context.lineWidth = 3.4 / scale;
      context.strokeStyle = HALO;
      context.stroke(blip.outline);
    }
    fill(blip.outline);
    context.lineWidth = (overlay.radius < BLIP_RADIUS ? 1.1 : 1.5) / scale;
    context.strokeStyle = INK;
    context.stroke(blip.outline);
    if (detailed) {
      // The black detail is cut at a fixed weight so it stays legible when the icon grows, and
      // a little lighter on the small icons of a narrow plot.
      context.lineJoin = 'miter';
      context.lineCap = 'butt';
      context.lineWidth = (overlay.radius < BLIP_RADIUS ? 1.25 : 1.5) / scale;
      context.stroke(blip.ink);
    }
    context.lineWidth = lineWidth;
    context.lineJoin = lineJoin;
    context.lineCap = lineCap;
    context.strokeStyle = strokeStyle;
    context.setTransform(t);
    context.globalAlpha = alpha;
  };

  const unhook = (overlay: Overlay) => {
    overlay.release?.();
    overlay.release = null;
    overlay.surface = null;
  };

  const hook = (overlay: Overlay) => {
    const surface = overlay.host.querySelector<HTMLCanvasElement>(`.${CANVAS_POINT_SURFACE_CLASS}`);
    if (surface === overlay.surface) return;
    unhook(overlay);
    if (!surface) return;
    const release = hookPointFill(surface, (context, path, fill) =>
      paintBlip(overlay, context, path, fill),
    );
    if (!release) return;
    overlay.surface = surface;
    overlay.release = release;
  };

  const redraw = (overlay: Overlay) => canvasPointLayerOf(overlay.layer)?.invalidate();

  const tick = (now: number) => {
    frame = undefined;
    if (disposed) return;
    let again = false;
    for (const overlay of overlays.values()) {
      if (!overlay.layer.isConnected || now - overlay.sweepAt > SWEEP_MS + POP_MS + 60) continue;
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

  const removeSweepLine = (host: HTMLElement) => {
    sweepLines.get(host)?.remove();
    sweepLines.delete(host);
  };

  /**
   * The sweep itself: a bright line crossing the plot once, with the count of blips it found
   * in a tab just above the plot. The line stays inside the plot bounds; neither takes
   * pointer input and both are removed when the sweep ends.
   */
  const addSweepLine = (overlay: Overlay) => {
    const { host, svg } = overlay;
    removeSweepLine(host);
    const bounds = plotBounds(svg);
    if (!bounds) return;
    const box = host.getBoundingClientRect();
    const line = document.createElement('div');
    line.className = SWEEP_CLASS_LINE;
    line.setAttribute('aria-hidden', 'true');
    line.style.left = `${bounds.left - box.left}px`;
    line.style.top = `${bounds.top - box.top}px`;
    line.style.width = `${bounds.right - bounds.left}px`;
    line.style.height = `${bounds.bottom - bounds.top}px`;
    line.style.setProperty('--gta-sweep-ms', `${SWEEP_MS}ms`);
    const count = overlay.layer.scatterPoints?.().filter((point) => point.opacity > 0).length ?? 0;
    const label = callbacks.sweepLabel?.(count);
    // The count sits above the plot's left corner, clear of the plot, and only where the plot
    // is wide enough that it cannot reach the zoom hint on the right.
    if (label && bounds.right - bounds.left >= 560) {
      const tab = document.createElement('span');
      tab.textContent = label;
      line.append(tab);
    }
    line.append(document.createElement('i'));
    host.append(line);
    sweepLines.set(host, line);
  };

  const startSweep = (overlay: Overlay) => {
    overlay.subject = subjectOf(overlay.svg);
    if (prefersReducedMotion()) {
      overlay.sweepAt = -Infinity;
      kick(overlay);
      return;
    }
    overlay.sweepAt = performance.now();
    const { host } = overlay;
    host.classList.remove(SWEEP_CLASS);
    // Restart the CSS animation when a sweep interrupts another.
    void host.offsetWidth;
    host.classList.add(SWEEP_CLASS);
    addSweepLine(overlay);
    window.clearTimeout(sweepTimers.get(host));
    sweepTimers.set(
      host,
      window.setTimeout(() => {
        host.classList.remove(SWEEP_CLASS);
        removeSweepLine(host);
        sweepTimers.delete(host);
      }, SWEEP_MS + POP_MS),
    );
    callbacks.onSweep?.(overlay.svg);
    kick(overlay);
  };

  const addOverlay = (layer: CanvasPointLayerElement) => {
    const svg = layer.ownerSVGElement;
    const host = svg?.parentElement;
    if (!svg || !host || typeof layer.scatterPoints !== 'function') return;
    const overlay: Overlay = {
      layer,
      svg,
      host,
      surface: null,
      release: null,
      sweepAt: -Infinity,
      subject: '',
      count: 0,
      lastCount: 0,
      frameNow: undefined,
      frameActive: false,
      radius: BLIP_RADIUS,
    };
    overlays.set(layer, overlay);
    startSweep(overlay);
  };

  const removeOverlay = (overlay: Overlay) => {
    unhook(overlay);
    overlay.host.classList.remove(SWEEP_CLASS);
    removeSweepLine(overlay.host);
    window.clearTimeout(sweepTimers.get(overlay.host));
    sweepTimers.delete(overlay.host);
    overlays.delete(overlay.layer);
    // Repaint without blips.
    if (overlay.layer.isConnected) redraw(overlay);
  };

  // ------------------------------------------------------------ SVG blips
  const removeMarker = (point: Element) => {
    markers.get(point)?.remove();
    markers.delete(point);
  };

  const decoratePoint = (point: Element) => {
    if (!(point instanceof SVGGElement)) return;
    const shape = point.querySelector<SVGElement>(':scope > .visible-shape');
    const existing = markers.get(point);
    if (existing?.parentNode === point && (!shape || existing.previousElementSibling === shape)) {
      return;
    }
    if (existing) removeMarker(point);
    const marker = document.createElementNS(SVG_NS, 'g');
    marker.setAttribute('class', MARKER_CLASS);
    marker.setAttribute('aria-hidden', 'true');
    marker.setAttribute('pointer-events', 'none');
    const fill = shape ? getComputedStyle(shape).fill : '';
    const key = shape?.dataset.shapeKey as PointShape | undefined;
    const kind: PointShape = key && key in BLIP_OUTLINES ? key : 'circle';
    const piece = (d: string, stroke: string, width: string) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', stroke);
      path.setAttribute('stroke-width', width);
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-linecap', 'round');
      return path;
    };
    const halo = piece(BLIP_OUTLINES[kind], HALO, '3.4');
    const body = piece(BLIP_OUTLINES[kind], INK, '1.5');
    body.setAttribute('fill', fill && fill !== 'none' ? fill : 'currentColor');
    marker.append(halo, body);
    const detail = inkOf(kind, character);
    if (detail) {
      const ink = piece(detail, INK, '1.5');
      ink.setAttribute('stroke-linejoin', 'miter');
      ink.setAttribute('stroke-linecap', 'butt');
      marker.append(ink);
    }
    // Keep the chart's own shape, hit circle, data and handlers; draw the blip right above the
    // shape and below any label.
    if (shape) shape.after(marker);
    else {
      const anchor = point.querySelector(':scope > text') ?? pointLabelAnchor(point);
      if (anchor) anchor.before(marker);
      else point.append(marker);
    }
    markers.set(point, marker);
  };

  // ------------------------------------------------------------ stat bars
  // One pattern pair per chart, each with its own id: ids are document-wide, and the export
  // clone of a chart must not resolve to (or shadow) the pattern of the chart on screen.
  let patternSerial = 0;
  const ensurePatterns = (svg: SVGSVGElement): string => {
    const existing = svg.querySelector<SVGDefsElement>(`:scope > defs.${DEFS_CLASS}`);
    if (existing?.dataset.gtaPattern) return existing.dataset.gtaPattern;
    const holder = document.createElementNS(SVG_NS, 'defs');
    holder.setAttribute('class', DEFS_CLASS);
    const id = `${PATTERN_ID}-${++patternSerial}`;
    holder.dataset.gtaPattern = id;
    const build = (suffix: string, sideways: boolean) => {
      const pattern = document.createElementNS(SVG_NS, 'pattern');
      pattern.setAttribute('id', `${id}-${suffix}`);
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('width', sideways ? '34' : '8');
      pattern.setAttribute('height', sideways ? '8' : '34');
      // The dark notch between two segments of a stat bar, and a lit top edge.
      const notch = document.createElementNS(SVG_NS, 'path');
      notch.setAttribute('d', sideways ? 'M33 0V8' : 'M0 33H8');
      notch.setAttribute('stroke', 'rgba(0, 0, 0, 0.62)');
      notch.setAttribute('stroke-width', '2');
      const lit = document.createElementNS(SVG_NS, 'path');
      lit.setAttribute('d', sideways ? 'M0 0.5H32' : 'M0.5 0V32');
      lit.setAttribute('stroke', 'rgba(255, 255, 255, 0.22)');
      lit.setAttribute('stroke-width', '1');
      pattern.append(notch, lit);
      holder.append(pattern);
    };
    build('h', true);
    build('v', false);
    svg.prepend(holder);
    defs.add(holder);
    return id;
  };

  /** True when the bars of this chart grow sideways (they share a left edge). */
  const isHorizontal = (bar: SVGRectElement): boolean => {
    for (const other of bar.parentElement?.querySelectorAll(`:scope > ${BAR_SELECTOR}`) ?? []) {
      if (other !== bar) return other.getAttribute('x') === bar.getAttribute('x');
    }
    return Number(bar.getAttribute('width')) >= Number(bar.getAttribute('height'));
  };

  const syncBar = (bar: Element) => {
    const overlay = segments.get(bar);
    if (!overlay) return;
    for (const name of ['x', 'y', 'width', 'height', 'rx', 'transform']) {
      const value = bar.getAttribute(name);
      if (value === null) overlay.removeAttribute(name);
      else if (overlay.getAttribute(name) !== value) overlay.setAttribute(name, value);
    }
  };

  const decorateBar = (bar: Element) => {
    if (!(bar instanceof SVGRectElement) || !bar.ownerSVGElement) return;
    const existing = segments.get(bar);
    if (existing?.previousElementSibling === bar) return;
    existing?.remove();
    const id = ensurePatterns(bar.ownerSVGElement);
    const overlay = document.createElementNS(SVG_NS, 'rect');
    overlay.setAttribute('class', SEGMENT_CLASS);
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('pointer-events', 'none');
    overlay.setAttribute('fill', `url(#${id}-${isHorizontal(bar) ? 'h' : 'v'})`);
    overlay.setAttribute('stroke', 'none');
    bar.after(overlay);
    segments.set(bar, overlay);
    syncBar(bar);
  };

  // ------------------------------------------------------------ export
  // PNG export renders a clone of the chart that sits in the page for a moment. The pipeline
  // only copies stroke colours, so carry the map styling of the frame and grid across as
  // inline styles, and close the plot frame, before the clone is captured.
  const EXPORT_STYLES: [string, string[]][] = [
    [
      '.chart-root :is(.grid, .grid-h, .grid-v) line',
      ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap'],
    ],
    ['.chart-root .domain', ['stroke', 'stroke-width', 'stroke-linecap']],
    ['.chart-root .tick line', ['stroke', 'stroke-width']],
    [BAR_SELECTOR, ['stroke', 'stroke-width']],
    [
      '.chart-root :is(.roofline-path, .overlay-roofline-path, .global-pareto-frontier)',
      ['stroke-width', 'stroke-linejoin', 'stroke-linecap', 'stroke-dasharray'],
    ],
  ];

  /**
   * The "mission passed" stamp of a PNG export: two lines in the empty top right corner of
   * the exported card, level with its heading and above the plot and the legend, so it covers
   * no data, axis, legend entry or watermark. It lives in the export clone and goes with it.
   */
  const stampExport = (root: Element) => {
    const holder = root.closest<HTMLElement>(EXPORT_SELECTOR);
    if (!(root instanceof HTMLElement) || !holder || root.parentElement !== holder) return;
    if (holder.querySelector(`.${STAMP_CLASS}`)) return;
    if (!root.querySelector('svg[data-testid="d3-chart-svg"]')) return;
    // The number on the stamp is the number of points the chart being exported shows.
    const live = document.querySelector(`#${CSS.escape(holder.id.replace(/-export$/u, ''))}`);
    const layer = live?.querySelector<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR);
    const count =
      layer?.scatterPoints?.().filter((point) => point.opacity > 0).length ??
      root.querySelectorAll(`${POINT_SELECTOR}, ${BAR_SELECTOR}`).length;
    const lines = callbacks.exportStamp?.(count);
    if (!lines) return;
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
    const stamp = document.createElement('div');
    stamp.className = STAMP_CLASS;
    stamp.setAttribute('aria-hidden', 'true');
    stamp.style.cssText =
      'position:absolute;top:0;right:0;display:flex;flex-direction:column;align-items:flex-end;' +
      'gap:2px;padding:4px 10px 5px 14px;border-right:4px solid #f0c850;' +
      'background:rgba(0,0,0,0.72);pointer-events:none;white-space:nowrap;line-height:1.05;';
    const title = document.createElement('span');
    title.textContent = lines[0];
    title.style.cssText =
      'color:#f0c850;font-size:22px;letter-spacing:0.02em;-webkit-text-stroke:3px #000;' +
      'paint-order:stroke fill;font-family:var(--gta-display);';
    const sub = document.createElement('span');
    sub.textContent = lines[1];
    sub.style.cssText =
      'color:#f5f5f5;font-size:11px;font-weight:700;letter-spacing:0.12em;' +
      'text-transform:uppercase;font-family:var(--gta-menu);';
    stamp.append(title, sub);
    root.append(stamp);
    // The image is rendered outside the page's styles: write the resolved font names in.
    for (const line of [title, sub]) line.style.fontFamily = getComputedStyle(line).fontFamily;
  };

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
      root.querySelectorAll<SVGSVGElement>('svg[data-testid="d3-chart-svg"]').forEach((svg) => {
        const chartRoot = svg.querySelector<SVGGElement>('g.chart-root');
        const matrix = chartRoot?.getScreenCTM()?.inverse();
        const bounds = plotBounds(svg);
        if (!chartRoot || !matrix || !bounds || chartRoot.querySelector(`.${FRAME_CLASS}`)) return;
        if (!svg.querySelector(CANVAS_POINT_LAYER_SELECTOR)) return;
        const from = new DOMPoint(bounds.left, bounds.top).matrixTransform(matrix);
        const to = new DOMPoint(bounds.right, bounds.bottom).matrixTransform(matrix);
        const outline = document.createElementNS(SVG_NS, 'path');
        outline.setAttribute('class', FRAME_CLASS);
        outline.setAttribute(
          'd',
          `M${from.x.toFixed(1)} ${from.y.toFixed(1)}H${to.x.toFixed(1)}V${to.y.toFixed(1)}`,
        );
        outline.setAttribute('fill', 'none');
        outline.setAttribute('stroke', 'rgba(255, 255, 255, 0.34)');
        outline.setAttribute('stroke-width', '1.5');
        outline.setAttribute('stroke-linecap', 'square');
        chartRoot.append(outline);
      });
      stampExport(root);
      callbacks.onExport?.();
    } catch {
      // Export still works without the extra styling.
    }
  };

  // ------------------------------------------------------------ scanning
  const emptyWatch =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              emptyWatch?.unobserve(entry.target);
              if (!disposed && entry.target.isConnected) callbacks.onEmpty?.(entry.target);
            }
          },
          { threshold: 0.6 },
        );
  const noteEmpty = (element: Element) => {
    if (emptied.has(element)) return;
    emptied.add(element);
    if (emptyWatch) emptyWatch.observe(element);
    else callbacks.onEmpty?.(element);
  };

  const decorateWithin = (node: Element) => {
    if (node.matches(POINT_SELECTOR)) decoratePoint(node);
    else if (node.matches(BAR_SELECTOR)) decorateBar(node);
    else if (node.matches(EMPTY_SELECTOR)) noteEmpty(node);
    if (node.firstElementChild) {
      node.querySelectorAll(POINT_SELECTOR).forEach(decoratePoint);
      node.querySelectorAll(BAR_SELECTOR).forEach(decorateBar);
      node.querySelectorAll(EMPTY_SELECTOR).forEach(noteEmpty);
    }
  };

  const scan = () => {
    scanFrame = undefined;
    if (disposed) return;
    for (const overlay of overlays.values()) {
      if (!overlay.layer.isConnected || !isActive()) removeOverlay(overlay);
    }
    for (const [point] of markers) if (!point.isConnected) removeMarker(point);
    for (const [bar, overlay] of segments) {
      if (!bar.isConnected) {
        overlay.remove();
        segments.delete(bar);
      }
    }
    for (const holder of defs) if (!holder.isConnected) defs.delete(holder);
    for (const [tooltip] of tooltips) if (!tooltip.isConnected) tooltips.delete(tooltip);
    if (!isActive()) return;
    document
      .querySelectorAll<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR)
      .forEach((layer) => {
        if (!overlays.has(layer)) addOverlay(layer);
      });
    decorateWithin(document.body);
  };

  const scheduleScan = () => {
    if (scanFrame === undefined && !disposed) scanFrame = requestAnimationFrame(scan);
  };

  const bumpTooltip = (tooltip: HTMLElement) => {
    inspected++;
    tooltips.set(tooltip, inspected);
    const label = (callbacks.blipLabel?.(inspected) ?? String(inspected)).replaceAll(/["\\]/gu, '');
    tooltip.style.setProperty('--gta-blip-label', `"${label}"`);
    callbacks.onInspect?.();
  };

  const observer = new MutationObserver((records) => {
    if (!isActive()) {
      scheduleScan();
      return;
    }
    let rescan = false;
    let retitled = false;
    const bumped = new Set<HTMLElement>();
    for (const record of records) {
      const { target } = record;
      // A chart whose heading changes has a new subject (another metric, model or scenario)
      // even when it keeps its points and moves them: that is an update, and it is swept.
      const holder = target instanceof Element ? target : target.parentElement;
      if (record.type !== 'attributes' && holder?.closest('figcaption')) retitled = true;
      if (record.type === 'characterData') continue;
      if (record.type === 'attributes') {
        if (!(target instanceof Element)) continue;
        if (record.attributeName === 'data-points-joined') {
          const overlay = overlays.get(target);
          if (!overlay) rescan = true;
          else if (subjectOf(overlay.svg) === overlay.subject) hook(overlay);
          else startSweep(overlay);
        } else if (record.attributeName === 'fill') {
          if (segments.has(target)) continue;
          const point = target.parentElement;
          if (point && markers.has(point) && target.classList.contains('visible-shape')) {
            removeMarker(point);
            decoratePoint(point);
          }
        } else if (segments.has(target)) {
          syncBar(target);
        }
        continue;
      }
      // Decorate inserted SVG points in this same task: PNG export renders its clone and
      // captures it before the next animation frame.
      for (const node of record.addedNodes) {
        if (!(node instanceof Element) || isMine(node)) continue;
        decorateWithin(node);
        if (node.closest(EXPORT_SELECTOR)) styleExport(node);
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
        if (node.classList.contains(MARKER_CLASS) || node.classList.contains(SEGMENT_CLASS)) {
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
    if (retitled) {
      for (const overlay of overlays.values()) {
        if (overlay.layer.isConnected && subjectOf(overlay.svg) !== overlay.subject) {
          startSweep(overlay);
        }
      }
    }
    if (rescan) scheduleScan();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-points-joined', 'fill', 'x', 'y', 'width', 'height'],
  });

  const themeObserver = new MutationObserver(scheduleScan);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-inferencex-embed'],
  });

  // Switching character relabels every mission marker, on canvas and in SVG.
  const unsubscribe = subscribeGta(() => {
    const next = getGtaState().character;
    if (next === character) return;
    character = next;
    blips.delete('circle');
    for (const [point] of markers) removeMarker(point);
    for (const overlay of overlays.values()) redraw(overlay);
    scheduleScan();
  });

  scan();

  return () => {
    disposed = true;
    unsubscribe();
    clearTrains();
    observer.disconnect();
    themeObserver.disconnect();
    emptyWatch?.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (scanFrame !== undefined) cancelAnimationFrame(scanFrame);
    for (const overlay of overlays.values()) removeOverlay(overlay);
    for (const [, line] of sweepLines) line.remove();
    sweepLines.clear();
    document.querySelectorAll(`.${STAMP_CLASS}`).forEach((stamp) => stamp.remove());
    for (const [point] of markers) removeMarker(point);
    for (const [, overlay] of segments) overlay.remove();
    segments.clear();
    for (const holder of defs) holder.remove();
    defs.clear();
    for (const [tooltip] of tooltips) tooltip.style.removeProperty('--gta-blip-label');
    tooltips.clear();
  };
}

/** Blips on the radar: every data point and bar that is currently drawn. */
export function countGtaBlips(): number {
  let total = 0;
  document
    .querySelectorAll<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR)
    .forEach((layer) => {
      total += layer.scatterPoints?.().filter((point) => point.opacity > 0).length ?? 0;
    });
  total += document.querySelectorAll(`${POINT_SELECTOR}, ${BAR_SELECTOR}`).length;
  return total;
}

// ---------------------------------------------------------------------- the train
// "Wrong Side of the Tracks": a freight train runs the length of a Pareto frontier line the
// chart has drawn, with a dirt bike chasing it. Both ride beside the line, not on it, take no
// pointer events and are removed when the run ends, so no point or line is covered for good.

const TRAIN_MS = 3600;
const TRAIN_FADE_MS = 500;
const CAR_GAP = 23;
const TRAIN_OFFSET = 11;
const trains = new Set<{
  node: SVGGElement;
  frame: number | undefined;
  timer: number | undefined;
}>();

function clearTrains() {
  for (const train of trains) {
    if (train.frame !== undefined) cancelAnimationFrame(train.frame);
    window.clearTimeout(train.timer);
    train.node.remove();
  }
  trains.clear();
}

function lengthOf(path: SVGPathElement): number {
  try {
    return path.getTotalLength();
  } catch {
    return 0;
  }
}

/** The longest frontier line that is drawn and on screen right now. */
function frontierOnScreen(): SVGPathElement | null {
  let best: SVGPathElement | null = null;
  let longest = 60;
  document
    .querySelectorAll<SVGPathElement>("svg[data-testid='d3-chart-svg'] .roofline-path")
    .forEach((path) => {
      if (path.closest(EXPORT_SELECTOR)) return;
      const style = getComputedStyle(path);
      if (style.display === 'none') return;
      // On canvas charts the line is painted on the canvas and its SVG path is kept, hidden,
      // as the geometry: that still counts as drawn.
      if (style.visibility === 'hidden' && !path.hasAttribute(CANVAS_UNDERLAY_ATTRIBUTE)) return;
      if (Number(style.opacity) < 0.2 || Number(style.strokeOpacity) < 0.2) return;
      const box = path.getBoundingClientRect();
      if (box.width < 40 || box.bottom < 0 || box.top > window.innerHeight) return;
      const length = lengthOf(path);
      if (length > longest) {
        longest = length;
        best = path;
      }
    });
  return best;
}

/**
 * Runs the train along a frontier line. Returns false when no chart with a frontier is on
 * screen. `onDone` fires when the train has reached the end of the line.
 */
export function runGtaTrain(onDone?: () => void): boolean {
  if (!isActive()) return false;
  const path = frontierOnScreen();
  const layer = path?.parentElement;
  if (!path || !layer?.parentNode) return false;
  clearTrains();
  const total = lengthOf(path);
  if (total <= 0) return false;
  const node = document.createElementNS(SVG_NS, 'g');
  node.setAttribute('class', `${TRAIN_CLASS} no-export`);
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('pointer-events', 'none');
  const car = (width: number, fill: string) => {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(-width / 2));
    rect.setAttribute('y', '-4.5');
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', '9');
    rect.setAttribute('rx', '1.5');
    rect.setAttribute('fill', fill);
    rect.setAttribute('stroke', INK);
    rect.setAttribute('stroke-width', '1.2');
    return rect;
  };
  // The engine in Brown Streak colours, three box cars, then the bike as a player arrow.
  const cars = [car(21, '#f2b33d'), car(19, '#b9773f'), car(19, '#c98a4c'), car(19, '#a8683a')];
  const bike = document.createElementNS(SVG_NS, 'path');
  bike.setAttribute('d', 'M9 0L-6.5 6.4L-3 0L-6.5 -6.4Z');
  bike.setAttribute('fill', '#ffffff');
  bike.setAttribute('stroke', INK);
  bike.setAttribute('stroke-width', '1.2');
  bike.setAttribute('stroke-linejoin', 'round');
  node.append(...cars, bike);
  // Beside the line's layer, not inside it: the canvas layer paints and hides what is inside.
  const shift = layer.getAttribute('transform');
  if (shift) node.setAttribute('transform', shift);
  layer.after(node);
  const train = {
    node,
    frame: undefined as number | undefined,
    timer: undefined as number | undefined,
  };
  trains.add(train);

  // A narrow plot gets a smaller train so it stays beside the line.
  const size = (path.ownerSVGElement?.clientWidth ?? 800) < 520 ? 0.7 : 1;
  const place = (element: SVGElement, at: number, side: number) => {
    if (at < 0) {
      element.setAttribute('visibility', 'hidden');
      return;
    }
    const here = path.getPointAtLength(Math.min(total, at));
    const ahead = path.getPointAtLength(Math.min(total, at + 2));
    const behind = path.getPointAtLength(Math.max(0, at - 2));
    const angle = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
    const x = here.x - Math.sin(angle) * side * size;
    const y = here.y + Math.cos(angle) * side * size;
    element.removeAttribute('visibility');
    element.setAttribute(
      'transform',
      `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)}) scale(${size})`,
    );
  };
  const draw = (head: number) => {
    cars.forEach((element, index) => place(element, head - index * CAR_GAP * size, -TRAIN_OFFSET));
    // The bike never quite catches the last car.
    place(bike, head - (cars.length * CAR_GAP + 12) * size, TRAIN_OFFSET);
  };
  const finish = () => {
    train.frame = undefined;
    onDone?.();
    node.style.transition = `opacity ${TRAIN_FADE_MS}ms linear`;
    node.style.opacity = '0';
    train.timer = window.setTimeout(() => {
      node.remove();
      trains.delete(train);
    }, TRAIN_FADE_MS);
  };

  if (prefersReducedMotion()) {
    // No travel: the train stands at the end of the line for a moment.
    draw(total);
    train.timer = window.setTimeout(finish, 1800);
    return true;
  }
  const startedAt = performance.now();
  const step = (now: number) => {
    if (!node.isConnected || !path.isConnected) {
      node.remove();
      trains.delete(train);
      return;
    }
    const t = Math.min(1, (now - startedAt) / TRAIN_MS);
    draw((t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) * total);
    if (t < 1) train.frame = requestAnimationFrame(step);
    else finish();
  };
  train.frame = requestAnimationFrame(step);
  return true;
}
