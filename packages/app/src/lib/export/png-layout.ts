export type PngAspectRatio = 'auto' | '16:9' | '1:1';
export const PNG_PIXEL_RATIO = 2;
export const PNG_FOOTER_HEIGHT = 60;

export function getPngLayoutSize(ratio: Exclude<PngAspectRatio, 'auto'>, minHeight = 0) {
  const [w, h, baseWidth] = ratio === '16:9' ? [16, 9, 1280] : [1, 1, 1000];
  const unit = Math.ceil(Math.max(baseWidth / w, minHeight / h));
  return { width: unit * w, height: unit * h };
}

export async function layoutPngExport(
  source: Element,
  clone: HTMLElement,
  container: HTMLElement,
  ratio: Exclude<PngAspectRatio, 'auto'>,
) {
  const original = [
    ...source.querySelectorAll<SVGSVGElement>('svg[data-testid="d3-chart-svg"]'),
  ].filter((svg) => !container.contains(svg));
  const charts = [...clone.querySelectorAll<SVGSVGElement>('svg[data-testid="d3-chart-svg"]')];
  if (charts.length !== 1 || original.length !== 1) {
    throw new Error('Fixed PNG layouts require a single chart');
  }
  const { renderChartForExport } = await import('@/lib/d3-chart/export-renderer');
  const svg = charts[0];
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
  if (plotColumn) Object.assign(plotColumn.style, { width: 'auto', flex: '1 1 0%' });
  const plotRow = plotColumn?.parentElement;
  if (plotRow) plotRow.style.flexDirection = 'row';
  for (const legend of clone.querySelectorAll<HTMLElement>('[data-slot="chart-legend-wrapper"]')) {
    Object.assign(legend.style, {
      width: '240px',
      minWidth: '0',
      maxWidth: '240px',
      flexShrink: '0',
    });
    const inner = legend.querySelector<HTMLElement>('.legend-container');
    if (inner) {
      inner.style.setProperty('min-width', '0', 'important');
      inner.style.setProperty('width', '100%', 'important');
      inner.style.setProperty('box-sizing', 'border-box', 'important');
    }
    for (const label of legend.querySelectorAll<HTMLElement>('label, .legend-label')) {
      label.style.whiteSpace = 'normal';
    }
  }
  for (const heading of clone.querySelectorAll<HTMLElement>('figcaption h2')) {
    heading.style.whiteSpace = 'normal';
  }
  let size = getPngLayoutSize(ratio);
  Object.assign(container.style, { boxSizing: 'border-box', padding: '16px', height: 'auto' });
  // Measure header/footer chrome with a tall SVG so a sidebar cannot dominate the row height.
  for (let attempt = 0; attempt < 3; attempt++) {
    container.style.width = `${size.width}px`;
    const legendHeight = Math.max(
      0,
      ...[...clone.querySelectorAll<HTMLElement>('[data-slot="chart-legend-wrapper"]')].map(
        (legend) => legend.getBoundingClientRect().height,
      ),
    );
    const probeHeight = Math.max(size.height, legendHeight + 1);
    svg.setAttribute('height', `${probeHeight}`);
    svg.style.height = `${probeHeight}px`;
    const overhead = container.getBoundingClientRect().height - probeHeight;
    const minHeight = overhead + PNG_FOOTER_HEIGHT + Math.max(360, legendHeight);
    const next = getPngLayoutSize(ratio, minHeight);
    if (next.height > size.height) {
      size = next;
      continue;
    }
    const height = size.height - PNG_FOOTER_HEIGHT - overhead;
    const width = svg.parentElement!.getBoundingClientRect().width;
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    renderChartForExport(original[0], svg, width, height);
    container.style.height = `${size.height - PNG_FOOTER_HEIGHT}px`;
    return { width: size.width, height: size.height - PNG_FOOTER_HEIGHT };
  }
  throw new Error('Chart caption is too large for the PNG layout');
}
