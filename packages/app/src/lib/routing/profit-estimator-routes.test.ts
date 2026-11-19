import { describe, expect, it } from 'vitest';

import { Model } from '@/lib/catalog/data-mappings';
import { modelRoutePathnameRewrite } from './model-routes';
import {
  PROFIT_ROUTE_PARAMS,
  parseProfitRouteFilters,
  profitRouteParams,
  profitRouteForTab,
  profitRoutePathname,
  profitRouteSearch,
  setProfitRouteUnofficialRuns,
} from './profit-estimator-routes';

describe('profit estimator route state', () => {
  for (const prefix of ['', '/zh']) {
    for (const tab of ['profit-estimator', 'profit-estimator-per-gigawatt']) {
      const base = `${prefix}/infx/${tab}/deepseek-v4`;
      it(`round-trips every supported parameter on ${base}`, () => {
        const values = [
          '24.5',
          'theoretical',
          'compare',
          'external',
          '2026-10-12',
          '1234',
          'fp4,fp8',
          'b200_sxm,trtllm-b300',
          '2026-10-01~r123,2026-10-12',
          '2026-10-01',
          '2026-10-12',
          '456,789',
        ];
        const params = new URLSearchParams();
        Object.values(PROFIT_ROUTE_PARAMS).forEach((key, index) => params.set(key, values[index]));
        const path = profitRoutePathname(base, params)!;
        expect(path).toContain(`${base}/target/24.5/cache-hit-mode/theoretical`);
        expect(path).not.toMatch(/[?#]/u);
        expect(profitRouteParams(path)).toEqual(params);
      });
    }
  }

  it('moves the model to its slug and does not leak other tabs or pinned sequence', () => {
    const params = new URLSearchParams({
      g_model: Model.DeepSeek_V4_Pro,
      c_ivtarget: '24',
      i_seq: 'agentic-traces',
      i_pctl: 'p75',
      i_metric: 'y_tokensPerSecond',
      c_mw: '100',
      r_range: 'last-7-days',
    });
    expect(profitRoutePathname('/infx/profit-estimator', params)).toBe(
      '/infx/profit-estimator/deepseek-v4/target/24',
    );
    expect(profitRoutePathname('/infx/inference', params)).toBeNull();
  });

  it('keeps other route values and locale when switching models', () => {
    expect(
      modelRoutePathnameRewrite(
        '/zh/infx/profit-estimator/deepseek-v4/target/24/cache-hit-mode/theoretical',
        Model.Kimi_K3,
      ),
    ).toBe('/zh/infx/profit-estimator/kimi-k3/target/24/cache-hit-mode/theoretical');
  });

  it('swaps the profit basis page and keeps locale, model and route values', () => {
    expect(profitRouteForTab('/infx/profit-estimator', 'profit-estimator-per-gigawatt')).toBe(
      '/infx/profit-estimator-per-gigawatt',
    );
    expect(
      profitRouteForTab(
        '/zh/infx/profit-estimator-per-gigawatt/glm-5-3/target/120/power/modeled',
        'profit-estimator',
      ),
    ).toBe('/zh/infx/profit-estimator/glm-5-3/target/120/power/modeled');
    expect(profitRouteForTab('/infx/profit-estimator/kimi-k3', 'profit-estimator')).toBe(
      '/infx/profit-estimator/kimi-k3',
    );
    expect(profitRouteForTab('/infx/calculator/kimi-k3', 'profit-estimator')).toBeNull();
  });

  it('gives route state priority over conflicting legacy queries', () => {
    const params = profitRouteSearch(
      '/infx/profit-estimator/deepseek-v4/target/24',
      '?c_ivtarget=99&g_model=Kimi-K3&i_pctl=p75',
    );
    expect(params.get('c_ivtarget')).toBe('24');
    expect(params.get('g_model')).toBe(Model.DeepSeek_V4_Pro);
    expect(params.has('i_pctl')).toBe(false);
  });

  it('discards legacy percentiles without changing other dashboards', () => {
    const path = '/infx/profit-estimator/deepseek-v4/target/24/percentile/p75';
    const params = profitRouteSearch(path, '?i_pctl=p50&percentile=p99');
    expect(params.has('i_pctl')).toBe(false);
    expect(params.has('percentile')).toBe(false);
    expect(profitRoutePathname(path, params)).toBe('/infx/profit-estimator/deepseek-v4/target/24');
    expect(profitRouteSearch('/infx/inference', '?i_pctl=p75').get('i_pctl')).toBe('p75');
  });

  it('encodes reserved characters once and rejects malformed route shapes', () => {
    const params = new URLSearchParams({ i_gpus: 'a/b,c%20?d#e' });
    const path = profitRoutePathname('/infx/profit-estimator/kimi-k3', params)!;
    expect(path).toContain('a%2Fb%2Cc%2520%3Fd%23e');
    expect(profitRouteParams(path)?.get('i_gpus')).toBe('a/b,c%20?d#e');
    for (const filters of [
      ['target'],
      ['unknown', '1'],
      ['target', '1', 'target', '2'],
      ['target', ''],
      ['chips', '\n'],
    ])
      expect(parseProfitRouteFilters(filters)).toBeNull();
    expect(profitRouteParams('/infx/profit-estimator/kimi-k3/chips/%broken')).toBeNull();
  });

  it('removes dismissed overlay IDs from the path without losing filters or hash', () => {
    const url = new URL(
      'https://example.com/zh/infx/profit-estimator/kimi-k3/target/24/unofficial-runs/1%2C2?utm_campaign=test#chart',
    );
    setProfitRouteUnofficialRuns(url, ['2']);
    expect(url.pathname).toBe('/zh/infx/profit-estimator/kimi-k3/target/24/unofficial-runs/2');
    setProfitRouteUnofficialRuns(url, []);
    expect(url.pathname).toBe('/zh/infx/profit-estimator/kimi-k3/target/24');
    expect(url.search).toBe('?utm_campaign=test');
    expect(url.hash).toBe('#chart');
  });
});
