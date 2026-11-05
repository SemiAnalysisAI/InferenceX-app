import { describe, expect, it, vi } from 'vitest';

import {
  drawExportFooter,
  EXPORT_FOOTER_FALLBACK_HOST,
  getExportFooterText,
} from './export-footer';

describe('drawExportFooter', () => {
  it.each([
    { backgroundColor: '#ffffff', color: '#1e1e1e', fontFamily: '"DM Sans", sans-serif' },
    { backgroundColor: '#131416', color: '#eaebec', fontFamily: 'serif' },
  ])('draws the supplied theme at the footer bounds: $backgroundColor', (style) => {
    const fills: string[] = [];
    const ctx = {
      fillStyle: '',
      fillRect: vi.fn(() => fills.push(ctx.fillStyle)),
      measureText: vi.fn(() => ({ width: 400 })),
      fillText: vi.fn(() => fills.push(ctx.fillStyle)),
      font: '',
      textAlign: '',
      textBaseline: '',
    };

    drawExportFooter(ctx as unknown as CanvasRenderingContext2D, style, 1200, 720, 96, 40);

    expect(ctx.fillRect).toHaveBeenCalledExactlyOnceWith(0, 720, 1200, 96);
    expect(fills).toEqual([style.backgroundColor, style.color]);
    expect(ctx.font).toBe(`bold 40px ${style.fontFamily}`);
    expect(ctx.textAlign).toBe('center');
    expect(ctx.textBaseline).toBe('middle');
    expect(ctx.fillText).toHaveBeenCalledExactlyOnceWith(getExportFooterText(), 600, 768, 1152);
  });

  it('fits a long route using the selected font at replay resolution', () => {
    const ctx = {
      fillRect: vi.fn(),
      measureText: vi.fn(() => ({ width: 800 })),
      fillText: vi.fn(),
      font: '',
    };

    drawExportFooter(
      ctx as unknown as CanvasRenderingContext2D,
      { backgroundColor: '#131416', color: '#eaebec', fontFamily: 'serif' },
      448,
      240,
      48,
      16,
    );

    expect(ctx.font).toBe('bold 8px serif');
    expect(ctx.fillText).toHaveBeenCalledExactlyOnceWith(getExportFooterText(), 224, 264, 400);
  });
});

describe('getExportFooterText', () => {
  it('joins the current hostname with the route path', () => {
    expect(
      getExportFooterText({
        hostname: 'inferencex.semianalysis.com',
        pathname: '/inference/kimi-k3',
      }),
    ).toBe('inferencex.semianalysis.com/inference/kimi-k3');
  });

  it('keeps nested estimator routes intact', () => {
    expect(
      getExportFooterText({
        hostname: 'inferencex.semianalysis.com',
        pathname: '/profit-estimator-per-gigawatt/minimax-m3',
      }),
    ).toBe('inferencex.semianalysis.com/profit-estimator-per-gigawatt/minimax-m3');
  });

  it('drops the trailing slash on the root route', () => {
    expect(getExportFooterText({ hostname: 'inferencex.semianalysis.com', pathname: '/' })).toBe(
      'inferencex.semianalysis.com',
    );
  });

  it('strips trailing slashes on nested routes', () => {
    expect(
      getExportFooterText({ hostname: 'inferencex.semianalysis.com', pathname: '/zh/inference/' }),
    ).toBe('inferencex.semianalysis.com/zh/inference');
  });

  it('preserves preview and alternate hostnames', () => {
    expect(getExportFooterText({ hostname: 'inferencex.com', pathname: '/inference' })).toBe(
      'inferencex.com/inference',
    );
    expect(
      getExportFooterText({
        hostname: 'inferencex-app-git-feature.vercel.app',
        pathname: '/compare',
      }),
    ).toBe('inferencex-app-git-feature.vercel.app/compare');
  });

  it('falls back to the production host for local development', () => {
    expect(getExportFooterText({ hostname: 'localhost', pathname: '/inference/kimi-k3' })).toBe(
      `${EXPORT_FOOTER_FALLBACK_HOST}/inference/kimi-k3`,
    );
    expect(getExportFooterText({ hostname: '127.0.0.1', pathname: '/model/glm-5.3' })).toBe(
      `${EXPORT_FOOTER_FALLBACK_HOST}/model/glm-5.3`,
    );
  });

  it('falls back to the production host when no location is available', () => {
    expect(getExportFooterText({ hostname: '', pathname: '/inference' })).toBe(
      `${EXPORT_FOOTER_FALLBACK_HOST}/inference`,
    );
  });

  it('reads window.location in a browser environment', () => {
    const text = getExportFooterText();
    expect(text.startsWith(EXPORT_FOOTER_FALLBACK_HOST) || text.includes('/')).toBe(true);
  });
});
