import { plotBounds } from '@/lib/d3-chart/plot-bounds';
import type { CanvasPointLayerElement } from '@/lib/d3-chart/layers/canvas-points';
import { ART, type Copy } from './strings';

interface Spot {
  x: number;
  y: number;
}
const spot = (x: number, y: number): Spot => ({ x, y });
const move = (p: Spot, dx: number, dy: number) => spot(p.x + dx, p.y + dy);
const mid = (a: Spot, b: Spot, k: number, lift = 0) =>
  spot(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - lift);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const visible = (p: Spot) =>
  p.x >= 18 && p.x <= window.innerWidth - 18 && p.y >= 100 && p.y < window.innerHeight - 10;
const CHART = 'svg[data-testid="d3-chart-svg"]';

/** Read at take-off, never on animation frames. D3 reports client coordinates after pan/zoom. */
function locations(round: number, board: HTMLElement, manual: boolean, target?: SVGSVGElement) {
  const charts = target
    ? [target]
    : [...document.querySelectorAll<SVGSVGElement>(CHART)].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 100 && r.bottom > 145 && r.top < innerHeight - 45;
      });
  if (charts.length === 0) {
    const r = board.getBoundingClientRect();
    if (!manual || r.bottom < 100 || r.top >= innerHeight) return null;
    const y = clamp(r.bottom - 13, 127, innerHeight - 12);
    return {
      left: spot(r.left + r.width * 0.22, y),
      right: spot(r.right - r.width * 0.22, y),
      asset: spot(r.left + r.width * 0.55, y),
      launch: spot(r.left + r.width * 0.11, y),
      home: true,
      svg: null,
    };
  }
  const svg = charts[round % charts.length];
  const other = charts[(round + 1) % charts.length];
  const plot = plotBounds(svg);
  const r = svg.getBoundingClientRect();
  const card = (svg.closest('[data-slot="card"],figure') ?? svg).getBoundingClientRect();
  const plotLeft = clamp(plot?.left ?? r.left + 19, 18, innerWidth - 46);
  const plotRight = clamp(plot?.right ?? r.right - 18, plotLeft + 28, innerWidth - 18);
  const top = clamp(plot?.top ?? r.top + 13, 140, innerHeight - 30);
  const cardLeft = spot(clamp(card.left + 61, 43, innerWidth - 43), card.top);
  const cardRight = spot(clamp(card.right - 64, 43, innerWidth - 43), card.top);
  const left = visible(cardLeft) ? cardLeft : spot(plotLeft + (plotRight - plotLeft) * 0.12, top);
  const right = visible(cardRight)
    ? cardRight
    : spot(plotLeft + (plotRight - plotLeft) * 0.86, top);
  const layer = svg.querySelector<CanvasPointLayerElement>('.canvas-point-layer');
  const anchors = (layer?.scatterPoints?.() ?? [])
    .filter((p) => p.opacity > 0.5 && p.interactive)
    .map((p) => spot(p.clientX, p.clientY));
  if (anchors.length === 0)
    for (const el of svg.querySelectorAll<SVGGraphicsElement>(
      '.dot-group,.unofficial-overlay-pt,rect.bar,.bar-group rect,[data-testid*="bar-segment"],.bars rect',
    )) {
      const box = el.getBoundingClientRect();
      const ctm = el.getScreenCTM();
      anchors.push(
        el.matches('g') && ctm ? spot(ctm.e, ctm.f) : spot(box.x + box.width / 2, box.top),
      );
    }
  const eligible = anchors.filter(
    (p) =>
      visible(p) &&
      p.x >= plotLeft &&
      p.x <= plotRight &&
      (!plot || (p.y >= plot.top && p.y <= plot.bottom)),
  );
  const legend = (svg.closest('[data-slot="card"],figure') ?? svg.parentElement)
    ?.querySelector('[data-testid*="legend"] button,[data-testid="chart-legend"]')
    ?.getBoundingClientRect();
  const legendSpot = legend && spot(legend.left + Math.min(legend.width / 2, 50), legend.top);
  const asset =
    round % 7 === 5 && legendSpot && visible(legendSpot)
      ? legendSpot
      : (eligible[
          (round * 13 + Math.floor(eligible.length * 0.38)) % Math.max(1, eligible.length)
        ] ?? spot((plotLeft + plotRight) / 2, top));
  const next = (other.closest('[data-slot="card"],figure') ?? other).getBoundingClientRect();
  const otherTop = spot(clamp(next.left + 48, 36, innerWidth - 36), next.top);
  const launch =
    charts.length > 1 && visible(otherTop) ? otherTop : spot(Math.max(23, left.x - 46), left.y + 6);
  return { left, right, asset, launch, home: false, svg };
}

export const beats = [
  { winner: 0, clip: 'bart-laugh' }, // skateboard clips Lisa's horn
  { winner: 1, clip: 'sax' }, // her solo sends Bart flying
  { winner: 1, clip: 'ay-caramba' }, // donut point boomerangs into its sender
  { winner: 1, clip: 'lisa-laugh' }, // pop quiz replaces the board
  { winner: 1, clip: 'lisa-doh' }, // Bart chalks nonsense; Lisa corrects his units
  { winner: 0, clip: 'shorts' }, // Bart drops a donut on Lisa's landing
  { winner: 0, clip: 'ha-ha' }, // Nelson jumps out at Lisa
] as const;
interface Frame {
  p: Spot;
  t: number;
  r?: number;
  a?: number;
  z?: number;
}
const f = (t: number, p: Spot, r = 0, a = 1, z = 1): Frame => ({ t, p, r, a, z });
const rest = (el: HTMLElement, frames: Frame[], w: number, h: number, duration = 3650) => {
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  return el.animate(
    frames.map(({ p, t, r, a, z }) => ({
      offset: t,
      opacity: a,
      transform: `translate3d(${p.x - w / 2}px,${p.y - h}px,0) rotate(${r}deg) scale(${z})`,
    })),
    { duration, fill: 'both', easing: 'linear' },
  );
};
const shown = (el: Element, root: Element) => {
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      style.display === 'none' ||
      Number(style.opacity) < 0.35 ||
      (style.visibility === 'hidden' && !node.matches('[data-canvas-underlay]'))
    )
      return false;
  }
  return true;
};

/** Client-space samples of each frontier curve on screen, ordered from its high end down. */
interface TrackPoint extends Spot {
  length: number;
}
interface Track {
  path: SVGPathElement;
  points: TrackPoint[];
}
const drop = (v: Spot[]) => v.at(-1)!.y - v[0].y;
const steepness = (v: Spot[]) => drop(v) / Math.max(1, Math.abs(v.at(-1)!.x - v[0].x));
const blocked = (el: SVGImageElement, rects: DOMRect[]) => {
  const r = el.getBoundingClientRect();
  return rects.some(
    (b) =>
      r.right > b.left - 2 && r.left < b.right + 2 && r.top < b.bottom + 2 && r.bottom > b.top - 2,
  );
};
function tracks(svg: SVGSVGElement, useFullPlot = false): Track[] {
  const plot = plotBounds(svg);
  const lengthScale = clamp(svg.getBoundingClientRect().width / 650, 0.45, 1);
  const found: Track[] = [];
  for (const path of svg.querySelectorAll<SVGPathElement>('path.roofline-path')) {
    const matrix = path.getScreenCTM();
    const total = shown(path, svg) && matrix ? path.getTotalLength() : 0;
    if (!matrix || total < 90 * lengthScale) continue;
    const steps = Math.round(clamp(total / 14, 12, 44));
    let run: TrackPoint[] = [];
    let best: TrackPoint[] = [];
    for (let i = 0; i <= steps; i++) {
      const at = path.getPointAtLength((total * i) / steps).matrixTransform(matrix);
      const p = spot(at.x, at.y);
      const inside =
        (useFullPlot || visible(p)) &&
        (!plot ||
          (p.x >= plot.left - 1 &&
            p.x <= plot.right + 1 &&
            p.y >= plot.top - 1 &&
            p.y <= plot.bottom + 1));
      if (inside) run.push({ ...p, length: (total * i) / steps });
      if (!inside || i === steps) {
        if (run.length > best.length) best = run;
        run = [];
      }
    }
    if (best.length < 6) continue;
    if (best[0].y > best.at(-1)!.y) best.reverse();
    const first = best[0];
    const last = best.at(-1)!;
    if (last.y - first.y >= 45 * lengthScale && Math.abs(last.x - first.x) >= 60 * lengthScale)
      found.push({ path, points: best });
  }
  return found.sort(
    (a, b) => steepness(b.points) - steepness(a.points) || drop(b.points) - drop(a.points),
  );
}

const RIDE_MS = 5200;
/** Where the wheels meet the ground in bart-ollie.webp, and how far its deck tilts downhill. */
const WHEELS = { x: 0.429, y: 0.872, tilt: 22.5 };

/** Bart drops in at the top of a frontier curve, rides it to the bottom and ollies off the end. */
function runRide(
  svg: SVGSVGElement,
  gutter: HTMLElement,
  curves: Track[],
  size: number,
  copy: Copy,
  onBeat: (winner: 0 | 1, clip: string) => void,
) {
  const bounds = plotBounds(svg),
    matrix = svg.getScreenCTM();
  if (!bounds || !matrix || matchMedia('(forced-colors: active)').matches) return null;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ns = 'http://www.w3.org/2000/svg',
    inverse = matrix.inverse();
  const local = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(inverse);
  const origin = local(bounds.left, bounds.top),
    end = local(bounds.right, bounds.bottom);
  const overlay = document.createElementNS(ns, 'svg');
  overlay.setAttribute('class', 'sp-frontier-ride no-export');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('pointer-events', 'none');
  overlay.setAttribute('x', String(origin.x));
  overlay.setAttribute('y', String(origin.y));
  overlay.setAttribute('width', String(end.x - origin.x));
  overlay.setAttribute('height', String(end.y - origin.y));
  const w = Math.round(size * 1.26);
  const h = (w * 264) / 230;
  const sprite = (asset: string, cl: string, width: number, height: number) => {
    const el = document.createElementNS(ns, 'image');
    el.setAttribute('href', `${ART}${asset}.webp`);
    el.setAttribute('class', cl);
    el.setAttribute('width', String(width));
    el.setAttribute('height', String(height));
    overlay.append(el);
    return el;
  };
  const bart = sprite('bart-ollie', 'simpsons-rider', w, h);
  const lisa = sprite('lisa-sax', 'sp-frontier-lisa', size, size);
  // Both transforms must be read before the in-flow caption moves the chart.
  const { path, points } = curves[0],
    first = points[0],
    last = points.at(-1)!;
  const pathToLocal = inverse.multiply(path.getScreenCTM()!);
  svg.append(overlay);
  const caption = document.createElement('span');
  caption.className = 'sp-frontier-caption';
  caption.textContent = copy.ride;
  gutter.append(caption);
  const onPath = (length: number) => path.getPointAtLength(length).matrixTransform(pathToLocal);
  // Same path `d` and CTM as the canvas underlay. No curve is copied or added to the plot.
  const forward = last.x >= first.x ? 1 : -1,
    direction = last.length >= first.length ? 1 : -1;
  const dest = curves[1]?.points
    .filter((p) => p.x > bounds.left + size && p.x < bounds.right - size && p.y > bounds.top + size)
    .sort(
      (a, b) => Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y),
    )[0];
  const landing = dest
    ? local(dest.x, dest.y)
    : local(bounds.right - size / 2 - 2, bounds.bottom - 2);
  const obstacles = () =>
    [
      ...svg.querySelectorAll('.line-label,.point-label'),
      ...document.querySelectorAll(
        '[data-chart-tooltip],[role="tooltip"],[data-testid="chart-legend"]',
      ),
    ]
      .filter((e) => e.checkVisibility({ checkOpacity: true }))
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
  const place = (length: number) => {
    const p = onPath(length),
      a = onPath(clamp(length - direction * 2, 0, path.getTotalLength())),
      b = onPath(clamp(length + direction * 2, 0, path.getTotalLength()));
    const angle =
      ((Math.atan2(b.y - a.y, (b.x - a.x) * forward) * 180) / Math.PI - WHEELS.tilt) * forward;
    bart.setAttribute(
      'transform',
      `translate(${p.x - origin.x} ${p.y - origin.y}) rotate(${angle}) scale(${forward} 1) translate(${-w * WHEELS.x} ${-h * WHEELS.y})`,
    );
  };
  let raf = 0,
    awarded = false,
    remaining = true;
  const start = performance.now(),
    initialD = path.getAttribute('d');
  const cleanup = () => {
    remaining = false;
    cancelAnimationFrame(raf);
    overlay.remove();
    caption.remove();
  };
  // Park at the first unblocked, fully visible upper contact in reduced motion.
  let park = first.length;
  if (still) {
    const rects = obstacles(),
      box = overlay.getBoundingClientRect();
    for (const p of points) {
      place(p.length);
      const r = bart.getBoundingClientRect();
      if (r.top >= box.top && r.left >= box.left && r.right <= box.right && !blocked(bart, rects)) {
        park = p.length;
        break;
      }
    }
  }
  const frame = (now: number) => {
    if (
      !remaining ||
      !svg.isConnected ||
      !path.isConnected ||
      path.getAttribute('d') !== initialD ||
      document.hidden ||
      matchMedia('(forced-colors: active)').matches
    ) {
      cleanup();
      return;
    }
    // A callback queued inside a frame can receive that frame's earlier timestamp.
    const phase = clamp((now - start) / RIDE_MS, 0, 1),
      progress = Math.min(1, phase / 0.86) ** 1.25;
    place(still ? park : first.length + (last.length - first.length) * progress);
    const jump = still
      ? 0
      : Math.sin(Math.PI * Math.min(1, Math.max(0, (phase - 0.46) / 0.35))) * size * 0.84;
    lisa.setAttribute(
      'transform',
      `translate(${landing.x - origin.x - size / 2} ${landing.y - origin.y - size - jump})`,
    );
    const rects = obstacles(),
      fade = Math.min(1, (1 - phase) * 12);
    bart.setAttribute('opacity', String(blocked(bart, rects) ? 0 : fade));
    lisa.setAttribute(
      'opacity',
      String(blocked(lisa, rects) || (!still && phase < 0.32) ? 0 : fade),
    );
    if (!awarded && (still || phase >= 0.86)) {
      awarded = true;
      onBeat(0, 'bart-laugh');
    }
    if (phase < 1) raf = requestAnimationFrame(frame);
    else cleanup();
  };
  frame(start);
  return { cleanup, duration: RIDE_MS };
}

export function runPrank(
  scene: HTMLElement,
  board: HTMLElement,
  round: number,
  manual: boolean,
  copy: Copy,
  onBeat: (winner: 0 | 1, clip: string) => void,
  target?: SVGSVGElement,
) {
  const where = locations(round, board, manual, target);
  if (!where) return null;
  const surface = where.svg?.closest('figure') ?? where.svg?.closest('[data-slot="card"]');
  const gutter =
    surface?.previousElementSibling?.querySelector<HTMLElement>('.sp-replay-gutter') ?? scene;
  scene = gutter;
  const width = gutter.clientWidth;
  if (!width) return null;
  const size = innerWidth < 520 ? 43 : 57;
  const near = spot(width * 0.12, 84),
    far = spot(width * 0.86, 84);
  const source = where.svg?.getBoundingClientRect();
  const fraction = source ? clamp((where.asset.x - source.x) / source.width, 0.18, 0.8) : 0.52;
  const L = near,
    R = far,
    P = spot(width * fraction, 82),
    A = spot(24, 85);
  // Charts with frontier curves alternate a ride down one of them with the pranks.
  const lines = where.svg ? tracks(where.svg, Boolean(target)) : [];
  if (
    manual &&
    where.svg &&
    lines.length > 0 &&
    (round % 2 === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches)
  )
    return runRide(where.svg, gutter, lines, size, copy, onBeat);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const gag = (lines.length > 0 ? round >> 1 : round) % beats.length;
  const offset = innerWidth < 520 ? 28 : 55;
  // Both landings are inside the clipped replay gutter.
  const N = P;
  const Q = spot(
    clamp(N.x + (N.x > innerWidth * 0.57 ? -offset : offset), 30, innerWidth - 30),
    N.y,
  );
  const actor = (key: string) => {
    const el = document.createElement('img');
    el.src = `${ART}${key}.webp`;
    el.alt = '';
    el.draggable = false;
    el.className = 'simpsons-actor';
    scene.append(el);
    return el;
  };
  const animations: Animation[] = [];
  const bart = actor([0, 1, 2, 3, 5].includes(gag) ? 'bart-ollie' : 'bart-board');
  const lisa = actor(gag < 2 ? 'lisa-sax' : 'lisa');
  // Each entrance is a jump between concrete ledges with a mid-air apex, not a random screen bounce.
  const bExit = gag === 1 || gag === 2 || gag === 3 ? move(L, -45, -33) : L;
  const landing = N;
  const recoil =
    gag === 1
      ? move(landing, -offset * 2, -size * 0.8)
      : gag === 3
        ? move(landing, offset, -size * 0.2)
        : landing;
  const bFrames = [
    f(0, A, -12, 0),
    f(0.08, L, 0),
    f(0.23, mid(L, landing, 0.5, size * 0.9), -18),
    f(0.38, landing, gag === 0 ? -7 : 0),
    f(0.5, recoil, gag === 1 ? -90 : gag === 3 ? 45 : -4),
    f(0.64, mid(recoil, bExit, 0.52, size * 0.8), gag === 1 ? -130 : -15),
    f(0.79, bExit, 5),
    f(0.91, bExit, 0),
    f(1, move(bExit, -30, -18), -9, 0),
  ];
  const lReact = [0, 5, 6].includes(gag) ? move(Q, offset * 0.4, -size * 0.62) : Q;
  const lFrames = [
    f(0, move(R, 16, 6), 9, 0),
    f(0.08, R, 0),
    f(0.18, R, 0),
    f(0.29, mid(R, Q, 0.5, size), 11),
    f(0.4, Q, 0),
    f(0.52, lReact, gag === 5 ? 22 : gag === 0 ? -25 : -6),
    f(0.68, mid(lReact, R, 0.5, size * 0.7), 9),
    f(0.79, R, 0),
    f(0.91, R, 0),
    f(1, move(R, 27, -13), 6, 0),
  ];
  animations.push(rest(bart, bFrames, size, size), rest(lisa, lFrames, size, size));
  const prop =
    gag === 0
      ? actor('sax-prop')
      : gag === 2 || gag === 5
        ? actor('donut')
        : gag === 6
          ? actor('nelson')
          : document.createElement('span');
  if (!prop.isConnected) {
    prop.className = `simpsons-prop simpsons-prop-${gag}`;
    prop.textContent = gag === 4 ? copy.badUnits : copy.props[gag];
    scene.append(prop);
  }
  const hand = move(Q, 0, -size * 0.45);
  const flick = move(N, 0, -size * 0.43);
  const propFrames =
    gag === 2
      ? [
          f(0, P, 0, 0),
          f(0.29, P, 0, 0),
          f(0.38, P),
          f(0.47, mid(P, hand, 0.58, 40), 120),
          f(0.53, hand, 230),
          f(0.58, mid(hand, flick, 0.48, 38), 280),
          f(0.65, flick, 360),
          f(0.76, P, 390),
          f(0.8, P, 400, 0),
          f(1, P, 400, 0),
        ]
      : gag === 1
        ? [
            f(0, hand, 0, 0),
            f(0.38, hand, 0, 0, 0.4),
            f(0.43, hand, -9, 1, 0.8),
            f(0.5, mid(hand, recoil, 0.5, 16), -17, 1, 1.25),
            f(0.62, recoil, -24, 0, 1.65),
            f(1, recoil, 0, 0),
          ]
        : gag === 6
          ? [
              f(0, P, 0, 0),
              f(0.36, move(P, 0, 18), 0, 0),
              f(0.43, P, -6, 1),
              f(0.6, P),
              f(0.76, move(P, 0, 18), 8, 0),
              f(1, P, 0, 0),
            ]
          : [
              f(0, hand, 0, 0),
              f(0.36, gag === 5 ? move(N, 0, -size) : hand, 0, 0),
              f(0.41, gag === 5 ? move(N, 0, -size) : hand, -8),
              f(
                0.53,
                gag === 0 ? move(hand, offset, -size * 0.7) : gag === 5 ? Q : flick,
                gag === 0 ? 150 : 8,
              ),
              f(
                0.66,
                gag === 0 ? move(hand, offset * 1.5, 12) : gag === 5 ? move(Q, 9, 4) : flick,
                gag === 0 ? 240 : -8,
              ),
              f(0.74, P, 0, 0),
              f(1, P, 0, 0),
            ];
  const propSize = gag === 6 ? size * 0.87 : gag === 4 ? 63 : 31;
  animations.push(rest(prop, propFrames, propSize, gag === 4 ? 23 : propSize));
  const caption = document.createElement('span');
  caption.className = 'simpsons-punch';
  caption.textContent = copy.gags[gag];
  scene.append(caption);
  const bubbleWidth = innerWidth < 520 ? 111 : 150;
  const bubble = spot(
    clamp(N.x, bubbleWidth / 2 + 8, innerWidth - bubbleWidth / 2 - 8),
    clamp(N.y - size - 12, 100, innerHeight - 65),
  );
  animations.push(
    rest(
      caption,
      [
        f(0, bubble, -4, 0, 0.8),
        f(0.36, bubble, -4, 0, 0.8),
        f(0.4, bubble, -3, 1, 1.08),
        f(0.45, bubble, -3),
        f(0.71, bubble, -3),
        f(0.77, bubble, -3, 0),
        f(1, bubble, 0, 0),
      ],
      bubbleWidth,
      29,
    ),
  );
  const strike = window.setTimeout(() => {
    if (gag === 0) lisa.src = `${ART}lisa.webp`;
    if (gag === 3) bart.src = `${ART}bart-board.webp`;
    onBeat(beats[gag].winner, beats[gag].clip);
  }, 1450);
  const correction =
    gag === 4
      ? window.setTimeout(() => {
          prop.textContent = copy.props[gag];
        }, 1900)
      : 0;
  const cleanup = () => {
    window.clearTimeout(strike);
    window.clearTimeout(correction);
    animations.forEach((a) => a.cancel());
    [bart, lisa, prop, caption].forEach((el) => el.remove());
  };
  return { cleanup, duration: 3650 };
}
