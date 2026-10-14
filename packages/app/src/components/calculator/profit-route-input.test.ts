import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('404');
  },
  permanentRedirect: (url: string) => {
    throw new Error(`308 ${url}`);
  },
}));

import { profitRouteInput } from './profit-route-input';
import { resolveCalculatorUrlSeed } from './url-seed';

describe('profit route server input', () => {
  for (const tab of ['profit-estimator', 'profit-estimator-per-gigawatt'] as const) {
    for (const zh of [false, true]) {
      it(`seeds the path model and target for ${zh ? 'zh' : 'en'} ${tab}`, async () => {
        const { searchParams } = await profitRouteInput(tab, zh, {
          params: Promise.resolve({
            model: 'deepseek-v4',
            filters: ['target', '24'],
          }),
          searchParams: Promise.resolve({ g_model: 'Kimi-K3', c_ivtarget: '99' }),
        });
        expect(resolveCalculatorUrlSeed(searchParams)).toMatchObject({
          model: 'DeepSeek-V4-Pro',
          profitTarget: 24,
        });
        expect(resolveCalculatorUrlSeed(searchParams).percentile).toBeUndefined();
      });

      it(`redirects legacy percentiles away for ${zh ? 'zh' : 'en'} ${tab}`, async () => {
        const base = `${zh ? '/zh' : ''}/${tab}/deepseek-v4/target/24`;
        for (const query of [{}, { i_pctl: 'p75' }, { percentile: 'p50' }]) {
          await expect(
            profitRouteInput(tab, zh, {
              params: Promise.resolve({
                model: 'deepseek-v4',
                filters: ['target', '24', 'percentile', 'p75'],
              }),
              searchParams: Promise.resolve(query),
            }),
          ).rejects.toThrow(`308 ${base}`);
        }
        await expect(
          profitRouteInput(tab, zh, {
            params: Promise.resolve({ model: 'deepseek-v4', filters: ['target', '24'] }),
            searchParams: Promise.resolve({ i_pctl: 'p75', utm_campaign: 'test' }),
          }),
        ).rejects.toThrow(`308 ${base}?utm_campaign=test`);
      });
    }
  }

  it('preserves route filters and query context when canonicalizing an alias', async () => {
    await expect(
      profitRouteInput('profit-estimator', true, {
        params: Promise.resolve({ model: 'DeepSeek-V4', filters: ['target', '24'] }),
        searchParams: Promise.resolve({ utm_campaign: 'test' }),
      }),
    ).rejects.toThrow('308 /zh/profit-estimator/deepseek-v4/target/24?utm_campaign=test');
  });

  it('rejects unsupported models and malformed filters', async () => {
    for (const params of [
      { model: 'deepseek-r1', filters: ['target', '24'] },
      { model: 'deepseek-v4', filters: ['unknown', '24'] },
      { model: 'deepseek-v4', filters: ['target'] },
    ]) {
      await expect(
        profitRouteInput('profit-estimator', false, {
          params: Promise.resolve(params),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow('404');
    }
  });
});
