import type { PointShape } from '@/components/effects/canvas-point-paint';

type Part = [string, string, string, number];
const dark = '#241c20',
  ivory = '#fff2cf',
  amber = '#ffac39',
  series = 'series';
// Pixel pickups use the active series for their main body. Coordinates are local chart units.
export const stamps: Record<PointShape, Part[]> = {
  circle: [
    [
      'M-6-2-3.8-1.6-5-5.8-1.7-3.8-.6-7 .9-4 3.1-5.2 3.2-3.2 5.1-2.2 5.8 0 5.1 3.2 2.5 5.2-.6 5.7-3.2 4.1-4.6 1.5Z',
      series,
      dark,
      1.1,
    ],
    ['M-2.6-.9-1.6.2-.6-2.4.8-.7 1.8-1.4 2.6.3 2 2.1.4 3.1-1.5 2.2Z', amber, '', 0],
    ['M-.3.4.3 1.3.8.7 1.1 1.7.2 2.1Z', ivory, '', 0],
  ],
  square: [
    ['M-6-4.3H3.5L6-2V4.2H1.5L.4 3.1H-6Z', series, dark, 1.2],
    ['M-5.3-2.6H4.3V-.6H-5.3Z', dark, '', 0],
    ['M-4.1.7h2.4v1.5h-2.4Z M1.2 1.1h2.6v.85H1.2Z', ivory, '', 0],
  ],
  triangle: [
    ['M-2.4-6.3H2.4V3.1H3.5V6.1H-3.5V3.1h1.1Z', series, dark, 1.2],
    ['M-3 3.2H3V5.8H-3Z', amber, dark, 0.55],
    ['M-1.6-5.1h.85v6.8h-.85Z', ivory, '', 0],
  ],
  diamond: [
    ['M-2.35-6h4.7v3.65H6v4.7H2.35V6h-4.7V2.35H-6v-4.7h3.65Z', series, dark, 1.25],
    ['M-1-4.2v3.1h-3.2', 'none', ivory, 1.05],
  ],
};
const lock: Part[] = [
  ['M-7-3.2V-7h3.4M3.6-7H7v3.8M7 3.4V7H3.5M-3.5 7H-7V3.4', 'none', dark, 1.8],
  ['M-7-3.2V-7h3.4M3.6-7H7v3.8M7 3.4V7H3.5M-3.5 7H-7V3.4', 'none', '#ffe355', 1],
];
const spec = (s: PointShape, picked: boolean) => (picked ? [...stamps[s], ...lock] : stamps[s]);
export const stampScale = (extent: number, picked = false) =>
  picked ? Math.min(1.25, (extent + 1.2) / 7) : 0.93;
const cache = new Map<string, { p: Path2D; ink: Part }[]>();
function drawVector(
  ctx: CanvasRenderingContext2D,
  fill: (p: Path2D) => void,
  key: PointShape,
  scale: number,
  picked = false,
) {
  const id = key + Number(picked);
  let rows = cache.get(id);
  if (!rows) {
    rows = spec(key, picked).map((ink) => ({ p: new Path2D(ink[0]), ink }));
    cache.set(id, rows);
  }
  const color = ctx.fillStyle;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';
  for (const {
    p,
    ink: [, c, s, w],
  } of rows) {
    if (c !== 'none') {
      ctx.fillStyle = c === series ? color : c;
      fill(p);
    }
    if (s) {
      ctx.strokeStyle = s;
      ctx.lineWidth = w;
      ctx.stroke(p);
    }
  }
  ctx.restore();
}
const tiles = new Map<string, HTMLCanvasElement>();
export const releaseStampTiles = () => tiles.clear();
export function paintStamp(
  ctx: CanvasRenderingContext2D,
  fill: (p: Path2D) => void,
  key: PointShape,
  scale: number,
  picked = false,
) {
  const color = ctx.fillStyle;
  if (typeof color !== 'string') {
    drawVector(ctx, fill, key, scale, picked);
    return;
  }
  const id = `${key}/${scale}/${Number(picked)}/${color}`;
  let tile = tiles.get(id);
  if (!tile) {
    const sheet = document.createElement('canvas');
    sheet.width = 66;
    sheet.height = 66;
    const ink = sheet.getContext('2d');
    if (!ink) {
      drawVector(ctx, fill, key, scale, picked);
      return;
    }
    ink.setTransform(3, 0, 0, 3, 33, 33);
    ink.fillStyle = color;
    drawVector(ink, (p) => ink.fill(p), key, scale, picked);
    if (tiles.size >= 160) tiles.clear();
    tiles.set(id, sheet);
    tile = sheet;
  }
  // Preserve the live transform, series opacity and clip without rebuilding
  // paths on each hover frame. SVG and the high-resolution tile share one outline.
  ctx.drawImage(tile, -11, -11, 22, 22);
}
export const ns = 'http://www.w3.org/2000/svg';
export const swatches = '[data-testid="chart-legend"] .rounded-full[style*="background-color"]';
export function stamp(el: SVGElement, key: PointShape, color: string, picked = false) {
  const rows = spec(key, picked);
  while (el.children.length > rows.length) el.lastElementChild?.remove();
  rows.forEach(([d, c, s, w], i) => {
    let p = el.children.item(i);
    if (!p) {
      p = document.createElementNS(ns, 'path');
      el.append(p);
    }
    for (const [k, v] of [
      ['d', d],
      ['fill', c === series ? color : c],
      ['stroke', s || 'none'],
      ['stroke-width', String(w)],
      ['stroke-linecap', 'square'],
    ])
      if (p.getAttribute(k) !== v) p.setAttribute(k, v);
  });
}
