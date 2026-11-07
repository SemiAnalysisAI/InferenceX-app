import { describe, expect, it } from 'vitest';

import { AGENTX_ROUTE, DASHBOARD_ROUTES, UBENCHX_ROUTE } from './dashboard-routes';
import {
  LEGACY_DASHBOARD_PATHS,
  legacyDashboardPathname,
  legacyDashboardRedirectUrl,
} from './legacy-dashboard-redirect';

const EXPECTED: readonly (readonly [string, string])[] = [
  ['/inference', '/infx/inference'],
  ['/profit-estimator', '/infx/profit-estimator'],
  ['/profit-estimator-per-gigawatt', '/infx/profit-estimator-per-gigawatt'],
  ['/evaluation', '/infx/evaluation'],
  ['/historical', '/infx/historical'],
  ['/calculator', '/infx/calculator'],
  ['/fleet', '/infx/fleet'],
  ['/first-token', '/infx/first-token'],
  ['/cache-reuse', '/infx/cache-reuse'],
  ['/reliability', '/infx/reliability'],
  ['/gpu-specs', '/infx/gpu-specs'],
  ['/submissions', '/infx/submissions'],
  ['/ai-chart', '/infx/ai-chart'],
  ['/current-inferencex-image', '/infx/current-inferencex-image'],
  ['/agentic-workload-explorer', '/infx/agentic-workload-explorer'],
  ['/agentx', '/infx/agentx'],
  ['/operatorx', '/opx'],
  ['/ubenchx', '/ubx'],
  ['/video', '/vgx'],
  ['/powerx', '/pwx'],
  ['/collectivex', '/colx'],
];

describe('legacy dashboard redirect table', () => {
  it('maps every moved top-level path to its registry path and nothing else', () => {
    expect([...LEGACY_DASHBOARD_PATHS].map(([first, path]) => [`/${first}`, path])).toEqual(
      expect.arrayContaining(EXPECTED.map(([from, to]) => [from, to])),
    );
    expect(LEGACY_DASHBOARD_PATHS.size).toBe(EXPECTED.length);
    for (const route of [...DASHBOARD_ROUTES, AGENTX_ROUTE, UBENCHX_ROUTE]) {
      if ('legacyPath' in route) {
        expect(LEGACY_DASHBOARD_PATHS.get(route.legacyPath.slice(1))).toBe(route.path);
      }
    }
  });

  it.each(EXPECTED.filter(([from]) => from !== '/ubenchx'))(
    'moves %s to %s in both locales',
    (from, to) => {
      expect(legacyDashboardPathname(from)).toBe(to);
      expect(legacyDashboardPathname(`${from}/`)).toBe(to);
      expect(legacyDashboardPathname(`/zh${from}`)).toBe(`/zh${to}`);
      expect(legacyDashboardPathname(`/zh${from}/a/b`)).toBe(`/zh${to}/a/b`);
    },
  );

  it('keeps every subpath segment', () => {
    expect(legacyDashboardPathname('/inference/deepseek-r1')).toBe('/infx/inference/deepseek-r1');
    expect(legacyDashboardPathname('/inference/agentic/206860')).toBe(
      '/infx/inference/agentic/206860',
    );
    expect(legacyDashboardPathname('/zh/profit-estimator/kimi-k3/target/24/')).toBe(
      '/zh/infx/profit-estimator/kimi-k3/target/24',
    );
    expect(legacyDashboardPathname('/agentx/methodology')).toBe('/infx/agentx/methodology');
    expect(legacyDashboardPathname('/agentic-workload-explorer/sessions/abc/costs')).toBe(
      '/infx/agentic-workload-explorer/sessions/abc/costs',
    );
    expect(legacyDashboardPathname('/operatorx/model')).toBe('/opx/model');
    expect(legacyDashboardPathname('/ubenchx/mem-bw')).toBe('/ubx/mem-bw');
    expect(legacyDashboardPathname('/zh/ubenchx/tpc-skyline/')).toBe('/zh/ubx/tpc-skyline');
    expect(legacyDashboardPathname('/powerx/tutorial')).toBe('/pwx/tutorial');
    expect(legacyDashboardPathname('/zh/powerx/tutorial/')).toBe('/zh/pwx/tutorial');
  });

  it('sends the bare product root to the Inference tab', () => {
    expect(legacyDashboardPathname('/infx')).toBe('/infx/inference');
    expect(legacyDashboardPathname('/infx/')).toBe('/infx/inference');
    expect(legacyDashboardPathname('/zh/infx')).toBe('/zh/infx/inference');
  });

  it('sends old uBenchX landing paths straight to their current page', () => {
    expect(legacyDashboardPathname('/ubenchx')).toBe('/ubx/mem-bw');
    expect(legacyDashboardPathname('/ubenchx/')).toBe('/ubx/mem-bw');
    expect(legacyDashboardPathname('/zh/ubenchx')).toBe('/zh/ubx/mem-bw');
    expect(legacyDashboardPathname('/ubenchx/sm-l2-distance')).toBe('/ubx/core-memory-profiles');
    expect(legacyDashboardPathname('/zh/ubenchx/sm-l2-distance/')).toBe(
      '/zh/ubx/core-memory-profiles',
    );
    expect(legacyDashboardPathname('/ubx')).toBeNull();
    expect(legacyDashboardPathname('/ubx/sm-l2-distance')).toBeNull();
    expect(
      legacyDashboardRedirectUrl(
        new URL('https://inferencex.semianalysis.com/zh/ubenchx/sm-l2-distance?gpu=all'),
      )?.href,
    ).toBe('https://inferencex.semianalysis.com/zh/ubx/core-memory-profiles?gpu=all');
  });

  it.each([
    '/',
    '/zh',
    '/infx/inference',
    '/infx/inference/deepseek-r1',
    '/zh/infx/agentx/methodology',
    '/infx/unknown',
    '/opx',
    '/opx/gemm',
    '/pwx',
    '/vgx',
    '/colx',
    '/feedback',
    '/ubx/mem-bw',
    '/api/v1/views/ubenchx',
    '/overview',
    '/compare/deepseek-r1-b200-vs-mi355x',
    '/inferencex',
    '/inference-chart',
    '/api/v1/views/inference',
    '/api/v1/operatorx/compare',
    '/api/v1/agentic-workload-explorer/sessions',
    '/images/inference/figure.png',
    '/_next/static/chunks/main.js',
    '/favicon.ico',
  ])('leaves %s alone', (pathname) => {
    expect(legacyDashboardPathname(pathname)).toBeNull();
  });

  it('keeps the query string and hash on the redirect URL', () => {
    const target = legacyDashboardRedirectUrl(
      new URL('https://inferencex.semianalysis.com/zh/inference/deepseek-r1?i_seq=8k%2F1k#chart'),
    );
    expect(target?.href).toBe(
      'https://inferencex.semianalysis.com/zh/infx/inference/deepseek-r1?i_seq=8k%2F1k#chart',
    );
    expect(
      legacyDashboardRedirectUrl(
        new URL('https://inferencex.semianalysis.com/api/v1/views/inference'),
      ),
    ).toBeNull();
    expect(
      legacyDashboardRedirectUrl(
        new URL('https://inferencex.semianalysis.com/zh/ubenchx/mem-bw?x=1#sweep'),
      )?.href,
    ).toBe('https://inferencex.semianalysis.com/zh/ubx/mem-bw?x=1#sweep');
  });
});
