import fs from 'node:fs';
import nodePath from 'node:path';

import { describe, expect, it } from 'vitest';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { DASHBOARD_ROUTES } from './dashboard-routes';

import {
  enAlternates,
  hasZhSibling,
  isZhPathname,
  languageAlternates,
  localePath,
  switchLocalePath,
  zhAlternates,
  zhPath,
} from './i18n';
import { findRoutePairViolations } from './zh-objective-guard';

const APP_ROUTER_DIR = nodePath.resolve(import.meta.dirname, '..', 'app');
const APP_DIR = nodePath.resolve(APP_ROUTER_DIR, '..', '..');

function pageFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = nodePath.join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(full);
    return entry.name === 'page.tsx' ? [nodePath.relative(APP_DIR, full)] : [];
  });
}

describe('actual App Router Chinese sibling coverage', () => {
  const pages = pageFiles(APP_ROUTER_DIR);

  it('discovers both locale roots and the Chinese-only fallback', () => {
    expect(pages).toEqual(
      expect.arrayContaining([
        'src/app/(landing)/page.tsx',
        'src/app/zh/page.tsx',
        'src/app/zh/[...notFound]/page.tsx',
      ]),
    );
  });

  it('pairs every English page with a Chinese page in both directions', () => {
    expect(
      findRoutePairViolations(pages, {
        chineseOnly: new Set(['/[...notFound]']),
      }),
    ).toEqual([]);
  });
});

describe('zhPath', () => {
  it('maps the root to /zh without a trailing slash', () => {
    expect(zhPath('/')).toBe('/zh');
  });

  it('prefixes non-root paths', () => {
    expect(zhPath('/blog')).toBe('/zh/blog');
    expect(zhPath('/blog/some-post')).toBe('/zh/blog/some-post');
  });
});

describe('localePath', () => {
  it('keeps English paths and prefixes Chinese paths', () => {
    expect(localePath('/about', 'en')).toBe('/about');
    expect(localePath('/about', 'zh')).toBe('/zh/about');
    expect(localePath('/', 'zh')).toBe('/zh');
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
    expect(hasZhSibling('/overview')).toBe(true);
    expect(hasZhSibling('/about')).toBe(true);
    expect(hasZhSibling('/collectivex')).toBe(true);
  });

  it.each(DASHBOARD_ROUTES.filter((route) => route.localeMirrored))(
    'derives the mirrored dashboard route "$path" from the canonical registry',
    ({ path }) => {
      expect(hasZhSibling(path)).toBe(true);
    },
  );

  it('matches blog and compare child paths', () => {
    expect(hasZhSibling('/blog/some-post')).toBe(true);
    expect(hasZhSibling('/compare')).toBe(true);
    expect(hasZhSibling('/compare/deepseek-r1-h100-vs-h200')).toBe(true);
    expect(hasZhSibling('/compare-per-dollar/deepseek-r1-h100-vs-h200')).toBe(true);
    expect(hasZhSibling('/compare-precision')).toBe(true);
    expect(hasZhSibling('/compare-precision/deepseek-r1-h100-fp8-vs-bf16')).toBe(true);
    expect(hasZhSibling('/compare-spec-decode')).toBe(true);
    expect(hasZhSibling('/compare-spec-decode/deepseek-r1-h100-mtp-vs-none')).toBe(true);
    expect(hasZhSibling('/embed/model/deepseek-v4')).toBe(true);
  });

  it('matches the model index and model detail pages', () => {
    expect(hasZhSibling('/model')).toBe(true);
    expect(hasZhSibling('/model/deepseek-r1')).toBe(true);
  });

  it('matches datasets, gated tabs, and agentic detail pages', () => {
    expect(hasZhSibling('/agentx')).toBe(true);
    expect(hasZhSibling('/agentx/some-set/conversations/abc123')).toBe(true);
    expect(hasZhSibling('/ai-chart')).toBe(true);
    expect(hasZhSibling('/current-inferencex-image')).toBe(true);
    expect(hasZhSibling('/feedback')).toBe(true);
    expect(hasZhSibling('/inference/agentic/42')).toBe(true);
  });

  it('rejects unknown routes', () => {
    expect(hasZhSibling('/nonexistent')).toBe(false);
  });
});

describe('switchLocalePath', () => {
  it('switches English pages to their zh sibling', () => {
    expect(switchLocalePath('/')).toBe('/zh');
    expect(switchLocalePath('/inference')).toBe('/zh/inference');
    expect(switchLocalePath('/collectivex')).toBe('/zh/collectivex');
    expect(switchLocalePath('/overview')).toBe('/zh/overview');
    expect(switchLocalePath('/blog/some-post')).toBe('/zh/blog/some-post');
  });

  it('switches zh pages back to English', () => {
    expect(switchLocalePath('/zh')).toBe('/');
    expect(switchLocalePath('/zh/quotes')).toBe('/quotes');
    expect(switchLocalePath('/zh/collectivex')).toBe('/collectivex');
    expect(switchLocalePath('/zh/overview')).toBe('/overview');
    expect(switchLocalePath('/zh/blog/some-post')).toBe('/blog/some-post');
  });

  it('switches compare slug pages within the language trees', () => {
    expect(switchLocalePath('/compare/foo-vs-bar')).toBe('/zh/compare/foo-vs-bar');
    expect(switchLocalePath('/zh/compare-per-dollar/foo-vs-bar')).toBe(
      '/compare-per-dollar/foo-vs-bar',
    );
    expect(switchLocalePath('/compare-precision/deepseek-r1-h100-fp8-vs-bf16')).toBe(
      '/zh/compare-precision/deepseek-r1-h100-fp8-vs-bf16',
    );
    expect(switchLocalePath('/zh/compare-precision/deepseek-r1-h100-fp8-vs-bf16')).toBe(
      '/compare-precision/deepseek-r1-h100-fp8-vs-bf16',
    );
    expect(switchLocalePath('/compare-spec-decode/deepseek-r1-h100-mtp-vs-none')).toBe(
      '/zh/compare-spec-decode/deepseek-r1-h100-mtp-vs-none',
    );
    expect(switchLocalePath('/zh/compare-spec-decode/deepseek-r1-h100-mtp-vs-none')).toBe(
      '/compare-spec-decode/deepseek-r1-h100-mtp-vs-none',
    );
  });

  it('switches datasets pages within the language trees', () => {
    expect(switchLocalePath('/agentx')).toBe('/zh/agentx');
    expect(switchLocalePath('/zh/agentx/some-set')).toBe('/agentx/some-set');
  });

  it('switches model pages within the language trees', () => {
    expect(switchLocalePath('/model')).toBe('/zh/model');
    expect(switchLocalePath('/model/deepseek-r1')).toBe('/zh/model/deepseek-r1');
    expect(switchLocalePath('/zh/model/deepseek-r1')).toBe('/model/deepseek-r1');
  });

  it('falls back to the other homepage for unmirrored paths', () => {
    expect(switchLocalePath('/some-unknown-route')).toBe('/zh');
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
