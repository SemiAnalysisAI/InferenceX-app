import { describe, expect, it } from 'vitest';

import { INFERENCE_MODEL_SLUGS } from './inference-model-slug';
import { powerXRedirectUrl } from './powerx-redirect';

const redirect = (path: string) =>
  powerXRedirectUrl(new URL(path, 'https://inferencex.test'))
    ?.toString()
    .replace('https://inferencex.test', '') ?? null;

describe('powerXRedirectUrl', () => {
  it('opens PowerX with the same filters for an old power link', () => {
    expect(redirect('/inference?g_model=DeepSeek-R1-0528&i_metric=y_measuredAvgPower')).toBe(
      '/powerx?g_model=DeepSeek-R1-0528&i_metric=y_measuredAvgPower',
    );
  });

  it('keeps all four boundaries of an old boundary compare', () => {
    expect(redirect('/zh/inference?i_metric=y_measuredJPerOutputToken&i_pcompare=boundaries')).toBe(
      '/zh/powerx?i_metric=y_measuredJPerOutputToken&i_pcompare=all',
    );
  });

  it('carries the model of a model route', () => {
    const [entry] = INFERENCE_MODEL_SLUGS;
    const target = new URL(
      redirect(`/inference/${entry.slug}?i_metric=y_measuredAvgPower`)!,
      'https://inferencex.test',
    );
    expect(target.pathname).toBe('/powerx');
    expect(target.searchParams.get('g_model')).toBe(entry.model);
  });

  it('opens PowerX for a power-tier link with no metric, as it used to chart power', () => {
    expect(redirect('/inference?i_power=certified')).toBe('/powerx?i_power=certified');
    expect(redirect('/inference?i_metric=y_tokensPerDollarH&i_power=certified')).toBe(null);
    expect(redirect('/inference?i_power=bogus')).toBe(null);
  });

  it('leaves non-power links and other pages alone', () => {
    expect(redirect('/inference?i_metric=y_tpPerGpu')).toBe(null);
    expect(redirect('/inference')).toBe(null);
    expect(redirect('/compare/b200-vs-h200?i_metric=y_measuredAvgPower')).toBe(null);
    expect(redirect('/inference/not-a-model?i_metric=y_measuredAvgPower')).toBe(null);
    expect(redirect('/powerx?i_metric=y_measuredAvgPower')).toBe(null);
  });
});
