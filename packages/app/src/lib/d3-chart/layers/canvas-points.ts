import { easeCubicInOut, select } from 'd3';

import {
  HIT_AREA_RADIUS,
  SHAPE_CONFIG,
  SHAPE_ORDER,
  type ShapeKey,
} from '@/lib/charts/chart-rendering';

import { setStyleIfChanged } from '../chart-update';
import type { ContinuousScale } from '../types';
import { PointHitGrid, hitAreaPath } from './canvas-point-hit';
import { joinedDrawOrder } from './canvas-point-order';
import { resolveShapeKey, syncPointLabel, type ScatterPointConfig } from './scatter-points';

export const CANVAS_POINT_LAYER_CLASS = 'canvas-point-layer';
export const CANVAS_POINT_LAYER_SELECTOR = `.${CANVAS_POINT_LAYER_CLASS}`;
export const POINT_HIT_AREA_CLASS = 'dot-hit-area';
export const POINT_LABEL_ANCHOR_CLASS = 'point-label-anchor';
export const POINTS_JOINED_ATTRIBUTE = 'data-points-joined';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const CSS_EASE_X1 = 0.25;
const CSS_EASE_Y1 = 0.1;
const CSS_EASE_X2 = 0.25;
const CSS_EASE_Y2 = 1;
const FADED_OPACITY = 0.2;
const MARKER_SIZE = 20;
const MARKER_HOVER_SCALE = 1.15;
const NO_SLOT = 0;
const NO_SHAPE = 255;

export interface ScatterDatum {
  precision: string;
  x: number;
  y: number;
}

export interface PointPosition {
  x: number;
  y: number;
}

export interface PointHaloStyle {
  radius: number;
  strokeWidth: number;
  dash: readonly number[];
  opacity: number;
}

export interface PointPointerHandlers<T> {
  enter: (event: MouseEvent, datum: T, position: PointPosition) => boolean;
  move: (event: MouseEvent) => void;
  leave: (event: MouseEvent, datum: T) => boolean;
  click: (event: MouseEvent, datum: T, position: PointPosition) => void;
}

export interface ScatterPointSnapshot<T = unknown> {
  key: string;
  datum: T;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  opacity: number;
  interactive: boolean;
  shape: ShapeKey;
  color: string;
  halo: string | null;
  faded: boolean;
  hovered: boolean;
  label: string | null;
  attrs: Record<string, string>;
}

export interface CanvasPointLayerElement extends SVGGElement {
  scatterPoints?: () => ScatterPointSnapshot[];
}

export type PointPositions = Map<number, PointPosition>;

function cssEaseComponent(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

export function cssEase(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let t = progress;
  for (let step = 0; step < 8; step++) {
    const x = cssEaseComponent(t, CSS_EASE_X1, CSS_EASE_X2) - progress;
    const u = 1 - t;
    const slope =
      3 * u * u * CSS_EASE_X1 +
      6 * u * t * (CSS_EASE_X2 - CSS_EASE_X1) +
      3 * t * t * (1 - CSS_EASE_X2);
    if (Math.abs(x) < 1e-7 || slope === 0) break;
    t = Math.min(1, Math.max(0, t - x / slope));
  }
  return cssEaseComponent(t, CSS_EASE_Y1, CSS_EASE_Y2);
}

interface RedrawableLayer {
  readonly element: Element;
  invalidate: () => void;
}

const layers = new WeakMap<Element, RedrawableLayer>();
const liveLayers = new Set<RedrawableLayer>();
let themeObserver: MutationObserver | null = null;

function observeTheme(): void {
  if (themeObserver || typeof MutationObserver === 'undefined') return;
  themeObserver = new MutationObserver(() => {
    for (const layer of liveLayers) {
      if (layer.element.isConnected) layer.invalidate();
      else liveLayers.delete(layer);
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
}

export function canvasPointLayerOf<T extends ScatterDatum = ScatterDatum>(
  root: Element | null | undefined,
): CanvasPointLayer<T> | null {
  if (!root) return null;
  const element = root.matches(CANVAS_POINT_LAYER_SELECTOR)
    ? root
    : root.querySelector(CANVAS_POINT_LAYER_SELECTOR);
  const layer = element ? layers.get(element) : undefined;
  return layer instanceof CanvasPointLayer ? (layer as CanvasPointLayer<T>) : null;
}

export function ensureCanvasPointLayer<T extends ScatterDatum>(
  zoomGroup: SVGGElement,
): CanvasPointLayer<T> {
  const existing = canvasPointLayerOf<T>(zoomGroup);
  if (existing && existing.element.parentNode === zoomGroup) return existing;
  const layer = new CanvasPointLayer<T>(zoomGroup.ownerDocument);
  zoomGroup.append(layer.element);
  layers.set(layer.element, layer);
  liveLayers.add(layer);
  observeTheme();
  return layer;
}

export class CanvasPointLayer<T extends ScatterDatum> {
  readonly element: CanvasPointLayerElement;
  private readonly foreignObject: SVGForeignObjectElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly hitPath: SVGPathElement;
  private readonly labelLayer: SVGGElement;
  private context: CanvasRenderingContext2D | null | undefined;
  private shapePaths: Map<string, Path2D> | null = null;

  data: T[] = [];
  private keys: string[] = [];
  private slots = new Uint32Array(0);
  private indexBySlot = new Map<number, number>();
  private nextSlot = 1;
  private count = 0;
  private config: ScatterPointConfig<T> | null = null;
  private width = 0;
  private height = 0;
  private joins = 0;

  private xs = new Float64Array(0);
  private ys = new Float64Array(0);
  private drawXs = new Float64Array(0);
  private drawYs = new Float64Array(0);
  private fromXs = new Float64Array(0);
  private fromYs = new Float64Array(0);
  private moving = new Uint8Array(0);
  private alpha = new Float64Array(0);
  private shownAlpha = new Float64Array(0);
  private fromAlpha = new Float64Array(0);
  private settled = new Uint8Array(0);
  private interactive = new Uint8Array(0);
  private faded = new Uint8Array(0);
  private shape = new Uint8Array(0);
  private colorIndex = new Uint16Array(0);
  private haloIndex = new Uint16Array(0);
  private shapeReplaced = new Uint8Array(0);
  private filterFirst = new Uint8Array(0);
  private fresh = new Uint8Array(0);
  private palette: string[] = [];

  private fadePredicate: ((datum: T) => boolean) | null = null;
  private haloStroke: ((datum: T) => string | null) | null = null;
  private haloStyle: PointHaloStyle | null = null;
  private marker: HTMLImageElement | null = null;
  private labelText: ((datum: T) => string) | null = null;
  private labelForeground = '';
  private readonly labelAnchors = new Map<number, SVGGElement>();

  private readonly grid = new PointHitGrid(HIT_AREA_RADIUS);
  private gridDirty = true;
  private hitPathDirty = false;
  private hoveredSlot = NO_SLOT;
  private pointerSlot = NO_SLOT;
  private handlers: PointPointerHandlers<T> | null = null;

  private opacityTransitionMs = 0;
  private alphaStart = -1;
  private alphaAnimating = false;
  private positionDuration = 0;
  private positionStart = -1;
  private positionAnimating = false;
  private frame: number | null = null;

  constructor(document: Document) {
    this.element = document.createElementNS(SVG_NS, 'g');
    this.element.setAttribute('class', CANVAS_POINT_LAYER_CLASS);
    this.element.setAttribute(POINTS_JOINED_ATTRIBUTE, '0');
    this.element.scatterPoints = () => this.snapshot();
    this.foreignObject = document.createElementNS(SVG_NS, 'foreignObject');
    this.foreignObject.setAttribute('pointer-events', 'none');
    this.canvas = document.createElementNS(XHTML_NS, 'canvas') as HTMLCanvasElement;
    this.canvas.style.display = 'block';
    this.canvas.style.pointerEvents = 'none';
    this.foreignObject.append(this.canvas);
    this.hitPath = document.createElementNS(SVG_NS, 'path');
    this.hitPath.setAttribute('class', POINT_HIT_AREA_CLASS);
    this.hitPath.setAttribute('fill', 'transparent');
    this.hitPath.setAttribute('cursor', 'pointer');
    this.labelLayer = document.createElementNS(SVG_NS, 'g');
    this.labelLayer.setAttribute('class', 'point-label-layer');
    this.element.append(this.foreignObject, this.hitPath, this.labelLayer);
  }

  join(
    data: readonly T[],
    keyFn: ((datum: T) => string) | undefined,
    width: number,
    height: number,
  ): void {
    const nextKeys = data.map((datum, index) => (keyFn ? keyFn(datum) : String(index)));
    const { order, previous } = joinedDrawOrder(this.keys, nextKeys);
    const before = {
      slots: this.slots,
      xs: this.drawXs,
      ys: this.drawYs,
      shownAlpha: this.shownAlpha,
      alpha: this.alpha,
      settled: this.settled,
      shape: this.shape,
      faded: this.faded,
      shapeReplaced: this.shapeReplaced,
      filterFirst: this.filterFirst,
    };
    const count = order.length;
    this.allocate(count);
    this.data = order.map((index) => data[index]);
    this.keys = order.map((index) => nextKeys[index]);
    this.indexBySlot = new Map();
    let entered = 0;
    for (let index = 0; index < count; index++) {
      const source = previous[index];
      if (source < 0) {
        entered++;
        this.slots[index] = this.nextSlot++;
        this.shape[index] = NO_SHAPE;
        this.fresh[index] = 1;
      } else {
        this.slots[index] = before.slots[source];
        this.drawXs[index] = before.xs[source];
        this.drawYs[index] = before.ys[source];
        this.shownAlpha[index] = before.shownAlpha[source];
        this.alpha[index] = before.alpha[source];
        this.settled[index] = before.settled[source];
        this.shape[index] = before.shape[source];
        this.faded[index] = before.faded[source];
        this.shapeReplaced[index] = before.shapeReplaced[source];
        this.filterFirst[index] = before.filterFirst[source];
      }
      this.indexBySlot.set(this.slots[index], index);
    }
    for (const [slot, anchor] of this.labelAnchors) {
      if (!this.indexBySlot.has(slot)) {
        anchor.remove();
        this.labelAnchors.delete(slot);
      }
    }
    this.positionAnimating = false;
    this.gridDirty = true;
    this.hitPathDirty = true;
    this.resize(width, height);
    if (entered > 0) {
      this.joins++;
      this.element.setAttribute(POINTS_JOINED_ATTRIBUTE, String(this.joins));
    }
  }

  replaceData(data: readonly T[], keyFn: ((datum: T) => string) | undefined): void {
    const nextByKey = new Map<string, T>();
    data.forEach((datum, index) => nextByKey.set(keyFn ? keyFn(datum) : String(index), datum));
    for (let index = 0; index < this.count; index++) {
      const next = nextByKey.get(this.keys[index]);
      if (next) Object.assign(this.data[index], next);
    }
  }

  orderedLike(data: readonly T[], keyFn: ((datum: T) => string) | undefined): T[] {
    const keys = data.map((datum, index) => (keyFn ? keyFn(datum) : String(index)));
    return joinedDrawOrder(this.keys, keys).order.map((index) => data[index]);
  }

  private allocate(count: number): void {
    this.count = count;
    this.slots = new Uint32Array(count);
    this.xs = new Float64Array(count);
    this.ys = new Float64Array(count);
    this.drawXs = new Float64Array(count);
    this.drawYs = new Float64Array(count);
    this.fromXs = new Float64Array(count);
    this.fromYs = new Float64Array(count);
    this.moving = new Uint8Array(count);
    this.alpha = new Float64Array(count);
    this.shownAlpha = new Float64Array(count);
    this.fromAlpha = new Float64Array(count);
    this.settled = new Uint8Array(count);
    this.interactive = new Uint8Array(count);
    this.faded = new Uint8Array(count);
    this.shape = new Uint8Array(count);
    this.colorIndex = new Uint16Array(count);
    this.haloIndex = new Uint16Array(count);
    this.shapeReplaced = new Uint8Array(count);
    this.filterFirst = new Uint8Array(count);
    this.fresh = new Uint8Array(count);
  }

  private resize(width: number, height: number): void {
    const ratio = globalThis.devicePixelRatio || 1;
    this.width = width;
    this.height = height;
    this.foreignObject.setAttribute('width', String(width));
    this.foreignObject.setAttribute('height', String(height));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
  }

  private paletteSlots(palette: string[]): (color: string) => number {
    const slotByColor = new Map(palette.map((color, index) => [color, index]));
    return (color) => {
      let slot = slotByColor.get(color);
      if (slot === undefined) {
        slot = palette.length;
        palette.push(color);
        slotByColor.set(color, slot);
      }
      return slot;
    };
  }

  restyle(config: ScatterPointConfig<T>): void {
    this.config = config;
    this.palette = [];
    const colorSlot = this.paletteSlots(this.palette);
    const { getOpacity, getPointerEvents, getShapeKey, getColor, selectedPrecisions } = config;
    for (let index = 0; index < this.count; index++) {
      const datum = this.data[index];
      this.alpha[index] = getOpacity ? getOpacity(datum) : 1;
      this.interactive[index] = getPointerEvents && getPointerEvents(datum) === 'none' ? 0 : 1;
      const shapeKey = getShapeKey
        ? getShapeKey(datum)
        : resolveShapeKey(datum.precision, selectedPrecisions);
      const previous = this.shape[index];
      if (
        previous !== NO_SHAPE &&
        SHAPE_CONFIG[SHAPE_ORDER[previous]].type !== SHAPE_CONFIG[shapeKey].type
      ) {
        this.shapeReplaced[index] = 1;
      }
      this.shape[index] = SHAPE_ORDER.indexOf(shapeKey);
      this.colorIndex[index] = colorSlot(getColor(datum));
    }
    this.restyleHalos(colorSlot);
    this.restyleFade();
    this.retargetAlpha();
    this.hoveredSlot = NO_SLOT;
    this.hitPathDirty = true;
    this.gridDirty = true;
    this.syncLabels();
    this.invalidate();
  }

  setOpacity(getOpacity: (datum: T) => number): void {
    let crossesZero = false;
    for (let index = 0; index < this.count; index++) {
      const next = getOpacity(this.data[index]);
      if ((next === 0) !== (this.alpha[index] === 0)) crossesZero = true;
      this.alpha[index] = next;
    }
    this.retargetAlpha();
    if (crossesZero) this.syncLabels();
    else this.syncLabelStyles();
    this.invalidate();
  }

  setFade(predicate: ((datum: T) => boolean) | null): void {
    if (predicate === null && this.fadePredicate === null) return;
    this.fadePredicate = predicate;
    this.restyleFade();
    this.syncLabelStyles();
    this.invalidate();
  }

  setHalo(stroke: ((datum: T) => string | null) | null, style: PointHaloStyle): void {
    if (stroke === null && this.haloStroke === null) return;
    this.haloStroke = stroke;
    this.haloStyle = style;
    this.restyleHalos(this.paletteSlots(this.palette));
    this.invalidate();
  }

  setMarker(marker: HTMLImageElement | null): void {
    if (this.marker === marker) return;
    this.marker = marker;
    if (marker && !marker.complete) {
      marker.addEventListener('load', () => this.invalidate(), { once: true });
    }
    this.invalidate();
  }

  setOpacityTransition(durationMs: number): void {
    this.opacityTransitionMs = durationMs;
    this.fresh.fill(0);
  }

  restoreExportOrder(zoomGroup: SVGGElement, keyFn: (datum: T) => string): void {
    const indexByKey = new Map<string, number>();
    this.keys.forEach((key, index) => {
      if (!indexByKey.has(key)) indexByKey.set(key, index);
    });
    for (const group of zoomGroup.querySelectorAll<SVGGElement>(':scope > .dot-group')) {
      const key = keyFn(select<SVGGElement, T>(group).datum());
      const index = indexByKey.get(key);
      if (index === undefined) continue;
      indexByKey.delete(key);
      const filter = group.style.getPropertyValue('filter');
      if (filter !== '' && !this.filterFirst[index]) {
        group.style.removeProperty('filter');
        group.style.setProperty('filter', filter);
      }
      const shape = group.querySelector(':scope > .visible-shape');
      if (!shape || !this.shapeReplaced[index]) continue;
      const halo = group.querySelector(':scope > .offload-halo');
      if (halo) halo.before(shape);
      else group.append(shape);
    }
  }

  private restyleHalos(colorSlot: (color: string) => number): void {
    const stroke = this.haloStroke;
    for (let index = 0; index < this.count; index++) {
      const color = stroke ? stroke(this.data[index]) : null;
      this.haloIndex[index] = color === null ? 0 : colorSlot(color) + 1;
    }
  }

  private restyleFade(): void {
    const predicate = this.fadePredicate;
    for (let index = 0; index < this.count; index++) {
      const next = predicate && predicate(this.data[index]) ? 1 : 0;
      if (next === 0) this.filterFirst[index] = 0;
      else if (this.faded[index] === 0) this.filterFirst[index] = this.fresh[index];
      this.faded[index] = next;
    }
  }

  private retargetAlpha(): void {
    const animate = this.opacityTransitionMs > 0 && this.context !== null;
    let pending = false;
    for (let index = 0; index < this.count; index++) {
      if (!animate || !this.settled[index]) {
        this.shownAlpha[index] = this.alpha[index];
        this.fromAlpha[index] = this.alpha[index];
        this.settled[index] = 1;
      } else {
        this.fromAlpha[index] = this.shownAlpha[index];
        if (this.shownAlpha[index] !== this.alpha[index]) pending = true;
      }
    }
    if (pending) {
      this.alphaAnimating = true;
      this.alphaStart = -1;
    }
  }

  place(xScale: ContinuousScale, yScale: ContinuousScale): void {
    for (let index = 0; index < this.count; index++) {
      const datum = this.data[index];
      const x = xScale(datum.x);
      const y = yScale(datum.y);
      this.xs[index] = x;
      this.ys[index] = y;
      this.drawXs[index] = x;
      this.drawYs[index] = y;
    }
    this.positionAnimating = false;
    this.hitPathDirty = true;
    this.gridDirty = true;
    for (const [slot, anchor] of this.labelAnchors) {
      this.positionLabel(anchor, this.indexBySlot.get(slot)!);
    }
    this.invalidate();
  }

  capturePositions(): PointPositions {
    const positions: PointPositions = new Map();
    for (let index = 0; index < this.count; index++) {
      if (this.alpha[index] !== 0) {
        positions.set(this.slots[index], { x: this.drawXs[index], y: this.drawYs[index] });
      }
    }
    return positions;
  }

  animateFrom(
    previous: PointPositions,
    durationMs: number,
    isVisible: ((datum: T) => boolean) | null,
  ): void {
    let any = false;
    for (let index = 0; index < this.count; index++) {
      this.moving[index] = 0;
      const visible = isVisible ? isVisible(this.data[index]) : this.alpha[index] !== 0;
      const from = visible ? previous.get(this.slots[index]) : undefined;
      if (!from || (from.x === this.xs[index] && from.y === this.ys[index])) continue;
      this.moving[index] = 1;
      this.fromXs[index] = from.x;
      this.fromYs[index] = from.y;
      this.drawXs[index] = from.x;
      this.drawYs[index] = from.y;
      any = true;
    }
    if (!any) return;
    this.positionAnimating = true;
    this.positionDuration = durationMs;
    this.positionStart = -1;
    this.invalidate();
  }

  setLabels(text: ((datum: T) => string) | null, foreground: string): void {
    this.labelText = text;
    this.labelForeground = foreground;
    this.syncLabels();
  }

  private syncLabels(): void {
    const text = this.labelText;
    if (!text) {
      for (const anchor of this.labelAnchors.values()) anchor.remove();
      this.labelAnchors.clear();
      return;
    }
    let previous: SVGGElement | null = null;
    for (let index = 0; index < this.count; index++) {
      const slot = this.slots[index];
      let anchor = this.labelAnchors.get(slot);
      if (this.alpha[index] === 0) {
        if (anchor) {
          anchor.remove();
          this.labelAnchors.delete(slot);
        }
        continue;
      }
      if (!anchor) {
        anchor = this.element.ownerDocument.createElementNS(SVG_NS, 'g');
        anchor.setAttribute('class', POINT_LABEL_ANCHOR_CLASS);
        this.labelAnchors.set(slot, anchor);
        this.positionLabel(anchor, index);
      }
      syncPointLabel(anchor, text(this.data[index]), this.labelForeground, false);
      this.styleLabel(anchor, index);
      const expectedNext: ChildNode | null = previous
        ? previous.nextSibling
        : this.labelLayer.firstChild;
      if (expectedNext !== anchor) {
        if (previous) previous.after(anchor);
        else this.labelLayer.prepend(anchor);
      }
      previous = anchor;
    }
  }

  private syncLabelStyles(): void {
    for (const [slot, anchor] of this.labelAnchors) {
      this.styleLabel(anchor, this.indexBySlot.get(slot)!);
    }
  }

  private styleLabel(anchor: SVGGElement, index: number): void {
    setStyleIfChanged(anchor, 'opacity', String(this.alpha[index]));
    setStyleIfChanged(anchor, 'filter', this.faded[index] ? `opacity(${FADED_OPACITY})` : '');
    if (this.opacityTransitionMs > 0) {
      setStyleIfChanged(anchor, 'transition', `opacity ${this.opacityTransitionMs}ms ease`);
    }
  }

  private positionLabel(anchor: SVGGElement, index: number): void {
    anchor.setAttribute('transform', `translate(${this.xs[index]},${this.ys[index]})`);
  }

  clearHover(): void {
    this.setHoveredSlot(NO_SLOT);
  }

  private setHoveredSlot(slot: number): void {
    if (this.hoveredSlot === slot) return;
    this.hoveredSlot = slot;
    this.invalidate();
  }

  hitTest(x: number, y: number): number {
    if (this.gridDirty) {
      this.gridDirty = false;
      this.grid.build(this.xs, this.ys, this.interactive, this.count, this.width, this.height);
    }
    return this.grid.hit(x, y);
  }

  listen(handlers: PointPointerHandlers<T>): void {
    const bound = this.handlers !== null;
    this.handlers = handlers;
    if (bound) return;
    const onMove = (event: MouseEvent) => this.pointerMoved(event);
    this.hitPath.addEventListener('mouseenter', onMove);
    this.hitPath.addEventListener('mousemove', onMove);
    this.hitPath.addEventListener('mouseleave', (event) => this.pointerLeft(event));
    this.hitPath.addEventListener('click', (event) => this.pointerClicked(event));
  }

  private pointAt(event: MouseEvent): number {
    const bounds = this.canvas.getBoundingClientRect();
    return this.hitTest(event.clientX - bounds.left, event.clientY - bounds.top);
  }

  private leavePointer(event: MouseEvent, handlers: PointPointerHandlers<T>): void {
    const previous = this.indexBySlot.get(this.pointerSlot);
    this.pointerSlot = NO_SLOT;
    if (previous !== undefined && handlers.leave(event, this.data[previous])) {
      this.setHoveredSlot(NO_SLOT);
    }
  }

  private pointerMoved(event: MouseEvent): void {
    const handlers = this.handlers;
    if (!handlers) return;
    const index = this.pointAt(event);
    const slot = index >= 0 ? this.slots[index] : NO_SLOT;
    if (slot !== this.pointerSlot) {
      this.leavePointer(event, handlers);
      this.pointerSlot = slot;
      if (index >= 0) {
        const position = { x: this.xs[index], y: this.ys[index] };
        if (handlers.enter(event, this.data[index], position)) this.setHoveredSlot(slot);
      }
    }
    if (index >= 0) handlers.move(event);
  }

  private pointerLeft(event: MouseEvent): void {
    if (this.handlers) this.leavePointer(event, this.handlers);
  }

  private pointerClicked(event: MouseEvent): void {
    const index = this.pointAt(event);
    if (index >= 0) {
      this.handlers?.click(event, this.data[index], { x: this.xs[index], y: this.ys[index] });
    }
  }

  snapshot(): ScatterPointSnapshot<T>[] {
    const bounds = this.canvas.getBoundingClientRect();
    const dataAttrs = Object.entries(this.config?.dataAttrs ?? {});
    return this.data.map((datum, index) => {
      const attrs: Record<string, string> = {};
      for (const [name, read] of dataAttrs) {
        const value = read(datum);
        if (value !== null) attrs[name] = value;
      }
      const halo = this.haloIndex[index];
      return {
        key: this.keys[index],
        datum,
        x: this.xs[index],
        y: this.ys[index],
        clientX: bounds.left + this.xs[index],
        clientY: bounds.top + this.ys[index],
        opacity: this.alpha[index],
        interactive: this.interactive[index] === 1,
        shape: SHAPE_ORDER[this.shape[index]],
        color: this.palette[this.colorIndex[index]],
        halo: halo === 0 ? null : this.palette[halo - 1],
        faded: this.faded[index] === 1,
        hovered: this.slots[index] === this.hoveredSlot,
        label: this.labelText && this.alpha[index] !== 0 ? this.labelText(datum) : null,
        attrs,
      };
    });
  }

  invalidate(): void {
    if (this.frame !== null || typeof requestAnimationFrame === 'undefined') return;
    this.frame = requestAnimationFrame((time) => {
      this.frame = null;
      this.renderFrame(time);
    });
  }

  private renderFrame(time: number): void {
    const animating = this.advance(time);
    if (this.hitPathDirty) {
      this.hitPathDirty = false;
      this.hitPath.setAttribute(
        'd',
        hitAreaPath(
          this.xs,
          this.ys,
          this.interactive,
          this.count,
          this.width,
          this.height,
          HIT_AREA_RADIUS,
        ),
      );
    }
    this.draw();
    if (animating) this.invalidate();
  }

  private advance(time: number): boolean {
    if (this.context === null) {
      this.alphaAnimating = false;
      this.positionAnimating = false;
    }
    if (this.alphaAnimating) {
      if (this.alphaStart < 0) this.alphaStart = time;
      const eased = cssEase((time - this.alphaStart) / this.opacityTransitionMs);
      for (let index = 0; index < this.count; index++) {
        this.shownAlpha[index] =
          this.fromAlpha[index] + (this.alpha[index] - this.fromAlpha[index]) * eased;
      }
      if (eased >= 1) this.alphaAnimating = false;
    }
    if (this.positionAnimating) {
      if (this.positionStart < 0) this.positionStart = time;
      const progress = Math.min(1, (time - this.positionStart) / this.positionDuration);
      const eased = easeCubicInOut(progress);
      for (let index = 0; index < this.count; index++) {
        if (!this.moving[index]) continue;
        this.drawXs[index] = this.fromXs[index] + (this.xs[index] - this.fromXs[index]) * eased;
        this.drawYs[index] = this.fromYs[index] + (this.ys[index] - this.fromYs[index]) * eased;
      }
      if (progress >= 1) this.positionAnimating = false;
    }
    return this.alphaAnimating || this.positionAnimating;
  }

  private shapePath(key: ShapeKey, hovered: boolean): Path2D {
    this.shapePaths ??= new Map();
    const name = `${key}:${hovered ? 'hover' : 'normal'}`;
    let path = this.shapePaths.get(name);
    if (path) return path;
    const config = SHAPE_CONFIG[key];
    const state = hovered ? config.hover : config.normal;
    path = new Path2D();
    if ('r' in state) {
      path.arc(0, 0, state.r, 0, 2 * Math.PI);
    } else if ('width' in state) {
      path.rect(state.x, state.y, state.width, state.height);
    } else {
      path.addPath(new Path2D(state.d));
    }
    this.shapePaths.set(name, path);
    return path;
  }

  private resolveColors(): string[] {
    let style: CSSStyleDeclaration | null = null;
    return this.palette.map((color) => {
      const match = /^var\((?<name>--[^,)]+)(?:,\s*(?<fallback>[^)]+))?\)$/u.exec(color.trim());
      if (!match?.groups) return color;
      style ??= getComputedStyle(this.canvas);
      return style.getPropertyValue(match.groups.name).trim() || match.groups.fallback || color;
    });
  }

  private draw(): void {
    this.context ??= this.canvas.getContext('2d');
    const context = this.context;
    if (!context) return;
    const ratio = this.canvas.width / Math.max(1, this.width);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const colors = this.resolveColors();
    const marker = this.marker?.complete ? this.marker : null;
    const halo = this.haloStyle;
    const hovered = this.indexBySlot.get(this.hoveredSlot) ?? -1;
    const margin = HIT_AREA_RADIUS + MARKER_SIZE;
    for (let index = 0; index < this.count; index++) {
      const opacity = this.shownAlpha[index] * (this.faded[index] ? FADED_OPACITY : 1);
      if (opacity <= 0) continue;
      const x = this.drawXs[index];
      const y = this.drawYs[index];
      if (x < -margin || x > this.width + margin || y < -margin || y > this.height + margin) {
        continue;
      }
      context.setTransform(ratio, 0, 0, ratio, x * ratio, y * ratio);
      context.globalAlpha = opacity;
      if (marker) {
        const size = MARKER_SIZE * (index === hovered ? MARKER_HOVER_SCALE : 1);
        context.drawImage(marker, -size / 2, -size / 2, size, size);
      } else {
        context.fillStyle = colors[this.colorIndex[index]];
        context.fill(this.shapePath(SHAPE_ORDER[this.shape[index]], index === hovered));
      }
      const haloSlot = this.haloIndex[index];
      if (haloSlot !== 0 && halo) {
        context.globalAlpha = opacity * halo.opacity;
        context.strokeStyle = colors[haloSlot - 1];
        context.lineWidth = halo.strokeWidth;
        context.setLineDash(halo.dash);
        context.beginPath();
        context.arc(0, 0, halo.radius, 0, 2 * Math.PI);
        context.stroke();
        context.setLineDash([]);
      }
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
  }
}
