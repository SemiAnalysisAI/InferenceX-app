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
import { calculatorUrlSeed } from './url-seed';

describe('profit route input', () => {
  for (const tab of ['profit-estimator', 'profit-estimator-per-gigawatt'] as const) {
    for (const zh of [false, true]) {
      const locale = zh ? '/zh' : '';

      it(`seeds the path model and target over the query for ${locale || 'en'} ${tab}`, () => {
        const seed = calculatorUrlSeed(
          `${locale}/infx/${tab}/deepseek-v4/target/24`,
          '?g_model=Kimi-K3&c_ivtarget=99&i_pctl=p75',
          undefined,
        );
        expect(seed).toMatchObject({ model: 'DeepSeek-V4-Pro', profitTarget: 24 });
        expect(seed.percentile).toBeUndefined();
      });

      it(`redirects a legacy percentile segment away for ${locale || 'en'} ${tab}`, async () => {
        await expect(
          profitRouteInput(
            tab,
            zh,
            Promise.resolve({
              model: 'deepseek-v4',
              filters: ['target', '24', 'percentile', 'p75'],
            }),
          ),
        ).rejects.toThrow(`308 ${locale}/infx/${tab}/deepseek-v4/target/24`);
      });
    }
  }

  it('canonicalizes an alias with its route filters', async () => {
    await expect(
      profitRouteInput(
        'profit-estimator',
        true,
        Promise.resolve({ model: 'DeepSeek-V4', filters: ['target', '24'] }),
      ),
    ).rejects.toThrow('308 /zh/infx/profit-estimator/deepseek-v4/target/24');
  });

  it('rejects unsupported models and malformed filters', async () => {
    for (const params of [
      { model: 'deepseek-r1', filters: ['target', '24'] },
      { model: 'deepseek-v4', filters: ['unknown', '24'] },
      { model: 'deepseek-v4', filters: ['target'] },
    ]) {
      await expect(
        profitRouteInput('profit-estimator', false, Promise.resolve(params)),
      ).rejects.toThrow('404');
    }
  });
});
