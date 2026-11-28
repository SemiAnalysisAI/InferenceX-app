'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

import { CANVAS_POINT_LAYER_SELECTOR } from '@/lib/d3-chart/layers/canvas-point-registry';
import type { CanvasPointLayerElement } from '@/lib/d3-chart/layers/canvas-points';
import { plotBounds } from '@/lib/d3-chart/plot-bounds';
import { hasUserGesture, playSnap } from './lego-audio';
import { surveyLanes, type Spot, type Strip } from './lego-lanes';
import type { LegoRuntime } from './lego-runtime';
import {
  getLegoState,
  getServerLegoState,
  onLegoEffect,
  onStudAward,
  prefersReducedMotion,
  subscribeLego,
  type CameoId,
  type CrewId,
  type StudAward,
} from './lego-store';
import type { LegoStrings } from './lego-strings';

const IMG = '/decorative/lego/img/';

interface CrewSpec {
  id: CrewId;
  file: string;
  /** Natural size of the cutout, used to reserve its box. */
  width: number;
  height: number;
  mode: 'walk' | 'float';
  speed: number;
  start: number;
}

/** The construction-worker slot is filled by a different figure on each visit. */
const WORKERS = ['builder.webp', 'foreman.webp', 'gail.webp'] as const;

/** Narrowest a minifigure button may be, in CSS px. */
const MIN_TAP = 30;

const CREW: readonly CrewSpec[] = [
  { id: 'emmet', file: 'emmet.webp', width: 104, height: 176, mode: 'walk', speed: 26, start: 0.2 },
  {
    id: 'builder',
    file: 'builder.webp',
    width: 104,
    height: 176,
    mode: 'walk',
    speed: 17,
    start: 0.62,
  },
  {
    id: 'wyldstyle',
    file: 'wyldstyle.webp',
    width: 104,
    height: 176,
    mode: 'walk',
    speed: 21,
    start: 0.9,
  },
  {
    id: 'unikitty',
    file: 'unikitty.webp',
    width: 104,
    height: 176,
    mode: 'walk',
    speed: 13,
    start: 0.42,
  },
  {
    id: 'benny',
    file: 'benny.webp',
    width: 104,
    height: 176,
    mode: 'float',
    speed: 9,
    start: 0.78,
  },
];

interface Stage {
  left: number;
  right: number;
  y: number;
  kind: 'chart' | 'card' | 'banner' | 'footer' | 'none';
  /** Element the stretch was measured on, and where it was then; lets a scroll move the stage. */
  anchor: Element | null;
  anchorLeft: number;
  anchorTop: number;
}

const NO_STAGE: Stage = {
  left: 0,
  right: 0,
  y: 0,
  kind: 'none',
  anchor: null,
  anchorLeft: 0,
  anchorTop: 0,
};

const INTERACTIVE =
  "a, button, input, select, textarea, label, summary, [role='tab'], [role='button'], [role='switch'], [role='combobox'], [role='slider'], [tabindex]:not([tabindex='-1'])";
const CHART_SVG = 'svg[data-testid="d3-chart-svg"]';
/** Text that ignores the pointer, so hit testing cannot see it. */
const QUIET_TEXT = "[data-testid='chart-instructions']:not([data-dismissed])";
const SAMPLE_STEP = 14;
/** Anything that opens over the page; the crew and the ship step aside for it. */
const OVERLAYS =
  "[data-testid='mobile-menu'], [role='dialog'], [role='menu'], [role='listbox'], [data-radix-popper-content-wrapper], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='dropdown-menu-content']";

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const inBox = (box: Box, x: number, y: number, pad: number) =>
  x >= box.left - pad && x <= box.right + pad && y >= box.top - pad && y <= box.bottom + pad;

/** True when the element's own text (not a child's) is drawn at this point. */
function hasTextAt(element: Element, x: number, y: number): boolean {
  for (const node of element.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) if (inBox(box, x, y, 6)) return true;
  }
  return false;
}

/** True when a figure standing at this point would cover a control, text or a picture. */
function isTaken(x: number, y: number, quiet: readonly Box[]): boolean {
  for (const box of quiet) if (inBox(box, x, y, 6)) return true;
  let element = document.elementFromPoint(x, y);
  if (element?.closest('.lego-scene')) {
    element =
      document.elementsFromPoint(x, y).find((candidate) => !candidate.closest('.lego-scene')) ??
      null;
  }
  if (!element) return false;
  if (element.closest(INTERACTIVE)) return true;
  if (element instanceof SVGElement) {
    // Chart plots are fine to stand on; chart text and icons are not.
    return element.closest('text') !== null || element.closest(CHART_SVG) === null;
  }
  if (element instanceof HTMLImageElement || element instanceof HTMLCanvasElement) {
    // The chart's own point canvas and the box art are scenery.
    return !element.matches('.canvas-point-surface, .lego-box-art');
  }
  return hasTextAt(element, x, y);
}

/** Longest stretch of the line at `y` where a figure of this height covers nothing. */
function freeRun(
  from: number,
  to: number,
  y: number,
  spriteHeight: number,
  quiet: readonly Box[],
): [number, number] | null {
  let best: [number, number] | null = null;
  let start: number | null = null;
  const close = (end: number) => {
    if (start !== null && (!best || end - start > best[1] - best[0])) best = [start, end];
    start = null;
  };
  // Feet, chest, head, and the height Benny hovers at.
  const takenAt = (at: number) =>
    [0.12, 0.5, 0.92, 1.35].some((part) => isTaken(at, y - spriteHeight * part, quiet));
  let x = from;
  for (; x <= to; x += SAMPLE_STEP) {
    const taken = takenAt(x);
    if (taken) close(x - SAMPLE_STEP);
    else if (start === null) start = x;
  }
  close(x - SAMPLE_STEP);
  return best;
}

function findStage(spriteHeight: number, small: boolean): Stage {
  const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 56;
  const minTop = Math.max(headerBottom, 0) + spriteHeight * 1.5 + 4;
  const maxTop = window.innerHeight - 24;
  const minRun = small ? 84 : 132;
  // Half a figure of room at each end of the stretch.
  const inset = spriteHeight * 0.36;
  const quiet: Box[] = [];
  document.querySelectorAll(QUIET_TEXT).forEach((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    for (const box of range.getClientRects()) quiet.push(box);
  });
  const settle = (
    anchor: Element,
    from: number,
    to: number,
    y: number,
    kind: Stage['kind'],
  ): Stage | null => {
    const run = freeRun(from, to, y, spriteHeight, quiet);
    if (!run || run[1] - run[0] - inset * 2 < minRun) return null;
    const box = anchor.getBoundingClientRect();
    return {
      left: run[0] + inset,
      right: run[1] - inset,
      y,
      kind,
      anchor,
      anchorLeft: box.left,
      anchorTop: box.top,
    };
  };
  for (const svg of document.querySelectorAll(CHART_SVG)) {
    const bounds = plotBounds(svg);
    if (!bounds || bounds.top < minTop || bounds.top > maxTop) continue;
    if (bounds.right - bounds.left < 160) continue;
    const stage = settle(svg, bounds.left + 4, bounds.right - 4, bounds.top + 1, 'chart');
    if (stage) return stage;
  }
  const cards = document.querySelectorAll<HTMLElement>("main [data-slot='card']");
  for (let index = 0, tried = 0; index < cards.length && tried < 4; index++) {
    const box = cards[index].getBoundingClientRect();
    if (box.width < 220 || box.top < minTop || box.top > maxTop) continue;
    tried++;
    // Stand on the studs, not behind them.
    const stage = settle(cards[index], box.left + 26, box.right - 26, box.top - 8, 'card');
    if (stage) return stage;
  }
  // No chart or free card edge in view: the floor of the box art, then the footer course.
  const banner = document.querySelector('.lego-box');
  if (banner) {
    const box = banner.getBoundingClientRect();
    const y = box.bottom - 7;
    if (y >= minTop && y <= maxTop) {
      const stage = settle(banner, box.left + 14, box.right - 14, y, 'banner');
      if (stage) return stage;
    }
  }
  const footer = document.querySelector("footer[data-testid='footer']");
  if (footer) {
    const box = footer.getBoundingClientRect();
    if (box.top >= minTop && box.top <= maxTop) {
      const stage = settle(footer, box.left + 14, box.right - 14, box.top + 1, 'footer');
      if (stage) return stage;
    }
  }
  return NO_STAGE;
}

/** Follow the anchor between measurements so the crew stays put while the page scrolls. */
function followAnchor(stage: Stage): Stage {
  if (!stage.anchor) return stage;
  if (!stage.anchor.isConnected) return NO_STAGE;
  const box = stage.anchor.getBoundingClientRect();
  const dx = box.left - stage.anchorLeft;
  const dy = box.top - stage.anchorTop;
  if (dx === 0 && dy === 0) return stage;
  return {
    ...stage,
    left: stage.left + dx,
    right: stage.right + dx,
    y: stage.y + dy,
    anchorLeft: box.left,
    anchorTop: box.top,
  };
}

interface Toast {
  id: number;
  text: string;
  tone: 'shout' | 'note';
  topic?: string;
  ms?: number;
}

/** Cutouts shown by a cameo, with their natural size. */
const CAMEO_ART: Record<CameoId, { file: string; width: number; height: number }> = {
  business: { file: 'business.webp', width: 104, height: 176 },
  glue: { file: 'kragle.webp', width: 320, height: 178 },
  badcop: { file: 'badcop.webp', width: 108, height: 176 },
  vitruvius: { file: 'vitruvius.webp', width: 156, height: 176 },
  yoda: { file: 'yoda.webp', width: 137, height: 176 },
  batman: { file: 'batman.webp', width: 147, height: 176 },
  sus: { file: 'piece-26047.webp', width: 180, height: 125 },
};

const DOCK_ART = {
  spaceship: { file: 'spaceship.webp', width: 439, height: 300 },
  helicopter: { file: 'rescue-helicopter.webp', width: 420, height: 269 },
} as const;
type DockArt = keyof typeof DOCK_ART;

// ---------------------------------------------------------------- helicopter rescue
// "A man has fallen into the river in LEGO City!" The rescue helicopter of set 7903 flies to
// a low data point of a chart on screen. It hovers above the chart, clear of its title and
// controls, and lowers a straight lifeline with a life ring that stops just above the point.
// The point is the lowest one that can be reached without the line or the ring touching any
// other point, series line, series label, axis, title or control (reachPoint). Where no point
// can be reached that way the helicopter hovers and nothing enters the plot. Nothing here takes
// pointer events and everything is gone after eight seconds.

const HELI_RATIO = DOCK_ART.helicopter.height / DOCK_ART.helicopter.width;
/** Where the lifeline leaves the helicopter, as a fraction of the cutout. */
const WINCH = { x: 0.52, y: 0.78 };
/** Life ring: its size, and the gap it keeps above the marker it is lowered to. */
const RING = 18;
const RING_GAP = 12;
const RESCUE_MS = 8200;
/** How far the plot may drift, in pixels, before a rescue in progress is called off. */
const RESCUE_SLACK = 96;
const CONTROLS = "button, a[href], [role='tab'], [role='switch'], input, select";

interface RescueTarget {
  /** Visible data points, lowest first, in viewport pixels. */
  points: { x: number; y: number }[];
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  /** The chart the points belong to: the rescue follows it if the page shifts a little. */
  plot: SVGSVGElement;
  layer: CanvasPointLayerElement;
}

function findRescueTarget(): RescueTarget | null {
  const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
  for (const layer of document.querySelectorAll<CanvasPointLayerElement>(
    CANVAS_POINT_LAYER_SELECTOR,
  )) {
    const svg = layer.ownerSVGElement;
    const bounds = svg ? plotBounds(svg) : null;
    const points = typeof layer.scatterPoints === 'function' ? layer.scatterPoints() : null;
    if (!svg || !bounds || !points) continue;
    // The top of the plot has to be on screen with some of the plot under it.
    if (bounds.top < header + 2 || bounds.top > window.innerHeight - 110) continue;
    const floor = Math.min(bounds.bottom, window.innerHeight - 20);
    const seen: { x: number; y: number }[] = [];
    for (const point of points) {
      if (point.opacity < 0.5 || point.faded) continue;
      if (point.clientX < bounds.left || point.clientX > bounds.right) continue;
      if (point.clientY < bounds.top + 24 || point.clientY > floor) continue;
      seen.push({ x: point.clientX, y: point.clientY });
    }
    if (seen.length > 0) {
      seen.sort((one, other) => other.y - one.y);
      return {
        points: seen,
        plotLeft: bounds.left,
        plotRight: bounds.right,
        plotTop: bounds.top,
        plotBottom: bounds.bottom,
        plot: svg,
        layer,
      };
    }
  }
  return null;
}

/** Top edge of the first scatter plot on the page, in viewport coordinates, on screen or not. */
function findPlotTop(): number | null {
  for (const layer of document.querySelectorAll<CanvasPointLayerElement>(
    CANVAS_POINT_LAYER_SELECTOR,
  )) {
    const bounds = layer.ownerSVGElement ? plotBounds(layer.ownerSVGElement) : null;
    if (bounds && typeof layer.scatterPoints === 'function') return bounds.top;
  }
  return null;
}

/** Controls and lines of text between the header and the plot: the helicopter covers neither. */
function hoverObstacles(bandTop: number, bandBottom: number): DOMRect[] {
  const inBand = (box: DOMRect) =>
    box.width > 0 && box.height > 0 && box.bottom > bandTop && box.top < bandBottom;
  const boxes: DOMRect[] = [];
  for (const control of document.querySelectorAll(CONTROLS)) {
    // The walking crew keeps moving and is the theme's own decoration, not a site control.
    if (control.closest('.lego-scene')) continue;
    const box = control.getBoundingClientRect();
    if (inBand(box)) boxes.push(box);
  }
  const walker = document.createTreeWalker(
    document.querySelector('main') ?? document.body,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE)
          return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        const box = (node as Element).getBoundingClientRect();
        // No box of its own (display: contents): its children may still be in the band.
        if (box.width === 0 && box.height === 0) return NodeFilter.FILTER_SKIP;
        return inBand(box) ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_REJECT;
      },
    },
  );
  const range = document.createRange();
  while (walker.nextNode()) {
    range.selectNodeContents(walker.currentNode);
    for (const box of range.getClientRects()) if (inBand(box)) boxes.push(box);
  }
  return boxes;
}

const INK_CELL = 2;
/** Parts of the page a caption must not sit on while the page is falling apart. */
const PAGE_PARTS =
  "header, footer, [data-slot='card'], [data-slot='control-panel'], [role='dialog'], [data-testid='lego-theme-banner'], a, button, h1, h2, h3, p, table, svg, img";

function shown(element: Element): boolean {
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Everything the lifeline and the life ring must stay clear of, as a grid over the viewport:
 * the text and controls above the plot, and inside it every marker, series line, series label,
 * tick label and axis title.
 */
function readInk(target: RescueTarget, above: readonly DOMRect[]): (box: Box) => boolean {
  const cols = Math.ceil(window.innerWidth / INK_CELL);
  const rows = Math.ceil(window.innerHeight / INK_CELL);
  const cells = new Uint8Array(cols * rows);
  const mark = (box: Box, pad: number) => {
    const c0 = Math.max(0, Math.floor((box.left - pad) / INK_CELL));
    const c1 = Math.min(cols - 1, Math.floor((box.right + pad) / INK_CELL));
    const r0 = Math.max(0, Math.floor((box.top - pad) / INK_CELL));
    const r1 = Math.min(rows - 1, Math.floor((box.bottom + pad) / INK_CELL));
    for (let row = r0; row <= r1; row++) cells.fill(1, row * cols + c0, row * cols + c1 + 1);
  };
  for (const box of above) mark(box, 5);
  for (const path of target.plot.querySelectorAll<SVGPathElement>(
    'g.zoom-group path:not(.dot-hit-area)',
  )) {
    const matrix = path.getScreenCTM();
    const parent = path.parentElement;
    if (!matrix || !shown(path) || (parent && !shown(parent))) continue;
    const length = path.getTotalLength();
    for (let at = 0; at <= length; at += 2) {
      const point = path.getPointAtLength(at);
      const x = matrix.a * point.x + matrix.c * point.y + matrix.e;
      const y = matrix.b * point.x + matrix.d * point.y + matrix.f;
      mark({ left: x, right: x, top: y, bottom: y }, 4);
    }
  }
  for (const label of target.plot.querySelectorAll('g.line-label, text, g.zoom-group line')) {
    if (label.closest('.ruler-group') || !shown(label)) continue;
    const box = label.getBoundingClientRect();
    if (box.width > 0 || box.height > 0) mark(box, 4);
  }
  const all = typeof target.layer.scatterPoints === 'function' ? target.layer.scatterPoints() : [];
  for (const point of all) {
    if (point.opacity < 0.02) continue;
    // A marker is a brick about sixteen pixels wide.
    mark(
      { left: point.clientX, right: point.clientX, top: point.clientY, bottom: point.clientY },
      10,
    );
  }
  return (box) => {
    const c0 = Math.max(0, Math.floor(box.left / INK_CELL));
    const c1 = Math.min(cols - 1, Math.floor(box.right / INK_CELL));
    const r0 = Math.max(0, Math.floor(box.top / INK_CELL));
    const r1 = Math.min(rows - 1, Math.floor(box.bottom / INK_CELL));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) if (cells[row * cols + col]) return true;
    }
    return false;
  };
}

interface Reach {
  /** The point being rescued. */
  x: number;
  y: number;
  /** Top-left corner of the hovering helicopter, or null when it has no free spot. */
  craft: Spot | null;
  /** Whether the lifeline can run from the winch to the ring without touching anything. */
  line: boolean;
}

function ringTopOf(point: { y: number }): number {
  return point.y - RING_GAP - RING;
}

/**
 * Who gets rescued, and from where. The life ring goes just over the lowest marker that has
 * clear space above it. The helicopter hovers on a free spot over the chart card, and the
 * lifeline is drawn only if it can run straight from the winch to the ring without touching
 * text, a control, another marker, a series line or a label, entering the plot through its top
 * edge: plumb onto a point in the lower half of the plot if one allows it, otherwise at a slant
 * onto a low point that does. Null when no marker has room for the ring.
 */
function reachPoint(target: RescueTarget, width: number, height: number): Reach | null {
  const ceiling = (document.querySelector('header')?.getBoundingClientRect().bottom ?? 0) + 2;
  const above = hoverObstacles(ceiling, target.plotTop);
  const inked = readInk(target, above);
  const base = target.plotTop - 8 - height;
  // Over the studs of the chart card's top edge, not down beside its title and toolbar.
  const cardTop = target.plot.closest("[data-slot='card']")?.getBoundingClientRect().top;
  const perch = cardTop === undefined ? base : Math.min(base, cardTop + 12 - height);
  const covers = (box: Box) =>
    above.some(
      (other) =>
        other.right > box.left - 4 &&
        other.left < box.right + 4 &&
        other.bottom > box.top - 4 &&
        other.top < box.bottom + 4,
    );
  const lineClear = (fromX: number, fromY: number, toX: number, toY: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toY - fromY) / 3));
    for (let step = 0; step <= steps; step++) {
      const x = fromX + ((toX - fromX) * step) / steps;
      const y = fromY + ((toY - fromY) * step) / steps;
      if (inked({ left: x - 2, right: x + 2, top: y - 1, bottom: y + 1 })) return false;
    }
    return true;
  };
  const open = target.points.filter((point) => {
    const ringTop = ringTopOf(point);
    return (
      ringTop > target.plotTop + 8 &&
      point.x - RING / 2 > target.plotLeft + 3 &&
      point.x + RING / 2 < target.plotRight - 3 &&
      !inked({
        left: point.x - RING / 2 - 2,
        right: point.x + RING / 2 + 2,
        top: ringTop - 2,
        bottom: ringTop + RING,
      })
    );
  });
  const hoverFor = (point: { x: number; y: number }, shift: number): Spot | null => {
    const left = point.x + shift - width * WINCH.x;
    if (left < 4 || left + width > window.innerWidth - 4) return null;
    for (let top = perch; top >= ceiling; top -= 6) {
      if (covers({ left, right: left + width, top, bottom: top + height })) continue;
      const fromX = point.x + shift;
      const fromY = top + height + 2;
      const toY = ringTopOf(point);
      // The line comes into the plot through its top edge, never along or across a side.
      const entry = fromX + ((point.x - fromX) * (target.plotTop - fromY)) / (toY - fromY);
      if (entry < target.plotLeft + 6 || entry > target.plotRight - 6) return null;
      // Out from under the skids, then all the way to the ring.
      return lineClear(fromX, fromY, point.x, toY) ? { left, top } : null;
    }
    return null;
  };
  const middle = (target.plotTop + target.plotBottom) / 2;
  for (const point of open) {
    if (point.y < middle) break;
    const craft = hoverFor(point, 0);
    if (craft) return { ...point, craft, line: true };
  }
  const low = target.plotTop + (target.plotBottom - target.plotTop) * 0.4;
  for (const point of open) {
    if (point.y < low) break;
    for (let aside = 20; aside <= 320; aside += 20) {
      for (const shift of [-aside, aside]) {
        const craft = hoverFor(point, shift);
        if (craft) return { ...point, craft, line: true };
      }
    }
  }
  const [first] = open;
  return first ? { ...first, craft: findHover(target, first.x, width, height), line: false } : null;
}

/** A free spot for the helicopter above the plot, as near as it gets to being over `x`. */
function findHover(target: RescueTarget, x: number, width: number, height: number): Spot | null {
  const ceiling = (document.querySelector('header')?.getBoundingClientRect().bottom ?? 0) + 2;
  const base = target.plotTop - 8 - height;
  const min = Math.max(4, target.plotLeft - 8);
  const max = Math.max(min, Math.min(window.innerWidth - width - 4, target.plotRight - width + 8));
  const ideal = Math.min(max, Math.max(min, x - width * WINCH.x));
  const boxes = hoverObstacles(ceiling, target.plotTop);
  let best: Spot | null = null;
  let bestCost = Infinity;
  for (let top = base; top >= ceiling; top -= 4) {
    const climb = (base - top) * 0.8;
    if (climb >= bestCost) break;
    const row = boxes.filter((box) => box.bottom > top - 4 && box.top < top + height + 4);
    const free = (left: number) =>
      left >= min &&
      left <= max &&
      row.every((box) => box.right < left - 4 || box.left > left + width + 4);
    for (let drift = 0; drift <= max - min && climb + drift < bestCost; drift += 6) {
      const left = [ideal - drift, ideal + drift].find(free);
      if (left === undefined) continue;
      best = { left, top };
      bestCost = climb + drift;
      break;
    }
  }
  return best;
}

/** The theme's own figures on screen: a caption does not sit on them either. */
const OWN_SCENERY =
  '.lego-putdown, .lego-sleeper, .lego-rescue, .lego-rescue-ring, .lego-spaceship, .lego-bubble';
/** Widths a caption is tried at: its normal measure, then wider (fewer lines), then narrower. */
const CAPTION_WIDTHS = [620, 900, 1240, 440, 320, 240];

interface Bubble {
  who: CrewId;
  text: string;
  nonce: number;
}

const RAIN = Array.from({ length: 34 }, (_, index) => ({
  delay: ((index * 53) % 100) / 60,
  duration: 1.6 + ((index * 29) % 100) / 90,
  tier: (['gold', 'silver', 'blue', 'gold', 'purple', 'silver'] as const)[index % 6],
}));

export function LegoScene({ strings, runtime }: { strings: LegoStrings; runtime: LegoRuntime }) {
  const t = strings.scene;
  const stringsRef = useRef(strings);
  useEffect(() => {
    stringsRef.current = strings;
  }, [strings]);
  const layerRef = useRef<HTMLDivElement>(null);
  const crewRefs = useRef(new Map<CrewId, HTMLButtonElement>());
  const bubbleRef = useRef<HTMLDivElement>(null);
  const bubbleState = useRef<Bubble | null>(null);
  const spoken = useRef(new Set<CrewId>());
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [ship, setShip] = useState(0);
  /** The ship parked beside the toast: no free lane to fly in, or motion is reduced. */
  const [docked, setDocked] = useState<{ nonce: number; art: DockArt } | null>(null);
  const shipRef = useRef<HTMLImageElement>(null);
  const toastsRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLImageElement>(null);
  /** Nonce of the ship that flies in on its own when the theme is switched on. */
  const arrival = useRef(0);
  /** A stud shower, and the free strips of the page it falls down. */
  const [rain, setRain] = useState<{ nonce: number; strips: Strip[] } | null>(null);
  const [footer, setFooter] = useState<Element | null>(null);
  const [ouch, setOuch] = useState(0);
  const [cameo, setCameo] = useState<{ who: CameoId; nonce: number } | null>(null);
  const [worker, setWorker] = useState<string>(WORKERS[0]);
  const sleeping = useSyncExternalStore(
    subscribeLego,
    () => getLegoState().sleeping,
    () => getServerLegoState().sleeping,
  );
  const separator = useSyncExternalStore(
    subscribeLego,
    () => getLegoState().separator,
    () => getServerLegoState().separator,
  );
  bubbleState.current = bubble;

  // Crew: walk a free stretch of the chart top, a card top, the box art floor or the footer.
  useEffect(() => {
    const still = prefersReducedMotion();
    const walkers = CREW.map((spec) => ({
      spec,
      at: spec.start,
      dir: spec.start > 0.5 ? -1 : 1,
      pauseUntil: 0,
      phase: Math.random() * 6,
    }));
    let stage: Stage | null = null;
    let dirty = true;
    let lastStage = -Infinity;
    let lastCover = -Infinity;
    let last = performance.now();
    let frame = 0;
    const markDirty = () => {
      dirty = true;
    };
    window.addEventListener('scroll', markDirty, { passive: true, capture: true });
    window.addEventListener('resize', markDirty, { passive: true });

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const layer = layerRef.current;
      if (!layer || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const small = window.innerWidth < 640;
      const spriteHeight = small ? 34 : 46;
      if (now - lastCover > 180) {
        lastCover = now;
        let covered = false;
        for (const overlay of document.querySelectorAll(OVERLAYS)) {
          // Some overlays stay in the document while closed; only a rendered one counts.
          if (!overlay.closest('.lego-scene') && overlay.getClientRects().length > 0) {
            covered = true;
            break;
          }
        }
        // The corner towers step aside while the footer course is on screen.
        const footerEl = document.querySelector("footer[data-testid='footer']");
        const grounded =
          footerEl !== null && footerEl.getBoundingClientRect().top < window.innerHeight - 8;
        if (grounded !== (layer.dataset.grounded === 'true')) {
          layer.dataset.grounded = grounded ? 'true' : 'false';
        }
        if (covered !== (layer.dataset.covered === 'true')) {
          layer.dataset.covered = covered ? 'true' : 'false';
        }
      }
      // Measuring is the costly part: do it on a timer, and only track the anchor on scroll.
      if (now - lastStage > (dirty ? 220 : 1100) || !stage) {
        stage = findStage(spriteHeight, small);
        lastStage = now;
        dirty = false;
        layer.dataset.stage = stage.kind;
      } else if (dirty) {
        stage = followAnchor(stage);
      }
      const headerBottom = small ? 56 : 64;
      const offstage =
        stage.kind === 'none' ||
        stage.y - spriteHeight * 1.5 < headerBottom ||
        stage.y > window.innerHeight;
      const span = Math.max(40, stage.right - stage.left);
      // Fewer figures where there is little room, and each keeps to its own stretch of the
      // stage so two figures never stand on top of each other.
      const room = Math.max(1, Math.min(small ? 2 : walkers.length, Math.floor(span / 96)));
      const lane = span / room;
      walkers.forEach((walker, index) => {
        const element = crewRefs.current.get(walker.spec.id);
        if (!element) return;
        const hidden = offstage || index >= room;
        element.hidden = hidden;
        if (hidden) return;
        const talking = bubbleState.current?.who === walker.spec.id;
        const moving = !still && !talking && now > walker.pauseUntil;
        if (moving) {
          walker.at += (walker.dir * walker.spec.speed * dt) / lane;
          if (walker.at > 1) {
            walker.at = 1;
            walker.dir = -1;
          } else if (walker.at < 0) {
            walker.at = 0;
            walker.dir = 1;
          }
          if (Math.random() < dt * 0.12) walker.pauseUntil = now + 1200 + Math.random() * 2600;
        }
        const spriteWidth = (spriteHeight * walker.spec.width) / walker.spec.height;
        // The button is never narrower than a comfortable tap; the figure is centred in it.
        const hitWidth = Math.max(spriteWidth, MIN_TAP);
        const reach = Math.max(0, lane - hitWidth - 6);
        const x =
          stage!.left + index * lane + (lane - reach) / 2 + walker.at * reach - hitWidth / 2;
        let y = stage!.y - spriteHeight;
        if (walker.spec.mode === 'float') {
          y -= spriteHeight * 0.45;
          if (!still) y += Math.sin(now / 520 + walker.phase) * 4;
        }
        element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        element.style.height = `${spriteHeight}px`;
        element.style.width = `${hitWidth.toFixed(1)}px`;
        element.dataset.dir = walker.dir > 0 ? 'right' : 'left';
        element.dataset.moving = moving && walker.spec.mode === 'walk' ? 'true' : 'false';
        if (talking && bubbleRef.current) {
          const bubbleWidth = bubbleRef.current.offsetWidth;
          const bx = Math.min(
            window.innerWidth - bubbleWidth - 8,
            Math.max(8, x + spriteWidth / 2 - bubbleWidth / 2),
          );
          bubbleRef.current.style.transform = `translate3d(${bx.toFixed(1)}px, ${(y - bubbleRef.current.offsetHeight - 10).toFixed(1)}px, 0)`;
        }
      });
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', markDirty, { capture: true });
      window.removeEventListener('resize', markDirty);
    };
  }, []);

  // Effects sent by the runtime: toasts, the spaceship, stud rain, crew reactions.
  useEffect(() => {
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };
    let nextId = 1;
    let stopRescue: (() => void) | null = null;
    const crewFlag = (name: 'hop' | 'busy', ms: number) => {
      const layer = layerRef.current;
      if (!layer) return;
      layer.dataset[name] = 'true';
      later(() => delete layer.dataset[name], ms);
    };
    const burst = (x: number, y: number) => {
      const layer = layerRef.current;
      if (!layer || prefersReducedMotion()) return;
      for (let index = 0; index < 12; index++) {
        const stud = document.createElement('span');
        stud.className = 'lego-fly-stud';
        stud.dataset.tier = (['gold', 'silver', 'blue', 'purple'] as const)[index % 4];
        layer.append(stud);
        const angle = (index / 12) * Math.PI * 2;
        const reach = 70 + Math.random() * 60;
        const animation = stud.animate(
          [
            { transform: `translate(${x}px, ${y}px) scale(0.6)`, opacity: 1 },
            {
              transform: `translate(${x + Math.cos(angle) * reach}px, ${y + Math.sin(angle) * reach + 40}px) scale(1.1)`,
              opacity: 0,
            },
          ],
          { duration: 800, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
        );
        animation.addEventListener('finish', () => stud.remove());
        animation.addEventListener('cancel', () => stud.remove());
      }
    };
    // Loose bricks tumble to the bottom of an emptied chart and lie there for a moment.
    const rubble = (
      left: number,
      top: number,
      width: number,
      height: number,
      holeLeft = left,
      holeRight = left,
    ) => {
      const layer = layerRef.current;
      if (!layer || width < 60 || height < 60) return;
      const still = prefersReducedMotion();
      const colors = ['red', 'yellow', 'blue', 'green', 'white', 'orange'] as const;
      for (let index = 0; index < 16; index++) {
        const brick = document.createElement('span');
        brick.className = 'lego-rubble';
        brick.dataset.color = colors[index % colors.length];
        brick.dataset.size = index % 3 === 0 ? 'small' : 'wide';
        layer.append(brick);
        // Either side of the stock message, never across it.
        const lane = (index * 0.618) % 1;
        const west = holeLeft - 34 - (left + 12);
        const east = left + width - 40 - (holeRight + 12);
        if (west < 40 && east < 40) {
          brick.remove();
          continue;
        }
        const onWest = east < 40 || (west >= 40 && index % 2 === 0);
        const x = onWest ? left + 12 + west * lane : holeRight + 12 + east * lane;
        // Resting on the bottom edge, under any button the empty state offers.
        const floor = top + height - 13 - (index % 3);
        const from = top + height * (0.15 + 0.4 * ((index * 0.37) % 1));
        // Lying nearly flat, so a tilted brick does not reach up into that button.
        const turn = ((index * 67) % 28) - 14;
        const landed = `translate(${x.toFixed(1)}px, ${floor.toFixed(1)}px) rotate(${turn}deg)`;
        const frames: Keyframe[] = still
          ? [
              { transform: landed, opacity: 1, offset: 0 },
              { transform: landed, opacity: 1, offset: 0.9 },
              { transform: landed, opacity: 0, offset: 1 },
            ]
          : [
              {
                transform: `translate(${x.toFixed(1)}px, ${from.toFixed(1)}px) rotate(0deg)`,
                opacity: 1,
                offset: 0,
                // Gravity: slow off the mark, fast at the floor.
                easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)',
              },
              { transform: landed, opacity: 1, offset: 0.26, easing: 'ease-out' },
              {
                transform: `translate(${x.toFixed(1)}px, ${(floor - 9).toFixed(1)}px) rotate(${turn + 8}deg)`,
                opacity: 1,
                offset: 0.37,
                easing: 'ease-in',
              },
              { transform: landed, opacity: 1, offset: 0.44 },
              { transform: landed, opacity: 1, offset: 0.9 },
              { transform: landed, opacity: 0, offset: 1 },
            ];
        const animation = brick.animate(frames, {
          duration: 3000,
          delay: still ? 0 : index * 28,
          easing: 'linear',
          fill: 'both',
        });
        animation.addEventListener('finish', () => brick.remove());
        animation.addEventListener('cancel', () => brick.remove());
      }
    };
    // Toasts wait their turn: one at a time, in one fixed corner.
    const queue: Toast[] = [];
    let showing = false;
    let toastTimer = 0;
    let toastSince = 0;
    /** The toast on screen was alone when it came up, so it was given the long three seconds. */
    let toastAlone = false;
    const nextToast = () => {
      const next = queue.shift();
      setToast(next ?? null);
      showing = next !== undefined;
      if (!next) return;
      const waiting = queue.length > 0;
      toastSince = performance.now();
      toastAlone = next.ms === undefined && !waiting;
      toastTimer = later(nextToast, next.ms ?? (waiting ? 1700 : 3000));
    };
    // A rushed toast (True Builder) goes to the front, and a lone toast on screen stops
    // waiting out its three seconds: the line would trail its own celebration otherwise.
    const rush = (entry: Toast) => {
      queue.unshift(entry);
      if (!showing) nextToast();
      else if (toastAlone) {
        toastAlone = false;
        window.clearTimeout(toastTimer);
        timers.delete(toastTimer);
        toastTimer = later(nextToast, Math.max(0, 1700 - (performance.now() - toastSince)));
      }
    };
    const say = (text: string, ms?: number) => {
      queue.push({ id: nextId++, text, tone: 'note', ms });
      if (!showing) nextToast();
    };
    const dock = (nonce: number, art: DockArt, ms: number) => {
      setDocked({ nonce, art });
      later(() => setDocked((current) => (current?.nonce === nonce ? null : current)), ms);
    };
    // The LEGO City rescue: see findRescueTarget for where the helicopter may hover.
    const rescue = (seek = false, riff?: string) => {
      const layer = layerRef.current;
      if (!layer) return;
      stopRescue?.();
      const lines = stringsRef.current.scene;
      const width = window.innerWidth < 640 ? 104 : 136;
      const height = width * HELI_RATIO;
      const target = findRescueTarget();
      if (!target && seek) {
        // Started from the set instructions, which open at the top of the page: on a phone no
        // chart can be on screen then, so the page moves to the first one and tries once more.
        const plot = findPlotTop();
        if (plot !== null) {
          const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
          window.scrollTo({
            top: Math.max(0, window.scrollY + plot - (header + height + (width < 136 ? 190 : 130))),
            behavior: 'instant',
          });
          later(() => rescue(false, riff), 320);
          return;
        }
      }
      if (!target) {
        say(lines.cityNoChart, 3600);
        dock(nextId++, 'helicopter', 3600);
        return;
      }
      say(riff ?? lines.cityRescue, 4800);
      say(lines.cityOutro, 2600);
      const still = prefersReducedMotion();
      const duration = still ? 5200 : RESCUE_MS;
      const reach = reachPoint(target, width, height);
      const hover = reach ? reach.craft : findHover(target, target.points[0].x, width, height);
      const animations: Animation[] = [];
      let ring: HTMLElement | null = null;
      let craft: HTMLElement | null = null;
      let line: HTMLElement | null = null;
      let turned = '';
      if (reach) {
        ring = document.createElement('span');
        ring.className = 'lego-rescue-ring';
        ring.style.left = `${(reach.x - RING / 2).toFixed(1)}px`;
        ring.style.top = `${(reach.y - RING_GAP - RING).toFixed(1)}px`;
        layer.append(ring);
      }
      // No free spot above this plot: the helicopter waits by the caption.
      if (hover === null) dock(nextId++, 'helicopter', duration - 600);
      else {
        const { left, top } = hover;
        const at = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
        craft = document.createElement('span');
        craft.className = 'lego-rescue';
        craft.style.width = `${width}px`;
        craft.style.height = `${height.toFixed(1)}px`;
        const art = document.createElement('img');
        art.src = `${IMG}${DOCK_ART.helicopter.file}`;
        art.alt = lines.helicopter;
        art.width = DOCK_ART.helicopter.width;
        art.height = DOCK_ART.helicopter.height;
        art.decoding = 'async';
        art.draggable = false;
        if (reach?.line) {
          const winchX = left + width * WINCH.x;
          const winchY = top + height * WINCH.y;
          const dx = reach.x - winchX;
          const dy = reach.y - RING_GAP - RING - winchY;
          turned = `rotate(${((-Math.atan2(dx, dy) * 180) / Math.PI).toFixed(2)}deg)`;
          line = document.createElement('span');
          line.className = 'lego-rescue-line';
          line.style.left = `${(width * WINCH.x - 1).toFixed(1)}px`;
          line.style.top = `${(height * WINCH.y).toFixed(1)}px`;
          line.style.height = `${Math.hypot(dx, dy).toFixed(1)}px`;
          craft.append(line);
        }
        craft.append(art);
        // Giant hands snap the helicopter together, then let it go.
        for (const side of ['left', 'right'] as const) {
          const hand = document.createElement('img');
          hand.className = 'lego-rescue-hand';
          hand.dataset.side = side;
          hand.src = `${IMG}hand.webp`;
          hand.alt = '';
          hand.width = 220;
          hand.height = 195;
          hand.decoding = 'async';
          hand.draggable = false;
          craft.append(hand);
        }
        layer.append(craft);
        if (still) {
          animations.push(
            craft.animate(
              [
                { transform: at, opacity: 0, offset: 0 },
                { transform: at, opacity: 1, offset: 0.06 },
                { transform: at, opacity: 1, offset: 0.92 },
                { transform: at, opacity: 0, offset: 1 },
              ],
              { duration, fill: 'both' },
            ),
          );
          if (line) {
            animations.push(
              line.animate([{ transform: turned }, { transform: turned }], {
                duration,
                fill: 'both',
              }),
            );
          }
        } else {
          const from = `translate(${-width - 30}px, ${(top - 46).toFixed(1)}px) rotate(7deg)`;
          const away = `translate(${window.innerWidth + 30}px, ${(top - 90).toFixed(1)}px) rotate(9deg)`;
          animations.push(
            // In on "Start the new rescue helicopter", away once the rescue is made.
            craft.animate(
              [
                { transform: from, offset: 0 },
                { transform: from, offset: 0.4, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
                { transform: `${at} rotate(0deg)`, offset: 0.57 },
                { transform: `${at} rotate(0deg)`, offset: 0.86, easing: 'ease-in' },
                { transform: away, offset: 1 },
              ],
              { duration, fill: 'both' },
            ),
          );
          if (line) {
            animations.push(
              line.animate(
                [
                  { transform: `${turned} scaleY(0)`, offset: 0 },
                  { transform: `${turned} scaleY(0)`, offset: 0.57, easing: 'ease-out' },
                  { transform: `${turned} scaleY(1)`, offset: 0.66 },
                  { transform: `${turned} scaleY(1)`, offset: 0.81, easing: 'ease-in' },
                  { transform: `${turned} scaleY(0)`, offset: 0.86 },
                  { transform: `${turned} scaleY(0)`, offset: 1 },
                ],
                { duration, fill: 'both' },
              ),
            );
          }
        }
      }
      if (ring) {
        // The life ring arrives with the end of the line, bobs on "HEY!" and leaves with it.
        animations.push(
          ring.animate(
            still
              ? [
                  { opacity: 0, offset: 0 },
                  { opacity: 1, offset: 0.06 },
                  { opacity: 1, offset: 0.92 },
                  { opacity: 0, offset: 1 },
                ]
              : [
                  { transform: 'scale(0.3)', opacity: 0, offset: 0 },
                  { transform: 'scale(0.3)', opacity: 0, offset: 0.64 },
                  { transform: 'scale(1)', opacity: 1, offset: 0.66 },
                  { transform: 'scale(1.25)', opacity: 1, offset: 0.7 },
                  { transform: 'scale(1)', opacity: 1, offset: 0.74 },
                  { transform: 'scale(1)', opacity: 1, offset: 0.81 },
                  { transform: 'scale(0.3)', opacity: 0, offset: 0.83 },
                  { transform: 'scale(0.3)', opacity: 0, offset: 1 },
                ],
            { duration, fill: 'both' },
          ),
        );
      }
      let timer = 0;
      // The ring belongs to one point. A small nudge of the page (a late layout shift, a thumb
      // resting on the screen) carries the rescue along; a real scroll or a resize calls it off.
      const home = target.plot.getBoundingClientRect();
      const roof = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
      const done = () => {
        if (stopRescue !== done) return;
        stopRescue = null;
        window.removeEventListener('scroll', follow, true);
        window.removeEventListener('resize', follow);
        window.clearTimeout(timer);
        timers.delete(timer);
        for (const animation of animations) animation.cancel();
        ring?.remove();
        craft?.remove();
      };
      const follow = () => {
        const now = target.plot.getBoundingClientRect();
        const dy = now.top - home.top;
        const moved =
          !target.plot.isConnected ||
          Math.abs(now.left - home.left) > 1 ||
          Math.abs(now.width - home.width) > 1 ||
          Math.abs(dy) > RESCUE_SLACK ||
          (hover !== null && hover.top + dy < roof);
        if (moved) {
          done();
          return;
        }
        const shift = `0 ${dy.toFixed(1)}px`;
        if (ring) ring.style.translate = shift;
        if (craft) craft.style.translate = shift;
      };
      window.addEventListener('scroll', follow, { capture: true, passive: true });
      window.addEventListener('resize', follow);
      stopRescue = done;
      timer = later(done, duration);
    };
    const offEffect = onLegoEffect((effect) => {
      if (effect.type === 'toast') {
        const topic = effect.topic;
        // News about the same thing replaces what was waiting (separator up, then down).
        if (topic) {
          for (let i = queue.length - 1; i >= 0; i--)
            if (queue[i].topic === topic) queue.splice(i, 1);
        }
        const entry = {
          id: nextId++,
          text: effect.text,
          tone: effect.tone ?? 'note',
          topic,
          ms: effect.ms,
        };
        if (effect.rush) {
          rush(entry);
          return;
        }
        queue.push(entry);
        // Never let a backlog build up: keep the newest few. Four, so the three True Builder
        // lines survive the "secret found" note of the brick that filled the meter.
        if (queue.length > 4) queue.splice(0, queue.length - 4);
        if (!showing) nextToast();
      } else if (effect.type === 'spaceship') {
        const nonce = nextId++;
        if (prefersReducedMotion()) {
          dock(nonce, 'spaceship', 3200);
        } else setShip(nonce);
      } else if (effect.type === 'rescue') rescue(effect.seek, effect.riff);
      else if (effect.type === 'stud-rain') {
        if (prefersReducedMotion()) return;
        // Studs fall only down strips of the page that are empty under the header (its margins
        // on a wide screen), and stop where a strip stops. With no such strip there is no shower.
        const strips = surveyLanes().columns(20);
        if (strips.length === 0) return;
        const nonce = nextId++;
        setRain({ nonce, strips });
        later(() => setRain((current) => (current?.nonce === nonce ? null : current)), 3600);
      } else if (effect.type === 'cameo') {
        const nonce = nextId++;
        setCameo({ who: effect.who, nonce });
        later(() => setCameo((current) => (current?.nonce === nonce ? null : current)), 3800);
      } else if (effect.type === 'crew-hop') crewFlag('hop', 700);
      else if (effect.type === 'crew-busy') crewFlag('busy', effect.ms);
      else if (effect.type === 'burst') burst(effect.x, effect.y);
      else if (effect.type === 'rubble') {
        rubble(
          effect.left,
          effect.top,
          effect.width,
          effect.height,
          effect.holeLeft,
          effect.holeRight,
        );
      }
    });

    // A collected stud flies from where it was earned to the counter.
    let flying = 0;
    const fly = (award: StudAward) => {
      const layer = layerRef.current;
      if (!layer || award.x === undefined || award.y === undefined || prefersReducedMotion()) {
        return;
      }
      if (flying >= 14) return;
      const counters = [...document.querySelectorAll<HTMLElement>('[data-lego-stud-counter]')];
      const target = counters
        .map((element) => element.getBoundingClientRect())
        .find((box) => box.width > 0 && box.bottom > 0 && box.top < window.innerHeight);
      const tx = target ? target.left + 10 : window.innerWidth - 60;
      const ty = target ? target.top + target.height / 2 - 7 : 20;
      const stud = document.createElement('span');
      stud.className = 'lego-fly-stud';
      stud.dataset.tier = award.tier;
      if (award.tier !== 'silver') {
        stud.dataset.label = `+${award.amount.toLocaleString('en-US')}`;
      }
      layer.append(stud);
      flying += 1;
      const midX = (award.x + tx) / 2;
      const midY = Math.min(award.y, ty) - 60;
      const animation = stud.animate(
        [
          { transform: `translate(${award.x - 7}px, ${award.y - 7}px) scale(0.4)`, opacity: 0 },
          {
            transform: `translate(${award.x - 7}px, ${award.y - 26}px) scale(1.25)`,
            opacity: 1,
            offset: 0.18,
          },
          { transform: `translate(${midX}px, ${midY}px) scale(1.1)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${tx}px, ${ty}px) scale(0.6)`, opacity: 0.2 },
        ],
        { duration: award.tier === 'silver' ? 620 : 900, easing: 'ease-in-out' },
      );
      const done = () => {
        stud.remove();
        flying = Math.max(0, flying - 1);
      };
      animation.addEventListener('finish', done);
      animation.addEventListener('cancel', done);
    };
    const offAward = onStudAward(fly);

    // Benny arrives by spaceship when the theme is switched on, if there is a free lane to
    // fly in. Nobody asked for this one, so it never parks over the page.
    if (hasUserGesture() && !prefersReducedMotion())
      later(() => {
        const nonce = nextId++;
        arrival.current = nonce;
        setShip(nonce);
      }, 900);

    return () => {
      offEffect();
      offAward();
      for (const id of timers) window.clearTimeout(id);
      stopRescue?.();
      layerRef.current
        ?.querySelectorAll('.lego-fly-stud, .lego-rubble, .lego-rescue, .lego-rescue-ring')
        .forEach((stud) => stud.remove());
    };
  }, []);

  // The spaceship keeps to free space: up the page margin when the layout leaves one, parked
  // beside the toast when it does not. It never crosses the page's controls or the box figures.
  useEffect(() => {
    const img = shipRef.current;
    if (!ship || !img) return;
    const nonce = ship;
    const finish = () => setShip((current) => (current === nonce ? 0 : current));
    const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 56;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let height: number;
    let frames: Keyframe[];
    let duration: number;
    const at = (x: number, y: number, turn: number, scale = 1) =>
      `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${turn}deg) scale(${scale})`;
    // Free page margin to the right of the content column, if the layout leaves one.
    const column = document.querySelector('body > div.grow')?.getBoundingClientRect();
    const free = column ? vw - column.right : 0;
    // The landing-page box already shows the ship, with the crew standing beside it. A second
    // ship flying across them would cover their faces, so the uninvited arrival is skipped
    // there, and a ship that was asked for is the one on the box lifting off and settling.
    const artShip = document.querySelector<HTMLElement>('.lego-box .lego-box-art-ship');
    const art = artShip?.getBoundingClientRect();
    if (artShip && art && art.width > 0 && art.bottom > headerBottom + 40 && art.top < vh) {
      if (arrival.current === nonce) {
        finish();
        return;
      }
      img.style.display = 'none';
      const hop = artShip.animate(
        [
          { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 0 },
          { transform: 'translate3d(-10px, -22px, 0) rotate(-7deg)', offset: 0.3 },
          { transform: 'translate3d(6px, -30px, 0) rotate(4deg)', offset: 0.6 },
          { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 1 },
        ],
        { duration: 1800, easing: 'ease-in-out' },
      );
      hop.addEventListener('finish', finish);
      return () => {
        hop.removeEventListener('finish', finish);
        hop.cancel();
      };
    }
    if (free >= 26) {
      // Nose up the page margin: turned a quarter, the hull is as wide as the image is tall.
      height = Math.min(38, free - 4);
      const width = (height * 439) / 300;
      const x = vw - free / 2 - width / 2;
      frames = [
        { transform: at(x, vh + 30, 90), offset: 0 },
        { transform: at(x, headerBottom - width * 1.4, 90), offset: 1 },
      ];
      duration = 1900;
    } else if (arrival.current === nonce) {
      finish();
      return;
    } else {
      // Nowhere to fly without crossing the page: park beside the toast instead.
      const undock = () => setDocked((current) => (current?.nonce === nonce ? null : current));
      setDocked({ nonce, art: 'spaceship' });
      const timer = window.setTimeout(() => {
        undock();
        finish();
      }, 3200);
      return () => {
        window.clearTimeout(timer);
        undock();
      };
    }
    img.style.height = `${height.toFixed(1)}px`;
    const animation = img.animate(frames, { duration, easing: 'ease-in-out', fill: 'forwards' });
    animation.addEventListener('finish', finish);
    return () => {
      animation.removeEventListener('finish', finish);
      animation.cancel();
    };
  }, [ship]);

  // Captions, the parked craft and cameo figures go where the page is empty (see lego-lanes).
  // A caption is tried at its normal size, then wider and lower, then in small type; a cameo
  // stands as a whole figure where there is room and is a portrait beside the caption where
  // there is not. With no free rectangle at all the caption is not drawn; it stays in the live
  // region for screen readers. The lane is checked again when the page scrolls or resizes.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const box = toastsRef.current;
    if (!layer || !box) return;
    if (!toast && !docked && !cameo) {
      box.dataset.lane = 'none';
      delete layer.dataset.cameo;
      return;
    }
    let caption: (Spot & { width: number; height: number }) | null = null;
    let figureAt: Spot | null = null;
    // While the page is in pieces every card is moving, so a measured lane is stale within a
    // frame. The caption waits under the header instead and is shown only on frames where
    // nothing of the page lies under it.
    const inPieces = () => {
      const fx = document.documentElement.dataset.legoFx;
      return fx === 'collapse' || fx === 'rebuild';
    };
    const placeInPieces = () => {
      layer.dataset.cameo = 'portrait';
      const vw = window.innerWidth;
      const roof = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
      box.dataset.size = 'small';
      box.style.maxWidth = `${Math.min(440, vw - 12)}px`;
      const width = box.offsetWidth;
      const height = box.offsetHeight + 6;
      const left = Math.round((vw - width) / 2);
      const top = Math.round(Math.max(0, roof) + 12);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      caption = null;
      let clear = width > 0;
      for (let row = 0; clear && row < 3; row++) {
        for (let col = 0; clear && col < 7; col++) {
          // Wrappers that only lay out the page may show through; a card, a control, a
          // heading or a plot anywhere under the point may not.
          const covered = document
            .elementsFromPoint(
              left - 6 + ((width + 12) * col) / 6,
              top - 6 + ((height + 12) * row) / 2,
            )
            .some((el) => el.closest('.lego-scene') === null && el.closest(PAGE_PARTS) !== null);
          if (covered) clear = false;
        }
      }
      box.dataset.lane = clear ? 'open' : 'none';
    };
    const place = () => {
      if (inPieces()) {
        placeInPieces();
        return;
      }
      const lanes = surveyLanes();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const own of layer.querySelectorAll(OWN_SCENERY)) {
        const rect = own.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) lanes.block(rect, 6);
      }
      const figure = figureRef.current;
      if (figure) {
        const h = figure.offsetHeight;
        // LEGO Yoda ends flat on his back, so he needs a box as wide as he is tall.
        const w =
          figure.dataset.who === 'yoda' ? Math.max(figure.offsetWidth, h) : figure.offsetWidth;
        const boxAt = (spot: Spot) => ({
          left: spot.left,
          top: spot.top,
          right: spot.left + w,
          bottom: spot.top + h,
        });
        if (!figureAt || !lanes.isFree(boxAt(figureAt))) {
          figureAt = w > 0 ? lanes.find(w, h, { x: vw - w / 2 - 24, y: vh - h / 2 - 4 }) : null;
        }
        if (figureAt) {
          figure.style.left = `${figureAt.left + (w - figure.offsetWidth) / 2}px`;
          figure.style.top = `${figureAt.top}px`;
          layer.dataset.cameo = 'figure';
          lanes.block(boxAt(figureAt), 10);
        } else layer.dataset.cameo = 'portrait';
      } else delete layer.dataset.cameo;
      if (
        caption &&
        lanes.isFree(
          {
            left: caption.left,
            top: caption.top,
            right: caption.left + caption.width,
            bottom: caption.top + caption.height,
          },
          true,
        )
      ) {
        return;
      }
      caption = null;
      const aim = { x: vw / 2, y: vh - 36 };
      const fit = (): typeof caption => {
        for (const inside of [false, true]) {
          for (const size of ['normal', 'small'] as const) {
            let last = 0;
            for (const max of CAPTION_WIDTHS) {
              const limit = Math.min(max, vw - 12);
              if (limit === last) continue;
              last = limit;
              box.dataset.size = size;
              box.dataset.lane = 'measure';
              box.style.maxWidth = `${limit}px`;
              const width = box.offsetWidth;
              // The caption's hard shadow hangs five pixels under it.
              const height = box.offsetHeight + 6;
              const spot = lanes.find(width, height, aim, inside);
              if (spot) return { ...spot, width, height };
            }
          }
        }
        return null;
      };
      caption = fit();
      if (caption) {
        box.style.left = `${caption.left}px`;
        box.style.top = `${caption.top}px`;
        box.dataset.lane = 'open';
      } else box.dataset.lane = 'none';
    };
    place();
    let frame = 0;
    const again = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };
    window.addEventListener('scroll', again, { capture: true, passive: true });
    window.addEventListener('resize', again);
    const timer = window.setInterval(again, 600);
    // Frame by frame while the page falls apart and rebuilds, and once more when it is whole.
    let watch = 0;
    let wasInPieces = false;
    const watchPieces = () => {
      watch = requestAnimationFrame(watchPieces);
      const now = inPieces();
      if (now || wasInPieces) place();
      wasInPieces = now;
    };
    watch = requestAnimationFrame(watchPieces);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(watch);
      window.clearInterval(timer);
      window.removeEventListener('scroll', again, { capture: true });
      window.removeEventListener('resize', again);
    };
  }, [toast, docked, cameo, separator]);

  useEffect(() => {
    setFooter(document.querySelector("footer[data-testid='footer']"));
    setWorker(WORKERS[Math.floor(Math.random() * WORKERS.length)]);
  }, []);

  useEffect(() => {
    if (!bubble) return;
    const id = window.setTimeout(() => setBubble(null), 3800);
    return () => window.clearTimeout(id);
  }, [bubble]);

  useEffect(() => {
    if (!ouch) return;
    const id = window.setTimeout(() => setOuch(0), 900);
    return () => window.clearTimeout(id);
  }, [ouch]);

  const talk = (who: CrewId, event: { clientX: number; clientY: number }) => {
    const lines = strings.quips[who];
    const previous = bubbleState.current?.who === who ? bubbleState.current.text : null;
    const options = lines.filter((line) => line !== previous);
    // Emmet and Wyldstyle open with their line from the film and the company motto (the last
    // entry of each list); after that the lines come up at random.
    const opener = (who === 'emmet' || who === 'wyldstyle') && !spoken.current.has(who);
    spoken.current.add(who);
    const text =
      (opener ? lines.at(-1) : options[Math.floor(Math.random() * options.length)]) ?? lines[0];
    setBubble({ who, text, nonce: Date.now() });
    runtime.egg('minifig', { x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <div ref={layerRef} className="lego-scene no-export" data-testid="lego-scene">
        <span className="lego-tower" data-side="left" aria-hidden="true" />
        <span className="lego-tower" data-side="right" aria-hidden="true" />
        <div className="lego-crew">
          {CREW.map((spec) => (
            <button
              key={spec.id}
              type="button"
              className="lego-minifig"
              data-who={spec.id}
              data-mode={spec.mode}
              aria-label={t[spec.id]}
              title={t[spec.id]}
              hidden
              ref={(element) => {
                if (element) crewRefs.current.set(spec.id, element);
                else crewRefs.current.delete(spec.id);
              }}
              onClick={(event) => talk(spec.id, event)}
            >
              <img
                src={`${IMG}${spec.id === 'builder' ? worker : spec.file}`}
                alt=""
                width={spec.width}
                height={spec.height}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </button>
          ))}
        </div>
        {bubble && (
          <div ref={bubbleRef} key={bubble.nonce} className="lego-bubble" role="status">
            {bubble.text}
          </div>
        )}
        {ship > 0 && (
          <img
            key={`ship-${ship}`}
            ref={shipRef}
            className="lego-spaceship"
            src={`${IMG}spaceship.webp`}
            alt={t.spaceship}
            width={439}
            height={300}
            decoding="async"
            draggable={false}
          />
        )}
        {rain && (
          <div key={`rain-${rain.nonce}`} className="lego-rain" aria-hidden="true">
            {RAIN.slice(0, Math.min(RAIN.length, rain.strips.length * 6)).map((drop, index) => (
              <span
                key={index}
                className="lego-rain-stud"
                data-tier={drop.tier}
                style={
                  {
                    '--lego-x': `${rain.strips[index % rain.strips.length].left + 2}px`,
                    '--lego-top': `${rain.strips[index % rain.strips.length].top}px`,
                    '--lego-fall': `${
                      rain.strips[index % rain.strips.length].bottom -
                      rain.strips[index % rain.strips.length].top -
                      18
                    }px`,
                    '--lego-delay': `${drop.delay}s`,
                    '--lego-duration': `${drop.duration}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
        {cameo && (
          <img
            key={cameo.nonce}
            ref={figureRef}
            className="lego-cameo"
            data-who={cameo.who}
            src={`${IMG}${CAMEO_ART[cameo.who].file}`}
            alt=""
            width={CAMEO_ART[cameo.who].width}
            height={CAMEO_ART[cameo.who].height}
            decoding="async"
            draggable={false}
          />
        )}
        {sleeping && (
          <button
            type="button"
            className="lego-sleeper"
            aria-label={t.sleeper}
            title={t.sleeper}
            onClick={() => playSnap()}
          >
            <img
              src={`${IMG}spaceman.webp`}
              alt=""
              width={104}
              height={176}
              decoding="async"
              draggable={false}
            />
            <span className="lego-zzz" aria-hidden="true">
              {t.zzz}
            </span>
          </button>
        )}
        {separator && (
          <button
            type="button"
            className="lego-putdown"
            data-lego-tool="putdown"
            data-testid="lego-putdown"
            onClick={() => runtime.toggleSeparator()}
          >
            <img
              src={`${IMG}separator.webp`}
              alt=""
              width={141}
              height={120}
              decoding="async"
              draggable={false}
            />
            <span>{strings.banner.separatorOff}</span>
          </button>
        )}
        <div
          ref={toastsRef}
          className="lego-toasts"
          data-lane="none"
          role="status"
          aria-live="polite"
        >
          {cameo && (
            <span key={`portrait-${cameo.nonce}`} className="lego-portrait" data-who={cameo.who}>
              <img
                src={`${IMG}${CAMEO_ART[cameo.who].file}`}
                alt={t[cameo.who]}
                width={CAMEO_ART[cameo.who].width}
                height={CAMEO_ART[cameo.who].height}
                decoding="async"
                draggable={false}
              />
            </span>
          )}
          {docked && (
            <img
              key={`docked-${docked.nonce}`}
              className="lego-ship-docked"
              src={`${IMG}${DOCK_ART[docked.art].file}`}
              alt={t[docked.art]}
              width={DOCK_ART[docked.art].width}
              height={DOCK_ART[docked.art].height}
              decoding="async"
              draggable={false}
            />
          )}
          {toast && (
            <p key={toast.id} className="lego-toast" data-tone={toast.tone}>
              {toast.text}
            </p>
          )}
        </div>
      </div>
      {footer &&
        createPortal(
          <button
            type="button"
            className="lego-foot-brick no-export"
            data-testid="lego-foot-brick"
            data-ouch={ouch ? 'true' : undefined}
            aria-label={t.footBrick}
            title={t.footBrick}
            onClick={(event) => {
              setOuch(Date.now());
              runtime.egg('footbrick', { x: event.clientX, y: event.clientY });
            }}
          />,
          footer,
        )}
    </>
  );
}
