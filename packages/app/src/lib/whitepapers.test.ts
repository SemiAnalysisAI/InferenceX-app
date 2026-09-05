import { describe, expect, it } from 'vitest';

import { OG_IMAGE, SITE_URL } from '@semianalysisai/inferencex-constants';

import { hasZhSibling, switchLocalePath } from './i18n';
import {
  buildWhitepaperBreadcrumbJsonLd,
  buildWhitepaperIndexJsonLd,
  buildWhitepaperJsonLd,
  formatWhitepaperDate,
  getAllWhitepapers,
  getWhitepaper,
  WHITEPAPER_AUTHORS,
  WHITEPAPER_AUTHORS_ZH,
  WHITEPAPER_COPY,
  WHITEPAPERS,
  whitepaperCopy,
  whitepaperDetailMetadata,
  whitepaperDetailPath,
  whitepaperIndexMetadata,
  whitepaperIndexPath,
} from './whitepapers';

const MI355X_SLUG = 'amd-mi355x-32b-revenue-per-gigawatt-kimi-k3';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const HAN = /\p{Script=Han}/u;

describe('whitepaper registry', () => {
  it('has unique, URL-safe slugs and asset paths scoped to the slug', () => {
    const slugs = WHITEPAPERS.map((paper) => paper.slug);
    expect(slugs.length).toBeGreaterThan(0);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const paper of WHITEPAPERS) {
      expect(paper.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      expect(paper.pdfPath.startsWith(`/whitepaper/${paper.slug}/`)).toBe(true);
      expect(paper.pdfPath.endsWith('.pdf')).toBe(true);
      expect(paper.heroImagePath).toBe(`/whitepaper/${paper.slug}/cover.webp`);
      expect(paper.coverImagePath).toBe(paper.heroImagePath);
      expect(paper.chipImagePath.startsWith(`/whitepaper/${paper.slug}/`)).toBe(true);
      expect(paper.chipImageWidth).toBeGreaterThan(paper.chipImageHeight);
      expect(paper.figures.length).toBeGreaterThan(0);
      for (const figure of paper.figures) {
        expect(figure.srcLight.startsWith(`/whitepaper/${paper.slug}/`)).toBe(true);
        expect(figure.srcDark.startsWith(`/whitepaper/${paper.slug}/`)).toBe(true);
        expect(figure.srcLight).not.toBe(figure.srcDark);
        expect(figure.width).toBeGreaterThan(figure.height);
      }
      expect(paper.publishedDate).toMatch(ISO_DATE);
      expect(paper.dataDate).toMatch(ISO_DATE);
      expect(paper.pageCount).toBeGreaterThan(0);
      expect(paper.tags.length).toBeGreaterThan(0);
    }
  });

  it('ships every paper with parallel English and Chinese copy', () => {
    for (const paper of WHITEPAPERS) {
      const { en, zh } = paper;
      expect(en.authors).toBe(WHITEPAPER_AUTHORS);
      expect(zh.authors).toBe(WHITEPAPER_AUTHORS_ZH);
      expect(en.keyFindings.length).toBe(zh.keyFindings.length);
      expect(en.kpis.length).toBe(3);
      expect(zh.kpis.length).toBe(3);
      expect(en.figures.length).toBe(paper.figures.length);
      expect(zh.figures.length).toBe(paper.figures.length);
      expect(en.comparison.items.length).toBe(zh.comparison.items.length);
      expect(en.methodSteps.length).toBe(zh.methodSteps.length);
      expect(en.assumptions.length).toBe(zh.assumptions.length);
      expect(en.sources.length).toBe(zh.sources.length);
      // Headline numbers are locale-independent; the Chinese cards keep them verbatim.
      expect(zh.kpis.map((kpi) => kpi.value)).toEqual(en.kpis.map((kpi) => kpi.value));
      expect(zh.comparison.items.map((item) => item.value)).toEqual(
        en.comparison.items.map((item) => item.value),
      );
      // Chinese copy is real Chinese, English copy carries no Han characters.
      for (const text of [
        zh.title,
        zh.subtitle,
        zh.abstract,
        zh.figureTitle,
        zh.comparison.lead,
        ...zh.keyFindings,
        ...zh.kpis.map((kpi) => kpi.label),
        ...zh.figures.map((figure) => figure.caption),
      ]) {
        expect(text).toMatch(HAN);
      }
      for (const text of [
        en.title,
        en.subtitle,
        en.abstract,
        en.figureTitle,
        en.comparison.lead,
        ...en.keyFindings,
        ...en.kpis.map((kpi) => kpi.label),
        ...en.figures.map((figure) => figure.caption),
      ]) {
        expect(text).not.toMatch(HAN);
      }
      // External sources keep the same destinations; only internal ones may move to /zh.
      for (const [index, source] of en.sources.entries()) {
        const zhHref = zh.sources[index]!.href;
        expect(zhHref.replace(`${SITE_URL}/zh/`, `${SITE_URL}/`)).toBe(source.href);
      }
      expect(JSON.stringify(paper)).not.toMatch(/[—–]/u);
    }
  });

  it('carries the MI355X Kimi K3 executive summary with its headline numbers', () => {
    const paper = getWhitepaper(MI355X_SLUG);
    expect(paper).toBeDefined();
    expect(paper?.publishedDate).toBe('2026-09-04');
    expect(paper?.pageCount).toBe(2);
    expect(paper?.tags).toEqual(['AMD', 'MI355X', 'Kimi K3', 'vLLM', 'AgentX', 'Economics']);
    expect(paper?.pdfPath).toBe(
      `/whitepaper/${MI355X_SLUG}/pdf/SemiAnalysis-InferenceX-Executive-Summary_AMD-MI355X-Revenue-per-Gigawatt-Kimi-K3.pdf`,
    );
    expect(paper?.en.title).toBe(
      'AMD Instinct MI355X Kimi K3 Can Generate Up to $32B of Revenue per GigaWatt per Year',
    );
    expect(paper?.en.kpis.map((kpi) => kpi.value)).toEqual(['$32.6B', '$16.5B', '50.7%']);
    expect(paper?.en.comparison.items.map((item) => item.value)).toEqual([
      '$10.3B',
      '31.5%',
      '$2.45',
    ]);
    expect(paper?.figures.map((figure) => figure.tcoBadge)).toEqual(['MI355X: 1.5', 'MI355X: 3']);
    expect(paper?.chipImageWidth).toBe(1783);
    expect(paper?.chipImageHeight).toBe(1073);
    expect(paper?.chart.tcoSourceHref).toBe('https://semianalysis.com/ai-cloud-tco-model/');
    expect(paper?.en.abstract).toContain('$32.6 billion');
    expect(paper?.zh.abstract).toContain('326 亿美元');
    expect(paper?.en.assumptions.find((row) => row.item === 'Data date')?.value).toBe('2026-09-04');
    expect(getWhitepaper('missing-paper')).toBeUndefined();
  });

  it('sorts newest first and resolves locale copy and paths', () => {
    const papers = getAllWhitepapers();
    for (let index = 1; index < papers.length; index += 1) {
      expect(papers[index - 1]!.publishedDate >= papers[index]!.publishedDate).toBe(true);
    }
    const paper = getWhitepaper(MI355X_SLUG)!;
    expect(whitepaperCopy(paper, 'en')).toBe(paper.en);
    expect(whitepaperCopy(paper, 'zh')).toBe(paper.zh);
    expect(whitepaperIndexPath('en')).toBe('/whitepaper');
    expect(whitepaperIndexPath('zh')).toBe('/zh/whitepaper');
    expect(whitepaperDetailPath(MI355X_SLUG, 'en')).toBe(`/whitepaper/${MI355X_SLUG}`);
    expect(whitepaperDetailPath(MI355X_SLUG, 'zh')).toBe(`/zh/whitepaper/${MI355X_SLUG}`);
    expect(formatWhitepaperDate('2026-09-04', 'en')).toBe('September 4, 2026');
    expect(formatWhitepaperDate('2026-09-04', 'zh')).toBe('2026年9月4日');
  });

  it('is registered for the header locale toggle', () => {
    expect(hasZhSibling('/whitepaper')).toBe(true);
    expect(hasZhSibling(`/whitepaper/${MI355X_SLUG}`)).toBe(true);
    expect(switchLocalePath(`/whitepaper/${MI355X_SLUG}`)).toBe(`/zh/whitepaper/${MI355X_SLUG}`);
    expect(switchLocalePath(`/zh/whitepaper/${MI355X_SLUG}`)).toBe(`/whitepaper/${MI355X_SLUG}`);
  });

  it('keeps the page chrome dictionary aligned across locales', () => {
    expect(Object.keys(WHITEPAPER_COPY.zh).toSorted()).toEqual(
      Object.keys(WHITEPAPER_COPY.en).toSorted(),
    );
    expect(WHITEPAPER_COPY.en.pages(2)).toBe('2 pages');
    expect(WHITEPAPER_COPY.zh.pages(2)).toBe('共 2 页');
  });
});

describe('whitepaper metadata locale pairing', () => {
  it('pairs the English and Chinese index canonicals and hreflang values', () => {
    const en = whitepaperIndexMetadata('en');
    const zh = whitepaperIndexMetadata('zh');
    expect(en.alternates).toEqual({
      canonical: `${SITE_URL}/whitepaper`,
      languages: {
        en: `${SITE_URL}/whitepaper`,
        'zh-CN': `${SITE_URL}/zh/whitepaper`,
        'x-default': `${SITE_URL}/whitepaper`,
      },
    });
    expect(zh.alternates).toEqual({
      canonical: `${SITE_URL}/zh/whitepaper`,
      languages: en.alternates?.languages,
    });
    expect(en.title).toBe('Whitepapers');
    expect(zh.title).toBe('白皮书');
    expect(zh.openGraph).toMatchObject({ locale: 'zh_CN', url: `${SITE_URL}/zh/whitepaper` });
    expect(en.openGraph).toMatchObject({ locale: 'en_US', url: `${SITE_URL}/whitepaper` });
  });

  it('localizes detail metadata while reusing the site OG image', () => {
    const en = whitepaperDetailMetadata(MI355X_SLUG, 'en');
    const zh = whitepaperDetailMetadata(MI355X_SLUG, 'zh');
    const enPath = `/whitepaper/${MI355X_SLUG}`;
    expect(en.alternates).toEqual({
      canonical: `${SITE_URL}${enPath}`,
      languages: {
        en: `${SITE_URL}${enPath}`,
        'zh-CN': `${SITE_URL}/zh${enPath}`,
        'x-default': `${SITE_URL}${enPath}`,
      },
    });
    expect(zh.alternates).toEqual({
      canonical: `${SITE_URL}/zh${enPath}`,
      languages: en.alternates?.languages,
    });
    expect(en.title).toEqual({
      absolute:
        'AMD Instinct MI355X Kimi K3 Can Generate Up to $32B of Revenue per GigaWatt per Year | InferenceX',
    });
    expect(String((zh.title as { absolute: string }).absolute)).toMatch(HAN);
    expect(en.authors).toEqual([{ name: WHITEPAPER_AUTHORS }]);
    expect(zh.authors).toEqual([{ name: WHITEPAPER_AUTHORS_ZH }]);
    expect(en.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2026-09-04T00:00:00Z',
      images: [{ url: OG_IMAGE }],
    });
    expect(zh.openGraph).toMatchObject({ locale: 'zh_CN', url: `${SITE_URL}/zh${enPath}` });
    expect(whitepaperDetailMetadata('missing-paper', 'en')).toEqual({});
  });
});

describe('whitepaper JSON-LD', () => {
  const paper = getWhitepaper(MI355X_SLUG)!;

  it('describes the paper as a Report authored by the InferenceX team with the PDF encoding', () => {
    const en = buildWhitepaperJsonLd(paper, 'en') as Record<string, unknown>;
    expect(en).toMatchObject({
      '@type': 'Report',
      inLanguage: 'en',
      datePublished: '2026-09-04',
      numberOfPages: 2,
      author: { '@type': 'Organization', name: WHITEPAPER_AUTHORS },
      image: `${SITE_URL}${paper.heroImagePath}`,
      encoding: { encodingFormat: 'application/pdf', contentUrl: `${SITE_URL}${paper.pdfPath}` },
    });
    const zh = buildWhitepaperJsonLd(paper, 'zh') as Record<string, unknown>;
    expect(zh).toMatchObject({
      inLanguage: 'zh-CN',
      url: `${SITE_URL}/zh/whitepaper/${MI355X_SLUG}`,
      headline: paper.zh.title,
      // Organization attribution stays the English legal name in both locales.
      author: { name: WHITEPAPER_AUTHORS },
    });
  });

  it('builds breadcrumb and collection JSON-LD per locale', () => {
    expect(buildWhitepaperBreadcrumbJsonLd(paper, 'zh')).toMatchObject({
      itemListElement: [
        { position: 1, name: '白皮书', item: `${SITE_URL}/zh/whitepaper` },
        { position: 2, name: paper.zh.title, item: `${SITE_URL}/zh/whitepaper/${MI355X_SLUG}` },
      ],
    });
    const index = buildWhitepaperIndexJsonLd('en') as { hasPart: { url: string }[] };
    expect(index.hasPart.map((part) => part.url)).toContain(
      `${SITE_URL}/whitepaper/${MI355X_SLUG}`,
    );
  });
});
