// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exportMocks = vi.hoisted(() => ({ pathname: '/inference', toPng: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => exportMocks.pathname }));
vi.mock('@jpinsonneau/html-to-image', () => ({
  toPng: exportMocks.toPng,
  getFontEmbedCSS: undefined,
}));

import {
  getExportCaptureDimensions,
  getExportFontFamily,
  normalizeChartSvgWidthsForExport,
  useChartExport,
} from './useChartExport';

describe('useChartExport failure messages', () => {
  let root: Root;
  let container: HTMLDivElement;
  let chart: HTMLDivElement;
  let exportContainer: HTMLDivElement;
  let current: ReturnType<typeof useChartExport>;
  let originalFonts: PropertyDescriptor | undefined;

  function HookProbe() {
    current = useChartExport({ chartId: 'inference-chart' });
    return null;
  }

  beforeEach(() => {
    exportMocks.pathname = '/inference';
    exportMocks.toPng.mockReset();
    originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    container = document.createElement('div');
    chart = document.createElement('div');
    chart.id = 'inference-chart';
    chart.textContent = 'DeepSeek R1';
    exportContainer = document.createElement('div');
    exportContainer.id = 'inference-chart-export';
    document.body.append(container, chart, exportContainer);
    root = createRoot(container);
    act(() => root.render(createElement(HookProbe)));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    chart.remove();
    exportContainer.remove();
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else Reflect.deleteProperty(document, 'fonts');
    vi.restoreAllMocks();
  });

  it.each([
    ['/inference', 'Failed to export image. Please try again.'],
    ['/zh/inference', '图片导出失败，请重试。'],
  ])('reports a PNG capture failure in the current locale on %s', async (pathname, message) => {
    // Keep the hook mounted across locale navigation to catch a stale callback.
    exportMocks.pathname = pathname;
    act(() => root.render(createElement(HookProbe)));
    const error = new Error('PNG capture failed');
    exportMocks.toPng.mockRejectedValueOnce(error);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      await current.exportToImage();
    });

    expect(exportMocks.toPng).toHaveBeenCalledExactlyOnceWith(
      exportContainer,
      expect.objectContaining({ quality: 1, pixelRatio: 2 }),
    );
    expect(alertSpy).toHaveBeenCalledExactlyOnceWith(message);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith('Error exporting image:', error);
    expect(current.isExporting).toBe(false);
    expect(exportContainer.childElementCount).toBe(0);
    expect(chart.textContent).toBe('DeepSeek R1');
  });
});

describe('getExportFontFamily', () => {
  it('uses Minecraft font stack when minecraft theme is active', () => {
    document.documentElement.classList.add('minecraft');

    expect(getExportFontFamily()).toContain('var(--font-minecraft)');
    expect(getExportFontFamily()).toContain('"Monocraft"');

    document.documentElement.classList.remove('minecraft');
  });

  it('uses default sans stack when minecraft theme is inactive', () => {
    document.documentElement.classList.remove('minecraft');
    document.body.classList.remove('minecraft');

    expect(getExportFontFamily()).toContain('var(--font-dm-sans)');
    expect(getExportFontFamily()).toContain('"Segoe UI"');
  });
});

describe('getExportCaptureDimensions', () => {
  it('includes content that overflows the export host to the right', () => {
    const element = document.createElement('div');
    Object.defineProperties(element, {
      clientWidth: { value: 980 },
      clientHeight: { value: 604 },
      scrollWidth: { value: 1168 },
      scrollHeight: { value: 604 },
    });
    element.getBoundingClientRect = () => ({ width: 980, height: 604 }) as DOMRect;

    expect(getExportCaptureDimensions(element)).toEqual({ width: 1168, height: 604 });
  });

  it('rounds fractional layout bounds up so the edge pixel is not cropped', () => {
    const element = document.createElement('div');
    Object.defineProperties(element, {
      clientWidth: { value: 1168 },
      clientHeight: { value: 604 },
      scrollWidth: { value: 1168 },
      scrollHeight: { value: 604 },
    });
    element.getBoundingClientRect = () => ({ width: 1168.25, height: 604.5 }) as DOMRect;

    expect(getExportCaptureDimensions(element)).toEqual({ width: 1169, height: 605 });
  });
});

describe('normalizeChartSvgWidthsForExport', () => {
  it('resizes only the chart SVG and leaves UI icons unchanged', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <svg data-testid="d3-chart-svg" style="width: 800px"></svg>
      <a href="#"><svg data-testid="external-link-icon" style="width: 12px"></svg></a>
      <button><svg data-testid="legend-info-icon" style="width: 14px"></svg></button>
    `;

    normalizeChartSvgWidthsForExport(root);

    expect(root.querySelector<SVGElement>('svg[data-testid="d3-chart-svg"]')?.style.width).toBe(
      '100%',
    );
    expect(
      root.querySelector<SVGElement>('svg[data-testid="external-link-icon"]')?.style.width,
    ).toBe('12px');
    expect(root.querySelector<SVGElement>('svg[data-testid="legend-info-icon"]')?.style.width).toBe(
      '14px',
    );
  });
});
