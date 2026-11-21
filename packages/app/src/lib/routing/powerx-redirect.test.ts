import { describe, expect, it } from 'bun:test';

import { INFERENCE_MODEL_SLUGS } from './inference-model-slug';
import { powerXRedirectUrl } from './powerx-redirect';

const redirect = (path: string) =>
  powerXRedirectUrl(new URL(path, 'https://inferencex.test'))
    ?.toString()
    .replace('https://inferencex.test', '') ?? null;

describe('powerXRedirectUrl', () => {
  it('keeps all four boundaries of an old boundary compare', () => {
    expect(
      redirect('/zh/infx/inference?i_metric=y_measuredJPerOutputToken&i_pcompare=boundaries'),
    ).toBe('/zh/pwx?i_metric=y_measuredJPerOutputToken&i_pcompare=all');
  });

  it('carries the model of a model route', () => {
    const [entry] = INFERENCE_MODEL_SLUGS;
    const target = new URL(
      redirect(`/infx/inference/${entry.slug}?i_metric=y_measuredAvgPower`)!,
      'https://inferencex.test',
    );
    expect(target.pathname).toBe('/pwx');
    expect(target.searchParams.get('g_model')).toBe(entry.model);
  });

  it('opens PowerX for a power-tier link with no metric, on the power chart it used to open', () => {
    expect(redirect('/infx/inference?i_power=certified')).toBe(
      '/pwx?i_power=certified&i_metric=y_measuredAvgPower',
    );
    expect(redirect('/infx/inference?i_metric=y_tokensPerDollarH&i_power=certified')).toBe(null);
    expect(redirect('/infx/inference?i_power=bogus')).toBe(null);
  });

  it('leaves non-power links and other pages alone', () => {
    expect(redirect('/infx/inference?i_metric=y_tpPerGpu')).toBe(null);
    expect(redirect('/infx/inference')).toBe(null);
    expect(redirect('/compare/b200-vs-h200?i_metric=y_measuredAvgPower')).toBe(null);
    expect(redirect('/infx/inference/not-a-model?i_metric=y_measuredAvgPower')).toBe(null);
    expect(redirect('/pwx?i_metric=y_measuredAvgPower')).toBe(null);
  });

  it.each([
    ['i_metric=y_measuredAvgPower&i_pcompare=roles', 'y_measuredAvgPower', 'breakdown', 'split'],
    ['i_metric=y_measuredPrefillAvgPower', 'y_measuredAvgPower', null, 'prefill'],
    ['i_metric=y_measuredDecodeAvgPower', 'y_measuredAvgPower', null, 'decode'],
    ['i_metric=y_measuredPrefillJPerInputToken', 'y_measuredJPerInputToken', null, 'prefill'],
    ['i_metric=y_measuredDecodeJPerOutputToken', 'y_measuredJPerOutputToken', null, 'decode'],
  ])('moves the GPU role of an old link (%s) onto i_role', (query, metric, compare, role) => {
    const target = new URL(redirect(`/infx/inference?${query}`)!, 'https://inferencex.test');
    expect(target.pathname).toBe('/pwx');
    expect(target.searchParams.get('i_metric')).toBe(metric);
    expect(target.searchParams.get('i_pcompare')).toBe(compare);
    expect(target.searchParams.get('i_role')).toBe(role);
  });

  it('keeps an explicit i_role over the role an old metric implied', () => {
    const target = new URL(
      redirect('/infx/inference?i_metric=y_measuredPrefillAvgPower&i_role=split')!,
      'https://inferencex.test',
    );
    expect(target.searchParams.get('i_role')).toBe('split');
    expect(target.searchParams.get('i_metric')).toBe('y_measuredAvgPower');
  });
});
