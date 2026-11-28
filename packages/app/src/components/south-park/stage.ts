import type { CanvasPointLayerElement } from '@/lib/d3-chart/layers/canvas-points';
import { plotBounds } from '@/lib/d3-chart/plot-bounds';

interface Spot {
  x: number;
  y: number;
}
const selector = 'svg[data-testid="d3-chart-svg"]';
/** Read actual x coordinates. Actors live in a separate in-flow bus stop, never the plot. */
export function buildStage(
  scene: HTMLElement,
  banner: HTMLElement,
  caption: string,
  stuntLabel: string,
) {
  const actors = [...scene.querySelectorAll<HTMLElement>('.sp-kid')],
    homes = [...banner.querySelectorAll<HTMLElement>('.sp-home-mark')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'),
    forced = matchMedia('(forced-colors: active)');
  const rails = new Map<Element, HTMLElement>(),
    anim: (Animation | null)[] = [null, null, null, null];
  let landed: (Spot | null)[] = [null, null, null, null],
    frame = 0,
    round = 0,
    plotted = false,
    filming = false,
    locked = false,
    stopped = false,
    structureChanged = true;
  function reconcile() {
    for (const [owner, rail] of rails)
      if (!owner.isConnected || !owner.querySelector(selector)) {
        rail.remove();
        rails.delete(owner);
      }
    for (const svg of document.querySelectorAll(selector)) {
      if (svg.closest('[id$="-export"],[role=dialog],[aria-hidden=true]')) continue;
      const owner = svg.closest('figure[data-testid="chart-figure"],figure');
      if (!owner || rails.has(owner) || owner.parentElement?.closest('[id$="-export"]')) continue;
      const rail = document.createElement('div');
      rail.className = 'sp-chart-rail no-export';
      rail.setAttribute('role', 'group');
      rail.setAttribute('aria-label', caption);
      const label = document.createElement('span');
      label.textContent = caption;
      rail.append(label);
      for (let i = 0; i < 4; i++) rail.append(document.createElement('i'));
      const play = document.createElement('button');
      play.type = 'button';
      play.dataset.spStunt = '';
      play.disabled = locked;
      play.textContent = stuntLabel;
      rail.append(play);
      owner.before(rail);
      rails.set(owner, rail);
    }
  }
  function arrange(place: string, points: (Spot | null)[], clip: DOMRect | null, hop: boolean) {
    scene.dataset.place = place;
    scene.style.clipPath = clip
      ? `inset(${Math.max(0, clip.top)}px ${Math.max(0, innerWidth - clip.right)}px ${Math.max(0, innerHeight - clip.bottom)}px ${Math.max(0, clip.left)}px)`
      : 'none';
    actors.forEach((kid, i) => {
      const p = points[i],
        was = landed[i];
      anim[i]?.cancel();
      anim[i] = null;
      if (!p) {
        kid.hidden = true;
        return;
      }
      kid.hidden = false;
      kid.style.transform = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`;
      kid.dataset.edge = p.x > innerWidth - 142 ? 'right' : 'left';
      if (hop && was && !reduced.matches && !(locked && i === 3)) {
        const dx = Math.max(-96, Math.min(96, was.x - p.x));
        anim[i] =
          kid
            .querySelector('.sp-leap')
            ?.animate(
              [
                { transform: `translateX(${dx}px)` },
                { transform: `translate(${dx * 0.4}px,-13px) rotate(-3deg)` },
                { transform: 'translate(0,0)' },
              ],
              { duration: 380, easing: 'steps(8,end)' },
            ) ?? null;
      }
    });
    landed = points;
  }
  function shot() {
    for (const [owner, rail] of rails) {
      const r = rail.getBoundingClientRect(),
        svg = owner.querySelector(selector);
      if (!svg || r.top < 50 || r.bottom > innerHeight || r.width < 180) continue;
      const bounds = plotBounds(svg);
      if (!bounds) continue;
      const surf = svg.querySelector<CanvasPointLayerElement>('.canvas-point-layer');
      const samples = (surf?.scatterPoints?.() ?? [])
        .filter((p) => p.opacity > 0.05 && p.interactive)
        .map((p) => ({ x: p.clientX, y: p.clientY }));
      // The live Canvas layer already returns measured screen coordinates. Only the
      // SVG fallback needs per-mark style and transformation reads.
      if (samples.length === 0)
        for (const g of svg.querySelectorAll<SVGGraphicsElement>(
          '.dot-group,.unofficial-overlay-pt',
        )) {
          const m = g.getScreenCTM();
          if (m && Number(getComputedStyle(g).opacity) > 0.05) samples.push({ x: m.e, y: m.f });
        }
      const lo = Math.max(r.left + 22, bounds.left + 3),
        hi = Math.min(r.right - 22, bounds.right - 3);
      const valid = samples
        .map((p) => p.x)
        .filter((x) => x >= lo && x <= hi)
        .sort((a, b) => a - b);
      if (valid.length === 0 || hi <= lo) continue;
      // Assign separated observed x positions near the four stops; never invent a mark or move chart data.
      const used: number[] = [];
      const targets = [0.1, 0.36, 0.63, 0.9];
      for (const [i, q] of targets.entries()) {
        const desired =
          lo + (hi - lo) * Math.max(0.04, Math.min(0.96, q + (((round + i) % 3) - 1) * 0.04));
        const available = valid.filter((x) =>
          used.every((v) => Math.abs(v - x) > (innerWidth < 600 ? 44 : 81)),
        );
        const x = available.reduce<number | null>(
          (best, v) =>
            best === null || Math.abs(v - desired) < Math.abs(best - desired) ? v : best,
          null,
        );
        used.push(x ?? NaN);
      }
      rail.dataset.geometry = surf ? 'canvas' : 'svg';
      rail.dataset.anchors = used.filter(Number.isFinite).map(Math.round).join(',');
      // Compress real y to a shallow snowbank. Each footprint is an individual
      // observation; connecting unrelated series would imply a fictitious curve.
      const all = used.map((x, i) => {
        const sample = samples.find((p) => p.x === x),
          pin = rail.children[i + 1] as HTMLElement;
        pin.hidden = !sample;
        if (!sample) return null;
        const rise =
          Math.max(
            0,
            Math.min(1, (bounds.bottom - sample.y) / Math.max(1, bounds.bottom - bounds.top)),
          ) * 12;
        const y = r.bottom - 10 - rise;
        pin.style.left = `${x - r.left}px`;
        pin.style.bottom = `${rise + 4}px`;
        return { x, y };
      });
      return { r, all };
    }
    return null;
  }
  function layout(hop = false) {
    if (stopped) return;
    if (structureChanged) {
      structureChanged = false;
      reconcile();
    }
    plotted = false;
    if (
      forced.matches ||
      document.hidden ||
      document.querySelector('[role="dialog"][aria-modal=true],dialog[open]')
    ) {
      arrange('off', [], null, false);
      return;
    }
    const br = banner.querySelector('.sp-postcard')?.getBoundingClientRect();
    if (
      br &&
      homes[0]?.getClientRects().length &&
      br.bottom > 100 &&
      br.top < innerHeight &&
      !filming
    ) {
      const all = homes.map((m) => {
        const r = m.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.bottom };
      });
      arrange('home', all, br, hop);
      return;
    }
    const s = shot();
    if (s) {
      plotted = true;
      arrange('plot', s.all, s.r, hop && !reduced.matches);
      return;
    }
    filming = false;
    delete scene.dataset.opening;
    const footer = document.querySelector('[data-testid="footer"]')?.getBoundingClientRect();
    if (footer && footer.top > 52 && footer.top < innerHeight - 82 && !reduced.matches) {
      arrange(
        'footer',
        actors.map((_, i) => ({
          x:
            footer.left +
            footer.width * 0.5 +
            (footer.width < 550 ? 0 : 118) +
            (i - 1.5) * (footer.width < 550 ? 29 : 36),
          y: footer.top + 164,
        })),
        new DOMRect(footer.left, footer.top + 14, footer.width, 162),
        hop,
      );
      return;
    }
    arrange('off', [], null, false);
  }
  const schedule = () => {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        layout();
      });
  };
  const resized = new ResizeObserver(schedule);
  resized.observe(banner);
  resized.observe(document.body);
  const changed = new MutationObserver((records) => {
    if (
      records.some((r) =>
        [...r.addedNodes, ...r.removedNodes].some(
          (n) =>
            n instanceof Element &&
            (n.matches(`${selector},figure,[role=dialog],.canvas-point-layer`) ||
              (n.firstElementChild &&
                n.querySelector(`${selector},figure,[role=dialog],.canvas-point-layer`))),
        ),
      )
    ) {
      structureChanged = true;
      schedule();
    }
  });
  changed.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  reduced.addEventListener('change', schedule);
  forced.addEventListener('change', schedule);
  layout();
  return {
    startOpening() {
      if (reduced.matches || forced.matches || !shot()) return false;
      filming = true;
      scene.dataset.opening = 'full';
      layout(true);
      return plotted;
    },
    openingVisible() {
      return filming && plotted && !reduced.matches;
    },
    finishOpening() {
      filming = false;
      delete scene.dataset.opening;
      layout();
    },
    summon() {
      layout();
    },
    jump() {
      round++;
      layout(true);
    },
    point: (i: number) => landed[i],
    isPlot: () => plotted,
    lock: (v: boolean) => {
      locked = v;
      for (const rail of rails.values()) {
        const button = rail.querySelector<HTMLButtonElement>('[data-sp-stunt]');
        if (button) button.disabled = v;
      }
    },
    dispose() {
      stopped = true;
      changed.disconnect();
      resized.disconnect();
      cancelAnimationFrame(frame);
      anim.forEach((a) => a?.cancel());
      rails.forEach((rail) => rail.remove());
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      forced.removeEventListener('change', schedule);
      reduced.removeEventListener('change', schedule);
    },
  };
}
