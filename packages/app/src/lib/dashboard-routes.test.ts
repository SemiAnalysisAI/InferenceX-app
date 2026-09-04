import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_ROUTES,
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
    const englishPage = new URL(`../app/(dashboard)/${route.key}/page.tsx`, import.meta.url);
    const chinesePage = new URL(`../app/zh/(dashboard)/${route.key}/page.tsx`, import.meta.url);

    expect(existsSync(englishPage)).toBe(true);
    expect(existsSync(chinesePage)).toBe(route.localeMirrored);
  });

  it('keeps reliability and gpu-specs footer-only and indexable, and feedback out of the sitemap', () => {
    expect(getDashboardRoute('reliability').navGroup).toBe('footer-only');
    expect(getDashboardRoute('reliability').indexable).toBe(true);
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

  it('puts both profit estimators in the primary nav right after the benchmark tabs', () => {
    const primary = DASHBOARD_ROUTES.filter((route) => route.navGroup === 'primary').map(
      (route) => route.key,
    );
    expect(primary.slice(0, 4)).toEqual([
      'inference',
      'evaluation',
      'profit-estimator-per-gigawatt',
      'profit-estimator',
    ]);
    expect(primary).not.toContain('calculator');
    expect(primary).not.toContain('fleet');
    expect(dashboardRouteForPathname('/profit-estimator-per-gigawatt/kimi-k3')?.key).toBe(
      'profit-estimator-per-gigawatt',
    );
    expect(dashboardRouteForPathname('/profit-estimator/kimi-k3')?.key).toBe('profit-estimator');
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

  it.each(['/inference/agentic', '/zh/inference/agentic'])(
    'keeps the agentic catalog standalone at %s',
    (pathname) => {
      expect(dashboardShellCapabilitiesForPathname(pathname)).toEqual({
        providers: { globalFilters: false, unofficialRuns: false },
        dashboardNudge: false,
      });
    },
  );

  it.each(['/inference/agentic/42', '/zh/inference/agentic/42'])(
    'preserves standalone agentic detail behavior at %s',
    (pathname) => {
      expect(dashboardShellCapabilitiesForPathname(pathname)).toEqual({
        providers: { globalFilters: false, unofficialRuns: false },
        dashboardNudge: false,
      });
    },
  );

  it.each(['/collectivex', '/zh/collectivex'])(
    'keeps the CollectiveX route free of dashboard providers and nudges at %s',
    (pathname) => {
      expect(dashboardShellCapabilitiesForPathname(pathname)).toEqual({
        providers: { globalFilters: false, unofficialRuns: false },
        dashboardNudge: false,
      });
    },
  );

  it.each(['/reliability', '/gpu-specs', '/submissions', '/feedback'])(
    'keeps dashboard nudges active on provider-free route %s',
    (pathname) => {
      expect(dashboardShellCapabilitiesForPathname(pathname).dashboardNudge).toBe(true);
    },
  );

  it('resolves English, Chinese, canonical, and dashboard child paths', () => {
    expect(dashboardRouteForPathname('/evaluation')?.key).toBe('evaluation');
    expect(dashboardRouteForPathname('/zh/evaluation')?.key).toBe('evaluation');
    expect(dashboardRouteForPathname('/')?.key).toBe('inference');
    expect(dashboardRouteForPathname('/zh/inference/agentic/42')?.key).toBe('inference');
    expect(dashboardRouteForPathname('/compare/foo-vs-bar')).toBeUndefined();
    expect(isDashboardRouteKey('not-a-tab')).toBe(false);
  });
});
