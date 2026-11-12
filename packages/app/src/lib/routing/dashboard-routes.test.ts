import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_ROUTES,
  dashboardNavTabForPathname,
  dashboardRouteForPathname,
  dashboardShellCapabilitiesForPathname,
  getDashboardRoute,
  isDashboardRouteKey,
} from './dashboard-routes';

describe('dashboard route registry', () => {
  it('has unique keys, navigation paths, and sitemap paths', () => {
    expect(new Set(DASHBOARD_ROUTES.map((route) => route.key)).size).toBe(DASHBOARD_ROUTES.length);
    expect(new Set(DASHBOARD_ROUTES.map((route) => route.path)).size).toBe(DASHBOARD_ROUTES.length);
    expect(new Set(DASHBOARD_ROUTES.map((route) => route.canonicalPath)).size).toBe(
      DASHBOARD_ROUTES.length,
    );
  });

  it.each(DASHBOARD_ROUTES)('has English and Chinese page parity for "$key"', (route) => {
    const englishPage = new URL(`../../app/(dashboard)${route.path}/page.tsx`, import.meta.url);
    const chinesePage = new URL(`../../app/zh/(dashboard)${route.path}/page.tsx`, import.meta.url);

    expect(existsSync(englishPage)).toBe(true);
    expect(existsSync(chinesePage)).toBe(route.localeMirrored);
  });

  it('keeps gpu-specs footer-only and indexable, and feedback out of the sitemap', () => {
    expect(getDashboardRoute('gpu-specs').navGroup).toBe('footer-only');
    expect(getDashboardRoute('gpu-specs').indexable).toBe(true);
    expect(getDashboardRoute('feedback').indexable).toBe(false);
  });

  it('moves the TCO calculator and fleet lifecycle to the footer but keeps them indexed', () => {
    expect(getDashboardRoute('calculator').navGroup).toBe('footer-only');
    expect(getDashboardRoute('calculator').indexable).toBe(true);
    expect(getDashboardRoute('fleet').navGroup).toBe('footer-only');
    expect(getDashboardRoute('fleet').indexable).toBe(true);
  });

  it('moves Historical Trends to the footer but keeps it indexed and locale-mirrored', () => {
    expect(getDashboardRoute('historical').navGroup).toBe('footer-only');
    expect(getDashboardRoute('historical').indexable).toBe(true);
    expect(getDashboardRoute('historical').localeMirrored).toBe(true);
    expect(dashboardRouteForPathname('/infx/historical/kimi-k3')?.key).toBe('historical');
  });

  it('puts one profit estimator tab between Inference Performance and Accuracy Evals', () => {
    const primary = DASHBOARD_ROUTES.filter((route) => route.navGroup === 'primary').map(
      (route) => route.key,
    );
    expect(primary.slice(0, 3)).toEqual(['inference', 'profit-estimator', 'evaluation']);
    expect(primary).not.toContain('profit-estimator-per-gigawatt');
    expect(primary).not.toContain('calculator');
    expect(primary).not.toContain('fleet');
    expect(primary).not.toContain('historical');
    expect(dashboardRouteForPathname('/infx/profit-estimator-per-gigawatt/kimi-k3')?.key).toBe(
      'profit-estimator-per-gigawatt',
    );
    expect(dashboardRouteForPathname('/infx/profit-estimator/kimi-k3')?.key).toBe(
      'profit-estimator',
    );
  });

  it('keeps the per-gigawatt page indexed and marks the profit estimator tab active on it', () => {
    const perGw = getDashboardRoute('profit-estimator-per-gigawatt');
    expect(perGw.navGroup).toBe('merged');
    expect(perGw.indexable).toBe(true);
    expect(perGw.localeMirrored).toBe(true);
    for (const pathname of [
      '/infx/profit-estimator',
      '/infx/profit-estimator-per-gigawatt',
      '/zh/infx/profit-estimator-per-gigawatt/kimi-k3/target/45',
    ]) {
      expect(dashboardNavTabForPathname(pathname)).toBe('profit-estimator');
    }
    expect(dashboardNavTabForPathname('/zh/infx/evaluation')).toBe('evaluation');
    expect(dashboardNavTabForPathname('/compare/foo-vs-bar')).toBeUndefined();
  });

  it('keeps PowerX behind the feature gate while its routes still resolve', () => {
    const powerx = getDashboardRoute('powerx');
    expect(powerx.navGroup).toBe('feature-gated');
    expect(powerx.indexable).toBe(false);
    expect(powerx.localeMirrored).toBe(true);
    expect(dashboardRouteForPathname('/pwx')?.key).toBe('powerx');
    expect(dashboardRouteForPathname('/zh/pwx')?.key).toBe('powerx');
  });

  it('exposes OperatorX in primary navigation for both locales', () => {
    expect(getDashboardRoute('operatorx').navGroup).toBe('primary');
    expect(dashboardRouteForPathname('/opx')?.key).toBe('operatorx');
    expect(dashboardRouteForPathname('/zh/opx')?.key).toBe('operatorx');
  });

  it('declares the standalone and self-seeded provider capabilities', () => {
    expect(getDashboardRoute('collectivex').providers).toEqual({
      globalFilters: false,
      unofficialRuns: false,
    });
    expect(getDashboardRoute('calculator').providers).toEqual({
      globalFilters: false,
      unofficialRuns: true,
    });
  });

  it.each(['/infx/inference/agentic', '/zh/infx/inference/agentic'])(
    'keeps the agentic catalog standalone at %s',
    (pathname) => {
      expect(dashboardShellCapabilitiesForPathname(pathname)).toEqual({
        providers: { globalFilters: false, unofficialRuns: false },
        dashboardNudge: false,
        tabNav: true,
      });
    },
  );

  it.each(['/infx/inference/agentic/42', '/zh/infx/inference/agentic/42'])(
    'preserves standalone agentic detail behavior at %s',
    (pathname) => {
      expect(dashboardShellCapabilitiesForPathname(pathname)).toEqual({
        providers: { globalFilters: false, unofficialRuns: false },
        dashboardNudge: false,
        tabNav: true,
      });
    },
  );

  it.each(['/colx', '/zh/colx'])(
    'keeps the CollectiveX route free of dashboard providers and nudges at %s',
    (pathname) => {
      expect(dashboardShellCapabilitiesForPathname(pathname)).toEqual({
        providers: { globalFilters: false, unofficialRuns: false },
        dashboardNudge: false,
        tabNav: true,
      });
    },
  );

  it.each([
    '/infx/agentic-workload-explorer',
    '/zh/infx/agentic-workload-explorer',
    '/infx/agentic-workload-explorer/sessions/abc/timeline',
    '/zh/infx/agentic-workload-explorer/tool-analytics',
  ])('hides the dashboard tab strip on the explorer, which has its own nav, at %s', (pathname) => {
    expect(dashboardShellCapabilitiesForPathname(pathname)).toEqual({
      providers: { globalFilters: false, unofficialRuns: false },
      dashboardNudge: false,
      tabNav: false,
    });
  });

  it.each(['/infx/gpu-specs', '/infx/submissions', '/feedback'])(
    'keeps dashboard nudges active on provider-free route %s',
    (pathname) => {
      expect(dashboardShellCapabilitiesForPathname(pathname).dashboardNudge).toBe(true);
    },
  );

  it('resolves English, Chinese, canonical, and dashboard child paths', () => {
    expect(dashboardRouteForPathname('/infx/evaluation')?.key).toBe('evaluation');
    expect(dashboardRouteForPathname('/zh/infx/evaluation')?.key).toBe('evaluation');
    expect(dashboardRouteForPathname('/infx/inference')?.key).toBe('inference');
    expect(dashboardRouteForPathname('/')).toBeUndefined();
    expect(dashboardRouteForPathname('/zh/infx/inference/agentic/42')?.key).toBe('inference');
    expect(dashboardNavTabForPathname('/opx/model')).toBe('operatorx');
    expect(dashboardNavTabForPathname('/zh/opx/moe')).toBe('operatorx');
    expect(dashboardRouteForPathname('/compare/foo-vs-bar')).toBeUndefined();
    expect(isDashboardRouteKey('not-a-tab')).toBe(false);
  });

  it('removes reliability from navigation, discovery, and localized route matching', () => {
    expect(isDashboardRouteKey('reliability')).toBe(false);
    for (const path of ['/infx/reliability', '/zh/infx/reliability']) {
      expect(dashboardRouteForPathname(path)).toBeUndefined();
      expect(dashboardNavTabForPathname(path)).toBeUndefined();
    }
  });
});
