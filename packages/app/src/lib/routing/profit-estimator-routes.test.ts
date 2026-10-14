import { describe, expect, it } from 'vitest';

import { Model } from '@/lib/catalog/data-mappings';
import { modelRoutePathnameRewrite } from './model-routes';
import {
  PROFIT_ROUTE_PARAMS,
  parseProfitRouteFilters,
  profitRouteParams,
  profitRoutePathname,
  profitRouteSearch,
  setProfitRouteUnofficialRuns,
} from './profit-estimator-routes';

describe('profit estimator route state', () => {
  for (const prefix of ['', '/zh']) {
    for (const tab of ['profit-estimator', 'profit-estimator-per-gigawatt']) {
      const base = `${prefix}/${tab}/deepseek-v4`;
      it(`round-trips every supported parameter on ${base}`, () => {
        const values = [
          '24.5',
          'p75',
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
        expect(path).toContain(`${base}/target/24.5/percentile/p75`);
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
      i_metric: 'y_tokensPerSecond',
      c_mw: '100',
      r_range: 'last-7-days',
    });
    expect(profitRoutePathname('/profit-estimator', params)).toBe(
      '/profit-estimator/deepseek-v4/target/24',
    );
    expect(profitRoutePathname('/inference', params)).toBeNull();
  });

  it('keeps other route values and locale when switching models', () => {
    expect(
      modelRoutePathnameRewrite(
        '/zh/profit-estimator/deepseek-v4/target/24/percentile/p75',
        Model.Kimi_K3,
      ),
    ).toBe('/zh/profit-estimator/kimi-k3/target/24/percentile/p75');
  });

  it('gives route state priority over conflicting legacy queries', () => {
    const params = profitRouteSearch(
      '/profit-estimator/deepseek-v4/target/24',
      '?c_ivtarget=99&g_model=Kimi-K3&i_pctl=p75',
    );
    expect(params.get('c_ivtarget')).toBe('24');
    expect(params.get('g_model')).toBe(Model.DeepSeek_V4_Pro);
    expect(params.get('i_pctl')).toBe('p75');
  });

  it('encodes reserved characters once and rejects malformed route shapes', () => {
    const params = new URLSearchParams({ i_gpus: 'a/b,c%20?d#e' });
    const path = profitRoutePathname('/profit-estimator/kimi-k3', params)!;
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
    expect(profitRouteParams('/profit-estimator/kimi-k3/chips/%broken')).toBeNull();
  });

  it('removes dismissed overlay IDs from the path without losing filters or hash', () => {
    const url = new URL(
      'https://example.com/zh/profit-estimator/kimi-k3/target/24/unofficial-runs/1%2C2?utm_campaign=test#chart',
    );
    setProfitRouteUnofficialRuns(url, ['2']);
    expect(url.pathname).toBe('/zh/profit-estimator/kimi-k3/target/24/unofficial-runs/2');
    setProfitRouteUnofficialRuns(url, []);
    expect(url.pathname).toBe('/zh/profit-estimator/kimi-k3/target/24');
    expect(url.search).toBe('?utm_campaign=test');
    expect(url.hash).toBe('#chart');
  });
});
