import {
  AWS_ORANGE,
  GOOGLE_BLUE,
  HUAWEI_CHART_COLORS,
  VENDOR_OKLCH_ZONES,
} from '@semianalysisai/inferencex-constants';
import { hsl } from 'd3';
import {
  classifyPointShape,
  hookPointFill,
  isPlainTransform,
  measurePointExtent,
  POINT_HOVER_EXTENT,
  type PointShape,
} from '@/components/effects/canvas-point-paint';
import { getShapeConfig } from '@/lib/charts/chart-rendering';
import { CANVAS_POINT_SURFACE_CLASS } from '@/lib/d3-chart/layers/canvas-points';
import {
  CANVAS_POINT_LAYER_SELECTOR,
  canvasPointLayerOf,
} from '@/lib/d3-chart/layers/canvas-point-registry';

const strokes = {
  circle: [
    'M.2 -5.7C3.3 -6 5.7 -3.1 5.8 -.2C6 3.2 3.3 5.7 .1 5.8C-3.4 5.6 -5.9 3.4 -5.7 .2C-5.9 -2.9 -3.4 -5.7 .2 -5.7Z',
    'M-3.5 -4.6Q-.2 -6.5 3 -4.8M5.7 -.8Q6.2 4.2 1.4 5.9M-4.6 3.6Q-6.5 1.3 -5.6 -1',
    'M-3.4 .2L.4 -3.8M-2.5 3.5L3.6 -2.9M.8 4L4.3 .5',
  ],
  square: [
    'M-5.5 -5L5.3 -5.6L5.7 5.1L-5.8 5.7Z',
    'M-5.9 2.8L-5.8 -5.6L1.6 -5.3M2.4 5.8L6 5.4L5.5 -1',
    'M-4 -.7L-.5 -4.2M-4 2.6L2.8 -4.3M-1.1 4L4 -1M2.5 4L4.1 2.2M-3 -3.5L3 2.8',
  ],
  triangle: [
    'M-.2 -6.6L6.3 4.6L-6.2 5.1Z',
    'M-6.4 4.9Q-3.2 -.6 -.4 -6.7M.9 -5L6.5 4.5L-2.4 5.3',
    'M-2.7 3.5L.4 -.1M.5 3.6L2 1.9M-1.1 .3L.2 -1.3',
  ],
  diamond: [
    'M-.1 -6.5L6 0L.1 6.2L-6 -.1Z',
    'M-5.9 -.1L-.4 -6.8L3 -3.1M6.2 .1L.2 6.5L-3.3 2.7',
    'M-3.5 .1L.8 -4M-1.9 2.3L2.7 -2.2M.1 4.4L4 .4',
  ],
  hex: [
    'M-3.1-5.5L3.5-5.3 6.1.2 3 5.5-3.5 5.2-6-.2Z',
    'M-6.2-.1L-3.3-5.7 3.6-5.3M6.1.5L2.9 5.7-1.9 5.6',
    'M-3.6.7L-.3-3.6M-2.2 3.8L3.6-3.4M1.1 3.6L4.3.2',
  ],
  capsule: [
    'M-6-1.9Q-5.9-4.6-2.6-4.6L3.1-4.5Q6.1-4.4 6 0T3.1 4.6L-3 4.5Q-6.2 4.4-6-1.9Z',
    'M-5.1-3.7Q-3.5-5 1.9-4.6M4.9 3.6Q3.6 4.9-.3 4.5',
    'M-4.2.5L-.5-3.3M-2.8 3.5L3.2-3.2M1.7 3.4L4.6.4',
  ],
};
type InkShape = keyof typeof strokes;
const vendorShape: Record<string, InkShape> = {
  nvidia: 'circle',
  amd: 'square',
  google: 'triangle',
  huawei: 'hex',
  aws: 'diamond',
  openai: 'capsule',
};

function vendorForInk(ink: string) {
  const normalized = ink.toLowerCase();
  if (normalized === GOOGLE_BLUE.toLowerCase()) return 'google';
  if (normalized === AWS_ORANGE.toLowerCase()) return 'aws';
  if (Object.values(HUAWEI_CHART_COLORS).some((value) => value.toLowerCase() === normalized))
    return 'huawei';
  const hue = normalized.match(/^oklch\(\s*[\d.]+%?\s+[\d.]+%?\s+(?<hue>[\d.]+)/)?.groups?.hue;
  if (hue !== undefined) {
    return Object.keys(VENDOR_OKLCH_ZONES).find((key) => {
      const { start, end } = VENDOR_OKLCH_ZONES[key];
      return Number(hue) >= start && Number(hue) <= end;
    });
  }
  const color = hsl(ink);
  if (Number.isNaN(color.h) || color.s < 0.25) return;
  if (color.h < 18 || color.h >= 345) return 'amd';
  if (color.h < 42) return 'aws';
  if (color.h < 63) return 'huawei';
  if (color.h < 170) return 'nvidia';
  if (color.h >= 250) return 'openai';
  if (color.h >= 198) return 'google';
}
const SVG = 'http://www.w3.org/2000/svg';
const legendSelector =
  '.legend-container label > span.relative > :is(span.rounded-full, svg[data-testid="legend-line-swatch"])';
const pointSelector = '.dot-group > .visible-shape';
const microSelector = '[id^="ubenchx-"] svg circle.point';
const barSelector = '[data-testid="calculator-bar-chart"] rect.bar';
const barInkProperty = '--excalidraw-bar-ink';
const barDefinitions = 'excalidraw-bar-patterns';
const tracked = `${pointSelector}, ${legendSelector}, ${microSelector}, ${barSelector}`;
let barSequence = 0;
const captionSelector =
  ':is([data-testid="chart-figure"], [data-testid="historical-trend-figure"], [data-testid="calculator-figure"]) figcaption, [id^="ubenchx-"] > figcaption';
const frameClass = 'excalidraw-chart-frame-ink';
const editorShape = (triangle: boolean) => {
  // The small circle/square hover measures 12 px across. The triangle hover
  // is shallower; keep the entire editor mark (handle strokes included) within +4.
  const left = -6.65;
  const right = 6.65;
  const top = triangle ? -4.72 : -6.65;
  const bottom = triangle ? 2.62 : 6.65;
  return {
    outline: `M${left} ${top}H${right}V${bottom}H${left}Z`,
    handles: [left, right]
      .flatMap((x) => [top, bottom].map((y) => `M${x - 0.9} ${y - 0.9}h1.8v1.8h-1.8z`))
      .join(' '),
    bottom: bottom + 1.325,
  };
};

function addCaptionArt(caption: Element) {
  if (caption.querySelector(`:scope > .${frameClass}`)) return;
  const strip = document.createElement('div');
  strip.className = frameClass;
  strip.setAttribute('aria-hidden', 'true');
  for (const [name, width] of [
    ['tool-select', 24],
    ['tool-library', 24],
    ['architecture-strip', 153],
    ['stick-shrug', 31],
  ] as const) {
    const art = document.createElement('img');
    art.src = `/decorative/excalidraw/${name}.webp`;
    art.alt = '';
    art.width = width;
    art.height = 29;
    strip.append(art);
  }
  caption.append(strip);
  const stamp = document.createElement('div');
  stamp.className = 'excalidraw-export-imprint export-only';
  stamp.style.display = 'none';
  stamp.textContent =
    document.documentElement.lang === 'zh'
      ? '用 Excalidraw 风格绘制 · 推理基准'
      : 'Made with Excalidraw-style ink · InferenceX';
  caption.append(stamp);
}

function isEnlarged(original: Element, shape: PointShape) {
  const config = getShapeConfig(shape);
  if (config.type === 'circle') return Number(original.getAttribute('r')) > config.normal.r;
  if (config.type === 'rect') return Number(original.getAttribute('width')) > config.normal.width;
  return original.getAttribute('d') === config.hover.d;
}

function refresh() {
  for (const layer of document.querySelectorAll(CANVAS_POINT_LAYER_SELECTOR)) {
    canvasPointLayerOf(layer)?.invalidate();
  }
}

function drawSvg(group: Element, shape: InkShape, ink: string, paper: string) {
  for (const [index, d] of strokes[shape].entries()) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', index === 0 ? paper : 'none');
    path.setAttribute('stroke', ink);
    path.setAttribute('stroke-width', index === 0 ? '1.8' : index === 1 ? '1.1' : '1.25');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    group.append(path);
  }
}

export function mountBoardCharts() {
  const surfaces = new Map<HTMLCanvasElement, () => void>();
  const geometry = new Map(
    Object.entries(strokes).map(([key, paths]) => [key, paths.map((d) => new Path2D(d))]),
  );
  const signatures = new WeakMap<Element, string>();
  const barPatterns = new WeakMap<
    SVGSVGElement,
    { definitions: SVGDefsElement; fills: Map<string, string> }
  >();
  const shapes = new WeakMap<Path2D, { shape: PointShape; hovered: boolean }>();
  const editor = [false, true].map((triangle) => {
    const shape = editorShape(triangle);
    return { ...shape, boxPath: new Path2D(shape.outline), handlesPath: new Path2D(shape.handles) };
  });
  const inkShapes = new Map<string, InkShape | null>();
  // A legend swatch without a precision shape gets a vendor silhouette.
  // Plot marks keep the native precision shape, series ink and exact hit targets.
  function shapeFor(ink: string, fallback: PointShape): InkShape {
    if (inkShapes.has(ink)) return inkShapes.get(ink) ?? fallback;
    const vendor = vendorForInk(ink);
    const shape = vendor ? (vendorShape[vendor] ?? null) : null;
    if (inkShapes.size >= 256) inkShapes.clear();
    inkShapes.set(ink, shape);
    return shape ?? fallback;
  }
  let frame = 0;
  let paper = '';
  let plotPaper = '';
  let selectionInk = '#6965db';
  const readPaper = () => {
    const styles = getComputedStyle(document.documentElement);
    paper = styles.getPropertyValue('--card').trim() || '#fff';
    plotPaper = styles.getPropertyValue('--excalidraw-plot-paper').trim() || paper;
    selectionInk = styles.getPropertyValue('--primary').trim() || selectionInk;
  };
  readPaper();

  function paintBar(bar: SVGRectElement) {
    const root = bar.ownerSVGElement;
    const color = bar.getAttribute('fill');
    if (!root || !color || color === 'none') return;
    let group = barPatterns.get(root);
    if (!group?.definitions.isConnected) {
      const definitions = document.createElementNS(SVG, 'defs');
      definitions.classList.add(barDefinitions);
      root.prepend(definitions);
      group = { definitions, fills: new Map() };
      barPatterns.set(root, group);
    }
    let fill = group.fills.get(color);
    if (!fill) {
      const pattern = document.createElementNS(SVG, 'pattern');
      pattern.id = `excalidraw-bar-ink-${++barSequence}`;
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('width', '7');
      pattern.setAttribute('height', '7');
      const ground = document.createElementNS(SVG, 'rect');
      ground.setAttribute('width', '7');
      ground.setAttribute('height', '7');
      ground.setAttribute('fill', color);
      const hatch = document.createElementNS(SVG, 'path');
      hatch.setAttribute('d', 'M-1 3Q1 2 4-2M-1 8Q4 3 8-1M4 9Q6 7 9 4');
      hatch.setAttribute('fill', 'none');
      hatch.setAttribute('stroke', '#fff');
      hatch.setAttribute('stroke-width', '0.8');
      hatch.setAttribute('stroke-opacity', '0.38');
      pattern.append(ground, hatch);
      group.definitions.append(pattern);
      fill = `url(#${pattern.id})`;
      group.fills.set(color, fill);
    }
    if (bar.style.getPropertyValue(barInkProperty) !== fill)
      bar.style.setProperty(barInkProperty, fill);
  }

  function paint(original: Element) {
    if (!original.isConnected || !original.matches(tracked)) return;
    if (original instanceof SVGRectElement && original.matches(barSelector)) {
      paintBar(original);
      return;
    }
    const micro = original.matches(microSelector);
    const point = micro || original.matches(pointSelector);
    const row = original.parentElement;
    if (!row) return;
    const cls = point ? 'excalidraw-svg-marker' : 'excalidraw-legend-marker';
    const ink = point
      ? original.getAttribute('fill')
      : (original.querySelector('line')?.getAttribute('stroke') ??
        (original as HTMLElement).style.backgroundColor);
    if (!ink || ink === 'none' || ink === 'transparent') return;
    const key = (point ? (original as SVGElement).dataset.shapeKey : 'circle') as PointShape;
    const nativeShape: PointShape = Object.hasOwn(strokes, key) ? key : 'circle';
    const shape = point && !micro ? nativeShape : shapeFor(ink, nativeShape);
    const selected = point && !micro && isEnlarged(original, nativeShape);
    const scale = micro ? Number(original.getAttribute('r')) / 6.7 : 1;
    const alpha = point ? '' : (original as HTMLElement | SVGElement).style.opacity;
    const position = micro
      ? `translate(${Number(original.getAttribute('cx'))} ${Number(original.getAttribute('cy'))}) `
      : '';
    const markPaper =
      point &&
      original.closest(':is([data-testid="chart-figure"], [data-testid="historical-trend-figure"])')
        ? plotPaper
        : paper;
    const signature = `${ink}|${shape}|${scale}|${markPaper}|${alpha}|${position}|${selected}`;
    let marker = micro
      ? original.nextElementSibling?.matches(`.${cls}`)
        ? original.nextElementSibling
        : undefined
      : row.querySelector(`:scope > .${cls}`);
    if (marker && signatures.get(marker) === signature) return;
    marker?.remove();
    marker = document.createElementNS(SVG, point ? 'g' : 'svg');
    marker.classList.add(cls);
    if (micro) marker.classList.add('excalidraw-micro-marker');
    marker.setAttribute('aria-hidden', 'true');
    marker.setAttribute('pointer-events', 'none');
    if (point) {
      if (scale !== 1 || position) marker.setAttribute('transform', `${position}scale(${scale})`);
    } else {
      marker.setAttribute('viewBox', '-7 -7 14 14');
      marker.setAttribute('width', '14');
      marker.setAttribute('height', '14');
      marker.setAttribute('opacity', alpha || '1');
    }
    const drawLayer =
      selected && nativeShape === 'triangle' ? document.createElementNS(SVG, 'g') : marker;
    if (drawLayer !== marker) {
      drawLayer.setAttribute('transform', 'translate(0 -1.1) scale(.86 .57)');
      marker.append(drawLayer);
    }
    drawSvg(drawLayer, shape, ink, markPaper);
    if (selected) {
      const bounds = editor[nativeShape === 'triangle' ? 1 : 0]!;
      for (const [d, fill] of [
        [bounds.outline, 'none'],
        [bounds.handles, markPaper],
      ]) {
        const inkPath = document.createElementNS(SVG, 'path');
        inkPath.setAttribute('d', d);
        inkPath.setAttribute('fill', fill);
        inkPath.classList.add('excalidraw-editor-handle');
        marker.append(inkPath);
      }
    }
    if (point) original.after(marker);
    else row.append(marker);
    signatures.set(marker, signature);
  }

  const paintCanvas: Parameters<typeof hookPointFill>[1] = (ctx, path, fill) => {
    const t = ctx.getTransform();
    if (!isPlainTransform(t)) {
      fill(path);
      return;
    }
    let info = shapes.get(path);
    if (!info) {
      const extent = measurePointExtent(ctx, path, t);
      if (!extent) {
        fill(path);
        return;
      }
      const shape = classifyPointShape(ctx, path, t, extent);
      info = { shape, hovered: extent >= POINT_HOVER_EXTENT[shape] };
      shapes.set(path, info);
    }
    const [outline, echo, hatch] = geometry.get(info.shape)!;
    const editorBounds = editor[info.shape === 'triangle' ? 1 : 0]!;
    const y = t.f / t.d;
    const bottom = ctx.canvas.height / t.d;
    const inset = bottom - y;
    // Near the x axis keep the lower edge of the ink inside the canvas. A small
    // stem goes back to the exact observation; hover and measurement coordinates are untouched.
    const inkBottom = info.hovered ? editorBounds.bottom : 7;
    const inkY = inset >= 0 && inset < inkBottom ? inset - inkBottom : 0;
    ctx.save();
    try {
      if (inkY !== 0) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, inkY);
        ctx.strokeStyle = String(ctx.fillStyle);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.translate(0, inkY);
      }
      ctx.strokeStyle = ctx.fillStyle;
      ctx.fillStyle = plotPaper;
      const flatTriangle = info.hovered && info.shape === 'triangle';
      if (flatTriangle) {
        ctx.save();
        ctx.translate(0, -1.1);
        ctx.scale(0.86, 0.57);
      }
      fill(outline);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.8;
      ctx.stroke(outline);
      ctx.lineWidth = 1.1;
      ctx.stroke(echo);
      ctx.lineWidth = 1.25;
      ctx.stroke(hatch);
      if (flatTriangle) ctx.restore();
      if (info.hovered) {
        ctx.strokeStyle = selectionInk;
        ctx.lineWidth = 0.85;
        ctx.stroke(editorBounds.boxPath);
        ctx.fillStyle = plotPaper;
        fill(editorBounds.handlesPath);
        ctx.stroke(editorBounds.handlesPath);
      }
    } finally {
      ctx.restore();
    }
  };
  const syncSurfaces = () => {
    frame = 0;
    for (const [canvas, release] of surfaces) {
      if (canvas.isConnected) continue;
      release();
      surfaces.delete(canvas);
    }
    let changed = false;
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
      `.${CANVAS_POINT_SURFACE_CLASS}`,
    )) {
      if (surfaces.has(canvas)) continue;
      const release = hookPointFill(canvas, paintCanvas);
      if (release) {
        changed = true;
        surfaces.set(canvas, release);
      }
    }
    if (changed) refresh();
  };
  const queueSurface = () => {
    if (!frame) frame = requestAnimationFrame(syncSurfaces);
  };
  // Decorate new SVG shapes in the observer microtask, not in rAF: PNG layout rebuilds
  // its scatter SVG from canvas data just before serializing the export container.
  const observer = new MutationObserver((records) => {
    const pending = new Set<Element>();
    const captions = new Set<Element>();
    for (const record of records) {
      if (
        !(record.target instanceof Element) ||
        record.target.closest('.excalidraw-svg-marker,.excalidraw-legend-marker')
      )
        continue;
      if (record.type === 'attributes') {
        const pointOrSwatch = record.target.closest(tracked);
        if (pointOrSwatch) pending.add(pointOrSwatch);
        continue;
      }
      if (
        !frame &&
        [...record.removedNodes].some(
          (node) =>
            node instanceof Element &&
            (node.matches(`canvas.${CANVAS_POINT_SURFACE_CLASS}`) ||
              node.querySelector(`canvas.${CANVAS_POINT_SURFACE_CLASS}`)),
        )
      )
        queueSurface();
      for (const node of record.addedNodes) {
        if (
          !(node instanceof Element) ||
          node.matches('.excalidraw-svg-marker,.excalidraw-legend-marker')
        )
          continue;
        if (node.matches(tracked)) pending.add(node);
        for (const original of node.querySelectorAll(tracked)) pending.add(original);
        if (node.matches(captionSelector)) captions.add(node);
        for (const caption of node.querySelectorAll(captionSelector)) captions.add(caption);
        if (
          !frame &&
          (node.matches(`canvas.${CANVAS_POINT_SURFACE_CLASS}`) ||
            node.querySelector(`canvas.${CANVAS_POINT_SURFACE_CLASS}`))
        )
          queueSurface();
      }
    }
    for (const caption of captions) addCaptionArt(caption);
    for (const record of records) {
      for (const removed of record.removedNodes) {
        if (removed instanceof Element && removed.matches('circle.point')) {
          const next = record.nextSibling;
          if (next instanceof Element && next.classList.contains('excalidraw-micro-marker'))
            next.remove();
        }
      }
    }
    for (const original of pending) paint(original);
  });
  const palette = new MutationObserver(() => {
    readPaper();
    for (const original of document.querySelectorAll(tracked)) paint(original);
    refresh();
  });
  palette.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-excalidraw-paper'],
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['fill', 'stroke', 'r', 'cx', 'cy', 'width', 'd', 'data-shape-key', 'style'],
  });
  for (const original of document.querySelectorAll(tracked)) paint(original);
  for (const caption of document.querySelectorAll(captionSelector)) addCaptionArt(caption);
  syncSurfaces();
  return () => {
    observer.disconnect();
    palette.disconnect();
    cancelAnimationFrame(frame);
    for (const release of surfaces.values()) release();
    for (const marker of document.querySelectorAll(
      `.excalidraw-svg-marker,.excalidraw-legend-marker,.${frameClass},.excalidraw-export-imprint,.${barDefinitions}`,
    ))
      marker.remove();
    for (const bar of document.querySelectorAll<SVGRectElement>(barSelector))
      bar.style.removeProperty(barInkProperty);
    refresh();
  };
}
