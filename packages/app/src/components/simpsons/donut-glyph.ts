import type { PointShape } from '@/components/effects/canvas-point-paint';

type Ink = readonly [string, string, string?, number?];
const edge = '#27182c',
  milk = '#fff5c5',
  pink = '#ff8bbb';
const items: Record<PointShape, Ink[]> = {
  circle: [
    ['M-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z', 'series', edge, 0.16],
    [
      'M-.83-.14Q-.73-.97.02-.92Q.79-.95.88-.19Q.62-.42.46-.14Q.19.09-.08-.15Q-.37-.4-.53-.12Z',
      pink,
    ],
    ['M-.31 0a.31 .31 0 1 0 .62 0a.31 .31 0 1 0-.62 0Z', 'paper', edge, 0.12],
    ['M-.56-.53l.16-.09m.68.08l.14.09', 'none', milk, 0.18],
  ],
  square: [
    ['M-.65-.92Q0-1.15.65-.92L.72.9Q0 1.12-.72.9Z', 'series', edge, 0.18],
    ['M-.68-.38L.68-.52V.24L-.69.43Z', milk],
    ['M-.22-.27Q.56-.46.32-.04Q.18.16-.25.19Z', 'none', edge, 0.18],
    ['M-.61-.87Q0-.72.61-.87M-.58.77Q0 .89.58.77', 'none', '#e2e8eb', 0.14],
  ],
  triangle: [
    ['M-.88-.54H.84L.52 1.01H-.48Z', 'series', edge, 0.18],
    ['M.04-.5L.23-1.08l.42-.17', 'none', '#ef4678', 0.23],
    ['M-.94-.52Q-.8-.96-.03-.95Q.72-.97.93-.52Z', '#a8f4eb', edge, 0.13],
    ['M-.68.06l.84-.18-.35.32.68-.15', 'none', milk, 0.21],
  ],
  diamond: [
    [
      'M-1.05.01Q-.94-.86 0-.89Q.9-.88 1.05.01ZM-1.02.5H1.02Q.85.98-.02.98Q-.89.98-1.02.5Z',
      'series',
      edge,
      0.17,
    ],
    ['M-1.02.03Q-.64.18-.37.07L0 .32.39.07Q.73.21 1.02.03L.98.41H-.98Z', '#ffca39', edge, 0.13],
    ['M-.51-.42l.13-.08m.38-.12l.12.04m.32.13l.13.07', 'none', milk, 0.17],
  ],
};
const bites: Record<PointShape, Ink[]> = {
  circle: [['M1.13-.77L.6-.89Q.65-.51.34-.48Q.44-.12.13-.09Q.3.18.58.1Q.72.38 1.1.27Z', 'paper']],
  square: [['M-.65-.96l.29-.28.72.13-.19.34Z', milk, edge, 0.13]],
  triangle: [['M-.61-.82q.36-.6.72-.14q.33-.58.67-.26', 'none', pink, 0.22]],
  diamond: [['M-.93-.12Q0-.49.96-.12M-.88.48Q0 .27.91.48', 'none', milk, 0.21]],
};
const cache = new Map<string, { spec: Ink; path: Path2D }[]>();
export const donutRadius = (extent: number, selected = false) =>
  selected ? Math.min(extent + 2.8, 8.3) : 5.8;
const styles = (s: PointShape, selected: boolean) =>
  selected ? [...items[s], ...bites[s]] : items[s];
const col = (v: string, series: string | CanvasGradient | CanvasPattern, paper: string) =>
  v === 'series' ? series : v === 'paper' ? paper : v;
export function paintDonut(
  ctx: CanvasRenderingContext2D,
  fill: (p: Path2D) => void,
  shape: PointShape,
  radius: number,
  paper: string,
  selected = false,
) {
  const id = shape + (selected ? '!' : '');
  let rows = cache.get(id);
  if (!rows) {
    rows = styles(shape, selected).map((spec) => ({ spec, path: new Path2D(spec[0]) }));
    cache.set(id, rows);
  }
  const series = ctx.fillStyle;
  ctx.save();
  ctx.scale(radius, radius);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const {
    spec: [, ink, outline, width],
    path,
  } of rows) {
    if (ink !== 'none') {
      ctx.fillStyle = col(ink, series, paper);
      fill(path);
    }
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = width ?? 0.15;
      ctx.stroke(path);
    }
  }
  ctx.restore();
}
export const swatchSelector =
  '[data-testid="chart-legend"] .rounded-full[style*="background-color"]';
export const ns = 'http://www.w3.org/2000/svg';
export function decorateDonut(
  el: SVGElement,
  shape: PointShape,
  color: string,
  paper: string,
  selected = false,
) {
  const sig = [shape, color, paper, selected].join('/');
  if (el.dataset.spSymbol === sig) return;
  el.dataset.spSymbol = sig;
  el.dataset.springfieldItem = {
    circle: 'donut',
    square: 'duff',
    triangle: 'squishee',
    diamond: 'burger',
  }[shape];
  const rows = styles(shape, selected);
  while (el.children.length > rows.length) el.lastElementChild?.remove();
  rows.forEach(([d, f, s, w], i) => {
    let p = el.children.item(i);
    if (!p) {
      p = document.createElementNS(ns, 'path');
      el.append(p);
    }
    for (const [a, v] of Object.entries({
      d,
      fill: String(col(f, color, paper)),
      stroke: s ?? 'none',
      'stroke-width': String(w ?? 0),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }))
      p.setAttribute(a, v);
  });
}
