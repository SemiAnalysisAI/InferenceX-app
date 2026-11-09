import { canvasPointLayerOf } from '@/lib/d3-chart/layers/canvas-point-registry';

export type PngAspectRatio = 'auto' | '16:9' | '1:1';
export const PNG_PIXEL_RATIO = 2;
export const PNG_FOOTER_HEIGHT = 60;
export const PNG_MAX_CANVAS_AREA = 4096 * 4096;
export const PNG_MAX_CANVAS_HEIGHT = 10_000;
export const PNG_MIN_PIXEL_RATIO = 0.5;

export function getPngLayoutSize(
  ratio: Exclude<PngAspectRatio, 'auto'>,
  minHeight = 0,
  contentHeight = 0,
) {
  const [w, h, baseWidth] = ratio === '16:9' ? [16, 9, 1280] : [1, 1, 1000];
  const unit = Math.ceil(Math.max(baseWidth / w, contentHeight > 0 ? 0 : minHeight / h));
  const width = unit * w;
  const maxHeight = Math.floor(
    Math.min(PNG_MAX_CANVAS_HEIGHT, PNG_MAX_CANVAS_AREA / width) / PNG_MIN_PIXEL_RATIO,
  );
  const height = Math.max(
    unit * h,
    Math.ceil(minHeight),
    Math.min(Math.ceil(contentHeight), maxHeight),
  );
  const pixelRatio = Math.min(
    PNG_PIXEL_RATIO,
    PNG_MAX_CANVAS_HEIGHT / height,
    Math.sqrt(PNG_MAX_CANVAS_AREA / (width * height)),
  );
  return { width, height, pixelRatio };
}

function rowLabelsOverlap(svg: SVGSVGElement) {
  const labels = [...svg.querySelectorAll('.y-axis .tick text')]
    .map((label) => label.getBoundingClientRect())
    .filter((box) => box.height > 0)
    .sort((a, b) => a.top - b.top);
  return labels.some((box, index) => index > 0 && box.top < labels[index - 1].bottom);
}

function exportCharts(source: Element, clone: HTMLElement, container: HTMLElement) {
  const original = [
    ...source.querySelectorAll<SVGSVGElement>('svg[data-testid="d3-chart-svg"]'),
  ].filter((svg) => !container.contains(svg));
  const charts = [...clone.querySelectorAll<SVGSVGElement>('svg[data-testid="d3-chart-svg"]')];
  return { original, charts };
}

export async function renderCanvasChartsForExport(
  source: Element,
  clone: HTMLElement,
  container: HTMLElement,
) {
  const { original, charts } = exportCharts(source, clone, container);
  const canvasCharts = original.flatMap((svg, index) =>
    canvasPointLayerOf(svg) && charts[index] ? [[svg, charts[index]] as const] : [],
  );
  if (canvasCharts.length === 0) return false;
  const { renderChartForExport } = await import('@/lib/d3-chart/export-renderer');
  for (const [svg, chart] of canvasCharts) {
    const [width, height] = ['width', 'height'].map((name) => Number(svg.getAttribute(name)));
    renderChartForExport(svg, chart, width, height);
  }
  return true;
}

export async function layoutPngExport(
  source: Element,
  clone: HTMLElement,
  container: HTMLElement,
  ratio: Exclude<PngAspectRatio, 'auto'>,
) {
  const { original, charts } = exportCharts(source, clone, container);
  if (charts.length !== 1 || original.length !== 1) {
    throw new Error('Fixed PNG layouts require a single chart');
  }
  const { renderChartForExport } = await import('@/lib/d3-chart/export-renderer');
  let svg = charts[0];
  // Remove viewport-derived widths, including the mobile horizontal scroller.
  for (let node = svg.parentElement; node && clone.contains(node); node = node.parentElement) {
    Object.assign(node.style, {
      width: '100%',
      minWidth: '0',
      maxWidth: 'none',
      height: 'auto',
      flexShrink: '0',
      overflow: 'visible',
      boxSizing: 'border-box',
    });
  }
  Object.assign(clone.style, {
    width: '100%',
    minWidth: '0',
    maxWidth: 'none',
    boxSizing: 'border-box',
  });
  const plotColumn = svg.parentElement?.parentElement;
  if (plotColumn) Object.assign(plotColumn.style, { width: '100%', flex: 'none' });
  const plotRow = plotColumn?.parentElement;
  if (plotRow) plotRow.style.flexDirection = 'column';
  for (const legend of clone.querySelectorAll<HTMLElement>('[data-slot="chart-legend-wrapper"]')) {
    Object.assign(legend.style, {
      width: '100%',
      minWidth: '0',
      maxWidth: 'none',
      marginTop: '12px',
      alignSelf: 'stretch',
    });
    const inner = legend.querySelector<HTMLElement>('.legend-container');
    if (inner) {
      inner.style.setProperty('min-width', '0', 'important');
      inner.style.setProperty('width', '100%', 'important');
      inner.style.setProperty('box-sizing', 'border-box', 'important');
      const list = inner.querySelector<HTMLElement>('ul, [class*="overflow"]');
      if (list) Object.assign(list.style, { display: 'flex', flexWrap: 'wrap', columnGap: '16px' });
    }
  }
  for (const heading of clone.querySelectorAll<HTMLElement>('figcaption h2')) {
    heading.style.whiteSpace = 'normal';
  }
  let size = getPngLayoutSize(ratio);
  let rowsHeight = 0;
  Object.assign(container.style, { boxSizing: 'border-box', padding: '16px', height: 'auto' });
  // Measure caption, legend and footer chrome with a tall SVG.
  for (let attempt = 0; attempt < 6; attempt++) {
    container.style.width = `${size.width}px`;
    svg.setAttribute('height', `${size.height}`);
    svg.style.height = `${size.height}px`;
    const overhead = container.getBoundingClientRect().height - size.height;
    const chrome = overhead + PNG_FOOTER_HEIGHT;
    const next = getPngLayoutSize(ratio, chrome + 360, rowsHeight && chrome + rowsHeight);
    if (next.height > size.height) {
      size = next;
      continue;
    }
    const height = size.height - chrome;
    const width = svg.parentElement!.getBoundingClientRect().width;
    const blank = rowsHeight ? null : (svg.cloneNode(true) as SVGSVGElement);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    renderChartForExport(original[0], svg, width, height);
    if (blank && rowLabelsOverlap(svg)) {
      rowsHeight = Number(original[0].getAttribute('height'));
      svg.replaceWith(blank);
      svg = blank;
      size = getPngLayoutSize(ratio);
      continue;
    }
    container.style.height = `${size.height - PNG_FOOTER_HEIGHT}px`;
    return {
      width: size.width,
      height: size.height - PNG_FOOTER_HEIGHT,
      pixelRatio: size.pixelRatio,
    };
  }
  throw new Error('Chart caption is too large for the PNG layout');
}
