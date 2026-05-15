// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { getExportFontFamily } from './useChartExport';

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
