/**
 * Chart integration for the LEGO theme. Everything here decorates what the charts already
 * draw and never changes data, scales, hit areas or event handlers:
 *
 * - canvas scatter points are painted as bricks by the chart's own draw loop (its `fill` call is
 *   wrapped), so they keep their colour and follow every animated frame. Each point shape maps
 *   to its own brick, so the encoding the shape carries survives;
 * - SVG points (`.dot-group`, used by smaller charts and by PNG export) get the same brick;
 * - bars get a brick-seam overlay;
 * - a chart that mounts or changes subject is revealed in brick rows while its bricks drop in;
 * - chart tooltips get an instruction-booklet step number;
 * - a minifigure hangs off the side of the first chart card by one hand. Poke him and he
 *   loses his grip, then climbs back.
 *
 * `mountLegoCharts` returns a cleanup that removes every node, class, property and listener.
 */
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { pointLabelAnchor } from '@/lib/d3-chart/layers/point-label-order';
import { plotBounds } from '@/lib/d3-chart/plot-bounds';
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
import { prefersReducedMotion } from './lego-store';

const SVG_NS = 'http://www.w3.org/2000/svg';
const POINT_SELECTOR = '.dot-group, .unofficial-overlay-pt';
const BAR_SELECTOR = 'rect.bar';
const EMPTY_SELECTOR = "[data-testid='scatter-empty-state']";
const TOOLTIP_SELECTOR = '[data-chart-tooltip]';
const TRACKED_SELECTOR = `${CANVAS_POINT_LAYER_SELECTOR}, ${POINT_SELECTOR}, ${BAR_SELECTOR}`;
const MARKER_CLASS = 'lego-stud-marker';
const SEAM_CLASS = 'lego-bar-seams';
const BAR_STUDS_CLASS = 'lego-bar-studs';
const FRAME_CLASS = 'lego-plot-frame';
const HANGER_CLASS = 'lego-hanger';
const STAMP_CLASS = 'lego-export-stamp';
/** Room the hanging minifigure needs between the chart card and the edge of the window. */
const HANGER_ROOM = 54;
const HANGER_MAX = 88;
const HANGER_FALL_MS = 2300;
const EXPORT_SELECTOR = "[id$='-export']";
const CARD_SELECTOR = "main [data-slot='card']";
const TAG_SELECTOR = `${CARD_SELECTOR}, main h1, main h2, main h3`;
const DEFS_CLASS = 'lego-defs';
const BUILDING_CLASS = 'lego-building';
/** Height of the build tag, and a generous width per character plus its padding and border. */
const BUILD_TAG_H = 22;
const BUILD_TAG_CH = 7.5;
const BUILD_TAG_PAD = 22;
const SEAM_PATTERN_ID = 'lego-brick-seams';
const INK = 'rgba(24, 23, 22, 0.6)';
const STUD_RADIUS = 6;
/** Plots narrower than this get smaller bricks so crowded points stay separate. */
const SMALL_PLOT = 460;
const SMALL_STUD_RADIUS = 4.3;

/**
 * Bricks seen from the front, drawn around the data point at a stud radius of 6. One per point
 * shape the charts use: circle, square, triangle and diamond.
 */
type Brick = 'two' | 'one' | 'slope' | 'jumper';
const BRICK_TOP = -3.6;
const BRICK_BASE = 5.2;
const NUB_TOP = -6;
const NUB_HALF = 2.3;
const BRICK_SHAPES: Record<Brick, { half: number; nubs: number[] }> = {
  two: { half: 8, nubs: [-4.1, 4.1] },
  one: { half: 4.6, nubs: [0] },
  slope: { half: 8, nubs: [4.6] },
  jumper: { half: 8, nubs: [0] },
};
/** Where the slope meets the brick's flat top. */
const SLOPE_END = 1.6;
const SLOPE_FOOT = 2.2;

function brickOutline(kind: Brick): string {
  const { half, nubs } = BRICK_SHAPES[kind];
  let d =
    kind === 'slope'
      ? `M${-half} ${BRICK_BASE}V${SLOPE_FOOT}L${SLOPE_END} ${BRICK_TOP}`
      : `M${-half} ${BRICK_BASE}V${BRICK_TOP}`;
  for (const nub of nubs) {
    d += `H${nub - NUB_HALF}V${NUB_TOP}H${nub + NUB_HALF}V${BRICK_TOP}`;
  }
  return `${d}H${half}V${BRICK_BASE}Z`;
}

/** Light catching the top edges of the body and of each stud. */
function brickShine(kind: Brick): string {
  const { half, nubs } = BRICK_SHAPES[kind];
  let d =
    kind === 'slope'
      ? `M${-half + 1.5} ${SLOPE_FOOT + 0.6}L${SLOPE_END + 0.4} ${BRICK_TOP + 1.5}H${half - 1.5}`
      : `M${-half + 1.5} ${BRICK_TOP + 1.5}H${half - 1.5}`;
  for (const nub of nubs) d += `M${nub - 1.2} ${NUB_TOP + 1.2}H${nub + 0.3}`;
  return d;
}

const brickShade = (kind: Brick): string => {
  const { half } = BRICK_SHAPES[kind];
  return `M${-half + 1.2} ${BRICK_BASE - 1.2}H${half - 1.2}`;
};

/**
 * The same measurement taken to the left of the centre. A full circle starts and ends on the
 * ray to the right, where the hit test can report a miss for every reach.
 */
function measureLeftward(context: CanvasRenderingContext2D, path: Path2D, t: DOMMatrix): number {
  let extent = 0;
  for (let reach = 0.5; reach <= 14; reach += 0.5) {
    if (!context.isPointInPath(path, t.e - reach * t.a, t.f)) break;
    extent = reach;
  }
  return extent;
}

const BRICK_OF_SHAPE: Record<PointShape, Brick> = {
  circle: 'two',
  square: 'one',
  triangle: 'slope',
  diamond: 'jumper',
};
/** The picked brick: lifted this far off the plate, never more than HOVER_ROOM wider than the stock form. */
const HOVER_LIFT = 4;
const HOVER_ROOM = 4;
const HOVER_RING = '#FFD500';
const BUILD_MS = 1500;
const DROP_MS = 300;
const DETAIL_LIMIT = 1800;

export interface LegoChartCallbacks {
  /** A chart started its build-in animation; `rebuilt` when its subject changed in place. */
  onBuild?: (svg: SVGSVGElement, rebuilt: boolean) => void;
  /** Caption shown beside a chart while it is being built. */
  buildLabel?: (step: number, pieces: number) => string;
  /** An export image is being made; returns the lines of the set-box stamp. */
  exportStamp?: (pieces: number) => string[];
  onExport?: () => void;
  /** A scatter chart with no points appeared. */
  onEmpty?: (element: Element) => void;
  /** Localised "Step N" caption for the Nth tooltip a chart shows. */
  stepLabel?: (step: number) => string;
  /** Accessible name of the minifigure hanging off the chart. */
  hangerLabel?: () => string;
  /** The hanging minifigure was poked and let go; `back` fires when he grabs on again. */
  onHangerFall?: () => void;
  onHangerBack?: () => void;
}

interface Overlay {
  layer: CanvasPointLayerElement;
  svg: SVGSVGElement;
  host: HTMLElement;
  /** The chart's own point canvas while its context is wrapped. */
  surface: HTMLCanvasElement | null;
  release: (() => void) | null;
  buildAt: number;
  subject: string;
  /** Points painted in the frame being drawn, and in the frame before it. */
  count: number;
  lastCount: number;
  frameNow: number | undefined;
  frameActive: boolean;
  /** Stud radius and outline width for this plot's size, set once per painted frame. */
  radius: number;
  outline: number;
}

function isActive(): boolean {
  const root = document.documentElement;
  return (
    root.classList.contains('lego') &&
    !Object.hasOwn(root.dataset, 'inferencexEmbed') &&
    !isEmbedPathname(window.location.pathname)
  );
}

function bounce(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t - 1.5 / d) ** 2 + 0.75;
  if (t < 2.5 / d) return n * (t - 2.25 / d) ** 2 + 0.9375;
  return n * (t - 2.625 / d) ** 2 + 0.984375;
}

function subjectOf(svg: SVGSVGElement): string {
  const figure = svg.closest('figure');
  return figure?.querySelector('figcaption')?.textContent ?? '';
}

function isMine(node: Node): boolean {
  return (
    node instanceof Element &&
    (node.classList.contains(MARKER_CLASS) ||
      node.classList.contains(SEAM_CLASS) ||
      node.classList.contains(BAR_STUDS_CLASS) ||
      node.classList.contains(FRAME_CLASS) ||
      node.classList.contains(HANGER_CLASS) ||
      node.classList.contains(STAMP_CLASS) ||
      node.classList.contains(DEFS_CLASS) ||
      node.closest('.lego-scene, [data-testid="lego-theme-banner"]') !== null)
  );
}

export function mountLegoCharts(callbacks: LegoChartCallbacks = {}): () => void {
  const overlays = new Map<Element, Overlay>();
  const markers = new Map<Element, SVGGElement>();
  const seams = new Map<Element, SVGRectElement>();
  const barStuds = new Map<Element, SVGPathElement>();
  const defs = new Set<SVGDefsElement>();
  const tooltips = new Map<HTMLElement, number>();
  const emptied = new WeakSet<Element>();
  const buildTimers = new Map<HTMLElement, number>();
  const extents = new WeakMap<Path2D, number>();
  const kinds = new WeakMap<Path2D, PointShape>();
  const bricks = new Map<Brick, { outline: Path2D; shine: Path2D; shade: Path2D }>();
  const brickOf = (kind: Brick) => {
    let brick = bricks.get(kind);
    if (!brick) {
      brick = {
        outline: new Path2D(brickOutline(kind)),
        shine: new Path2D(brickShine(kind)),
        shade: new Path2D(brickShade(kind)),
      };
      bricks.set(kind, brick);
    }
    return brick;
  };
  let frame: number | undefined;
  let builds = 0;
  let scanFrame: number | undefined;
  let disposed = false;

  // ------------------------------------------------------------ canvas bricks
  // Painted inside the chart's own draw loop (see canvas-point-paint), so a brick keeps the
  // point's frame, animated position, colour, opacity, fade and hover size.
  const paintStud = (
    overlay: Overlay,
    context: CanvasRenderingContext2D,
    path: Path2D,
    fill: (path: Path2D) => void,
  ) => {
    if (overlay.frameNow === undefined) {
      overlay.frameNow = performance.now();
      overlay.frameActive = isActive();
      const small = (overlay.surface?.clientWidth ?? SMALL_PLOT) < SMALL_PLOT;
      overlay.radius = small ? SMALL_STUD_RADIUS : STUD_RADIUS;
      overlay.outline = small ? 0.75 : 1;
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
      extent = measurePointExtent(context, path, t) || measureLeftward(context, path, t);
      // A canvas that has no size yet measures nothing; ask again on the next frame.
      if (extent > 0) extents.set(path, extent);
    }
    if (extent <= 0) {
      fill(path);
      return;
    }
    const alpha = context.globalAlpha;
    let shown = alpha;
    let lift = 0;
    const elapsed = overlay.frameNow - overlay.buildAt;
    if (elapsed < BUILD_MS + DROP_MS) {
      const width = overlay.surface?.width || 1;
      const progress = (elapsed - Math.min(1, Math.max(0, t.e / width)) * BUILD_MS) / DROP_MS;
      if (progress <= 0) return;
      lift = (1 - bounce(progress)) * -46;
      shown *= Math.min(1, progress * 4);
    }
    let kind = kinds.get(path);
    if (kind === undefined) {
      kind = classifyPointShape(context, path, t, extent);
      kinds.set(path, kind);
    }
    const brick = brickOf(BRICK_OF_SHAPE[kind]);
    const hovered = extent >= POINT_HOVER_EXTENT[kind];
    const base = overlay.radius / STUD_RADIUS;
    const { half } = BRICK_SHAPES[BRICK_OF_SHAPE[kind]];
    // Picked up: no wider than the stock hover form plus HOVER_ROOM, ring included.
    const scale = hovered
      ? Math.max(base, Math.min(base * 1.3, (extent * 2 + HOVER_ROOM - 3) / (half * 2)))
      : base;
    const { lineWidth, lineJoin, lineCap, strokeStyle, fillStyle } = context;
    if (hovered) {
      // The studs it came off stay behind on the plate.
      context.setTransform(t.a * scale, 0, 0, t.d * scale, t.e, t.f);
      context.globalAlpha = shown * 0.65;
      context.fillStyle = '#181716';
      context.fillRect(-half, BRICK_BASE - 1.4, half * 2, 1.8);
      context.fillStyle = fillStyle;
      lift -= HOVER_LIFT;
    }
    context.setTransform(t.a * scale, 0, 0, t.d * scale, t.e, t.f + lift * t.d);
    context.globalAlpha = shown;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    if (hovered) {
      context.lineWidth = 3 / scale;
      context.strokeStyle = HOVER_RING;
      context.stroke(brick.outline);
    }
    fill(brick.outline);
    context.lineWidth = (hovered ? 1.25 : overlay.outline) / scale;
    context.strokeStyle = hovered ? '#181716' : INK;
    context.stroke(brick.outline);
    if (overlay.lastCount <= DETAIL_LIMIT && overlay.radius >= STUD_RADIUS) {
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(0, 0, 0, 0.24)';
      context.stroke(brick.shade);
      context.strokeStyle = 'rgba(255, 255, 255, 0.62)';
      context.stroke(brick.shine);
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
      paintStud(overlay, context, path, fill),
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
      if (!overlay.layer.isConnected || now - overlay.buildAt > BUILD_MS + DROP_MS + 60) continue;
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

  const startBuild = (overlay: Overlay, rebuilt = false) => {
    overlay.subject = subjectOf(overlay.svg);
    if (prefersReducedMotion()) {
      overlay.buildAt = -Infinity;
      kick(overlay);
      return;
    }
    overlay.buildAt = performance.now();
    const { host } = overlay;
    host.classList.remove(BUILDING_CLASS);
    // Restart the CSS animation when a build interrupts another.
    void host.offsetWidth;
    host.classList.add(BUILDING_CLASS);
    builds += 1;
    const pieces = overlay.layer.scatterPoints?.().filter((point) => point.opacity > 0).length ?? 0;
    const label = (callbacks.buildLabel?.(builds, pieces) ?? '').replaceAll(/["\\]/gu, '');
    host.style.setProperty('--lego-build', `"${label}"`);
    placeBuildTag(overlay.svg, host, label);
    window.clearTimeout(buildTimers.get(host));
    buildTimers.set(
      host,
      window.setTimeout(() => {
        host.classList.remove(BUILDING_CLASS);
        clearBuildTag(host);
        buildTimers.delete(host);
      }, BUILD_MS + DROP_MS),
    );
    callbacks.onBuild?.(overlay.svg, rebuilt);
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
      buildAt: -Infinity,
      subject: '',
      count: 0,
      lastCount: 0,
      frameNow: undefined,
      frameActive: false,
      radius: STUD_RADIUS,
      outline: 1,
    };
    overlays.set(layer, overlay);
    startBuild(overlay);
  };

  const removeOverlay = (overlay: Overlay) => {
    unhook(overlay);
    overlay.host.classList.remove(BUILDING_CLASS);
    clearBuildTag(overlay.host);
    window.clearTimeout(buildTimers.get(overlay.host));
    buildTimers.delete(overlay.host);
    overlays.delete(overlay.layer);
    // Repaint without bricks.
    if (overlay.layer.isConnected) redraw(overlay);
  };

  // ------------------------------------------------------------ hanging minifigure
  // One per page, on the first chart card, and only where the page margin has room for him:
  // he hangs outside the card, so he never covers the plot, the legend or a control.
  let hanger: HTMLButtonElement | null = null;
  let hangerTimer: number | undefined;
  const dropHanger = () => {
    window.clearTimeout(hangerTimer);
    hangerTimer = undefined;
    hanger?.remove();
    hanger = null;
  };
  const placeHanger = () => {
    const layer = isActive() ? document.querySelector(CANVAS_POINT_LAYER_SELECTOR) : null;
    const overlay = layer ? overlays.get(layer) : undefined;
    const card = overlay?.svg.closest<HTMLElement>(CARD_SELECTOR);
    if (!overlay || !card) {
      dropHanger();
      return;
    }
    const box = card.getBoundingClientRect();
    const plot = (overlay.surface ?? overlay.svg).getBoundingClientRect();
    const room = document.documentElement.clientWidth - box.right;
    if (room < HANGER_ROOM || plot.height < 200) {
      dropHanger();
      return;
    }
    if (!hanger) {
      hanger = document.createElement('button');
      hanger.type = 'button';
      hanger.className = HANGER_CLASS;
      const figure = document.createElement('img');
      figure.src = '/decorative/lego/img/emmet-run.webp';
      figure.alt = '';
      figure.draggable = false;
      hanger.append(figure);
      hanger.addEventListener('click', () => {
        if (!hanger || hangerTimer !== undefined) return;
        const fallen = hanger;
        fallen.dataset.fallen = 'true';
        callbacks.onHangerFall?.();
        hangerTimer = window.setTimeout(
          () => {
            hangerTimer = undefined;
            delete fallen.dataset.fallen;
            if (fallen.isConnected) callbacks.onHangerBack?.();
          },
          prefersReducedMotion() ? 900 : HANGER_FALL_MS,
        );
      });
    }
    const label = callbacks.hangerLabel?.() ?? '';
    if (hanger.getAttribute('aria-label') !== label) hanger.setAttribute('aria-label', label);
    if (hanger.parentElement !== card) card.append(hanger);
    const top = `${Math.round(plot.top - box.top + plot.height * 0.16)}px`;
    if (hanger.style.top !== top) hanger.style.top = top;
    // As big as the margin allows, so he never pushes the page wider than the window.
    const size = `${Math.round(Math.min(HANGER_MAX, room - 8))}px`;
    if (hanger.style.getPropertyValue('--lego-hang') !== size) {
      hanger.style.setProperty('--lego-hang', size);
    }
  };

  // ------------------------------------------------------------ SVG bricks
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
    const kind = BRICK_OF_SHAPE[shape?.dataset.shapeKey as PointShape] ?? 'two';
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
    const plate = piece(brickOutline(kind), INK, '1');
    plate.setAttribute('fill', fill && fill !== 'none' ? fill : 'currentColor');
    const shade = piece(brickShade(kind), 'rgba(0, 0, 0, 0.24)', '1');
    const shine = piece(brickShine(kind), 'rgba(255, 255, 255, 0.62)', '1');
    marker.append(plate, shade, shine);
    // Keep the chart's own shape, hit circle, data and handlers; draw the brick right above
    // the shape and below any label.
    if (shape) shape.after(marker);
    else {
      const anchor = point.querySelector(':scope > text') ?? pointLabelAnchor(point);
      if (anchor) anchor.before(marker);
      else point.append(marker);
    }
    markers.set(point, marker);
  };

  // ------------------------------------------------------------ brick bars
  // One pattern per chart, each with its own id: ids are document-wide, and the export clone
  // of a chart must not resolve to (or shadow) the pattern of the chart on screen.
  let seamSerial = 0;
  const ensureSeamPattern = (svg: SVGSVGElement): string => {
    const existing = svg.querySelector(`:scope > defs.${DEFS_CLASS} > pattern`);
    if (existing) return existing.id;
    const holder = document.createElementNS(SVG_NS, 'defs');
    holder.setAttribute('class', DEFS_CLASS);
    const pattern = document.createElementNS(SVG_NS, 'pattern');
    const id = `${SEAM_PATTERN_ID}-${++seamSerial}`;
    pattern.setAttribute('id', id);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    // Two courses of 2x4 bricks in running bond; faint, so labels on the bar stay crisp.
    pattern.setAttribute('width', '44');
    pattern.setAttribute('height', '44');
    const seam = document.createElementNS(SVG_NS, 'path');
    seam.setAttribute('d', 'M0 0.5H44M0 22.5H44M0.5 0V22M22.5 22V44');
    seam.setAttribute('stroke', 'rgba(24, 23, 22, 0.2)');
    seam.setAttribute('stroke-width', '1');
    seam.setAttribute('fill', 'none');
    const shine = document.createElementNS(SVG_NS, 'path');
    shine.setAttribute('d', 'M2 2.5H43M0 24.5H21M24 24.5H44');
    shine.setAttribute('stroke', 'rgba(255, 255, 255, 0.16)');
    shine.setAttribute('stroke-width', '1.5');
    shine.setAttribute('fill', 'none');
    pattern.append(seam, shine);
    holder.append(pattern);
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
    const seam = seams.get(bar);
    if (seam) {
      for (const name of ['x', 'y', 'width', 'height', 'rx', 'transform']) {
        const value = bar.getAttribute(name);
        if (value === null) seam.removeAttribute(name);
        else if (seam.getAttribute(name) !== value) seam.setAttribute(name, value);
      }
    }
    const studs = barStuds.get(bar);
    if (!studs || !(bar instanceof SVGRectElement)) return;
    const x = Number(bar.getAttribute('x')) || 0;
    const y = Number(bar.getAttribute('y')) || 0;
    const width = Number(bar.getAttribute('width')) || 0;
    const height = Number(bar.getAttribute('height')) || 0;
    // Studs sit on top of sideways bars, in the gap between rows. On upright bars they are
    // drawn inside the top edge instead, so nothing reaches past the value the bar shows.
    const outside = isHorizontal(bar);
    const nub = Math.min(9, Math.max(4, width * 0.4));
    const pitch = nub + 7;
    const rise = outside ? 3.5 : Math.min(3.5, height / 3);
    const base = outside ? y : y + rise + 1.5;
    let d = '';
    if (width >= 8 && height >= 6) {
      const count = Math.max(1, Math.floor((width - 6 + 7) / pitch));
      const start = x + (width - (count * pitch - 7)) / 2;
      for (let index = 0; index < count; index++) {
        d += `M${(start + index * pitch).toFixed(1)} ${base.toFixed(1)}v${-rise}h${nub.toFixed(1)}v${rise}`;
      }
    }
    if (studs.getAttribute('d') !== d) studs.setAttribute('d', d);
    const transform = bar.getAttribute('transform');
    if (transform === null) studs.removeAttribute('transform');
    else studs.setAttribute('transform', transform);
    const fill = outside ? getComputedStyle(bar).fill : 'rgba(255, 255, 255, 0.3)';
    if (studs.getAttribute('fill') !== fill) studs.setAttribute('fill', fill);
  };

  const decorateBar = (bar: Element) => {
    if (!(bar instanceof SVGRectElement) || !bar.ownerSVGElement) return;
    const existing = seams.get(bar);
    const existingStuds = barStuds.get(bar);
    if (existing?.previousElementSibling === bar && existingStuds?.nextElementSibling === bar) {
      return;
    }
    existing?.remove();
    existingStuds?.remove();
    const patternId = ensureSeamPattern(bar.ownerSVGElement);
    const seam = document.createElementNS(SVG_NS, 'rect');
    seam.setAttribute('class', SEAM_CLASS);
    seam.setAttribute('aria-hidden', 'true');
    seam.setAttribute('pointer-events', 'none');
    seam.setAttribute('fill', `url(#${patternId})`);
    seam.setAttribute('stroke', 'none');
    bar.after(seam);
    seams.set(bar, seam);
    const studs = document.createElementNS(SVG_NS, 'path');
    studs.setAttribute('class', BAR_STUDS_CLASS);
    studs.setAttribute('aria-hidden', 'true');
    studs.setAttribute('pointer-events', 'none');
    studs.setAttribute('stroke', 'rgba(24, 23, 22, 0.85)');
    studs.setAttribute('stroke-width', '1.25');
    studs.setAttribute('stroke-linejoin', 'round');
    // Under the bar's own outline when outside it, over the bar when inside it.
    if (isHorizontal(bar)) bar.before(studs);
    else seam.after(studs);
    barStuds.set(bar, studs);
    syncBar(bar);
  };

  // ------------------------------------------------------------ export
  // PNG export renders a clone of the chart that sits in the page for a moment. The pipeline
  // only copies stroke colours, so carry the brick styling of the frame and grid across as
  // inline styles, and close the plot frame, before the clone is captured.
  const EXPORT_STYLES: [string, string[]][] = [
    [
      '.chart-root :is(.grid, .grid-h, .grid-v) line',
      ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap'],
    ],
    ['.chart-root .domain', ['stroke', 'stroke-width', 'stroke-linecap']],
    ['.chart-root .tick line', ['stroke', 'stroke-width']],
    [BAR_SELECTOR, ['stroke', 'stroke-width']],
  ];

  // The corner of a set box: tile, set number, piece count, ages. It sits in the title row of
  // the exported image, right of the heading, where the stock layout draws nothing.
  const stampExport = (root: Element) => {
    if (!(root instanceof HTMLElement) || root.querySelector(`.${STAMP_CLASS}`)) return;
    const svg = root.querySelector<SVGSVGElement>('svg[data-testid="d3-chart-svg"]');
    const layer = svg?.querySelector<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR);
    if (!svg || !layer) return;
    const live = [...overlays.values()].find((candidate) => !root.contains(candidate.layer))?.layer;
    const pieces =
      (live ?? layer).scatterPoints?.().filter((point) => point.opacity > 0).length ?? 0;
    const lines = callbacks.exportStamp?.(pieces) ?? [];
    if (lines.length === 0) return;
    const rootBox = root.getBoundingClientRect();
    const top = svg.getBoundingClientRect().top - rootBox.top;
    // Needs the title row; a chart exported without one keeps the stock layout.
    if (top < 36 || rootBox.width < 560) return;
    const height = Math.min(40, Math.floor(top - 6));
    const stamp = document.createElement('div');
    stamp.className = STAMP_CLASS;
    stamp.setAttribute('aria-hidden', 'true');
    stamp.style.cssText = `position:absolute;right:14px;top:${Math.max(3, (top - height) / 2).toFixed(0)}px;height:${height}px;box-sizing:border-box;display:flex;align-items:stretch;border:2px solid #181716;border-radius:4px;overflow:hidden;font:700 ${height < 38 ? 9 : 11}px/1.12 Arial,sans-serif;color:#181716;background:#ffd500;pointer-events:none;`;
    const tile = document.createElement('div');
    tile.style.cssText =
      'display:flex;align-items:center;justify-content:center;width:36px;background:#d01012;border-right:2px solid #181716;';
    const stud = document.createElement('div');
    stud.style.cssText =
      'width:18px;height:18px;border-radius:50%;background:#ffd500;border:2px solid #181716;box-sizing:border-box;';
    tile.append(stud);
    const text = document.createElement('div');
    text.style.cssText =
      'display:flex;flex-direction:column;justify-content:center;padding:0 8px;white-space:nowrap;';
    for (const line of lines) {
      const row = document.createElement('div');
      row.textContent = line;
      text.append(row);
    }
    stamp.append(tile, text);
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
    root.append(stamp);
    callbacks.onExport?.();
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
        outline.setAttribute('stroke', '#181716');
        outline.setAttribute('stroke-width', '3');
        outline.setAttribute('stroke-linecap', 'square');
        chartRoot.append(outline);
      });
      stampExport(root);
    } catch {
      // Export still works without the extra styling.
    }
  };

  // ------------------------------------------------------------ scanning
  // The build falls apart where the reader can see it: wait for the empty chart to be on screen.
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
    for (const [bar, seam] of seams) {
      if (!bar.isConnected) {
        seam.remove();
        seams.delete(bar);
        barStuds.get(bar)?.remove();
        barStuds.delete(bar);
      }
    }
    for (const holder of defs) if (!holder.isConnected) defs.delete(holder);
    for (const [tooltip] of tooltips) if (!tooltip.isConnected) tooltips.delete(tooltip);
    if (!isActive()) {
      dropHanger();
      return;
    }
    document
      .querySelectorAll<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR)
      .forEach((layer) => {
        if (!overlays.has(layer)) addOverlay(layer);
      });
    decorateWithin(document.body);
    scheduleTag();
  };

  // -------------------------------------------------------- brick colours
  // Cards take turns through the four classic colours in document order, wherever they sit
  // in the tree (sibling position says nothing on pages that wrap every card).
  let tagFrame: number | undefined;
  // Cards that scroll into view after the page has settled click into place, once each.
  const startedAt = performance.now();
  const snapTimers = new Set<number>();
  const watched = new WeakSet<Element>();
  const buildWatch =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const card = entry.target as HTMLElement;
              buildWatch?.unobserve(card);
              if (disposed || prefersReducedMotion() || performance.now() - startedAt < 1500) {
                continue;
              }
              card.dataset.legoSnap = '';
              const timer = window.setTimeout(() => {
                snapTimers.delete(timer);
                delete card.dataset.legoSnap;
              }, 420);
              snapTimers.add(timer);
            }
          },
          { threshold: 0.08 },
        );
  const tagCards = () => {
    tagFrame = undefined;
    if (disposed) return;
    placeHanger();
    if (!isActive()) return;
    let index = 0;
    for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
      if (card.parentElement?.closest("[data-slot='card']")) continue;
      const colour = String(index++ % 4);
      if (card.dataset.legoColor !== colour) card.dataset.legoColor = colour;
      const size = card.offsetWidth < 300 ? 'small' : 'full';
      if (card.dataset.legoCorner !== size) card.dataset.legoCorner = size;
      if (buildWatch && !watched.has(card)) {
        watched.add(card);
        buildWatch.observe(card);
      }
    }
    // Long headings are set in the body face on phones (the display face is very wide).
    for (const heading of document.querySelectorAll<HTMLElement>('main h1, main h2, main h3')) {
      const long = (heading.textContent ?? '').trim().length > 64;
      if (long !== Object.hasOwn(heading.dataset, 'legoLong')) {
        heading.toggleAttribute('data-lego-long', long);
      }
    }
  };
  const scheduleTag = () => {
    if (tagFrame === undefined && !disposed) tagFrame = requestAnimationFrame(tagCards);
  };
  window.addEventListener('resize', scheduleTag);

  const scheduleScan = () => {
    if (scanFrame === undefined && !disposed) scanFrame = requestAnimationFrame(scan);
  };

  const bumpTooltip = (tooltip: HTMLElement) => {
    const step = (tooltips.get(tooltip) ?? 0) + 1;
    tooltips.set(tooltip, step);
    const label = (callbacks.stepLabel?.(step) ?? String(step)).replaceAll(/["\\]/gu, '');
    tooltip.style.setProperty('--lego-step', `"${label}"`);
  };

  // A new model or metric rewrites the chart's caption; the points then move in place, so the
  // chart is built again from the left.
  const rebuildFor = (node: Node) => {
    const element = node instanceof Element ? node : node.parentElement;
    const figure = element?.closest('figcaption')?.closest('figure');
    if (!figure) return;
    for (const overlay of overlays.values()) {
      if (figure.contains(overlay.svg) && subjectOf(overlay.svg) !== overlay.subject) {
        startBuild(overlay, true);
      }
    }
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
      if (record.type === 'characterData') {
        rebuildFor(target);
        continue;
      }
      if (record.type === 'attributes') {
        if (!(target instanceof Element)) continue;
        if (record.attributeName === 'data-points-joined') {
          const overlay = overlays.get(target);
          if (!overlay) rescan = true;
          else if (subjectOf(overlay.svg) === overlay.subject) hook(overlay);
          else startBuild(overlay, true);
        } else if (record.attributeName === 'fill') {
          if (seams.has(target)) {
            syncBar(target);
            continue;
          }
          const point = target.parentElement;
          if (point && markers.has(point) && target.classList.contains('visible-shape')) {
            removeMarker(point);
            decoratePoint(point);
          }
        } else if (seams.has(target)) {
          syncBar(target);
        }
        continue;
      }
      if (target instanceof Element && target.closest('figcaption')) rebuildFor(target);
      // Decorate inserted SVG points in this same task: PNG export renders its clone and
      // captures it before the next animation frame.
      for (const node of record.addedNodes) {
        if (!(node instanceof Element) || isMine(node)) continue;
        decorateWithin(node);
        if (node.closest(EXPORT_SELECTOR)) styleExport(node);
        if (node.matches(TAG_SELECTOR) || node.querySelector(TAG_SELECTOR)) scheduleTag();
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
        if (node.matches(CARD_SELECTOR)) scheduleTag();
        if (
          node.classList.contains(MARKER_CLASS) ||
          node.classList.contains(SEAM_CLASS) ||
          node.classList.contains(BAR_STUDS_CLASS)
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
    characterData: true,
    attributeFilter: ['data-points-joined', 'fill', 'x', 'y', 'width', 'height'],
  });

  const themeObserver = new MutationObserver(scheduleScan);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-inferencex-embed'],
  });

  scan();
  scheduleTag();

  return () => {
    disposed = true;
    window.removeEventListener('resize', scheduleTag);
    if (tagFrame !== undefined) cancelAnimationFrame(tagFrame);
    buildWatch?.disconnect();
    for (const timer of snapTimers) window.clearTimeout(timer);
    snapTimers.clear();
    for (const card of document.querySelectorAll<HTMLElement>('[data-lego-color]')) {
      delete card.dataset.legoColor;
      delete card.dataset.legoCorner;
      delete card.dataset.legoSnap;
    }
    for (const heading of document.querySelectorAll<HTMLElement>('[data-lego-long]')) {
      delete heading.dataset.legoLong;
    }
    observer.disconnect();
    themeObserver.disconnect();
    emptyWatch?.disconnect();
    dropHanger();
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (scanFrame !== undefined) cancelAnimationFrame(scanFrame);
    for (const overlay of overlays.values()) removeOverlay(overlay);
    for (const [point] of markers) removeMarker(point);
    for (const [, seam] of seams) seam.remove();
    seams.clear();
    for (const [, studs] of barStuds) studs.remove();
    barStuds.clear();
    for (const holder of defs) holder.remove();
    defs.clear();
    for (const [tooltip] of tooltips) tooltip.style.removeProperty('--lego-step');
    tooltips.clear();
  };
}

export interface LegoChartFacts {
  /** Points drawn on the chart in view (or the first chart on the page). */
  points: number;
  /** The lowest point on that chart. */
  low: { hw: string; conc: string; value: string } | null;
  /** The point with the highest median time to first token. */
  slow: { hw: string; ttft: string } | null;
}

/** Whether the pointer is on a data point of this chart (a click then pins it). */
export function legoPointHovered(svg: Element): boolean {
  return [...svg.querySelectorAll<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR)].some(
    (layer) => layer.scatterPoints?.().some((point) => point.hovered) ?? false,
  );
}

const field = (datum: unknown, name: string): unknown =>
  datum && typeof datum === 'object' ? (datum as Record<string, unknown>)[name] : undefined;

/** Real numbers off the chart on screen, for the captions that quote them. */
/**
 * The build tag sits in the margin above the plot, at its left edge. The stock zoom hint is
 * right-aligned in the same margin: where the two would meet, the tag is left out.
 */
function placeBuildTag(svg: SVGSVGElement, host: HTMLElement, label: string): void {
  const frame = host.getBoundingClientRect();
  const plot = svg.querySelector('.y-axis > .domain')?.getBoundingClientRect();
  const left = (plot?.left ?? frame.left + 6) - frame.left;
  const top = Math.max(0, (plot?.top ?? frame.top + BUILD_TAG_H) - frame.top - BUILD_TAG_H);
  const width = label.length * BUILD_TAG_CH + BUILD_TAG_PAD;
  const hint = host.querySelector('[data-testid="chart-instructions"]')?.getBoundingClientRect();
  const meets =
    hint !== undefined &&
    hint.width > 0 &&
    hint.left < frame.left + left + width + 8 &&
    hint.top < frame.top + top + BUILD_TAG_H &&
    hint.bottom > frame.top + top;
  host.style.setProperty('--lego-build-left', `${Math.round(left)}px`);
  host.style.setProperty('--lego-build-top', `${Math.round(top)}px`);
  if (meets) host.dataset.legoBuildTag = 'off';
  else delete host.dataset.legoBuildTag;
}

function clearBuildTag(host: HTMLElement): void {
  host.style.removeProperty('--lego-build');
  host.style.removeProperty('--lego-build-left');
  host.style.removeProperty('--lego-build-top');
  delete host.dataset.legoBuildTag;
}

export function legoChartFacts(): LegoChartFacts {
  const layers = [
    ...document.querySelectorAll<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR),
  ].filter((layer) => !layer.closest(EXPORT_SELECTOR));
  const layer =
    layers.find((candidate) => {
      const box = candidate.ownerSVGElement?.getBoundingClientRect();
      return box && box.bottom > 80 && box.top < window.innerHeight - 80;
    }) ?? layers[0];
  const points = layer?.scatterPoints?.().filter((point) => point.opacity > 0) ?? [];
  let low: LegoChartFacts['low'] = null;
  let slow: LegoChartFacts['slow'] = null;
  let lowest = -Infinity;
  let slowest = 0;
  for (const point of points) {
    const hw = field(point.datum, 'hw');
    if (typeof hw !== 'string') continue;
    const conc = field(point.datum, 'conc');
    const value = field(point.datum, 'tput_per_gpu');
    const ttft = field(point.datum, 'median_ttft');
    if (point.clientY > lowest && typeof value === 'number' && typeof conc === 'number') {
      lowest = point.clientY;
      low = { hw: hw.toUpperCase(), conc: String(conc), value: value.toFixed(1) };
    }
    if (typeof ttft === 'number' && ttft > slowest) {
      slowest = ttft;
      slow = { hw: hw.toUpperCase(), ttft: ttft.toFixed(2) };
    }
  }
  return { points: points.length, low, slow };
}

/**
 * Piece count for the box art: every brick on the page (cards, panels, buttons, tabs, table
 * rows, legend tiles) plus every data point and bar that is currently drawn.
 */
export function countLegoPieces(): number {
  let total = 0;
  document
    .querySelectorAll<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR)
    .forEach((layer) => {
      total += layer.scatterPoints?.().filter((point) => point.opacity > 0).length ?? 0;
    });
  total += document.querySelectorAll(`${POINT_SELECTOR}, ${BAR_SELECTOR}`).length;
  total += document.querySelectorAll(
    "main [data-slot='card'], main [data-slot='control-panel'], main [data-slot='button'], main [data-slot='tabs-trigger'], main a[href], main tbody tr, main [data-slot='badge'], [data-slot='dashboard-navigation'] nav a, header[data-testid='header'] nav a, footer[data-testid='footer'] a",
  ).length;
  return total;
}
