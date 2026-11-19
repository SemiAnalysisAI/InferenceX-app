import { describe, expect, it } from 'vitest';

import { COMPARE_MODEL_ALIASES } from '@/lib/compare/compare-slug';
import { modelRouteRedirectUrl } from './model-route-redirect';
import { modelRoutePath, resolveModelRouteSlug } from './model-routes';

const ORIGIN = 'https://inferencex.semianalysis.com';

function redirectFor(path: string): string | null {
  const target = modelRouteRedirectUrl(new URL(`${ORIGIN}${path}`));
  return target ? `${target.pathname}${target.search}` : null;
}

describe('modelRouteRedirectUrl', () => {
  it.each([
    ['/infx/calculator/kimi?i_seq=1k%2F1k', '/infx/calculator/kimi-k26?i_seq=1k%2F1k'],
    [
      '/zh/infx/historical/glm-5?g_rundate=2026-08-20',
      '/zh/infx/historical/glm-5-1?g_rundate=2026-08-20',
    ],
    ['/infx/calculator/Kimi-K3?utm_source=x', '/infx/calculator/kimi-k3?utm_source=x'],
    [
      '/zh/infx/profit-estimator/DeepSeek-V4/target/24?utm_campaign=test',
      '/zh/infx/profit-estimator/deepseek-v4/target/24?utm_campaign=test',
    ],
    [
      '/infx/profit-estimator/deepseek-v4/target/24/percentile/p75',
      '/infx/profit-estimator/deepseek-v4/target/24',
    ],
    [
      '/infx/profit-estimator-per-gigawatt/deepseek-v4/target/24?i_pctl=p75&utm_campaign=test',
      '/infx/profit-estimator-per-gigawatt/deepseek-v4/target/24?utm_campaign=test',
    ],
    [
      '/zh/infx/profit-estimator/deepseek-v4?percentile=p50&c_power=modeled',
      '/zh/infx/profit-estimator/deepseek-v4?c_power=modeled',
    ],
  ])('redirects %s to %s', (from, to) => {
    expect(redirectFor(from)).toBe(to);
  });

  it('canonicalizes every alias on every model-route tab', () => {
    for (const [alias, canonical] of Object.entries(COMPARE_MODEL_ALIASES)) {
      if (!resolveModelRouteSlug(canonical)) continue;
      expect(redirectFor(`/infx/calculator/${alias}?a=1`)).toBe(
        `${modelRoutePath('calculator', canonical)}?a=1`,
      );
    }
  });

  it.each([
    '/infx/calculator',
    '/infx/calculator/kimi-k3?i_seq=1k%2F1k',
    '/infx/calculator/not-a-model?x=1',
    '/infx/profit-estimator?i_pctl=p75',
    '/infx/profit-estimator/deepseek-v4/target/24?utm_campaign=test',
    '/infx/profit-estimator/deepseek-r1/target/24?i_pctl=p75',
    '/infx/profit-estimator/deepseek-v4/unknown/24?i_pctl=p75',
    '/infx/profit-estimator/deepseek-v4/target?i_pctl=p75',
    '/infx/profit-estimator/deepseek-v4/target/%E0%A4%A?i_pctl=p75',
    '/compare/kimi?x=1',
  ])('leaves %s alone', (path) => {
    expect(redirectFor(path)).toBeNull();
  });
});
