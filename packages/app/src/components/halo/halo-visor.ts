import {
  CANVAS_UNDERLAY_ATTRIBUTE,
  canvasPointLayerOf,
} from '@/lib/d3-chart/layers/canvas-point-registry';
import { KNOWN_CONFIG_ISSUES } from '@/lib/benchmarks/known-issues';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { getDisplayLabel } from '@/lib/shared/utils';
import { HALO_ART, HALO_FRONTIER } from './halo-archive';

export const liveCharts = 'svg[data-testid="d3-chart-svg"]';
export const frontierPaths = '.roofline-path, .overlay-roofline-path, .line-path';
export const laneSelector = '.halo-chart-keel';
export const noticesSelector = '.known-issue-annotations';
const svgNs = 'http://www.w3.org/2000/svg';

function art(file: string, width: number, height: number) {
  const image = document.createElement('img');
  image.src = `${HALO_ART}${file}.webp`;
  image.alt = '';
  image.width = width;
  image.height = height;
  image.decoding = 'async';
  image.draggable = false;
  return image;
}

export function visor(zh: boolean) {
  const lane = document.createElement('div');
  lane.className = 'halo-chart-keel';
  lane.setAttribute('aria-hidden', 'true');
  const chief = art('spartan-117', 55, 74);
  chief.className = 'halo-chart-helmet';
  const ident = document.createElement('div');
  ident.className = 'halo-chart-ident';
  const label = document.createElement('small');
  label.textContent = zh ? '117 · 士官长护目镜' : '117 · MJOLNIR VISOR';
  ident.append(art('halo-logo', 78, 15), label);
  const ring = document.createElement('div');
  ring.className = 'halo-chart-ring';
  const shield = document.createElement('i');
  shield.className = 'halo-chart-shield';
  const uplink = document.createElement('small');
  uplink.className = 'halo-chart-uplink no-export';
  uplink.textContent = zh ? '遥测链路已锁定' : 'TELEMETRY LOCKED';
  ring.append(shield, uplink);
  const kit = document.createElement('div');
  kit.className = 'halo-chart-kit';
  const sword = art('energy-sword', 62, 37);
  sword.className = 'halo-energy-sword';
  kit.append(art('ma5b', 65, 27), art('needler', 49, 28), sword);
  const trace = document.createElementNS(svgNs, 'svg');
  trace.setAttribute('viewBox', '0 0 224 42');
  trace.setAttribute('class', 'halo-nav-trace no-export');
  const stamp = document.createElement('span');
  stamp.className = 'halo-export-stamp';
  stamp.textContent = zh ? 'UNSC · 117 野战报告' : 'UNSC · 117 FIELD RECORD';
  lane.append(chief, ident, ring, kit, trace, stamp);
  return lane;
}

export function legendPlate() {
  const plate = document.createElement('div');
  plate.className = 'halo-legend-plate';
  plate.setAttribute('aria-hidden', 'true');
  const chief = art('spartan-117', 86, 121);
  chief.className = 'halo-legend-chief';
  const vehicle = art('m12-warthog', 126, 81);
  vehicle.className = 'halo-legend-warthog';
  const logo = art('halo-logo', 102, 18);
  logo.className = 'halo-legend-logo';
  plate.append(chief, vehicle, logo);
  return plate;
}

// Preserve the chart's own warning text, links and dismissal behavior, but move
// the presentation into flow. A fixed-width SVG callout cannot wrap at 390px.
export function placeNotices(chart: SVGSVGElement, row: HTMLElement, zh: boolean) {
  const anchors = [...chart.querySelectorAll<SVGElement>('.known-issue-annotation')];
  if (anchors.length === 0) {
    row.remove();
    delete chart.dataset.haloNoticeRail;
    return;
  }
  const signature = JSON.stringify(
    anchors.map((anchor) => [anchor.textContent, anchor.getAttribute('href')]),
  );
  if (row.dataset.revision !== signature) {
    row.dataset.revision = signature;
    row.replaceChildren(
      ...anchors.map((anchor, index) => {
        const entry = document.createElement('div');
        entry.className = 'halo-chart-notice';
        const notice = document.createElement('div');
        notice.className = 'halo-chart-notice-copy';
        const title = document.createElement('strong');
        const [label, detail] = anchor.querySelectorAll('text');
        const href = anchor.getAttribute('href');
        const issue = KNOWN_CONFIG_ISSUES.find(({ url }) => url === href);
        title.textContent = issue
          ? getDisplayLabel(getHardwareConfig(issue.hwKey, issue.model))
          : (label?.textContent ?? '');
        notice.append(title);
        const description = document.createElement('span');
        description.textContent = detail?.querySelector('tspan')?.textContent ?? '';
        if (href) {
          const link = document.createElement('a');
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = detail?.lastElementChild?.textContent ?? href;
          description.append(link);
        }
        notice.append(description);
        entry.append(notice);
        if (chart.querySelectorAll('.known-issue-dismiss').length > index) {
          const dismiss = document.createElement('button');
          dismiss.type = 'button';
          dismiss.className = 'no-export';
          dismiss.textContent = '×';
          dismiss.setAttribute('aria-label', zh ? '关闭提示' : 'Dismiss notice');
          dismiss.addEventListener('click', () => {
            const native = chart.querySelectorAll('.known-issue-dismiss')[index];
            native?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          });
          entry.append(dismiss);
        }
        return entry;
      }),
    );
  }
  const plot = chart.parentElement;
  if (!row.isConnected) plot?.before(row);
  if (row.isConnected) chart.dataset.haloNoticeRail = '';
}

function overlaps(a: DOMRect, b: DOMRect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function populateTrace(chart: SVGSVGElement, lane: HTMLElement) {
  const preview = lane.querySelector<SVGSVGElement>('.halo-nav-trace');
  if (!preview) return;
  const chartBox = chart.getBoundingClientRect();
  const laneBox = lane.getBoundingClientRect();
  const reserved = [
    chartBox,
    ...[
      ...document.querySelectorAll(
        'main :is(h1, h2, figcaption, [role="toolbar"], [data-slot="chart-legend-wrapper"], [data-testid="export-button"])',
      ),
    ].map((node) => node.getBoundingClientRect()),
  ];
  const plot = chart.querySelector<SVGGElement>('.zoom-group');
  const plotClip = plot?.getAttribute('clip-path')?.match(/^url\(#(?<id>.+)\)$/)?.groups?.id;
  const bounds = plotClip
    ? chart.querySelector<SVGRectElement>(`#${CSS.escape(plotClip)} > rect`)
    : null;
  const matrix = (bounds ? plot : chart)?.getScreenCTM();
  const maxX = bounds?.width.baseVal.value ?? chartBox.width;
  const maxY = bounds?.height.baseVal.value ?? chartBox.height;
  const paths: { points: DOMPoint[]; color: string; canvas: boolean }[] = [];
  if (matrix && laneBox.height > 0 && !reserved.some((box) => overlaps(laneBox, box))) {
    const intoPlot = matrix.inverse();
    for (const path of chart.querySelectorAll<SVGPathElement>(frontierPaths)) {
      const style = getComputedStyle(path);
      // The canvas underlay draws these exact SVG path commands, then hides their SVG copies.
      const canvas = path.hasAttribute(CANVAS_UNDERLAY_ATTRIBUTE);
      if (
        style.display === 'none' ||
        Number(style.opacity) <= 0 ||
        (style.visibility !== 'visible' && !canvas) ||
        style.stroke === 'none' ||
        (canvas && !canvasPointLayerOf(chart))
      )
        continue;
      const length = path.getTotalLength();
      const pathMatrix = path.getScreenCTM();
      if (!pathMatrix || !Number.isFinite(length) || length < 8) continue;
      const coordinates = intoPlot.multiply(pathMatrix);
      const points = [];
      for (let index = 0; index <= 48; index++) {
        const point = path.getPointAtLength((length * index) / 48).matrixTransform(coordinates);
        if (point.x >= 0 && point.x <= maxX && point.y >= 0 && point.y <= maxY) points.push(point);
      }
      if (points.length < 3) continue;
      const stop = style.stroke.match(/url\(["']?[^#]*#(?<id>[^)"']+)/)?.groups?.id;
      const gradient = stop ? document.querySelector(`#${CSS.escape(stop)} stop`) : null;
      paths.push({
        points,
        color: gradient?.getAttribute('stop-color') ?? (stop ? '#a7edff' : style.stroke),
        canvas,
      });
      if (paths.length === 4) break;
    }
  }
  const allPoints = paths.flatMap((path) => path.points);
  if (allPoints.length === 0) {
    delete lane.dataset.haloTraceSource;
    if (preview.firstChild) preview.replaceChildren();
    return;
  }
  const lowX = Math.min(...allPoints.map(({ x }) => x));
  const lowY = Math.min(...allPoints.map(({ y }) => y));
  const dx = Math.max(1, ...allPoints.map(({ x }) => x - lowX));
  const dy = Math.max(1, ...allPoints.map(({ y }) => y - lowY));
  const signature = paths.map(({ points, color, canvas }) => ({
    color,
    canvas,
    d: points
      .map(
        ({ x, y }, i) =>
          `${i === 0 ? 'M' : 'L'}${(7 + (210 * (x - lowX)) / dx).toFixed(1)} ${(5 + (32 * (y - lowY)) / dy).toFixed(1)}`,
      )
      .join(''),
  }));
  const revision = JSON.stringify(signature);
  if (lane.dataset.haloTraceSource && preview.dataset.haloTraceRevision === revision) return;
  const segments = signature.map(({ color, d }) => {
    const segment = document.createElementNS(svgNs, 'path');
    segment.setAttribute('d', d);
    segment.setAttribute('stroke', color);
    segment.setAttribute('pathLength', '1');
    return segment;
  });
  // Fly the beach insertion along the first real frontier, normalized into the
  // HUD frame. This never adds or intercepts anything over the data plot.
  const pelican = document.createElementNS(svgNs, 'g');
  pelican.setAttribute('class', 'halo-cartographer-pelican');
  const img = document.createElementNS(svgNs, 'image');
  img.setAttribute('href', `${HALO_ART}pelican-skiff.webp`);
  img.setAttribute('x', '-13');
  img.setAttribute('y', '-8');
  img.setAttribute('width', '26');
  img.setAttribute('height', '16');
  pelican.append(img);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const last = signature[0]!.d.split('L').at(-1)?.split(' ').join(',');
    if (last) pelican.setAttribute('transform', `translate(${last})`);
  } else {
    const move = document.createElementNS(svgNs, 'animateMotion');
    move.setAttribute('dur', '2.2s');
    move.setAttribute('fill', 'freeze');
    move.setAttribute('path', signature[0]!.d);
    pelican.append(move);
  }
  preview.replaceChildren(...segments, pelican);
  preview.dataset.haloTraceRevision = revision;
  lane.dataset.haloTraceSource = paths.some(({ canvas }) => canvas) ? 'canvas' : 'svg';
  window.dispatchEvent(new CustomEvent(HALO_FRONTIER, { detail: paths.length }));
}
