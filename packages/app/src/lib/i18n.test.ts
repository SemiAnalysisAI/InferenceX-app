import { describe, expect, it } from 'vitest';

import { SITE_URL } from '@semianalysisai/inferencex-constants';

import {
  enAlternates,
  hasZhSibling,
  isZhPathname,
  languageAlternates,
  switchLocalePath,
  zhAlternates,
  zhPath,
} from './i18n';

describe('zhPath', () => {
  it('maps the root to /zh without a trailing slash', () => {
    expect(zhPath('/')).toBe('/zh');
  });

  it('prefixes non-root paths', () => {
    expect(zhPath('/blog')).toBe('/zh/blog');
    expect(zhPath('/blog/some-post')).toBe('/zh/blog/some-post');
  });
});

describe('isZhPathname', () => {
  it('matches the zh root and zh children', () => {
    expect(isZhPathname('/zh')).toBe(true);
    expect(isZhPathname('/zh/inference')).toBe(true);
  });

  it('does not match English paths or lookalikes', () => {
    expect(isZhPathname('/')).toBe(false);
    expect(isZhPathname('/inference')).toBe(false);
    expect(isZhPathname('/zhejiang')).toBe(false);
  });
});

describe('hasZhSibling', () => {
  it('matches mirrored exact routes', () => {
    expect(hasZhSibling('/')).toBe(true);
    expect(hasZhSibling('/inference')).toBe(true);
    expect(hasZhSibling('/about')).toBe(true);
  });

  it('matches blog and compare child paths', () => {
    expect(hasZhSibling('/blog/some-post')).toBe(true);
    expect(hasZhSibling('/compare')).toBe(true);
    expect(hasZhSibling('/compare/deepseek-r1-h100-vs-h200')).toBe(true);
    expect(hasZhSibling('/compare-per-dollar/deepseek-r1-h100-vs-h200')).toBe(true);
  });

  it('rejects unmirrored routes', () => {
    expect(hasZhSibling('/datasets')).toBe(false);
    expect(hasZhSibling('/feedback')).toBe(false);
  });
});

describe('switchLocalePath', () => {
  it('switches English pages to their zh sibling', () => {
    expect(switchLocalePath('/')).toBe('/zh');
    expect(switchLocalePath('/inference')).toBe('/zh/inference');
    expect(switchLocalePath('/blog/some-post')).toBe('/zh/blog/some-post');
  });

  it('switches zh pages back to English', () => {
    expect(switchLocalePath('/zh')).toBe('/');
    expect(switchLocalePath('/zh/quotes')).toBe('/quotes');
    expect(switchLocalePath('/zh/blog/some-post')).toBe('/blog/some-post');
  });

  it('switches compare slug pages within the language trees', () => {
    expect(switchLocalePath('/compare/foo-vs-bar')).toBe('/zh/compare/foo-vs-bar');
    expect(switchLocalePath('/zh/compare-per-dollar/foo-vs-bar')).toBe(
      '/compare-per-dollar/foo-vs-bar',
    );
  });

  it('falls back to the other homepage for unmirrored paths', () => {
    expect(switchLocalePath('/datasets')).toBe('/zh');
    expect(switchLocalePath('/zh/unknown-page')).toBe('/');
  });
});

describe('languageAlternates', () => {
  it('links both languages with English as x-default', () => {
    expect(languageAlternates('/about')).toEqual({
      en: `${SITE_URL}/about`,
      'zh-CN': `${SITE_URL}/zh/about`,
      'x-default': `${SITE_URL}/about`,
    });
  });

  it('uses the bare site URL for the root path', () => {
    const alternates = languageAlternates('/');
    expect(alternates.en).toBe(SITE_URL);
    expect(alternates['zh-CN']).toBe(`${SITE_URL}/zh`);
  });
});

describe('enAlternates / zhAlternates', () => {
  it('canonicalizes each side to its own URL with a shared language set', () => {
    const en = enAlternates('/quotes');
    const zh = zhAlternates('/quotes');
    expect(en.canonical).toBe(`${SITE_URL}/quotes`);
    expect(zh.canonical).toBe(`${SITE_URL}/zh/quotes`);
    expect(en.languages).toEqual(zh.languages);
  });
});
