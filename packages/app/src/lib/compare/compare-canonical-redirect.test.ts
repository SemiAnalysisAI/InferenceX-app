import { describe, expect, it } from 'vitest';

import { compareCanonicalRedirectUrl } from './compare-canonical-redirect';

function redirect(path: string): string | null {
  const target = compareCanonicalRedirectUrl(new URL(path, 'https://example.com'));
  return target ? `${target.pathname}${target.search}` : null;
}

describe('compareCanonicalRedirectUrl', () => {
  it('keeps the query string when it normalizes a reversed GPU order', () => {
    expect(
      redirect('/compare/deepseek-r1-h100-vs-gb200?i_seq=1k%2F1k&g_model=DeepSeek-R1-0528'),
    ).toBe('/compare/deepseek-r1-gb200-vs-h100?i_seq=1k%2F1k&g_model=DeepSeek-R1-0528');
  });

  it('keeps any query, not only the comparison selectors', () => {
    expect(
      redirect('/compare/deepseek-r1-h100-vs-gb200?i_metric=y_tpPerGpu&utm_source=x&g_rundate=1'),
    ).toBe('/compare/deepseek-r1-gb200-vs-h100?i_metric=y_tpPerGpu&utm_source=x&g_rundate=1');
  });

  it('leaves a URL without a query to the page, whose own redirect loses nothing', () => {
    expect(redirect('/compare/deepseek-r1-h100-vs-gb200')).toBeNull();
  });

  it('adds the default model to a bare legacy pair slug', () => {
    expect(redirect('/compare/h100-vs-h200?i_seq=1k/1k')).toBe(
      '/compare/deepseek-r1-h100-vs-h200?i_seq=1k%2F1k',
    );
  });

  it('keeps the locale, family and scenario segment', () => {
    expect(redirect('/zh/compare-per-dollar/deepseek-r1-h100-vs-gb200/8K-1K?i_prec=fp8')).toBe(
      '/zh/compare-per-dollar/deepseek-r1-gb200-vs-h100/8k-1k?i_prec=fp8',
    );
  });

  it('normalizes precision and speculative-decoding slugs with their own rules', () => {
    expect(redirect('/compare-precision/deepseek-r1-h100-bf16-vs-fp8?i_seq=8k%2F1k')).toBe(
      '/compare-precision/deepseek-r1-h100-fp8-vs-bf16?i_seq=8k%2F1k',
    );
  });

  it('leaves canonical slugs, case-only variants and unknown pages to the page', () => {
    expect(redirect('/compare/deepseek-r1-gb200-vs-h100?i_seq=1k%2F1k')).toBeNull();
    expect(redirect('/compare/DeepSeek-R1-GB200-vs-H100?i_seq=1k%2F1k')).toBeNull();
    expect(redirect('/compare/not-a-real-pair?i_seq=1k%2F1k')).toBeNull();
    expect(redirect('/compare/deepseek-r1-h100-vs-gb200/bogus?i_seq=1k%2F1k')).toBeNull();
    expect(redirect('/compare?i_seq=1k%2F1k')).toBeNull();
  });
});
