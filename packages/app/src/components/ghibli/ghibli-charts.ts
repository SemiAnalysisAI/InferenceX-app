/**
 * Chart painting for the Studio Ghibli theme: scatter points become painted figures, and every
 * frame the chart draws is finished by hand: lines wobble a little and the grain of the paper
 * shows through the paint. Nothing here changes data, scales, hit areas or handlers; the
 * stylesheet does the rest (washes behind the plot, brushed curves, pencil gridlines, painted
 * legend swatches).
 *
 * The finish is drawn into the chart's own canvas once per frame it draws, so an idle chart
 * costs nothing. (A CSS/SVG filter gives a similar look but is recomputed on every composited
 * frame wherever filters are rasterised in software.)
 *
 * `mountGhibliCharts` returns a cleanup that restores every canvas it touched.
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
  canvasPointLayerOf,
  POINTS_JOINED_ATTRIBUTE,
} from '@/lib/d3-chart/layers/canvas-point-registry';
import { CANVAS_POINT_SURFACE_CLASS } from '@/lib/d3-chart/layers/canvas-points';

const PAINTED_ATTRIBUTE = 'data-ghibli-painted';
const MARKER_CLASS = 'ghibli-point-marker';
const SVG_POINT_SELECTOR = '.dot-group, .unofficial-overlay-pt';
const SVG_NS = 'http://www.w3.org/2000/svg';
/** A dab is this much larger than the chart's own marker, at rest and enlarged. */
const DAB_GROW = 1.8;
const DAB_GROW_HOVER = 1.42;
/** The wash that bleeds past the edge of a dab. */
const BLEED_REACH = 1.28;
const BLEED_ALPHA = 0.2;
const HIGHLIGHT = '#fffdf2';
const INK = '#2a2418';
const FIGURE_CLASS = 'ghibli-point-figure';
/** SVG figures are drawn a little smaller than the canvas ones: SVG charts are sparser. */
const SVG_GROW = 0.8;
/** Above this many points the dabs lose their bleed and highlight to keep frames cheap. */
const DETAIL_LIMIT = 1500;

/**
 * The four point shapes become four painted figures, one per shape so the precision encoding
 * still reads: a soot sprite (circle), a kodama (square), Calcifer (triangle) and Ponyo
 * (diamond). Geometry is in units of the chart's own marker extent (1 = the shape's reach),
 * as SVG path data so the canvas (Path2D) and the SVG charts draw the same figure. The body
 * takes the series colour; `ink` is the dark of eyes and mouths, `light` the whites.
 * The enlarged form (hovered or pinned) wakes up: wide eyes and raised arms, a head rattle,
 * a flare and an open mouth, a bubble. It reaches at most 1.2 units, within 4 px of the
 * chart's own enlarged marker.
 */
interface Figure {
  body: string;
  ink: string;
  light: string;
  /** Series-colour strokes (arms, a bubble). */
  limbs: string;
  /** Rotation in degrees, for the kodama's rattle. */
  turn: number;
}

const r2 = (value: number) => value.toFixed(2);
const disc = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${r2(cx - rx)},${r2(cy)}a${r2(rx)},${r2(ry)} 0 1,0 ${r2(2 * rx)},0a${r2(rx)},${r2(ry)} 0 1,0 ${r2(-2 * rx)},0Z`;

function sootBody(): string {
  let d = '';
  const spikes = 18;
  for (let k = 0; k < spikes * 2; k++) {
    const angle = (k * Math.PI) / spikes;
    const reach = k % 2 === 0 ? 1.02 : 0.8;
    d += `${k === 0 ? 'M' : 'L'}${r2(Math.cos(angle) * reach)},${r2(Math.sin(angle) * reach)}`;
  }
  return `${d}Z`;
}

const SOOT = sootBody();
const FLAME =
  'M0,-1.05C0.14,-0.72 0.32,-0.74 0.44,-0.98C0.58,-0.55 0.95,-0.22 0.92,0.3C0.9,0.78 0.48,1 0,1C-0.48,1 -0.9,0.78 -0.92,0.3C-0.95,-0.22 -0.58,-0.55 -0.44,-0.98C-0.32,-0.74 -0.14,-0.72 0,-1.05Z';
const FLAME_TALL =
  'M0,-1.2C0.16,-0.8 0.34,-0.8 0.5,-1.12C0.62,-0.58 0.98,-0.22 0.94,0.3C0.92,0.8 0.48,1 0,1C-0.48,1 -0.92,0.8 -0.94,0.3C-0.98,-0.22 -0.62,-0.58 -0.5,-1.12C-0.34,-0.8 -0.16,-0.8 0,-1.2Z';
const KODAMA = `${disc(0, -0.26, 1, 0.7)}M-0.36,0.3L-0.46,1L0.46,1L0.36,0.3Z`;
const PONYO =
  'M-1,0C-1,-0.62 -0.24,-0.78 0.34,-0.28L1,-0.76C0.84,-0.3 0.84,0.3 1,0.76L0.34,0.28C-0.24,0.78 -1,0.62 -1,0Z';

function figureFor(shape: PointShape, awake: boolean): Figure {
  if (shape === 'circle') {
    return awake
      ? {
          body: SOOT,
          light: disc(-0.36, -0.1, 0.37) + disc(0.36, -0.1, 0.37),
          ink: disc(-0.32, -0.1, 0.12) + disc(0.4, -0.1, 0.12),
          limbs: 'M-0.7,-0.5L-1.15,-0.95M0.7,-0.5L1.15,-0.95',
          turn: 0,
        }
      : {
          body: SOOT,
          light: disc(-0.34, -0.06, 0.29) + disc(0.34, -0.06, 0.29),
          ink: disc(-0.3, -0.02, 0.15) + disc(0.38, -0.02, 0.15),
          limbs: '',
          turn: 0,
        };
  }
  if (shape === 'square') {
    return {
      body: KODAMA,
      light: '',
      ink:
        disc(-0.38, -0.3, 0.17) +
        disc(0.36, -0.28, 0.17) +
        (awake ? disc(0, 0.06, 0.15, 0.2) : disc(0, 0.06, 0.12, 0.14)),
      limbs: '',
      turn: awake ? -24 : -6,
    };
  }
  if (shape === 'triangle') {
    return {
      body: awake ? FLAME_TALL : FLAME,
      light: disc(-0.3, 0.2, 0.22, 0.27) + disc(0.3, 0.2, 0.22, 0.27),
      ink:
        disc(-0.26, 0.25, 0.11) +
        disc(0.34, 0.25, 0.11) +
        (awake ? disc(0, 0.68, 0.26, 0.14) : 'M-0.22,0.62Q0,0.76 0.22,0.62'),
      limbs: '',
      turn: 0,
    };
  }
  return {
    body: PONYO,
    light: disc(-0.56, -0.12, 0.2),
    ink: disc(-0.52, -0.1, 0.1) + (awake ? disc(-0.82, 0.22, 0.09) : ''),
    limbs: awake ? disc(-0.9, -0.9, 0.18) : '',
    turn: 0,
  };
}

interface FigurePaths {
  body: Path2D;
  ink: Path2D;
  light: Path2D | null;
  limbs: Path2D | null;
  turn: number;
}

const figureCache = new Map<string, FigurePaths>();

function figurePaths(shape: PointShape, awake: boolean): FigurePaths {
  const id = `${shape}${awake ? 1 : 0}`;
  let paths = figureCache.get(id);
  if (!paths) {
    const figure = figureFor(shape, awake);
    paths = {
      body: new Path2D(figure.body),
      ink: new Path2D(figure.ink),
      light: figure.light ? new Path2D(figure.light) : null,
      limbs: figure.limbs ? new Path2D(figure.limbs) : null,
      turn: figure.turn,
    };
    figureCache.set(id, paths);
  }
  return paths;
}

/** Rows and columns are shifted in strips this many CSS pixels thick. */
const STRIP = 1;
/** Side of the tiled paper-grain texture, in pixels. */
const GRAIN_TILE = 160;

/** Points painted in each chart canvas's last frame: the export seal and the memes quote it. */
const painted = new Map<HTMLCanvasElement, number>();

export function paintedPointCount(): number {
  let total = 0;
  for (const [canvas, count] of painted) if (canvas.isConnected) total += count;
  return total;
}

/** A sheet of wash pulled off the plot when the points change, so they look painted in. */
function washIn(canvas: HTMLCanvasElement): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (matchMedia('(forced-colors: active)').matches) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 120 || rect.bottom < 0 || rect.top > window.innerHeight) return;
  const sheet = document.createElement('div');
  sheet.className = 'ghibli-wash-in no-export';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.style.left = `${rect.left}px`;
  sheet.style.top = `${rect.top}px`;
  sheet.style.width = `${rect.width}px`;
  sheet.style.height = `${rect.height}px`;
  document.body.append(sheet);
  sheet.addEventListener('animationend', () => sheet.remove(), { once: true });
  window.setTimeout(() => sheet.remove(), 1200);
}

interface Surface {
  release: () => void;
  /** Dabs painted in the frame being drawn, and in the frame before it. */
  count: number;
  lastCount: number;
  /** True from the chart clearing the canvas until the frame has been finished. */
  open: boolean;
}

/** How far the hand strays from the ruler at a distance along the paper, in CSS pixels. */
function wobble(at: number, phase: number): number {
  return (
    0.9 * Math.sin(at * 0.031 + phase) +
    0.55 * Math.sin(at * 0.083 + phase * 2.3) +
    0.3 * Math.sin(at * 0.19 + phase * 4.1)
  );
}

/** A tile of paper tooth: mostly clear, with specks that lift paint off the page. */
function makeGrain(): HTMLCanvasElement | null {
  const tile = document.createElement('canvas');
  tile.width = GRAIN_TILE;
  tile.height = GRAIN_TILE;
  const context = tile.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(GRAIN_TILE, GRAIN_TILE);
  let seed = 20_010_720;
  for (let i = 3; i < image.data.length; i += 4) {
    // Small linear congruential generator: the same paper on every visit.
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    const speck = seed / 4_294_967_296;
    image.data[i] = speck > 0.5 ? (speck - 0.5) * 2 * 115 : 0;
  }
  context.putImageData(image, 0, 0);
  return tile;
}

/** Stable pseudo-random number in [0, 1) for the nth dab of a frame. */
function chance(n: number, salt: number): number {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Mirrors the figures onto points the chart draws in SVG. Plain attributes, no filters, so
 * the PNG export carries them; pointer-events none keeps every hit area. */
const KINDS = new Set<string>(['circle', 'square', 'triangle', 'diamond']);

/** Which figure an SVG point is (the chart tags its shape), and its reach in its own units. */
function svgShapeOf(shape: SVGGraphicsElement): { kind: PointShape; extent: number } | null {
  const key = shape.dataset.shapeKey ?? shape.tagName.toLowerCase();
  if (!KINDS.has(key)) return null;
  const kind = key as PointShape;
  const tag = shape.tagName.toLowerCase();
  let extent = 0;
  if (tag === 'circle') extent = Number(shape.getAttribute('r')) || 0;
  else if (tag === 'rect') extent = (Number(shape.getAttribute('width')) || 0) / 2;
  else {
    const numbers = (shape.getAttribute('d') ?? '').match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
    for (const value of numbers) extent = Math.max(extent, Math.abs(Number(value)));
  }
  return extent > 0 ? { kind, extent } : null;
}

/** Keeps a point's figure in step with its colour, shape and size. */
function syncFigure(group: SVGGElement, shape: SVGGraphicsElement): void {
  const existing = group.querySelector<SVGGElement>(`:scope > .${FIGURE_CLASS}`);
  const fill = shape.getAttribute('fill') ?? '';
  const found = svgShapeOf(shape);
  if (!found || !fill) {
    existing?.remove();
    return;
  }
  const awake = found.extent >= POINT_HOVER_EXTENT[found.kind];
  const scale = found.extent * (awake ? DAB_GROW_HOVER : DAB_GROW) * SVG_GROW;
  const id = `${found.kind}${awake ? 1 : 0}|${scale.toFixed(2)}|${fill}`;
  if (existing?.dataset.figure === id) return;
  const marker = existing ?? document.createElementNS(SVG_NS, 'g');
  if (!existing) {
    marker.setAttribute('class', `${MARKER_CLASS} ${FIGURE_CLASS}`);
    marker.setAttribute('pointer-events', 'none');
    marker.setAttribute('aria-hidden', 'true');
  }
  marker.dataset.figure = id;
  const figure = figureFor(found.kind, awake);
  marker.setAttribute('transform', `rotate(${figure.turn}) scale(${scale.toFixed(3)})`);
  const width = (px: number) => (px / scale).toFixed(3);
  const parts: [string, Record<string, string>][] = [
    [
      figure.body,
      {
        fill,
        stroke: INK,
        'stroke-opacity': '0.4',
        'stroke-width': width(1),
        'stroke-linejoin': 'round',
      },
    ],
    [
      figure.limbs,
      {
        fill: 'none',
        stroke: found.kind === 'diamond' ? INK : fill,
        'stroke-width': width(1.5),
        'stroke-linecap': 'round',
      },
    ],
    [figure.light, { fill: HIGHLIGHT }],
    [figure.ink, { fill: INK, 'fill-opacity': '0.9' }],
  ];
  marker.replaceChildren();
  for (const [d, attributes] of parts) {
    if (!d) continue;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    for (const [name, value] of Object.entries(attributes)) path.setAttribute(name, value);
    marker.append(path);
  }
  // Over the chart's own marker, which the stylesheet turns to a faint wash under the figure.
  if (shape.nextSibling !== marker) shape.after(marker);
}

function markSvgPoints(root: ParentNode = document): void {
  const groups = [...root.querySelectorAll<SVGGElement>(SVG_POINT_SELECTOR)];
  if (root instanceof SVGGElement && root.matches(SVG_POINT_SELECTOR)) groups.push(root);
  for (const group of groups) {
    const shape = group.querySelector<SVGGraphicsElement>(':scope > .visible-shape');
    if (!shape) continue;
    if (!group.classList.contains('unofficial-overlay-pt')) {
      syncFigure(group, shape);
      continue;
    }
    if (group.querySelector(`:scope > .${MARKER_CLASS}`)) continue;
    // Overlay runs are inked crosses: a faint brushed ring circles each one.
    const marker = document.createElementNS(SVG_NS, 'g');
    marker.setAttribute('class', MARKER_CLASS);
    marker.setAttribute('pointer-events', 'none');
    marker.setAttribute('aria-hidden', 'true');
    const ring = document.createElementNS(SVG_NS, 'path');
    ring.setAttribute('d', 'M-7.5,0a7.5,7.5 0 1,0 15,0a7.5,7.5 0 1,0 -15,0');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#6d6245');
    ring.setAttribute('stroke-opacity', '0.4');
    ring.setAttribute('stroke-width', '1');
    ring.setAttribute('stroke-dasharray', '9 3 5 3');
    marker.append(ring);
    group.append(marker);
  }
}

/** Asks every chart canvas on the page to draw itself again. */
function redrawAll(): void {
  for (const layer of document.querySelectorAll(CANVAS_POINT_LAYER_SELECTOR)) {
    canvasPointLayerOf(layer)?.invalidate();
  }
}

export function mountGhibliCharts(): () => void {
  const surfaces = new Map<HTMLCanvasElement, Surface>();
  const extents = new WeakMap<Path2D, number>();
  const shapes = new WeakMap<Path2D, PointShape>();
  const grain = makeGrain();
  const scratch = document.createElement('canvas');
  const scratchContext = scratch.getContext('2d');
  let frame: number | undefined;
  let disposed = false;

  /** Finishes the frame the chart just drew: a hand wobble, then paper grain. */
  const finishFrame = (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => {
    const { width, height } = canvas;
    if (!scratchContext || width === 0 || height === 0) return;
    const ratio = width / Math.max(1, canvas.clientWidth || width);
    const strip = Math.max(1, Math.round(STRIP * ratio));
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const copy = () => {
      if (scratch.width !== width || scratch.height !== height) {
        scratch.width = width;
        scratch.height = height;
      } else scratchContext.clearRect(0, 0, width, height);
      scratchContext.drawImage(canvas, 0, 0);
      Reflect.apply(clear, context, [0, 0, width, height]);
    };
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.imageSmoothingEnabled = true;
    copy();
    for (let y = 0; y < height; y += strip) {
      const dx = wobble(y / ratio, 0.7) * ratio;
      context.drawImage(scratch, 0, y, width, strip, dx, y, width, strip);
    }
    copy();
    for (let x = 0; x < width; x += strip) {
      const dy = wobble(x / ratio, 3.9) * ratio;
      context.drawImage(scratch, x, 0, strip, height, x, dy, strip, height);
    }
    const tooth = grain ? context.createPattern(grain, 'repeat') : null;
    if (tooth) {
      tooth.setTransform(new DOMMatrix().scale(Math.max(1, ratio * 0.75)));
      context.globalCompositeOperation = 'destination-out';
      context.fillStyle = tooth;
      context.fillRect(0, 0, width, height);
    }
    context.restore();
  };

  const paintDab = (
    surface: Surface,
    context: CanvasRenderingContext2D,
    path: Path2D,
    fill: (path: Path2D) => void,
  ) => {
    const t = context.getTransform();
    let extent = extents.get(path);
    if (extent === undefined && isPlainTransform(t)) {
      extent = measurePointExtent(context, path, t);
      if (extent > 0) extents.set(path, extent);
    }
    if (!extent || !isPlainTransform(t)) {
      fill(path);
      return;
    }
    let shape = shapes.get(path);
    if (shape === undefined) {
      shape = classifyPointShape(context, path, t, extent);
      shapes.set(path, shape);
    }
    const n = surface.count++;
    const detailed = surface.lastCount <= DETAIL_LIMIT;
    const awake = extent >= POINT_HOVER_EXTENT[shape];
    const figure = figurePaths(shape, awake);
    const grow = awake ? DAB_GROW_HOVER : DAB_GROW;
    // No two figures stand quite alike: each leans a little, the same way every frame.
    const turn = (figure.turn * Math.PI) / 180 + (chance(n, 1) - 0.5) * 0.22;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const place = (k: number) =>
      context.setTransform(k * cos, k * sin, -k * sin, k * cos, t.e, t.f);
    const {
      globalAlpha,
      globalCompositeOperation,
      fillStyle,
      strokeStyle,
      lineWidth,
      lineJoin,
      lineCap,
    } = context;
    const k = t.a * grow * extent;
    if (detailed) {
      // The wash that bleeds past the figure's edge.
      place(k * BLEED_REACH);
      context.globalAlpha = globalAlpha * BLEED_ALPHA;
      fill(figure.body);
    }
    place(k);
    context.globalAlpha = globalAlpha * 0.92;
    fill(figure.body);
    // Pigment pools at the edge of wet paint and dries darker there.
    context.globalCompositeOperation = 'multiply';
    context.globalAlpha = globalAlpha * 0.7;
    context.strokeStyle = fillStyle;
    context.lineWidth = 1.4 / k;
    context.lineJoin = 'round';
    context.stroke(figure.body);
    context.globalCompositeOperation = 'source-over';
    if (figure.limbs) {
      context.globalAlpha = globalAlpha * 0.9;
      context.lineCap = 'round';
      context.lineWidth = 1.5 / k;
      context.strokeStyle = shape === 'diamond' ? INK : fillStyle;
      context.stroke(figure.limbs);
    }
    if (figure.light) {
      context.globalAlpha = globalAlpha;
      context.fillStyle = HIGHLIGHT;
      fill(figure.light);
    }
    context.globalAlpha = globalAlpha * 0.9;
    context.fillStyle = INK;
    fill(figure.ink);
    context.globalCompositeOperation = globalCompositeOperation;
    context.fillStyle = fillStyle;
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.lineJoin = lineJoin;
    context.lineCap = lineCap;
    context.globalAlpha = globalAlpha;
    context.setTransform(t);
  };

  const restore = (canvas: HTMLCanvasElement, surface: Surface) => {
    surface.release();
    painted.delete(canvas);
    canvas.removeAttribute(PAINTED_ATTRIBUTE);
    surfaces.delete(canvas);
  };

  const sync = () => {
    frame = undefined;
    if (disposed) return;
    for (const [canvas, surface] of surfaces) {
      if (!canvas.isConnected) restore(canvas, surface);
    }
    let added = false;
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
      `.${CANVAS_POINT_SURFACE_CLASS}`,
    )) {
      if (surfaces.has(canvas)) continue;
      const context = canvas.getContext('2d');
      if (!context) continue;
      const surface: Surface = { release: () => {}, count: 0, lastCount: 0, open: false };
      const release = hookPointFill(canvas, (target, path, fill) =>
        paintDab(surface, target, path, fill),
      );
      if (!release) continue;
      // The chart clears the whole canvas at the start of each frame and draws it in one go,
      // so the frame is complete by the time the microtask runs.
      context.clearRect = (...args: [number, number, number, number]) => {
        Reflect.apply(CanvasRenderingContext2D.prototype.clearRect, context, args);
        if (surface.open || args[2] < canvas.width || args[3] < canvas.height) return;
        surface.open = true;
        surface.lastCount = surface.count;
        surface.count = 0;
        queueMicrotask(() => {
          surface.open = false;
          if (!surfaces.has(canvas)) return;
          const before = painted.get(canvas) ?? 0;
          painted.set(canvas, surface.count);
          // A new set of points (first draw, a model or filter change) is washed in.
          if (surface.count > 0 && surface.count !== before) washIn(canvas);
          try {
            finishFrame(canvas, context);
          } catch {
            // Leave the frame as the chart drew it.
          }
        });
      };
      surface.release = () => {
        Reflect.deleteProperty(context, 'clearRect');
        release();
      };
      surfaces.set(canvas, surface);
      canvas.setAttribute(PAINTED_ATTRIBUTE, '');
      added = true;
    }
    if (added) redrawAll();
    markSvgPoints();
  };

  const schedule = () => {
    if (frame === undefined && !disposed) frame = requestAnimationFrame(sync);
  };

  const observer = new MutationObserver((records) => {
    let rescan = false;
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target;
        if (record.attributeName === POINTS_JOINED_ATTRIBUTE) rescan = true;
        else if (target instanceof SVGElement && target.classList.contains('visible-shape')) {
          // A point changed colour, shape or size: its figure follows.
          const group = target.parentElement;
          if (group instanceof SVGGElement && group.matches(SVG_POINT_SELECTOR)) {
            markSvgPoints(group);
          }
        }
        continue;
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element) || node.classList.contains(MARKER_CLASS)) continue;
        // SVG points are finished in this same task: the PNG export renders its clone and
        // captures it before the next animation frame.
        if (node instanceof SVGElement && node.classList.contains('visible-shape')) {
          const group = node.parentElement;
          if (group instanceof SVGGElement) markSvgPoints(group);
        } else if (node instanceof SVGElement) markSvgPoints(node);
        else if (node.querySelector(SVG_POINT_SELECTOR)) markSvgPoints(node);
        if (node instanceof HTMLCanvasElement || node.firstChild) rescan = true;
      }
      for (const node of record.removedNodes) {
        if (node instanceof Element && node.classList.contains(MARKER_CLASS)) continue;
        if (node instanceof HTMLCanvasElement || (node instanceof Element && node.firstChild)) {
          rescan = true;
        }
      }
    }
    if (rescan) schedule();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [POINTS_JOINED_ATTRIBUTE, 'fill', 'r', 'd', 'width', 'data-shape-key'],
  });
  sync();

  return () => {
    disposed = true;
    observer.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    for (const [canvas, surface] of surfaces) restore(canvas, surface);
    for (const marker of document.querySelectorAll(`.${MARKER_CLASS}`)) marker.remove();
    for (const sheet of document.querySelectorAll('.ghibli-wash-in')) sheet.remove();
    redrawAll();
  };
}
