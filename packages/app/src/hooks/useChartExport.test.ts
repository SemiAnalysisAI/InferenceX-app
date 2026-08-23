// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  getExportCaptureDimensions,
  getExportFontFamily,
  normalizeChartSvgWidthsForExport,
} from './useChartExport';

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
