import type { CanvasPointLayerElement } from '@/lib/d3-chart/layers/canvas-points';
import { CANVAS_POINT_LAYER_SELECTOR } from '@/lib/d3-chart/layers/canvas-point-registry';
import { plotBounds } from '@/lib/d3-chart/plot-bounds';

const SVG = 'http://www.w3.org/2000/svg';
const FIGURE = '[data-testid="chart-figure"]';
const HIT = '.dot-group .dot-hit-area, .dot-group .visible-shape';

interface Anchor {
  host: SVGElement;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  hardware?: string;
  precision?: string;
}
type XY = Pick<Anchor, 'clientX' | 'clientY'>;

function findSvgAnchors(svg: SVGSVGElement): Anchor[] {
  const anchors: Anchor[] = [];
  for (const group of svg.querySelectorAll<SVGGElement>('.dot-group')) {
    const shape = group.querySelector<SVGGraphicsElement>('.visible-shape');
    if (!shape || shape.getBoundingClientRect().width === 0) continue;
    const matrix = group.getScreenCTM();
    if (matrix)
      anchors.push({
        host: group,
        x: 0,
        y: 0,
        clientX: matrix.e,
        clientY: matrix.f,
        hardware: group.dataset.hwKey,
        precision: group.dataset.precision,
      });
  }
  return anchors;
}

function canvasAnchors(svg: SVGSVGElement, interactiveOnly: boolean): Anchor[] {
  const layer = svg.querySelector<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR);
  if (!layer) return [];
  const points = layer.scatterPoints?.() ?? [];
  const host = layer.parentElement;
  const bounds = plotBounds(svg) ?? svg.getBoundingClientRect();
  if (!(host instanceof SVGElement)) return [];
  return points
    .filter(
      (point) =>
        point.opacity > 0 &&
        (!interactiveOnly || point.interactive) &&
        point.clientX >= bounds.left &&
        point.clientX <= bounds.right &&
        point.clientY >= bounds.top &&
        point.clientY <= bounds.bottom,
    )
    .map((point) => ({
      ...point,
      host,
      hardware: point.attrs['hw-key'],
      precision: point.attrs.precision,
    }));
}

function closest(anchors: Anchor[], at: XY) {
  let best: Anchor | undefined;
  let distance = 12;
  for (const anchor of anchors) {
    const delta = Math.hypot(anchor.clientX - at.clientX, anchor.clientY - at.clientY);
    if (delta <= distance) {
      best = anchor;
      distance = delta;
    }
  }
  return best;
}

function crowdedAt(anchor: Anchor, neighbors: Anchor[]) {
  return neighbors.some((neighbor) => {
    const distance = Math.hypot(
      neighbor.clientX - anchor.clientX,
      neighbor.clientY - anchor.clientY,
    );
    return distance > 0.2 && distance < 23;
  });
}

function labelRects(svg: SVGSVGElement) {
  return [
    ...svg.querySelectorAll<SVGGraphicsElement>(
      '.line-label > .ll-bg, .parallelism-label > .pl-bg, .point-label > .pl-bg',
    ),
  ]
    .filter((label) => (label.parentNode as SVGElement | null)?.style.opacity !== '0')
    .map((label) => label.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

function touchesLabel({ clientX, clientY }: Anchor, labels: DOMRect[]) {
  return labels.some(
    ({ left, right, top, bottom }) =>
      clientX + 13 > left && clientX - 13 < right && clientY + 13 > top && clientY - 13 < bottom,
  );
}

export function mountChartSelection(zh: boolean, complete: (observation: string) => void) {
  let armed = false;
  let marker: SVGPathElement | undefined;
  let note: HTMLElement | undefined;
  let caption: HTMLElement | null = null;
  let resize: ResizeObserver | undefined;
  let replot: MutationObserver | undefined;
  const remove = () => {
    marker?.remove();
    note?.remove();
    delete caption?.dataset.sketchMarked;
    resize?.disconnect();
    replot?.disconnect();
    marker = undefined;
    note = undefined;
    caption = null;
    resize = undefined;
    replot = undefined;
  };

  function mark(svg: SVGSVGElement, anchor: Anchor, neighbors: Anchor[], labels = labelRects(svg)) {
    const figure = svg.closest(FIGURE);
    if (!figure) return false;
    remove();
    armed = false;
    // Draw only an unfilled bracket outside the point's own glyph. In a dense cluster the
    // in-flow note still works, without placing any decoration over neighboring observations.
    const bounds = plotBounds(svg);
    const withinPlot =
      !bounds ||
      (anchor.clientX > bounds.left + 13 &&
        anchor.clientX < bounds.right - 13 &&
        anchor.clientY > bounds.top + 13 &&
        anchor.clientY < bounds.bottom - 13);
    if (withinPlot && !crowdedAt(anchor, neighbors) && !touchesLabel(anchor, labels)) {
      marker = document.createElementNS(SVG, 'path');
      marker.setAttribute('class', 'excalidraw-ip-selection');
      marker.setAttribute('aria-hidden', 'true');
      marker.setAttribute('pointer-events', 'none');
      marker.setAttribute('transform', `translate(${anchor.x} ${anchor.y})`);
      marker.setAttribute(
        'd',
        'M-11 -6l.3-5.1 5.4.2 M5.8-11l5.4.2-.3 5.2 M11 5.4l-.2 5.8-5.4-.3 M-5.2 11l-5.8-.2.1-5.5',
      );
      anchor.host.append(marker);
    }
    note = document.createElement('div');
    note.className = 'excalidraw-ip-plot-note';
    note.setAttribute('role', 'status');
    const text = document.createElement('span');
    const hardware = anchor.hardware?.replaceAll('_', ' ').toUpperCase();
    const precision = anchor.precision?.toUpperCase();
    const observation = [hardware, precision].filter(Boolean).join(' · ');
    const detail = observation ? `${observation} · ` : '';
    text.textContent =
      detail +
      (zh
        ? '草图便签：比较这个测量点与帕累托前沿。吞吐提高了多少？交互速率又发生了什么变化？'
        : 'Sketch note: Compare this measurement with the Pareto frontier. What did the extra throughput cost in interactivity?');
    const shrug = document.createElement('span');
    shrug.className = 'excalidraw-plot-shrug';
    shrug.dataset.benchmarkMeme = 'shrug';
    const figureArt = document.createElement('img');
    figureArt.src = '/decorative/excalidraw/stick-shrug.webp';
    figureArt.alt = '';
    figureArt.width = 26;
    figureArt.height = 26;
    shrug.append(
      figureArt,
      zh
        ? `火柴人耸耸肩：「${hardware ?? '这个点'} 有了吞吐记录。我还在等首词元。」`
        : `The stick figure shrugs: “${hardware ?? 'This point'} has a throughput number. I’m still waiting for my first token.”`,
    );
    text.append(shrug);
    note.append(text);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', zh ? '关闭图表便签' : 'Close chart note');
    close.addEventListener('click', remove, { once: true });
    note.append(close);
    figure.append(note);
    caption = figure.querySelector<HTMLElement>('.excalidraw-chart-frame-ink');
    if (caption) caption.dataset.sketchMarked = 'true';
    const hits = anchor.host.querySelector(`${CANVAS_POINT_LAYER_SELECTOR} > .dot-hit-area`);
    const tracked = hits ?? anchor.host;
    const attribute = hits ? 'd' : 'transform';
    const geometry = tracked.getAttribute(attribute);
    replot = new MutationObserver(() => {
      if (tracked.getAttribute(attribute) !== geometry) remove();
    });
    replot.observe(tracked, {
      attributes: true,
      attributeFilter: [attribute],
    });
    if (typeof ResizeObserver !== 'undefined') {
      const width = svg.getBoundingClientRect().width;
      const height = svg.getBoundingClientRect().height;
      resize = new ResizeObserver(() => {
        const size = svg.getBoundingClientRect();
        if (size.width !== width || size.height !== height) remove();
      });
      resize.observe(svg);
    }
    complete(observation);
    return true;
  }

  function click(event: MouseEvent) {
    if (!armed || !(event.target instanceof Element)) return;
    const hit = event.target.closest(`.dot-hit-area, ${HIT}`);
    const svg = hit?.closest('svg');
    if (!svg?.closest(FIGURE)) return;
    const canvas = hit?.closest(CANVAS_POINT_LAYER_SELECTOR);
    const anchors = canvas ? canvasAnchors(svg, false) : findSvgAnchors(svg);
    const anchor = canvas
      ? closest(canvasAnchors(svg, true), event)
      : anchors.find((item) => item.host === hit?.closest('.dot-group'));
    if (anchor) mark(svg, anchor, anchors);
  }

  function clearOnZoom(event: WheelEvent) {
    if (event.target instanceof Element && event.target.closest(`${FIGURE} svg`)) remove();
  }

  document.addEventListener('click', click, true);
  document.addEventListener('wheel', clearOnZoom, { passive: true });
  return {
    arm(value: boolean) {
      armed = value;
      if (value) remove();
    },
    first() {
      for (const svg of document.querySelectorAll<SVGSVGElement>(
        `${FIGURE} [data-testid="d3-chart-svg"]`,
      )) {
        const canvas = canvasAnchors(svg, false);
        const hasCanvas = canvas.length > 0;
        const underlying = hasCanvas ? canvas : findSvgAnchors(svg);
        const bounds = plotBounds(svg) ?? svg.getBoundingClientRect();
        const inside = (point: Anchor) =>
          point.clientX > bounds.left + 18 &&
          point.clientX < bounds.right - 18 &&
          point.clientY > bounds.top + 18 &&
          point.clientY < bounds.bottom - 18;
        const eligible = (hasCanvas ? canvasAnchors(svg, true) : underlying).filter(inside);
        const labels = labelRects(svg);
        const anchor =
          eligible
            .slice(0, 100)
            .find((point) => !crowdedAt(point, underlying) && !touchesLabel(point, labels)) ??
          eligible[0];
        if (anchor && mark(svg, anchor, underlying, labels)) {
          svg.scrollIntoView({ block: 'center', behavior: 'instant' });
          return true;
        }
      }
      return false;
    },
    clear() {
      armed = false;
      remove();
    },
    dispose() {
      remove();
      document.removeEventListener('click', click, true);
      document.removeEventListener('wheel', clearOnZoom);
    },
  };
}
