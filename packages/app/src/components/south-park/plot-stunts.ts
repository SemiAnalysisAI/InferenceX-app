import { plotBounds } from '@/lib/d3-chart/plot-bounds';
import type { CanvasPointLayerElement } from '@/lib/d3-chart/layers/canvas-points';

interface P {
  x: number;
  y: number;
}
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface Trail {
  p: P[];
  total: number;
  key: string;
  source: string;
  start: boolean;
  end: boolean;
}
function hide(node: HTMLElement) {
  node.style.visibility = 'hidden';
  node.dataset.visible = 'false';
}
const art = '/decorative/south-park/art/';
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const along = (p: P[], t: number) => {
  const n = clamp(t) * (p.length - 1),
    a = p[Math.floor(n)],
    b = p[Math.ceil(n)];
  return { x: mix(a.x, b.x, n % 1), y: mix(a.y, b.y, n % 1) };
};
function visible(e: Element, stop: Element | null) {
  for (let n: Element | null = e; n && n !== stop; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.14) return false;
  }
  return true;
}
function exclusions(svg: Element): Box[] {
  const all = [
    ...svg.querySelectorAll(
      '.line-label,.point-label,.bar-label,.annotation,foreignObject,.tick text,.x-axis-label,.y-axis-label',
    ),
    ...document.querySelectorAll(
      '[role="tooltip"],[data-slot="tooltip-content"],[data-testid$="tooltip"],.fixed.pointer-events-none[style*="z-index"],.pinned-tooltip,.chart-tooltip,.known-issue-annotation,[class*="known-issue-callout"],[data-testid="chart-legend"],figcaption',
    ),
  ];
  return all
    .filter((e) => visible(e, svg))
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 1 && r.height > 1);
}
function clear(p: P, w: number, h: number, room: Box, blocks: Box[]) {
  const left = p.x - w / 2 - 2,
    right = p.x + w / 2 + 2,
    top = p.y - h - 2,
    bottom = p.y + 1;
  return (
    left >= room.left &&
    right <= room.right &&
    top >= room.top &&
    bottom <= room.bottom &&
    !blocks.some(
      (b) => left < b.right + 2 && right > b.left - 2 && top < b.bottom + 2 && bottom > b.top - 2,
    )
  );
}
function dataTrails(svg: SVGSVGElement, room: Box, blocks: Box[], h: number): Trail[] {
  const trails: Trail[] = [];
  for (const path of svg.querySelectorAll<SVGPathElement>('path.roofline-path,path.line-path')) {
    const raster = Object.hasOwn(path.dataset, 'canvasUnderlay');
    const s = getComputedStyle(path);
    if (
      s.display === 'none' ||
      Number(s.opacity) < 0.28 ||
      !visible(path.parentElement!, svg) ||
      (!raster && s.visibility === 'hidden')
    )
      continue;
    const mat = path.getScreenCTM(),
      len = path.getTotalLength();
    if (!mat || len < 10) continue;
    const count = clamp(Math.ceil(len / 7), 8, 180);
    let seq: P[] = [];
    let atStart = false;
    const add = (end: boolean) => {
      if (seq.length >= 3) {
        const total = seq.slice(1).reduce((sum, b, i) => sum + dist(seq[i], b), 0);
        if (total >= 14)
          trails.push({
            p: seq,
            total,
            key: path.getAttribute('class') || 'line',
            source: raster ? 'painted-canvas-path' : 'visible-svg-path',
            start: atStart,
            end,
          });
      }
      seq = [];
    };
    for (let i = 0; i <= count; i++) {
      // These are the very same d and CTM used by CanvasPointLayer.paintShape.
      // CSS-hidden SVG geometry is eligible ONLY when the renderer flags it as painted.
      const pos = path.getPointAtLength((len * i) / count).matrixTransform(mat);
      if (clear({ x: pos.x, y: pos.y - 3 }, h * 0.86, h, room, blocks)) {
        if (seq.length === 0) atStart = i === 0;
        seq.push({ x: pos.x, y: pos.y });
      } else add(false);
    }
    add(true);
  }
  if (trails.length > 0) return trails;
  // With no run of line visible, only land on actual visible scatter centers.
  const snaps = svg
    .querySelector<CanvasPointLayerElement>('.canvas-point-layer')
    ?.scatterPoints?.();
  const pts =
    snaps
      ?.filter((p) => p.interactive && !p.faded && p.opacity > 0.45)
      .map((p) => ({ x: p.clientX, y: p.clientY, key: p.key.split('|')[0] })) ??
    [...svg.querySelectorAll<SVGGraphicsElement>('.dot-group')]
      .filter((g) => visible(g, svg))
      .flatMap((g) => {
        const m = g.getScreenCTM();
        return m ? [{ x: m.e, y: m.f, key: 'svg' }] : [];
      });
  for (const a of pts) {
    if (!clear({ x: a.x, y: a.y - 3 }, h * 0.86, h, room, blocks)) continue;
    const b = pts
      .filter(
        (v) =>
          v !== a &&
          v.key === a.key &&
          dist(a, v) > 14 &&
          dist(a, v) < 190 &&
          clear({ x: v.x, y: v.y - 3 }, h * 0.86, h, room, blocks),
      )
      .sort((x, y) => dist(a, y) - dist(a, x))[0];
    if (b)
      trails.push({
        p: [a, b],
        total: dist(a, b),
        key: a.key,
        source: snaps ? 'canvas-point-hop' : 'svg-point-hop',
        start: true,
        end: true,
      });
  }
  return trails;
}
function crossing(a: P, b: P, c: P, d: P): P | null {
  const rx = b.x - a.x,
    ry = b.y - a.y,
    sx = d.x - c.x,
    sy = d.y - c.y,
    den = rx * sy - ry * sx;
  if (Math.abs(den) < 0.01) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den,
    u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + t * rx, y: a.y + t * ry } : null;
}
function choose(trails: Trail[], id: number) {
  const ranked = trails.toSorted((a, b) => b.total - a.total);
  if (id === 2) {
    for (const [n, a] of ranked.entries())
      for (const b of ranked.slice(n + 1)) {
        if (a.key === b.key) continue;
        for (let i = 1; i < a.p.length; i++)
          for (let j = 1; j < b.p.length; j++) {
            const cross = crossing(a.p[i - 1], a.p[i], b.p[j - 1], b.p[j]);
            if (cross && i >= 3)
              return {
                ...a,
                p: [...a.p.slice(Math.max(0, i - 24), i), cross],
                key: `${a.key} × ${b.key}`,
              };
          }
      }
  }
  if (id === 0 || id === 5) {
    const q =
      ranked
        .filter((t) => t.total > 32)
        .toSorted(
          (a, b) => Math.min(a.p[0].y, a.p.at(-1)!.y) - Math.min(b.p[0].y, b.p.at(-1)!.y),
        )[0] ?? ranked[0];
    return { ...q, p: q.p[0].y < q.p.at(-1)!.y ? q.p.toReversed() : q.p };
  }
  if (id === 1 || id === 11) return ranked.find((t) => t.end && t.total > 34) ?? ranked[0];
  return ranked[Math.max(0, id * 2) % Math.min(5, ranked.length)];
}
export function makePlotStunts(scene: HTMLElement) {
  let raf = 0,
    expiry = 0,
    layer: HTMLDivElement | null = null;
  const abort = new AbortController(),
    signal = abort.signal;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'),
    forced = matchMedia('(forced-colors: active)');
  function stop() {
    cancelAnimationFrame(raf);
    clearTimeout(expiry);
    raf = 0;
    layer?.remove();
    layer = null;
    delete scene.dataset.plotStunt;
  }
  window.addEventListener('scroll', stop, { passive: true, signal, capture: true });
  window.addEventListener('resize', stop, { signal });
  window.addEventListener('wheel', stop, { passive: true, signal });
  document.addEventListener('pointerdown', stop, { capture: true, passive: true, signal });
  document.addEventListener('visibilitychange', stop, { signal });
  reduced.addEventListener('change', stop, { signal });
  forced.addEventListener('change', stop, { signal });
  function play(id: number) {
    stop();
    if (
      forced.matches ||
      document.hidden ||
      document.querySelector('[role=dialog][data-state=open]')
    )
      return false;
    const rails = [...document.querySelectorAll('.sp-chart-rail[data-geometry]')];
    return rails.some((rail) => visit(rail, id));
  }
  function visit(rail: Element, id: number) {
    const svg = rail.nextElementSibling?.querySelector<SVGSVGElement>(
      'svg[data-testid="d3-chart-svg"]',
    );
    if (!svg || !visible(svg, null)) return false;
    const bounds = plotBounds(svg);
    if (!bounds) return false;
    const room = {
      left: Math.max(0, bounds.left),
      top: Math.max(bounds.top, 64),
      right: Math.min(innerWidth, bounds.right),
      bottom: Math.min(innerHeight - 3, bounds.bottom),
    };
    if (room.right - room.left < 90 || room.bottom - room.top < 75) return false;
    let blocks = exclusions(svg);
    const h = innerWidth < 600 ? 25 : 43;
    const trails = dataTrails(svg, room, blocks, h);
    if (trails.length === 0) return false;
    const trail = choose(trails, id),
      p = trail.p,
      landing = p.at(-1)!;
    const peer =
      trails
        .flatMap((t) => [along(t.p, 0.4), along(t.p, 0.8)])
        .filter(
          (v) =>
            clear({ x: v.x, y: v.y - 4 }, h, h, room, blocks) &&
            p.every((q) => dist(v, q) > h * 1.45),
        )
        .toSorted(
          (a, b) => Math.abs(dist(a, landing) - h * 3) - Math.abs(dist(b, landing) - h * 3),
        )[0] ?? p[0];
    const axisY = Math.min(bounds.bottom - 4, room.bottom - 3);
    let stretches: number[][] = [],
      strip: number[] = [];
    for (let x = room.left + h * 0.65; x < room.right - h * 0.65; x += 6) {
      if (clear({ x, y: axisY }, h * 1.35, h * 0.93, room, blocks)) strip.push(x);
      else if (strip.length > 0) {
        stretches.push(strip);
        strip = [];
      }
    }
    if (strip.length > 0) stretches.push(strip);
    stretches = stretches.filter((g) => g.length >= 3).toSorted((a, b) => b.length - a.length);
    const axis = stretches[0];
    const house = document.createElement('div');
    layer = house;
    house.className = 'sp-plot-stunt no-export';
    house.setAttribute('aria-hidden', 'true');
    house.dataset.case = String(id);
    house.dataset.source = trail.source;
    house.dataset.series = trail.key;
    house.dataset.landing = `${Math.round(landing.x)},${Math.round(landing.y)}`;
    Object.assign(house.style, {
      left: `${room.left}px`,
      top: `${room.top}px`,
      width: `${room.right - room.left}px`,
      height: `${room.bottom - room.top}px`,
    });
    function image(name: string, file: string) {
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.dataset.stuntPart = name;
      img.src = `${art + file}.webp`;
      house.append(img);
      return img;
    }
    const k = image('kenny', 'kenny'),
      friend = image('friend', id % 2 === 0 ? 'cartman' : 'stan'),
      rats = image('rats', 'rats');
    const hazard =
      id === 4
        ? image('hazard', 'school-bus')
        : id === 6
          ? image('hazard', 'visitors')
          : document.createElement('i');
    if (!(hazard instanceof HTMLImageElement)) {
      hazard.dataset.stuntPart = 'hazard';
      house.append(hazard);
    }
    const snow = document.createElement('i');
    snow.className = 'sp-stunt-snowball';
    house.append(snow);
    document.body.append(house);
    scene.dataset.plotStunt = String(id);
    let checked = -1,
      prop: SVGElement | null = null;
    function show(
      node: HTMLElement,
      x: number,
      y: number,
      w: number,
      height: number,
      angle = 0,
      sy = 1,
    ) {
      // Account for the rotated silhouette, not just its feet. No text is emitted here.
      const rr = (angle * Math.PI) / 180,
        bw = Math.abs(w * Math.cos(rr)) + Math.abs(height * sy * Math.sin(rr));
      const bh = Math.abs(height * sy * Math.cos(rr)) + Math.abs(w * Math.sin(rr));
      const ok = clear(
        {
          x: x + (height * sy * Math.sin(rr)) / 2,
          y: y - (height * sy * Math.cos(rr)) / 2 + bh / 2,
        },
        bw,
        bh,
        room,
        blocks,
      );
      node.style.visibility = ok ? 'visible' : 'hidden';
      node.dataset.visible = String(ok);
      node.style.width = `${w}px`;
      node.style.height = `${height}px`;
      node.style.transform = `translate(${x - room.left - w / 2}px,${y - room.top - height}px) rotate(${angle}deg) scaleY(${sy})`;
      return ok;
    }
    const born = performance.now(),
      end = id < 0 ? 2250 : 4950;
    function tick(now: number) {
      if (
        !house.isConnected ||
        !svg?.isConnected ||
        forced.matches ||
        document.hidden ||
        document.querySelector('[role=dialog][data-state=open]')
      ) {
        stop();
        return;
      }
      const time = reduced.matches ? 2120 : now - born;
      if (time >= end) {
        stop();
        return;
      }
      if (now - checked > 110) {
        blocks = exclusions(svg);
        checked = now;
      }
      if (id >= 0 && !(hazard instanceof HTMLImageElement) && !prop) {
        const orig = scene.querySelector<SVGElement>('[data-actor="kenny"] .sp-prop');
        if (orig) {
          prop = orig.cloneNode(true) as SVGElement;
          prop.removeAttribute('class');
          hazard.append(prop);
        }
      }
      const jump = clamp(time / 1640),
        a = along(p, jump),
        f = peer;
      const lift = reduced.matches
        ? 0
        : Math.abs(Math.sin(jump * Math.PI * 3)) * Math.min(26, h * 0.53);
      house.dataset.phase = time < 1640 ? 'hop' : time < 3590 ? 'impact' : 'rats';
      if (time < 1640 || id < 0) {
        show(k, a.x, a.y - 4 - lift, h * 0.75, h, Math.sin(jump * Math.PI * 6) * 7);
        if (dist(a, f) > h * 1.3)
          show(
            friend,
            f.x,
            f.y - 4 - (reduced.matches ? 0 : Math.sin(jump * Math.PI) * 5),
            h * 0.99,
            h,
          );
        else hide(friend);
        const flight = clamp((time - 320) / 800),
          ball = { x: mix(f.x, a.x, flight), y: mix(f.y, a.y, flight) };
        if (flight > 0 && flight < 1)
          show(snow, ball.x, ball.y - h * 0.65 - 20 * Math.sin(flight * Math.PI), 9, 9);
        else hide(snow);
        hide(hazard);
        hide(rats);
      } else if (time < 3590) {
        hide(snow);
        hide(friend);
        hide(rats);
        const u = clamp((time - 1640) / 750),
          z = reduced.matches ? 1 : u;
        // Each booking has its own physical outcome on the sampled series.
        const dx = [0, 16, 0, 12, 12, 0, 0, 0, -5, 11, 0, 0][id] * z;
        const dy = [0, 19, 0, 8, 0, 0, -30, 0, 0, -8, -4, 0][id] * z;
        const tilt = [0, 29, -9, 21, -21, 5, 0, -7, 20, -18, 30, 0][id] * z;
        const sy = [0.35, 0.9, 0.79, 0.55, 0.48, 0.38, 0.88, 0.47, 0.7, 0.88, 0.7, 0.35][id];
        // Keep the boots at this measured landing if a full tumble would reach a label or edge.
        for (const fraction of [1, 0.5, 0]) {
          if (
            show(
              k,
              landing.x + dx * fraction,
              landing.y - 4 + dy * fraction,
              h * 0.75,
              h,
              tilt * fraction,
              mix(1, sy, z),
            )
          )
            break;
        }
        if (id === 3) show(rats, landing.x + 9, landing.y - 3, h * 0.95, h * 0.42);
        else {
          const ph = id === 4 ? h * 0.7 : id === 6 ? h * 1.1 : h * 0.63;
          const pw = id === 4 ? ph * 3.15 : id === 6 ? ph * 0.3 : ph;
          show(
            hazard,
            landing.x + (id === 4 ? -36 * (1 - z) : id === 2 ? 7 : 0),
            landing.y - 5 - h * sy - (1 - z) * 20,
            pw,
            ph,
          );
        }
      } else {
        hide(friend);
        hide(snow);
        hide(hazard);
        const u = clamp((time - 3590) / 1200);
        if (axis) {
          const x = mix(axis[0], axis.at(-1)!, u);
          show(rats, x, axisY, h * 1.05, h * 0.46);
          show(k, x, axisY - h * 0.3, h * 0.75, h, -12, 0.45);
        } else {
          hide(k);
          hide(rats);
        }
      }
      if (!reduced.matches) raf = requestAnimationFrame(tick);
    }
    if (reduced.matches) {
      raf = requestAnimationFrame(() => tick(born));
      expiry = window.setTimeout(stop, 3100);
    } else tick(born);
    return true;
  }
  return {
    play,
    dispose() {
      stop();
      abort.abort();
    },
  };
}
