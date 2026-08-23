// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { getExportCaptureDimensions, getExportFontFamily } from './useChartExport';

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
