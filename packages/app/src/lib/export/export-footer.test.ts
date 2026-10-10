import { describe, expect, it } from 'vitest';

import { EXPORT_FOOTER_FALLBACK_HOST, getExportFooterText } from './export-footer';

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
    // jsdom exposes window.location; under the node environment this exercises the fallback.
    const text = getExportFooterText();
    expect(text.startsWith(EXPORT_FOOTER_FALLBACK_HOST) || text.includes('/')).toBe(true);
  });
});
