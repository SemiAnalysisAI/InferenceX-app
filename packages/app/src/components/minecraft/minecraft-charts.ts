/**
 * Chart integration for the Minecraft theme. Everything here decorates what the charts already
 * draw and never changes data, scales, hit areas or event handlers:
 *
 * - canvas scatter points are painted as pixel-art items by the chart's own draw loop (its
 *   `fill` call is wrapped, see effects/canvas-point-paint), so they keep their series colour,
 *   opacity, fade and animated position. Every point is an 8x8 pixel block with a 1 px dark
 *   outline and a bevel (light top-left, dark bottom-right). The chart's shape encoding
 *   survives as the block's face: circle -> ore block (specks in a lighter tint of the
 *   series colour), square -> planks, triangle -> bricks, diamond -> gem ore;
 * - SVG points (`.dot-group`, smaller charts and PNG export) get the same pixel item;
 * - bars get a block texture and a pixel bevel;
 * - charts that mount "mine in": points pop in left to right like blocks being placed;
 * - a creeper peeks over the first chart card. Poke it and it hisses, swells and pops.
 *
 * `mountMinecraftCharts` returns a cleanup that removes every node, class, property and listener.
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

const SVG_NS = 'http://www.w3.org/2000/svg';
const POINT_SELECTOR = '.dot-group, .unofficial-overlay-pt';
const BAR_SELECTOR = 'rect.bar';
const TOOLTIP_SELECTOR = '[data-chart-tooltip]';
const TRACKED_SELECTOR = `${CANVAS_POINT_LAYER_SELECTOR}, ${POINT_SELECTOR}, ${BAR_SELECTOR}`;
const MARKER_CLASS = 'mc-point-marker';
const TEXTURE_CLASS = 'mc-bar-texture';
const BEVEL_CLASS = 'mc-bar-bevel';
const DEFS_CLASS = 'mc-defs';
const CREEPER_CLASS = 'mc-creeper';
const MINING_CLASS = 'mc-mining';
const EXPORT_SELECTOR = "[id$='-export']";
const CARD_SELECTOR = "main [data-slot='card']";
const INK = 'rgba(0, 0, 0, 0.85)';
const SHINE = 'rgba(255, 255, 255, 0.5)';
const SHADE = 'rgba(0, 0, 0, 0.38)';
/** Ore specks and mortar: a lighter tint of the series colour. */
const FLECK = 'rgba(255, 255, 255, 0.6)';
/** Plank seams and the shadow under each speck. */
const GROOVE = 'rgba(0, 0, 0, 0.34)';
/** One art pixel, in chart units, at the normal size. Items are 8 art pixels across. */
const PIXEL = 1.5;
const SMALL_PLOT = 460;
const SMALL_PIXEL = 1.1;
const HOVER_SCALE = 1.35;
/** Block-breaking crack cells drawn over the hovered or pinned item (stage 4 of 10). */
const CRACK_CELLS: [number, number][] = [
  [3, 1],
  [4, 2],
  [4, 3],
  [3, 4],
  [2, 5],
  [5, 4],
  [6, 5],
  [1, 6],
  [5, 1],
  [6, 2],
];
/** Corner brackets of the block-selection box, in art pixels around the 8x8 item. */
const SELECT_PATH = 'M-5 -5h3v1h-2v2h-1ZM5 -5v3h-1v-2h-2v-1ZM5 5h-3v-1h2v-2h1ZM-5 5v-3h1v2h2v1Z';
const STAMP_CLASS = 'mc-export-stamp';
const STAMP_ICONS = [
  '/decorative/minecraft/site/grass-side.png',
  '/decorative/minecraft/site/creeper-face.png',
  '/decorative/minecraft/ip/diamond-pickaxe.webp',
];
const CRACK_FILL = 'rgb(0 0 0 / 0.55)';
const PLACE_MS = 900;
const POP_MS = 180;
const DETAIL_LIMIT = 1800;

/**
 * Pixel items as row widths (in art pixels, centred) from top to bottom, 8 rows tall. Each
 * keeps the silhouette of the chart shape it replaces.
 */
const ROWS: Record<PointShape, number[]> = {
  square: [8, 8, 8, 8, 8, 8, 8, 8],
  circle: [4, 6, 8, 8, 8, 8, 6, 4],
  triangle: [2, 2, 4, 4, 6, 6, 8, 8],
  diamond: [2, 4, 6, 8, 8, 6, 4, 2],
};

interface ItemPaths {
  outline: string;
  shine: string;
  shade: string;
  light: string;
  dark: string;
}

const rect = (x: number, y: number, w: number) => `M${x} ${y}h${w}v1h${-w}Z`;

/** Outline, highlight pixels and shadow pixels of a pixel item, centred on 0,0. */
export function pixelItem(rows: number[]): ItemPaths {
  const top = -rows.length / 2;
  // Right side going down, then left side going up: one closed staircase polygon.
  let right = '';
  rows.forEach((width, index) => {
    const x = width / 2;
    right += `${index === 0 ? 'M' : 'L'}${x} ${top + index}L${x} ${top + index + 1}`;
  });
  let left = '';
  for (let index = rows.length - 1; index >= 0; index--) {
    const x = -rows[index] / 2;
    left += `L${x} ${top + index + 1}L${x} ${top + index}`;
  }
  const outline = `${right}${left}Z`;
  let shine = '';
  let shade = '';
  rows.forEach((width, index) => {
    const y = top + index;
    const above = index === 0 ? 0 : rows[index - 1];
    const below = index === rows.length - 1 ? 0 : rows[index + 1];
    const half = width / 2;
    // Pixels whose top is exposed catch the light; so does the left-most pixel of each row.
    if (width > above) {
      const exposed = (width - above) / 2;
      shine += rect(-half, y, exposed);
      if (above === 0) shine += rect(-half + exposed, y, width - exposed * 2 - 1);
    }
    shine += rect(-half, y, 1);
    // Pixels whose bottom is exposed are in shadow, as is the right-most pixel of each row.
    if (width > below) {
      const exposed = (width - below) / 2;
      shade += rect(half - exposed, y, exposed);
      if (below === 0) shade += rect(-half + 1, y, width - exposed - 1);
    }
    shade += rect(half - 1, y, 1);
  });
  return { outline, shine, shade, light: '', dark: '' };
}

/** Cells on the 8x8 face (0..7 from the top-left) as one path, centred on 0,0. */
const cells = (list: [number, number][]) =>
  list.map(([x, y]) => `M${x - 4} ${y - 4}h1v1h-1Z`).join('');

/** Face details per chart shape: [light cells, dark cells]. The rim is the bevel. */
const FACES: Record<PointShape, [[number, number][], [number, number][]]> = {
  // Ore block: three speck clusters, each with a shadow pixel.
  circle: [
    [
      [2, 2],
      [3, 2],
      [2, 3],
      [5, 2],
      [4, 4],
      [5, 4],
      [5, 5],
      [1, 5],
      [2, 5],
    ],
    [
      [3, 3],
      [6, 2],
      [5, 6],
      [2, 6],
      [6, 5],
    ],
  ],
  // Planks: three boards with staggered seams.
  square: [
    [],
    [
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
      [6, 2],
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
      [6, 5],
      [4, 1],
      [2, 3],
      [2, 4],
      [5, 6],
    ],
  ],
  // Bricks: light mortar rows and staggered joints.
  triangle: [
    [
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [5, 3],
      [6, 3],
      [1, 6],
      [2, 6],
      [3, 6],
      [4, 6],
      [5, 6],
      [6, 6],
      [3, 1],
      [3, 2],
      [5, 4],
      [5, 5],
    ],
    [],
  ],
  // Gem ore: a gem-shaped cluster and a single fleck.
  diamond: [
    [
      [3, 2],
      [2, 3],
      [4, 3],
      [3, 4],
      [5, 5],
      [1, 1],
    ],
    [
      [3, 3],
      [4, 4],
      [5, 6],
      [6, 5],
    ],
  ],
};

const blockItem = (kind: PointShape): ItemPaths => ({
  ...pixelItem(ROWS.square),
  light: cells(FACES[kind][0]),
  dark: cells(FACES[kind][1]),
});

/**
 * Round points also say which vendor family a series belongs to, read from the series colour
 * the chart already uses: red series (AMD) are TNT, green series (NVIDIA) are creeper faces,
 * every other colour keeps the ore block. Other shapes keep their own face.
 */
type ItemKind = PointShape | 'tnt' | 'creeper';
const FAMILY_FACES: Record<'tnt' | 'creeper', [[number, number][], [number, number][]]> = {
  // TNT: the pale label band across the middle with dark letters, dark fuse caps on top.
  tnt: [
    [
      [0, 3],
      [2, 3],
      [5, 3],
      [7, 3],
      [0, 4],
      [2, 4],
      [5, 4],
      [7, 4],
    ],
    [
      [1, 3],
      [3, 3],
      [4, 3],
      [6, 3],
      [1, 4],
      [3, 4],
      [6, 4],
      [1, 0],
      [3, 0],
      [5, 0],
      [7, 0],
    ],
  ],
  // Creeper: two square eyes over the long mouth.
  creeper: [
    [
      [0, 0],
      [4, 1],
      [7, 6],
      [0, 7],
    ],
    [
      [1, 2],
      [2, 2],
      [1, 3],
      [2, 3],
      [5, 2],
      [6, 2],
      [5, 3],
      [6, 3],
      [3, 4],
      [4, 4],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
      [2, 6],
      [5, 6],
    ],
  ],
};

const ITEMS: Record<ItemKind, ItemPaths> = {
  square: blockItem('square'),
  circle: blockItem('circle'),
  triangle: blockItem('triangle'),
  diamond: blockItem('diamond'),
  tnt: {
    ...pixelItem(ROWS.square),
    light: cells(FAMILY_FACES.tnt[0]),
    dark: cells(FAMILY_FACES.tnt[1]),
  },
  creeper: {
    ...pixelItem(ROWS.square),
    light: cells(FAMILY_FACES.creeper[0]),
    dark: cells(FAMILY_FACES.creeper[1]),
  },
};

/** Hue family of a CSS colour string as the canvas or computed style reports it. */
const familyCache = new Map<string, 'tnt' | 'creeper' | null>();
function familyOf(color: unknown): 'tnt' | 'creeper' | null {
  if (typeof color !== 'string') return null;
  const cached = familyCache.get(color);
  if (cached !== undefined) return cached;
  const hex = /^#(?<r>[0-9a-f]{2})(?<g>[0-9a-f]{2})(?<b>[0-9a-f]{2})/i.exec(color)?.groups;
  const rgb = /^rgba?\(\s*(?<r>\d+)[\s,]+(?<g>\d+)[\s,]+(?<b>\d+)/i.exec(color)?.groups;
  const parts = hex
    ? [hex.r, hex.g, hex.b].map((part) => Number.parseInt(part, 16))
    : rgb
      ? [rgb.r, rgb.g, rgb.b].map(Number)
      : null;
  if (!parts) {
    familyCache.set(color, null);
    return null;
  }
  const [r, g, b] = parts;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let family: 'tnt' | 'creeper' | null = null;
  if (max - min > 40) {
    if (max === r && g < r * 0.75 && b < r * 0.75) family = 'tnt';
    else if (max === g && r < g * 0.9 && b < g * 0.9) family = 'creeper';
  }
  familyCache.set(color, family);
  return family;
}
const itemKind = (shape: PointShape, color: unknown): ItemKind =>
  shape === 'circle' ? (familyOf(color) ?? 'circle') : shape;

export interface MinecraftChartCallbacks {
  /** A chart started placing its points. */
  onPlace?: (svg: SVGSVGElement) => void;
  /** A chart tooltip was shown (first time per tooltip element). */
  onTooltip?: () => void;
  /** Accessible name of the creeper peeking over the chart. */
  creeperLabel?: () => string;
  /** The creeper was poked; `onCreeperPop` fires when it explodes. */
  onCreeperHiss?: () => void;
  /** `count` is how many items the creeper's chart painted in its last frame. */
  onCreeperPop?: (count: number) => void;
  /** A hovered or pinned item was painted with a franchise face. */
  onHoverFace?: (face: 'creeper' | 'tnt') => void;
  /** Words on the export stamp. */
  stampLabel?: () => string;
}

interface Overlay {
  layer: CanvasPointLayerElement;
  svg: SVGSVGElement;
  host: HTMLElement;
  surface: HTMLCanvasElement | null;
  release: (() => void) | null;
  placeAt: number;
  subject: string;
  count: number;
  lastCount: number;
  frameNow: number | undefined;
  frameActive: boolean;
  pixel: number;
}

function isActive(): boolean {
  const root = document.documentElement;
  return (
    root.classList.contains('minecraft') &&
    !Object.hasOwn(root.dataset, 'inferencexEmbed') &&
    !isEmbedPathname(window.location.pathname)
  );
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function subjectOf(svg: SVGSVGElement): string {
  const figure = svg.closest('figure');
  return figure?.querySelector('figcaption')?.textContent ?? '';
}

function isMine(node: Node): boolean {
  return (
    node instanceof Element &&
    (node.classList.contains(MARKER_CLASS) ||
      node.classList.contains(TEXTURE_CLASS) ||
      node.classList.contains(BEVEL_CLASS) ||
      node.classList.contains(DEFS_CLASS) ||
      node.classList.contains(CREEPER_CLASS) ||
      node.classList.contains('mc-diamond-find') ||
      node.closest(`.${CREEPER_CLASS}, [data-testid="minecraft-play-banner"], .mc-toasts`) !== null)
  );
}

/** A deterministic pixel texture for bars: speckled stone, faint so labels stay crisp. */
function textureCells(): string {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  let light = '';
  let dark = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const r = random();
      if (r < 0.18) light += `M${x * 4} ${y * 4}h4v4h-4Z`;
      else if (r > 0.8) dark += `M${x * 4} ${y * 4}h4v4h-4Z`;
    }
  }
  return `${light}|${dark}`;
}

export function mountMinecraftCharts(callbacks: MinecraftChartCallbacks = {}): () => void {
  const overlays = new Map<Element, Overlay>();
  const markers = new Map<Element, SVGGElement>();
  const textures = new Map<Element, SVGRectElement>();
  const bevels = new Map<Element, SVGPathElement>();
  const defs = new Set<SVGDefsElement>();
  const tooltips = new WeakSet<HTMLElement>();
  const extents = new WeakMap<Path2D, number>();
  const kinds = new WeakMap<Path2D, PointShape>();
  const paths = new Map<
    ItemKind,
    { outline: Path2D; shine: Path2D; shade: Path2D; light: Path2D | null; dark: Path2D | null }
  >();
  const pathsOf = (kind: ItemKind) => {
    let item = paths.get(kind);
    if (!item) {
      item = {
        outline: new Path2D(ITEMS[kind].outline),
        shine: new Path2D(ITEMS[kind].shine),
        shade: new Path2D(ITEMS[kind].shade),
        light: ITEMS[kind].light ? new Path2D(ITEMS[kind].light) : null,
        dark: ITEMS[kind].dark ? new Path2D(ITEMS[kind].dark) : null,
      };
      paths.set(kind, item);
    }
    return item;
  };
  const crackPath = new Path2D(CRACK_CELLS.map(([x, y]) => `M${x - 4} ${y - 4}h1v1h-1Z`).join(''));
  const selectPath = new Path2D(SELECT_PATH);
  let frame: number | undefined;
  let scanFrame: number | undefined;
  let disposed = false;

  // ------------------------------------------------------------ canvas items
  const paintItem = (
    overlay: Overlay,
    context: CanvasRenderingContext2D,
    path: Path2D,
    fill: (path: Path2D) => void,
  ) => {
    if (overlay.frameNow === undefined) {
      overlay.frameNow = performance.now();
      overlay.frameActive = isActive();
      const small = (overlay.surface?.clientWidth ?? SMALL_PLOT) < SMALL_PLOT;
      overlay.pixel = small ? SMALL_PIXEL : PIXEL;
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
      if (extent > 0) extents.set(path, extent);
    }
    if (extent <= 0) {
      fill(path);
      return;
    }
    const alpha = context.globalAlpha;
    let shown = alpha;
    let grow = 1;
    const elapsed = overlay.frameNow - overlay.placeAt;
    if (elapsed < PLACE_MS + POP_MS) {
      const width = overlay.surface?.width || 1;
      const progress = (elapsed - Math.min(1, Math.max(0, t.e / width)) * PLACE_MS) / POP_MS;
      if (progress <= 0) return;
      // Placed blocks pop: overshoot a little, then settle.
      grow = progress >= 1 ? 1 : 0.4 + progress * 0.85 - Math.max(0, progress - 0.7) * 0.8;
      shown *= Math.min(1, progress * 3);
    }
    let kind = kinds.get(path);
    if (kind === undefined) {
      kind = classifyPointShape(context, path, t, extent);
      kinds.set(path, kind);
    }
    const { lineWidth, lineJoin, strokeStyle, fillStyle } = context;
    const item = pathsOf(itemKind(kind, fillStyle));
    const hovered = extent >= POINT_HOVER_EXTENT[kind];
    // The hovered item stays within the stock hover size plus 4 px, brackets included.
    const scale =
      (hovered ? Math.min(overlay.pixel * HOVER_SCALE, (extent * 2 + 4) / 10) : overlay.pixel) *
      grow;
    context.setTransform(t.a * scale, 0, 0, t.d * scale, t.e, t.f);
    context.globalAlpha = shown;
    fill(item.outline);
    if (overlay.lastCount <= DETAIL_LIMIT) {
      context.fillStyle = SHINE;
      fill(item.shine);
      context.fillStyle = SHADE;
      fill(item.shade);
      if (item.light) {
        context.fillStyle = FLECK;
        fill(item.light);
      }
      if (item.dark) {
        context.fillStyle = GROOVE;
        fill(item.dark);
      }
      context.fillStyle = fillStyle;
    }
    context.lineJoin = 'miter';
    context.lineWidth = 1 / scale;
    context.strokeStyle = INK;
    context.stroke(item.outline);
    if (hovered) {
      // Hovered or pinned: the block is being mined, inside the game's selection box.
      context.fillStyle = CRACK_FILL;
      fill(crackPath);
      context.fillStyle = INK;
      fill(selectPath);
      context.fillStyle = fillStyle;
      if (item === paths.get('creeper')) callbacks.onHoverFace?.('creeper');
      else if (item === paths.get('tnt')) callbacks.onHoverFace?.('tnt');
    }
    context.lineWidth = lineWidth;
    context.lineJoin = lineJoin;
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
      paintItem(overlay, context, path, fill),
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
      if (!overlay.layer.isConnected || now - overlay.placeAt > PLACE_MS + POP_MS + 60) continue;
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

  const miningTimers = new Map<HTMLElement, number>();
  const startPlacing = (overlay: Overlay) => {
    overlay.subject = subjectOf(overlay.svg);
    if (reducedMotion()) {
      overlay.placeAt = -Infinity;
      kick(overlay);
      return;
    }
    overlay.placeAt = performance.now();
    const { host } = overlay;
    host.classList.remove(MINING_CLASS);
    void host.offsetWidth;
    host.classList.add(MINING_CLASS);
    window.clearTimeout(miningTimers.get(host));
    miningTimers.set(
      host,
      window.setTimeout(() => {
        host.classList.remove(MINING_CLASS);
        miningTimers.delete(host);
      }, PLACE_MS),
    );
    callbacks.onPlace?.(overlay.svg);
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
      placeAt: -Infinity,
      subject: '',
      count: 0,
      lastCount: 0,
      frameNow: undefined,
      frameActive: false,
      pixel: PIXEL,
    };
    overlays.set(layer, overlay);
    startPlacing(overlay);
  };

  const removeOverlay = (overlay: Overlay) => {
    unhook(overlay);
    overlay.host.classList.remove(MINING_CLASS);
    window.clearTimeout(miningTimers.get(overlay.host));
    miningTimers.delete(overlay.host);
    overlays.delete(overlay.layer);
    if (overlay.layer.isConnected) redraw(overlay);
  };

  // ------------------------------------------------------------ SVG items
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
    const kind = (shape?.dataset.shapeKey as PointShape | undefined) ?? 'circle';
    const fill = shape ? getComputedStyle(shape).fill : '';
    const item = ITEMS[itemKind(ITEMS[kind] ? kind : 'circle', fill)];
    const marker = document.createElementNS(SVG_NS, 'g');
    marker.setAttribute('class', MARKER_CLASS);
    marker.setAttribute('aria-hidden', 'true');
    marker.setAttribute('pointer-events', 'none');
    marker.setAttribute('shape-rendering', 'crispEdges');
    const markerScale = PIXEL;
    marker.setAttribute('transform', `scale(${markerScale})`);
    const piece = (d: string, paint: string) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', paint);
      return path;
    };
    const body = piece(item.outline, fill && fill !== 'none' ? fill : 'currentColor');
    body.setAttribute('stroke', INK);
    body.setAttribute('stroke-width', String(1 / markerScale));
    body.setAttribute('stroke-linejoin', 'miter');
    marker.append(body, piece(item.shine, SHINE), piece(item.shade, SHADE));
    if (item.light) marker.append(piece(item.light, FLECK));
    if (item.dark) marker.append(piece(item.dark, GROOVE));
    if (shape) shape.after(marker);
    else {
      const anchor = point.querySelector(':scope > text') ?? pointLabelAnchor(point);
      if (anchor) anchor.before(marker);
      else point.append(marker);
    }
    markers.set(point, marker);
  };

  // ------------------------------------------------------------ block bars
  let patternSerial = 0;
  const [lightCells, darkCells] = textureCells().split('|');
  const ensurePattern = (svg: SVGSVGElement): string => {
    const existing = svg.querySelector(`:scope > defs.${DEFS_CLASS} > pattern`);
    if (existing) return existing.id;
    const holder = document.createElementNS(SVG_NS, 'defs');
    holder.setAttribute('class', DEFS_CLASS);
    const pattern = document.createElementNS(SVG_NS, 'pattern');
    const id = `mc-block-texture-${++patternSerial}`;
    pattern.setAttribute('id', id);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '32');
    pattern.setAttribute('height', '32');
    const light = document.createElementNS(SVG_NS, 'path');
    light.setAttribute('d', lightCells);
    light.setAttribute('fill', 'rgba(255, 255, 255, 0.13)');
    const dark = document.createElementNS(SVG_NS, 'path');
    dark.setAttribute('d', darkCells);
    dark.setAttribute('fill', 'rgba(0, 0, 0, 0.16)');
    pattern.append(light, dark);
    holder.append(pattern);
    svg.prepend(holder);
    defs.add(holder);
    return id;
  };

  const syncBar = (bar: Element) => {
    const texture = textures.get(bar);
    if (texture) {
      for (const name of ['x', 'y', 'width', 'height', 'transform']) {
        const value = bar.getAttribute(name);
        if (value === null) texture.removeAttribute(name);
        else if (texture.getAttribute(name) !== value) texture.setAttribute(name, value);
      }
    }
    const bevel = bevels.get(bar);
    if (!bevel) return;
    const x = Number(bar.getAttribute('x')) || 0;
    const y = Number(bar.getAttribute('y')) || 0;
    const width = Number(bar.getAttribute('width')) || 0;
    const height = Number(bar.getAttribute('height')) || 0;
    let d = '';
    if (width >= 6 && height >= 6) {
      const b = Math.min(3, width / 6, height / 6);
      // Light top and left strips, dark bottom and right strips: a raised block face.
      d =
        `M${x} ${y}h${width}v${b}h${-(width - b)}v${height - b}h${-b}Z|` +
        `M${x + width} ${y + height}h${-width}v${-b}h${width - b}v${-(height - b)}h${b}Z`;
    }
    const [light = '', dark = ''] = d.split('|');
    if (bevel.dataset.light !== light) {
      bevel.dataset.light = light;
      bevel.setAttribute('d', light);
    }
    const shadow = bevel.nextElementSibling;
    if (shadow instanceof SVGPathElement && shadow.classList.contains(BEVEL_CLASS)) {
      if (shadow.getAttribute('d') !== dark) shadow.setAttribute('d', dark);
      const transform = bar.getAttribute('transform');
      for (const node of [bevel, shadow]) {
        if (transform === null) node.removeAttribute('transform');
        else node.setAttribute('transform', transform);
      }
    }
  };

  const decorateBar = (bar: Element) => {
    if (!(bar instanceof SVGRectElement) || !bar.ownerSVGElement) return;
    const existing = textures.get(bar);
    if (existing?.previousElementSibling === bar) return;
    existing?.remove();
    const oldBevel = bevels.get(bar);
    oldBevel?.nextElementSibling?.remove();
    oldBevel?.remove();
    const patternId = ensurePattern(bar.ownerSVGElement);
    const texture = document.createElementNS(SVG_NS, 'rect');
    texture.setAttribute('class', TEXTURE_CLASS);
    texture.setAttribute('aria-hidden', 'true');
    texture.setAttribute('pointer-events', 'none');
    texture.setAttribute('fill', `url(#${patternId})`);
    texture.setAttribute('stroke', 'none');
    const light = document.createElementNS(SVG_NS, 'path');
    light.setAttribute('class', BEVEL_CLASS);
    light.setAttribute('aria-hidden', 'true');
    light.setAttribute('pointer-events', 'none');
    light.setAttribute('fill', 'rgba(255, 255, 255, 0.32)');
    light.setAttribute('shape-rendering', 'crispEdges');
    const dark = light.cloneNode() as SVGPathElement;
    dark.setAttribute('fill', 'rgba(0, 0, 0, 0.32)');
    bar.after(texture, light, dark);
    textures.set(bar, texture);
    bevels.set(bar, light);
    syncBar(bar);
  };

  // ------------------------------------------------------------ export
  // The PNG export clones the chart; the pipeline only copies a few styles, so carry the
  // pixel styling of the grid, axes, frontier lines and bars across as inline styles.
  const EXPORT_STYLES: [string, string[]][] = [
    [
      '.chart-root :is(.grid, .grid-h, .grid-v) line',
      ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'shape-rendering'],
    ],
    ['.chart-root .domain', ['stroke', 'stroke-width', 'stroke-linecap', 'shape-rendering']],
    ['.chart-root .tick line', ['stroke', 'stroke-width']],
    [
      '.chart-root :is(.roofline-path, .overlay-roofline-path, .global-pareto-frontier)',
      ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linejoin', 'shape-rendering'],
    ],
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

  // The PNG gets a block stamp in the export padding, below the legend and above the
  // watermark strip the exporter adds. The exporter empties the container afterwards.
  const stampExport = (host: HTMLElement | null) => {
    if (!host || host.querySelector(`:scope > .${STAMP_CLASS}`)) return;
    const stamp = document.createElement('div');
    stamp.className = STAMP_CLASS;
    stamp.setAttribute('aria-hidden', 'true');
    for (const src of STAMP_ICONS) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.width = 14;
      img.height = 14;
      stamp.append(img);
    }
    const label = document.createElement('span');
    label.textContent = callbacks.stampLabel?.() ?? 'Minecraft';
    stamp.append(label);
    host.append(stamp);
  };

  // ------------------------------------------------------------ creeper
  let creeper: HTMLButtonElement | null = null;
  let creeperCard: HTMLElement | null = null;
  const creeperTimers = new Set<number>();
  const dropCreeper = () => {
    creeper?.remove();
    creeper = null;
    if (creeperCard) delete creeperCard.dataset.mcCreeperHost;
    creeperCard = null;
  };
  const placeCreeper = () => {
    if (!isActive()) {
      dropCreeper();
      return;
    }
    const svg = document.querySelector<SVGSVGElement>(
      "main [data-slot='card'] svg[data-testid='d3-chart-svg']",
    );
    const card = svg?.closest<HTMLElement>("[data-slot='card']") ?? null;
    if (!card || card.offsetWidth < 360) {
      dropCreeper();
      return;
    }
    if (creeper && creeperCard === card && creeper.isConnected) return;
    dropCreeper();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = CREEPER_CLASS;
    button.dataset.mcSilent = '';
    button.setAttribute('aria-label', callbacks.creeperLabel?.() ?? 'Creeper');
    button.innerHTML = `<span class="mc-creeper-face" aria-hidden="true"></span>`;
    button.addEventListener('click', () => {
      if (button.dataset.state) return;
      button.dataset.state = 'hiss';
      callbacks.onCreeperHiss?.();
      const pop = window.setTimeout(
        () => {
          creeperTimers.delete(pop);
          button.dataset.state = 'pop';
          const chart = creeperCard?.querySelector("svg[data-testid='d3-chart-svg']");
          let count = 0;
          for (const overlay of overlays.values()) {
            if (overlay.svg === chart) count = overlay.lastCount;
          }
          callbacks.onCreeperPop?.(count);
          const back = window.setTimeout(() => {
            creeperTimers.delete(back);
            delete button.dataset.state;
          }, 6000);
          creeperTimers.add(back);
        },
        reducedMotion() ? 200 : 1500,
      );
      creeperTimers.add(pop);
    });
    card.dataset.mcCreeperHost = '';
    card.append(button);
    creeper = button;
    creeperCard = card;
  };

  // ------------------------------------------------------------ scanning
  const decorateWithin = (node: Element) => {
    if (node.matches(POINT_SELECTOR)) decoratePoint(node);
    else if (node.matches(BAR_SELECTOR)) decorateBar(node);
    if (node.firstElementChild) {
      node.querySelectorAll(POINT_SELECTOR).forEach(decoratePoint);
      node.querySelectorAll(BAR_SELECTOR).forEach(decorateBar);
    }
  };

  let placeFrame: number | undefined;
  const schedulePlace = () => {
    if (placeFrame === undefined && !disposed) {
      placeFrame = requestAnimationFrame(() => {
        placeFrame = undefined;
        placeCreeper();
      });
    }
  };

  const scan = () => {
    scanFrame = undefined;
    if (disposed) return;
    for (const overlay of overlays.values()) {
      if (!overlay.layer.isConnected || !isActive()) removeOverlay(overlay);
    }
    for (const [point] of markers) if (!point.isConnected) removeMarker(point);
    for (const [bar, texture] of textures) {
      if (!bar.isConnected) {
        texture.remove();
        textures.delete(bar);
        const bevel = bevels.get(bar);
        bevel?.nextElementSibling?.remove();
        bevel?.remove();
        bevels.delete(bar);
      }
    }
    for (const holder of defs) if (!holder.isConnected) defs.delete(holder);
    if (!isActive()) {
      dropCreeper();
      return;
    }
    document
      .querySelectorAll<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR)
      .forEach((layer) => {
        if (!overlays.has(layer)) addOverlay(layer);
      });
    decorateWithin(document.body);
    schedulePlace();
  };

  const scheduleScan = () => {
    if (scanFrame === undefined && !disposed) scanFrame = requestAnimationFrame(scan);
  };

  const observer = new MutationObserver((records) => {
    if (!isActive()) {
      scheduleScan();
      return;
    }
    let rescan = false;
    for (const record of records) {
      const { target } = record;
      if (record.type === 'attributes') {
        if (!(target instanceof Element)) continue;
        if (record.attributeName === 'data-points-joined') {
          const overlay = overlays.get(target);
          if (!overlay) rescan = true;
          else if (subjectOf(overlay.svg) === overlay.subject) hook(overlay);
          else startPlacing(overlay);
        } else if (record.attributeName === 'fill') {
          const point = target.parentElement;
          if (point && markers.has(point) && target.classList.contains('visible-shape')) {
            removeMarker(point);
            decoratePoint(point);
          }
        } else if (textures.has(target)) {
          syncBar(target);
        }
        continue;
      }
      // Decorate inserted SVG points in this same task: PNG export renders its clone and
      // captures it before the next animation frame.
      for (const node of record.addedNodes) {
        if (!(node instanceof Element) || isMine(node)) continue;
        decorateWithin(node);
        if (node.closest(EXPORT_SELECTOR)) {
          styleExport(node);
          stampExport(node.closest<HTMLElement>(EXPORT_SELECTOR));
        }
        if (node.matches(CARD_SELECTOR) || node.querySelector(CARD_SELECTOR)) schedulePlace();
        if (
          node.matches(CANVAS_POINT_LAYER_SELECTOR) ||
          node.querySelector(CANVAS_POINT_LAYER_SELECTOR)
        ) {
          rescan = true;
        }
        if (target instanceof Element) {
          if (target.matches(POINT_SELECTOR)) decoratePoint(target);
          const tooltip = target.closest<HTMLElement>(TOOLTIP_SELECTOR);
          if (tooltip && !tooltips.has(tooltip)) {
            tooltips.add(tooltip);
            callbacks.onTooltip?.();
          }
        }
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(CARD_SELECTOR)) schedulePlace();
        if (
          node.classList.contains(MARKER_CLASS) ||
          node.classList.contains(TEXTURE_CLASS) ||
          node.classList.contains(BEVEL_CLASS)
        ) {
          if (target instanceof Element && target.isConnected) decorateWithin(target);
        } else if (
          !isMine(node) &&
          (node.matches(TRACKED_SELECTOR) || node.querySelector(TRACKED_SELECTOR) !== null)
        ) {
          rescan = true;
        }
      }
    }
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
  window.addEventListener('resize', schedulePlace);

  scan();

  return () => {
    disposed = true;
    observer.disconnect();
    themeObserver.disconnect();
    window.removeEventListener('resize', schedulePlace);
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (scanFrame !== undefined) cancelAnimationFrame(scanFrame);
    if (placeFrame !== undefined) cancelAnimationFrame(placeFrame);
    for (const timer of creeperTimers) window.clearTimeout(timer);
    creeperTimers.clear();
    for (const timer of miningTimers.values()) window.clearTimeout(timer);
    dropCreeper();
    document.querySelectorAll(`.${STAMP_CLASS}`).forEach((node) => node.remove());
    for (const overlay of overlays.values()) removeOverlay(overlay);
    for (const [point] of markers) removeMarker(point);
    for (const [, texture] of textures) texture.remove();
    textures.clear();
    for (const [, bevel] of bevels) {
      bevel.nextElementSibling?.remove();
      bevel.remove();
    }
    bevels.clear();
    for (const holder of defs) holder.remove();
    defs.clear();
  };
}
