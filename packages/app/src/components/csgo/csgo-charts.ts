/**
 * Paints chart points as crosshair hardware without changing data, scales or hit targets.
 * Canvas points stay in the chart's own draw loop. SVG points get the same marker so PNG
 * export keeps both the series colour and the shape encoding.
 */
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { pointLabelAnchor } from '@/lib/d3-chart/layers/point-label-order';
import { canvasPointLayerOf } from '@/lib/d3-chart/layers/canvas-point-registry';
import { CANVAS_POINT_SURFACE_CLASS } from '@/lib/d3-chart/layers/canvas-points';
import {
  classifyPointShape,
  hookPointFill,
  isPlainTransform,
  measurePointExtent,
  POINT_HOVER_EXTENT,
  type PointShape,
} from '@/components/effects/canvas-point-paint';

import { cueCsgoLine, emitCsgoLine } from './csgo-radio';

const SVG_NS = 'http://www.w3.org/2000/svg';
const POINT_SELECTOR = '.dot-group, .unofficial-overlay-pt';
const BAR_SELECTOR = 'rect.bar';
const MARKER = 'csgo-marker';
const SEAM = 'csgo-bar-seam';
const HOOKED = Symbol.for('csgo-point-fill');
const hooked = new WeakMap<HTMLCanvasElement, () => void>();
let jumpNoted = false;

function active(): boolean {
  const root = document.documentElement;
  return (
    root.classList.contains('csgo') &&
    !Object.hasOwn(root.dataset, 'inferencexEmbed') &&
    !isEmbedPathname(window.location.pathname)
  );
}

function colorOf(value: string | CanvasGradient | CanvasPattern): string {
  return typeof value === 'string' && value ? value : '#e6bd68';
}

const HALO = '#101820';
const TICKS = 'M0,-8 V-4 M0,4 V8 M-8,0 H-4 M4,0 H8';

function drawLockRing(ctx: CanvasRenderingContext2D, color: string, radius: number) {
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(3, radius - 1.5), 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.beginPath();
  const edge = radius;
  ctx.moveTo(-1.5, -edge);
  ctx.lineTo(1.5, -edge);
  ctx.moveTo(-1.5, edge);
  ctx.lineTo(1.5, edge);
  ctx.moveTo(-edge, -1.5);
  ctx.lineTo(-edge, 1.5);
  ctx.moveTo(edge, -1.5);
  ctx.lineTo(edge, 1.5);
  ctx.stroke();
}

function strokeTicks(ctx: CanvasRenderingContext2D, color: string, width: number) {
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(0, -4);
  ctx.moveTo(0, 4);
  ctx.lineTo(0, 8);
  ctx.moveTo(-8, 0);
  ctx.lineTo(-4, 0);
  ctx.moveTo(4, 0);
  ctx.lineTo(8, 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  ctx.stroke();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: PointShape,
  color: string,
  hover: boolean,
) {
  ctx.save();
  ctx.globalAlpha = hover ? 1 : 0.94;
  const ink = hover ? 2 : 1.7;
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
    ctx.fillStyle = HALO;
    ctx.fill();
    strokeTicks(ctx, HALO, 3.4);
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = ink;
    ctx.stroke();
    strokeTicks(ctx, color, ink);
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  } else if (shape === 'square') {
    ctx.fillStyle = HALO;
    ctx.fillRect(-8.2, -6.4, 16.4, 12.8);
    ctx.beginPath();
    ctx.moveTo(-8, -2.4);
    ctx.lineTo(-5.2, -5.6);
    ctx.lineTo(-5.2, 5.6);
    ctx.lineTo(-8, 2.4);
    ctx.closePath();
    ctx.moveTo(8, -2.4);
    ctx.lineTo(5.2, -5.6);
    ctx.lineTo(5.2, 5.6);
    ctx.lineTo(8, 2.4);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = ink;
    ctx.strokeRect(-5.2, -5.2, 10.4, 10.4);
    ctx.fillRect(-1.4, -2.2, 2.8, 4.4);
  } else if (shape === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -8.4);
    ctx.lineTo(7.4, 5.6);
    ctx.lineTo(-7.4, 5.6);
    ctx.closePath();
    ctx.fillStyle = HALO;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -6.2);
    ctx.lineTo(5.6, 4.4);
    ctx.lineTo(-5.6, 4.4);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4.2, 1.2);
    ctx.lineTo(0, -3.6);
    ctx.lineTo(4.2, 1.2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -8.2);
    ctx.lineTo(5.4, 0);
    ctx.lineTo(0, 8.2);
    ctx.lineTo(-5.4, 0);
    ctx.closePath();
    ctx.fillStyle = HALO;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -6.2);
    ctx.lineTo(4.2, 0);
    ctx.lineTo(0, 6.2);
    ctx.lineTo(-4.2, 0);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(1.4, -1.4);
    ctx.lineTo(5, 0);
    ctx.lineTo(1.4, 1.4);
    ctx.lineTo(0, 5);
    ctx.lineTo(-1.4, 1.4);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-1.4, -1.4);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

function paintPoint(context: CanvasRenderingContext2D, path: Path2D, fill: (path: Path2D) => void) {
  const transform = context.getTransform();
  if (!isPlainTransform(transform)) {
    fill(path);
    return;
  }
  const extent = measurePointExtent(context, path, transform);
  if (extent <= 0) {
    fill(path);
    return;
  }
  const shape = classifyPointShape(context, path, transform, extent);
  const hover = extent + 0.2 >= POINT_HOVER_EXTENT[shape];
  const color = colorOf(context.fillStyle);
  context.save();
  context.setTransform(1, 0, 0, 1, transform.e, transform.f);
  if (hover) {
    const stock = POINT_HOVER_EXTENT[shape] * Math.abs(transform.a);
    const cap = stock + 3.5;
    context.scale(
      Math.min(Math.abs(transform.a), cap / 8.4),
      Math.min(Math.abs(transform.a), cap / 8.4),
    );
    drawShape(context, shape, color, true);
    context.setTransform(1, 0, 0, 1, transform.e, transform.f);
    drawLockRing(context, color, cap);
    noteHover();
  } else {
    context.scale(transform.a, transform.a);
    drawShape(context, shape, color, false);
  }
  context.restore();
}

function hookSurface(surface: HTMLCanvasElement) {
  const context = surface.getContext('2d');
  if (!context || Reflect.get(context, HOOKED) === true) return;
  hooked.get(surface)?.();
  const release = hookPointFill(surface, paintPoint);
  if (!release) return;
  Reflect.set(context, HOOKED, true);
  hooked.set(surface, release);
  const svg = surface.nextElementSibling;
  if (svg instanceof Element) canvasPointLayerOf(svg)?.invalidate();
}

function svgMarker(shape: PointShape, fill: string): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', MARKER);
  group.dataset.csgoShape = shape;
  const node = (name: string, attrs: Record<string, string>) => {
    const el = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    group.append(el);
  };
  const ink = fill || 'currentColor';
  const sw = '1.7';
  if (shape === 'circle') {
    node('circle', { cx: '0', cy: '0', r: '6.4', fill: HALO });
    node('path', {
      d: TICKS,
      fill: 'none',
      stroke: HALO,
      'stroke-width': '3.4',
      'stroke-linecap': 'butt',
    });
    node('circle', { cx: '0', cy: '0', r: '5.6', fill: 'none', stroke: ink, 'stroke-width': sw });
    node('path', {
      d: TICKS,
      fill: 'none',
      stroke: ink,
      'stroke-width': sw,
      'stroke-linecap': 'butt',
    });
    node('circle', { cx: '0', cy: '0', r: '1.5', fill: ink });
  } else if (shape === 'square') {
    node('rect', { x: '-8.2', y: '-6.4', width: '16.4', height: '12.8', fill: HALO });
    node('path', {
      d: 'M-8,-2.4 L-5.2,-5.6 L-5.2,5.6 L-8,2.4 Z M8,-2.4 L5.2,-5.6 L5.2,5.6 L8,2.4 Z',
      fill: ink,
    });
    node('rect', {
      x: '-5.2',
      y: '-5.2',
      width: '10.4',
      height: '10.4',
      fill: 'none',
      stroke: ink,
      'stroke-width': sw,
    });
    node('rect', { x: '-1.4', y: '-2.2', width: '2.8', height: '4.4', fill: ink });
  } else if (shape === 'triangle') {
    node('path', { d: 'M0,-8.4 L7.4,5.6 L-7.4,5.6 Z', fill: HALO });
    node('path', {
      d: 'M0,-6.2 L5.6,4.4 L-5.6,4.4 Z',
      fill: 'none',
      stroke: ink,
      'stroke-width': sw,
    });
    node('path', {
      d: 'M-4.2,1.2 L0,-3.6 L4.2,1.2',
      fill: 'none',
      stroke: ink,
      'stroke-width': sw,
      'stroke-linejoin': 'miter',
    });
  } else {
    node('path', { d: 'M0,-8.2 L5.4,0 L0,8.2 L-5.4,0 Z', fill: HALO });
    node('path', {
      d: 'M0,-6.2 L4.2,0 L0,6.2 L-4.2,0 Z',
      fill: 'none',
      stroke: ink,
      'stroke-width': sw,
    });
    node('path', {
      d: 'M0,-5 L1.4,-1.4 L5,0 L1.4,1.4 L0,5 L-1.4,1.4 L-5,0 L-1.4,-1.4 Z',
      fill: ink,
    });
  }
  return group;
}

function shapeFromPoint(point: Element): { shape: PointShape; fill: string } {
  const visible = point.querySelector('.visible-shape');
  const tag = visible?.tagName.toLowerCase();
  const fill = visible?.getAttribute('fill') || '#e6bd68';
  if (tag === 'rect') return { shape: 'square', fill };
  if (tag === 'polygon') {
    const points = visible?.getAttribute('points') ?? '';
    return { shape: points.split(' ').length > 4 ? 'diamond' : 'triangle', fill };
  }
  return { shape: 'circle', fill };
}

function decorateSvg(root: ParentNode) {
  for (const point of root.querySelectorAll(POINT_SELECTOR)) {
    if (point.querySelector(`.${MARKER}`)) continue;
    const { shape, fill } = shapeFromPoint(point);
    const marker = svgMarker(shape, fill);
    const anchor = pointLabelAnchor(point);
    if (anchor) anchor.before(marker);
    else point.append(marker);
    point.querySelector('.visible-shape')?.setAttribute('opacity', '0');
  }
  for (const bar of root.querySelectorAll(BAR_SELECTOR)) {
    if (bar.nextElementSibling?.classList.contains(SEAM)) continue;
    const x = Number(bar.getAttribute('x') ?? 0);
    const y = Number(bar.getAttribute('y') ?? 0);
    const w = Number(bar.getAttribute('width') ?? 0);
    const h = Number(bar.getAttribute('height') ?? 0);
    if (w < 4 || h < 8) continue;
    const seam = document.createElementNS(SVG_NS, 'g');
    seam.setAttribute('class', SEAM);
    seam.setAttribute('pointer-events', 'none');
    for (let offset = 6; offset < h; offset += 6) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x + 1));
      line.setAttribute('x2', String(x + w - 1));
      line.setAttribute('y1', String(y + offset));
      line.setAttribute('y2', String(y + offset));
      line.setAttribute('stroke', '#101820');
      line.setAttribute('stroke-opacity', '0.35');
      seam.append(line);
    }
    bar.after(seam);
  }
}

function pathLength(path: SVGPathElement) {
  try {
    return path.getTotalLength();
  } catch {
    return 0;
  }
}

function frontierPath(svg: SVGSVGElement): SVGPathElement | null {
  const named = svg.querySelector('path.global-pareto-frontier');
  if (named instanceof SVGPathElement && pathLength(named) > 12) return named;
  let best: SVGPathElement | null = null;
  let bestLen = 0;
  for (const path of svg.querySelectorAll('path')) {
    if (!(path instanceof SVGPathElement)) continue;
    const len = pathLength(path);
    if (len > bestLen && (path.getAttribute('d') ?? '').length > 24) {
      best = path;
      bestLen = len;
    }
  }
  return bestLen > 12 ? best : null;
}

let jumpToken = '';

function placeJump() {
  const token = document.documentElement.dataset.csgoJump;
  if (!token || token === jumpToken) return;
  const svg = document.querySelector('[data-testid="d3-chart-svg"]');
  if (!(svg instanceof SVGSVGElement)) return;
  const host = svg.parentElement;
  if (!host) return;
  if (host.querySelector(':scope > .csgo-jump')) return;
  const path = frontierPath(svg);
  if (!path) return;
  jumpToken = token;
  let length = 0;
  try {
    length = path.getTotalLength();
  } catch {
    return;
  }
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const fig = document.createElement('img');
  fig.src = '/decorative/csgo/fig-ct.webp';
  fig.alt = '';
  fig.className = 'csgo-jump';
  fig.dataset.testid = 'csgo-jump';
  fig.width = 18;
  fig.height = 36;
  host.append(fig);
  const started = performance.now();
  const duration = 3800;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const placeAt = (t: number) => {
    const point = path.getPointAtLength(length * t);
    const matrix = path.getScreenCTM();
    if (!matrix) return;
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    const box = host.getBoundingClientRect();
    const labels = [...svg.querySelectorAll('text')].map((node) => node.getBoundingClientRect());
    const width = 18;
    const height = 36;
    const clear = (left: number, top: number) => {
      const rect = {
        l: box.left + left,
        t: box.top + top,
        r: box.left + left + width,
        b: box.top + top + height,
      };
      return labels.every(
        (label) =>
          label.width < 2 ||
          rect.r < label.left - 6 ||
          rect.l > label.right + 6 ||
          rect.b < label.top - 6 ||
          rect.t > label.bottom + 6,
      );
    };
    let left = screen.x - box.left - 9;
    let top = screen.y - box.top - 72;
    for (const dy of [72, 96, 48, 120]) {
      for (const dx of [-9, -36, 24, -60]) {
        const nextLeft = screen.x - box.left + dx;
        const nextTop = screen.y - box.top - dy;
        if (nextTop < 0 || nextLeft < 0 || nextLeft > box.width - width) continue;
        if (!clear(nextLeft, nextTop)) continue;
        left = nextLeft;
        top = nextTop;
        break;
      }
      if (clear(left, top)) break;
    }
    fig.style.visibility = clear(left, top) ? 'visible' : 'hidden';
    fig.style.left = `${left}px`;
    fig.style.top = `${top}px`;
  };
  if (calm) {
    placeAt(0.42);
    window.setTimeout(() => fig.remove(), duration);
    return;
  }
  const tick = (now: number) => {
    if (!fig.isConnected) return;
    const t = Math.min(1, (now - started) / duration);
    placeAt(t);
    if (t < 1) window.requestAnimationFrame(tick);
    else fig.remove();
  };
  window.requestAnimationFrame(tick);
  if (!jumpNoted) {
    jumpNoted = true;
    emitCsgoLine('coldzera');
  }
}

function decorateLegend() {
  for (const dot of document.querySelectorAll(String.raw`label.group\/item span.rounded-full`)) {
    dot.classList.add('csgo-legend-swatch');
  }
  if (document.querySelector('.csgo-shape-key')) return;
  const label = document.querySelector(String.raw`label.group\/item`);
  const list = label?.parentElement?.parentElement;
  if (!list) return;
  const key = document.createElement('div');
  key.className = 'csgo-shape-key';
  key.setAttribute('aria-hidden', 'true');
  const labels = ['FP4', 'FP8', 'BF16', 'Spec'];
  (['circle', 'square', 'triangle', 'diamond'] as const).forEach((shape, index) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '-10 -10 20 20');
    svg.setAttribute('aria-label', labels[index] ?? shape);
    svg.append(svgMarker(shape, '#e6bd68'));
    key.append(svg);
  });
  list.prepend(key);
}

let hoverCueAt = 0;
let positioned = false;
let lastTitle = '';
let defuseToken = '';

function noteHover() {
  const now = Date.now();
  if (now - hoverCueAt < 500) return;
  hoverCueAt = now;
  const fig = document.querySelector('[data-testid="chart-figure"]');
  if (fig instanceof HTMLElement) fig.dataset.csgoLock = '1';
  cueCsgoLine('spotted');
}

let loadHoldArmed = false;

function holdName(): string {
  try {
    return new URLSearchParams(window.location.search).get('csgo_hold') ?? '';
  } catch {
    return '';
  }
}

function wantsLoadHold(): boolean {
  if (holdName() === 'load') loadHoldArmed = true;
  return loadHoldArmed;
}

function chartFigure(): HTMLElement | null {
  const fig = document.querySelector('[data-testid="chart-figure"]');
  return fig instanceof HTMLElement ? fig : null;
}

function ensureExportStamp() {
  const zh = document.documentElement.dataset.csgoLocale === 'zh';
  const model = new URLSearchParams(window.location.search).get('g_model') || '';
  for (const host of document.querySelectorAll('[id$="-export"]')) {
    if (!(host instanceof HTMLElement)) continue;
    if (host.querySelector('[data-testid="csgo-export-stamp"]')) continue;
    const bar = document.createElement('div');
    bar.className = 'csgo-export-stamp';
    bar.dataset.testid = 'csgo-export-stamp';
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.justifyContent = 'space-between';
    bar.style.gap = '12px';
    bar.style.margin = '0 0 8px';
    bar.style.padding = '6px 10px';
    bar.style.background = '#101820';
    bar.style.color = '#e6bd68';
    bar.style.border = '2px solid #e6bd68';
    bar.style.fontFamily = 'CsgoDisplay, Rajdhani, sans-serif';
    bar.style.letterSpacing = '0.12em';
    bar.style.textTransform = 'uppercase';
    bar.style.fontSize = '13px';
    bar.style.lineHeight = '1.2';
    const left = document.createElement('span');
    left.textContent = 'COUNTER-STRIKE';
    const mid = document.createElement('strong');
    mid.textContent = zh ? 'CT 胜' : 'CT WIN';
    mid.style.color = '#7dffb3';
    const right = document.createElement('span');
    right.textContent = model ? model.replaceAll('-', ' ') : zh ? '比赛报告' : 'MATCH REPORT';
    bar.append(left, mid, right);
    host.prepend(bar);
    host.style.border = '3px solid #e6bd68';
    host.style.boxSizing = 'border-box';
    host.style.background = '#101820';
  }
}

function ensureLoadHold() {
  if (!wantsLoadHold()) return;
  if (document.querySelector('[data-testid="csgo-loading-hold"]')) return;
  const skeleton = document.querySelector("[data-slot='skeleton'][class*='h-[600px]']");
  if (!(skeleton instanceof HTMLElement)) return;
  const zh = document.documentElement.dataset.csgoLocale === 'zh';
  const hold = document.createElement('div');
  hold.className = 'csgo-hold csgo-skeleton-hold';
  hold.dataset.hold = 'skeleton';
  hold.dataset.testid = 'csgo-loading-hold';
  hold.setAttribute('aria-hidden', 'true');
  const title = document.createElement('strong');
  title.textContent = zh
    ? '冻结时间。真实骨架的保持。Hold This Position. 守住这个位置。'
    : 'FREEZE TIME. Hold of the real skeleton. Hold This Position. 守住这个位置。';
  const clone = skeleton.cloneNode(true);
  if (clone instanceof HTMLElement) clone.dataset.csgoHeldSkeleton = '1';
  hold.append(title, clone);
  document.body.append(hold);
  cueCsgoLine('hold');
}

function ensureHold() {
  const hold = holdName();
  const fig = chartFigure();
  if (!fig) return;
  for (const node of fig.querySelectorAll('.csgo-hold')) {
    if (node instanceof HTMLElement && node.dataset.hold !== hold) node.remove();
  }
  if (!hold) return;
  const testId = hold === 'pin' ? 'csgo-hover-lock' : hold === 'round' ? 'csgo-round-start' : '';
  if (!testId || fig.querySelector(`[data-testid="${testId}"]`)) return;
  const zh = document.documentElement.dataset.csgoLocale === 'zh';
  const card = document.createElement('div');
  card.className = 'csgo-hold';
  card.dataset.hold = hold;
  card.dataset.testid = testId;
  card.setAttribute('aria-hidden', 'true');
  if (hold === 'pin') {
    fig.dataset.csgoLock = '1';
    cueCsgoLine('spotted');
  } else if (hold === 'round') {
    const title = document.createElement('strong');
    title.textContent = zh ? '回合开始 Go go go! 冲冲冲！' : 'ROUND START Go go go! 冲冲冲！';
    const sweepBar = document.createElement('i');
    card.append(title, sweepBar);
    document.documentElement.dataset.csgoRound = 'hold';
    cueCsgoLine('go');
  }
  fig.append(card);
}

function noteTitle() {
  const heading = document.querySelector('[data-testid="chart-figure"] h2');
  const text = heading?.textContent?.replaceAll(/\s+/g, ' ').trim() ?? '';
  if (!text) return;
  if (lastTitle && text !== lastTitle) {
    document.documentElement.dataset.csgoRound = String(Date.now());
    cueCsgoLine('go');
    window.setTimeout(() => {
      if (document.documentElement.dataset.csgoRound !== 'hold') {
        delete document.documentElement.dataset.csgoRound;
      }
    }, 1400);
  }
  lastTitle = text;
}

function noteChartReady() {
  if (positioned) return;
  if (!document.querySelector('[data-testid="d3-chart-svg"]')) return;
  positioned = true;
  cueCsgoLine('position');
}

function placeDefuse() {
  const token = document.documentElement.dataset.csgoDefuse;
  if (!token || token === defuseToken) return;
  const svg = document.querySelector('[data-testid="d3-chart-svg"]');
  if (!(svg instanceof SVGSVGElement)) return;
  const host = svg.parentElement;
  if (!host) return;
  defuseToken = token;
  const path = frontierPath(svg);
  if (!path) return;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const flame = document.createElement('div');
  flame.className = 'csgo-defuse-fx';
  flame.dataset.testid = 'csgo-defuse-fx';
  flame.setAttribute('aria-hidden', 'true');
  host.append(flame);
  let length: number;
  try {
    length = path.getTotalLength();
  } catch {
    flame.remove();
    return;
  }
  const point = path.getPointAtLength(length * 0.55);
  const matrix = path.getScreenCTM();
  if (!matrix) {
    flame.remove();
    return;
  }
  const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
  const box = host.getBoundingClientRect();
  flame.style.left = `${Math.max(0, screen.x - box.left - 10)}px`;
  flame.style.top = `${Math.max(0, screen.y - box.top - 28)}px`;
  window.setTimeout(() => flame.remove(), 4200);
}

function onExportClick(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('[data-testid="export-png-button"]')) cueCsgoLine('nice');
}

function sweep() {
  if (!active()) return;
  for (const surface of document.querySelectorAll(`canvas.${CANVAS_POINT_SURFACE_CLASS}`)) {
    if (surface instanceof HTMLCanvasElement) hookSurface(surface);
  }
  decorateSvg(document);
  decorateLegend();
  for (const node of document.querySelectorAll('.csgo-gutter')) node.remove();
  placeJump();
  placeDefuse();
  ensureExportStamp();
  ensureHold();
  ensureLoadHold();
  noteTitle();
  noteChartReady();
  if (document.querySelector('[data-testid="scatter-empty-state"]')) cueCsgoLine('clear');
  let step = 1;
  for (const tip of document.querySelectorAll('[data-chart-tooltip]')) {
    if (!tip.querySelector('.csgo-round-tag')) {
      const tag = document.createElement('span');
      tag.className = 'csgo-round-tag';
      tag.textContent = `R${step}`;
      tip.prepend(tag);
    }
    step += 1;
  }
}

export function mountCsgoCharts(): () => void {
  let frame = 0;
  const schedule = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(sweep);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  const onJump = () => schedule();
  window.addEventListener('csgo-jump', onJump);
  document.addEventListener('click', onExportClick, true);
  schedule();
  return () => {
    window.removeEventListener('csgo-jump', onJump);
    document.removeEventListener('click', onExportClick, true);
    observer.disconnect();
    window.cancelAnimationFrame(frame);
    for (const surface of document.querySelectorAll(`canvas.${CANVAS_POINT_SURFACE_CLASS}`)) {
      if (surface instanceof HTMLCanvasElement) hooked.get(surface)?.();
    }
    for (const node of document.querySelectorAll(
      `.${MARKER}, .${SEAM}, .csgo-round-tag, .csgo-shape-key, .csgo-jump, .csgo-gutter, .csgo-export-stamp, .csgo-hold, .csgo-defuse-fx`,
    ))
      node.remove();
    for (const swatch of document.querySelectorAll('.csgo-legend-swatch'))
      swatch.classList.remove('csgo-legend-swatch');
    for (const shape of document.querySelectorAll(`${POINT_SELECTOR} .visible-shape`)) {
      shape.removeAttribute('opacity');
    }
  };
}
