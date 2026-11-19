import { describe, expect, it } from 'vitest';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { getAllChipRouteSlugs } from '@/lib/catalog/chip-pages';
import { parseCompareSlug } from '@/lib/compare/compare-slug';

import { compareChipPageLink, findChipVsPageForPair } from './compare-chip-link';

describe('findChipVsPageForPair', () => {
  it('resolves a pair registered as b200-vs-h200 in either compare order', () => {
    expect(findChipVsPageForPair('b200', 'h200')?.slug).toBe('b200-vs-h200');
    expect(findChipVsPageForPair('h200', 'b200')?.slug).toBe('b200-vs-h200');
  });

  it('resolves a pair registered as b300-vs-b200 in either compare order', () => {
    expect(findChipVsPageForPair('b200', 'b300')?.slug).toBe('b300-vs-b200');
    expect(findChipVsPageForPair('b300', 'b200')?.slug).toBe('b300-vs-b200');
  });

  it('maps HW_REGISTRY keys to chip slugs that differ from them', () => {
    expect(findChipVsPageForPair('b200', 'gb200')?.slug).toBe('gb200-nvl72-vs-b200');
    expect(findChipVsPageForPair('gb200', 'gb300')?.slug).toBe('gb300-nvl72-vs-gb200-nvl72');
  });

  it('returns undefined when no chip page exists for the pair', () => {
    expect(findChipVsPageForPair('h100', 'h200')).toBeUndefined();
    expect(findChipVsPageForPair('b200', 'b200')).toBeUndefined();
    expect(findChipVsPageForPair('b200', 'not-a-gpu')).toBeUndefined();
  });
});

describe('compareChipPageLink', () => {
  it('builds the English link with exact-match anchor text in chip-page order', () => {
    expect(compareChipPageLink('h200', 'b200', 'en')).toEqual({
      slug: 'b200-vs-h200',
      href: '/chips/b200-vs-h200',
      label: 'B200 vs H200: full specs & benchmarks across models',
    });
  });

  it('points zh compare pages at the /zh chip page', () => {
    const link = compareChipPageLink('b200', 'b300', 'zh');
    expect(link?.href).toBe('/zh/chips/b300-vs-b200');
    expect(link?.label).toBe('B300 vs B200：完整规格与各模型基准测试');
  });

  it('returns null when no chip page exists', () => {
    expect(compareChipPageLink('h100', 'h200', 'en')).toBeNull();
    expect(compareChipPageLink('h100', 'h200', 'zh')).toBeNull();
  });

  it('works from a parsed compare slug', () => {
    const parsed = parseCompareSlug('deepseek-r1-b200-vs-b300');
    expect(parsed).not.toBeNull();
    expect(compareChipPageLink(parsed!.a, parsed!.b, 'en')?.href).toBe('/chips/b300-vs-b200');
  });

  it('only ever links to a registered chip route for every hardware pair', () => {
    const routes = new Set(getAllChipRouteSlugs());
    const keys = Object.keys(HW_REGISTRY);
    let linked = 0;
    for (const a of keys) {
      for (const b of keys) {
        for (const locale of ['en', 'zh'] as const) {
          const link = compareChipPageLink(a, b, locale);
          if (!link) continue;
          linked += 1;
          expect(routes.has(link.slug)).toBe(true);
          expect(link.href).toBe(`${locale === 'zh' ? '/zh' : ''}/chips/${link.slug}`);
        }
      }
    }
    expect(linked).toBeGreaterThan(0);
  });
});
