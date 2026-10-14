import { createHash } from 'node:crypto';

import type { Metadata } from 'next';

import { FAQ_ITEMS } from '@/components/about/faq-data';
import { FAQ_ITEMS_ZH } from '@/components/about/faq-data-zh';
import type { FaqItem } from '@/components/about/faq';
import { CHIP_PAGE_STRINGS, chipSpecRows } from '@/components/chips/chip-page-sections';
import {
  getLocalizedFrameworks,
  getOptimizationsOverview,
} from '@/lib/agentx/agentx-optimizations-zh';
import type { OptimizationSection } from '@/lib/agentx/agentx-optimizations';
import { blogDescription, getAllPosts, getPostBySlug } from '@/lib/blog/blog';
import {
  buildChipFaq,
  buildChipVsFaq,
  buildChipVsHighlights,
  CHIP_VS_HIGHLIGHT_LABELS_EN,
  type ChipPageEntry,
  getAllChipPages,
  getAllChipVsPages,
} from '@/lib/catalog/chip-pages';
import {
  buildZhChipFaq,
  buildZhChipVsFaq,
  CHIP_VS_HIGHLIGHT_LABELS_ZH,
  getZhChipTranslation,
  localizeVsHighlightValueZh,
} from '@/lib/catalog/chip-pages-zh';
import { getModelPageSlugs } from '@/lib/catalog/model-pages';
import { getLocalizedModelPage } from '@/lib/catalog/model-pages-zh';
import { type GlossaryEntry, getAllGlossaryEntries } from '@/lib/content/glossary';
import { getAllZhGlossaryEntries } from '@/lib/content/glossary-zh';
import {
  getAllWhitepapers,
  WHITEPAPER_COPY,
  whitepaperCopy,
  whitepaperDetailPath,
} from '@/lib/content/whitepapers';
import { type Locale, zhPath } from '@/lib/i18n/i18n';
import {
  getAllRankingPageEntries,
  rankingPageDescription,
  rankingPageHeading,
  rankingPagePath,
} from '@/lib/live-seo/rankings';
import { rankingPageDescriptionZh, rankingPageHeadingZh } from '@/lib/live-seo/rankings-zh';
import { DASHBOARD_ROUTES } from '@/lib/routing/dashboard-routes';
import { inferenceModelMeta, inferenceModelMetaZh } from '@/lib/routing/inference-model-meta';
import { INFERENCE_MODEL_SLUGS } from '@/lib/routing/inference-model-slug';
import { LANDING_META, TAB_META } from '@/lib/routing/tab-meta';
import { LANDING_META_ZH, TAB_META_ZH } from '@/lib/routing/tab-meta-zh';

import { cleanPageTitle, MAX_SECTION_CHARS, MAX_SECTIONS_PER_PAGE } from './extract';
import {
  type IndexedPage,
  type IndexedSection,
  SEARCH_INDEX_LOCALES,
  SEARCH_INDEX_SCHEMA,
  type SearchIndexFile,
  type SearchIndexManifest,
  searchIndexFilePath,
} from './index-format';
import { mdxToSections } from './mdx-text';

/**
 * Build-time site search index.
 *
 * Every page is produced from the same content registries its route renders
 * from (MDX articles, glossary, chip catalog, whitepapers, AgentX
 * optimizations, dashboard metadata), never from fetched HTML. Pages whose
 * prose lives in JSX contribute their own exported metadata, so titles and
 * summaries cannot drift from the page.
 *
 * Each English page may have a Chinese variant. The `en` file holds English
 * pages; the `zh` file holds the Chinese variant where one exists and the
 * English page otherwise, mirroring how the header links a `/zh` session.
 */

interface PageVariant {
  url: string;
  title: string;
  coverage: IndexedPage['coverage'];
  sections: IndexedSection[];
}

interface SourcePage {
  /** English canonical path. */
  path: string;
  en: PageVariant;
  /** Present only when the `/zh` route actually renders this page. */
  zh?: PageVariant;
}

function clean(text: string): string {
  return text.replaceAll(/\s+/gu, ' ').trim();
}

function section(text: string, heading?: string, anchor?: string): IndexedSection {
  return {
    ...(anchor ? { anchor } : {}),
    ...(heading ? { heading } : {}),
    text: clean(text).slice(0, MAX_SECTION_CHARS),
  };
}

function nonEmpty(sections: readonly IndexedSection[]): IndexedSection[] {
  return sections.filter((entry) => entry.text || entry.heading).slice(0, MAX_SECTIONS_PER_PAGE);
}

function summaryVariant(url: string, title: string, description: string): PageVariant {
  return { url, title, coverage: 'summary', sections: [section(description)] };
}

// ---------------------------------------------------------------------------
// Articles: blog posts and model pages (MDX)
// ---------------------------------------------------------------------------

function blogPages(): SourcePage[] {
  const zhSlugs = new Set(getAllPosts('zh').map((post) => post.slug));
  return getAllPosts('en').map((post) => {
    const variant = (locale: Locale): PageVariant | undefined => {
      const loaded = getPostBySlug(post.slug, locale);
      if (!loaded) return undefined;
      const { meta, raw } = loaded;
      const url = locale === 'zh' ? `/zh/blog/${post.slug}` : `/blog/${post.slug}`;
      return {
        url,
        title: meta.title,
        coverage: 'full',
        sections: nonEmpty([
          section([blogDescription(meta), meta.subtitle].filter(Boolean).join(' ')),
          ...mdxToSections(raw),
        ]),
      };
    };
    return {
      path: `/blog/${post.slug}`,
      en: variant('en')!,
      zh: zhSlugs.has(post.slug) ? variant('zh') : undefined,
    };
  });
}

function modelPages(): SourcePage[] {
  return getModelPageSlugs().flatMap((slug) => {
    const variant = (locale: Locale): PageVariant | undefined => {
      const page = getLocalizedModelPage(slug, locale);
      if (!page) return undefined;
      return {
        url: locale === 'zh' ? `/zh/model/${slug}` : `/model/${slug}`,
        title: page.meta.title,
        coverage: 'full',
        sections: nonEmpty([
          section(`${page.meta.description} ${page.meta.developer}`),
          ...mdxToSections(page.raw),
        ]),
      };
    };
    const en = variant('en');
    return en ? [{ path: `/model/${slug}`, en, zh: variant('zh') }] : [];
  });
}

// ---------------------------------------------------------------------------
// Reference content: glossary, chips, whitepapers, AgentX optimizations, FAQ
// ---------------------------------------------------------------------------

/** Section labels as rendered by `app/(zh/)glossary/[slug]/page.tsx`. */
const GLOSSARY_LABELS = {
  en: {
    plain: 'In plain English',
    plainAnchor: 'plain-english-heading',
    definition: 'Technical definition',
    explanation: 'Engineering details',
    significance: 'Why it matters',
    benchmark: 'How to read it in InferenceX',
  },
  zh: {
    plain: '先用大白话',
    plainAnchor: 'plain-language-heading',
    definition: '技术定义',
    explanation: '工程细节',
    significance: '为什么重要',
    benchmark: '如何在 InferenceX 中解读',
  },
} as const;

function glossaryVariant(entry: GlossaryEntry, locale: Locale): PageVariant {
  const labels = GLOSSARY_LABELS[locale];
  const names = [entry.abbreviation, ...(entry.aliases ?? [])].filter(Boolean).join(' ');
  const measurement = entry.measurement
    ? `${entry.measurement.label} ${entry.measurement.value}`
    : '';
  return {
    url: `${locale === 'zh' ? '/zh' : ''}/glossary/${entry.slug}`,
    title: entry.term,
    coverage: 'full',
    sections: nonEmpty([
      section(`${names} ${entry.plainEnglish}`, labels.plain, labels.plainAnchor),
      section(
        `${entry.definition} ${measurement}`,
        labels.definition,
        'technical-definition-heading',
      ),
      section(entry.explanation, labels.explanation, 'engineering-details'),
      section(entry.significance, labels.significance, 'why-it-matters'),
      section(entry.benchmarkContext, labels.benchmark, 'reading-inferencex'),
    ]),
  };
}

function glossaryPages(): SourcePage[] {
  const zh = new Map(getAllZhGlossaryEntries().map((entry) => [entry.slug, entry]));
  return getAllGlossaryEntries().map((entry) => {
    const zhEntry = zh.get(entry.slug);
    return {
      path: `/glossary/${entry.slug}`,
      en: glossaryVariant(entry, 'en'),
      zh: zhEntry ? glossaryVariant(zhEntry, 'zh') : undefined,
    };
  });
}

function faqSections(faq: readonly { question: string; answer: string }[], heading: string) {
  return section(
    faq.map((item) => `${item.question} ${item.answer}`).join(' '),
    heading,
    'chip-faq',
  );
}

/** Document titles for `/chips/<slug>` (chip and versus pages), from the routes' own metadata. */
async function chipTitles(slug: string): Promise<Record<Locale, string>> {
  const [en, zh] = await Promise.all([
    readMetadata(() => import('@/app/chips/[slug]/page'), { slug }),
    readMetadata(() => import('@/app/zh/chips/[slug]/page'), { slug }),
  ]);
  return { en: en.title, zh: zh.title };
}

function specSection(entry: ChipPageEntry, locale: Locale): IndexedSection {
  return section(
    chipSpecRows(entry, locale).flat().join(' '),
    CHIP_PAGE_STRINGS[locale].specsHeading,
    'chip-specs',
  );
}

function chipVariant(entry: ChipPageEntry, locale: Locale, title: string): PageVariant | undefined {
  const strings = CHIP_PAGE_STRINGS[locale];
  // The zh page reads translated prose; without a translation it does not render.
  const prose = locale === 'zh' ? getZhChipTranslation(entry.slug) : entry;
  if (!prose) return undefined;
  return {
    url: `${locale === 'zh' ? '/zh' : ''}/chips/${entry.slug}`,
    title,
    coverage: 'partial',
    sections: nonEmpty([
      section(`${prose.summary} ${prose.keywords.join(' ')}`),
      section(prose.overview.join(' '), strings.overviewHeading, 'chip-overview'),
      specSection(entry, locale),
      section(prose.benchmarkContext, strings.benchmarkHeading, 'chip-benchmarks'),
      faqSections(
        locale === 'zh' ? buildZhChipFaq(entry) : buildChipFaq(entry),
        strings.faqHeading,
      ),
    ]),
  };
}

function chipPages(): Promise<SourcePage[]> {
  return Promise.all(
    getAllChipPages().map(async (entry) => {
      const titles = await chipTitles(entry.slug);
      return {
        path: `/chips/${entry.slug}`,
        en: chipVariant(entry, 'en', titles.en)!,
        zh: chipVariant(entry, 'zh', titles.zh),
      };
    }),
  );
}

function chipVsPages(): Promise<SourcePage[]> {
  return Promise.all(
    getAllChipVsPages().map(async (page) => {
      const titles = await chipTitles(page.slug);
      const highlights = buildChipVsHighlights(page);
      const table = (locale: Locale) => {
        const labels = locale === 'zh' ? CHIP_VS_HIGHLIGHT_LABELS_ZH : CHIP_VS_HIGHLIGHT_LABELS_EN;
        const value = locale === 'zh' ? localizeVsHighlightValueZh : (text: string) => text;
        return highlights
          .map((row) => `${labels[row.key]} ${value(row.aValue)} ${value(row.bValue)}`)
          .join(' ');
      };
      const variant = (locale: Locale): PageVariant => {
        const strings = CHIP_PAGE_STRINGS[locale];
        return {
          url: `${locale === 'zh' ? '/zh' : ''}/chips/${page.slug}`,
          title: titles[locale],
          coverage: 'partial',
          sections: nonEmpty([
            section(
              `${strings.vsIntroPrefix} ${page.a.title} ${strings.vsIntroAnd} ${page.b.title} ${strings.vsIntroSuffix}`,
            ),
            section(table(locale), strings.vsSpecTableCaption, 'vs-table'),
            faqSections(
              locale === 'zh' ? buildZhChipVsFaq(page) : buildChipVsFaq(page),
              strings.faqHeading,
            ),
          ]),
        };
      };
      return { path: `/chips/${page.slug}`, en: variant('en'), zh: variant('zh') };
    }),
  );
}

function whitepaperPages(): SourcePage[] {
  return getAllWhitepapers().map((paper) => {
    const variant = (locale: Locale): PageVariant => {
      const copy = whitepaperCopy(paper, locale);
      const labels = WHITEPAPER_COPY[locale];
      return {
        url: whitepaperDetailPath(paper.slug, locale),
        title: copy.title,
        coverage: 'full',
        sections: nonEmpty([
          section(`${copy.subtitle} ${copy.description}`),
          section(copy.abstract, labels.summary, 'whitepaper-summary'),
          section(copy.keyFindings.join(' '), labels.keyFindings, 'whitepaper-key-findings'),
          section(copy.methodSteps.join(' '), labels.method, 'whitepaper-method'),
          section(
            copy.assumptions.map((item) => `${item.item} ${item.value}`).join(' '),
            labels.assumptions,
            'whitepaper-assumptions',
          ),
        ]),
      };
    };
    return { path: whitepaperDetailPath(paper.slug, 'en'), en: variant('en'), zh: variant('zh') };
  });
}

function optimizationSections(sections: readonly OptimizationSection[]): IndexedSection[] {
  return sections.map((entry) =>
    section([...entry.paragraphs, entry.figure?.caption ?? ''].join(' '), entry.heading, entry.id),
  );
}

function optimizationPages(): SourcePage[] {
  const base = '/agentx/optimizations';
  const overview = (locale: Locale): PageVariant => {
    const copy = getOptimizationsOverview(locale);
    return {
      url: locale === 'zh' ? zhPath(base) : base,
      title: copy.title,
      coverage: 'full',
      sections: nonEmpty([
        section(`${copy.lead} ${copy.intro.join(' ')}`),
        ...optimizationSections(copy.sections),
        section(copy.frameworksIntro, copy.frameworksTitle, 'projects'),
      ]),
    };
  };
  const zhFrameworks = new Map(getLocalizedFrameworks('zh').map((fw) => [fw.slug, fw]));
  const frameworks: SourcePage[] = getLocalizedFrameworks('en').map((framework) => {
    const variant = (fw: typeof framework, locale: Locale): PageVariant => ({
      url: `${locale === 'zh' ? '/zh' : ''}${base}/${fw.slug}`,
      title: fw.name,
      coverage: 'full',
      sections: nonEmpty([
        section(`${fw.summary} ${fw.lead}`),
        ...optimizationSections(fw.sections),
      ]),
    });
    const zh = zhFrameworks.get(framework.slug);
    return {
      path: `${base}/${framework.slug}`,
      en: variant(framework, 'en'),
      zh: zh ? variant(zh, 'zh') : undefined,
    };
  });
  return [{ path: base, en: overview('en'), zh: overview('zh') }, ...frameworks];
}

function faqItemText(item: FaqItem): string {
  return [item.answer, item.link?.text, ...(item.list ?? [])].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Summary pages: copy lives in JSX or comes from live data per request
// ---------------------------------------------------------------------------

interface PageModule {
  metadata?: Metadata;
  generateMetadata?: (props: never) => Metadata | Promise<Metadata>;
}

async function readMetadata(
  load: () => Promise<PageModule>,
  params: Record<string, string> = {},
): Promise<{
  title: string;
  description: string;
}> {
  const mod = await load();
  const metadata =
    mod.metadata ??
    (mod.generateMetadata
      ? await mod.generateMetadata({
          params: Promise.resolve(params),
          searchParams: Promise.resolve({}),
        } as never)
      : {});
  const { title } = metadata;
  let text = '';
  if (typeof title === 'string') text = title;
  else if (title && typeof title === 'object') {
    text = 'absolute' in title ? title.absolute : 'default' in title ? title.default : '';
  }
  return { title: cleanPageTitle(text), description: clean(metadata.description ?? '') };
}

/**
 * Pages whose body is JSX or live data. Each entry reads the metadata the
 * page itself exports, in both locales. Imports are literal so the bundler
 * resolves them at build time.
 */
const METADATA_PAGES: readonly {
  path: string;
  en: () => Promise<PageModule>;
  zh: () => Promise<PageModule>;
}[] = [
  {
    path: '/agentx',
    en: () => import('@/app/agentx/page'),
    zh: () => import('@/app/zh/agentx/page'),
  },
  {
    path: '/agentx/methodology',
    en: () => import('@/app/agentx/methodology/page'),
    zh: () => import('@/app/zh/agentx/methodology/page'),
  },
  {
    path: '/agentx/quickstart',
    en: () => import('@/app/agentx/quickstart/page'),
    zh: () => import('@/app/zh/agentx/quickstart/page'),
  },
  {
    path: '/inference/agentic',
    en: () => import('@/app/(dashboard)/inference/agentic/page'),
    zh: () => import('@/app/zh/(dashboard)/inference/agentic/page'),
  },
  {
    path: '/agentx/telemetry',
    en: () => import('@/app/agentx/telemetry/page'),
    zh: () => import('@/app/zh/agentx/telemetry/page'),
  },
  { path: '/about', en: () => import('@/app/about/page'), zh: () => import('@/app/zh/about/page') },
  { path: '/api', en: () => import('@/app/api/page'), zh: () => import('@/app/zh/api/page') },
  { path: '/blog', en: () => import('@/app/blog/page'), zh: () => import('@/app/zh/blog/page') },
  { path: '/chips', en: () => import('@/app/chips/page'), zh: () => import('@/app/zh/chips/page') },
  {
    path: '/glossary',
    en: () => import('@/app/glossary/page'),
    zh: () => import('@/app/zh/glossary/page'),
  },
  { path: '/model', en: () => import('@/app/model/page'), zh: () => import('@/app/zh/model/page') },
  {
    path: '/whitepaper',
    en: () => import('@/app/whitepaper/page'),
    zh: () => import('@/app/zh/whitepaper/page'),
  },
  {
    path: '/rankings',
    en: () => import('@/app/rankings/page'),
    zh: () => import('@/app/zh/rankings/page'),
  },
  { path: '/run', en: () => import('@/app/run/page'), zh: () => import('@/app/zh/run/page') },
  {
    path: '/compare',
    en: () => import('@/app/compare/page'),
    zh: () => import('@/app/zh/compare/page'),
  },
  {
    path: '/compare-per-dollar',
    en: () => import('@/app/compare-per-dollar/page'),
    zh: () => import('@/app/zh/compare-per-dollar/page'),
  },
  {
    path: '/compare-precision',
    en: () => import('@/app/compare-precision/page'),
    zh: () => import('@/app/zh/compare-precision/page'),
  },
  {
    path: '/compare-spec-decode',
    en: () => import('@/app/compare-spec-decode/page'),
    zh: () => import('@/app/zh/compare-spec-decode/page'),
  },
  {
    path: '/overview',
    en: () => import('@/app/overview/page'),
    zh: () => import('@/app/zh/overview/page'),
  },
  {
    path: '/ubenchx/mem-bw',
    en: () => import('@/app/ubenchx/mem-bw/page'),
    zh: () => import('@/app/zh/ubenchx/mem-bw/page'),
  },
  {
    path: '/ubenchx/sm-l2-distance',
    en: () => import('@/app/ubenchx/sm-l2-distance/page'),
    zh: () => import('@/app/zh/ubenchx/sm-l2-distance/page'),
  },
  {
    path: '/ubenchx/tpc-skyline',
    en: () => import('@/app/ubenchx/tpc-skyline/page'),
    zh: () => import('@/app/zh/ubenchx/tpc-skyline/page'),
  },
  {
    path: '/quotes',
    en: () => import('@/app/quotes/page'),
    zh: () => import('@/app/zh/quotes/page'),
  },
  {
    path: '/land-acknowledgement',
    en: () => import('@/app/land-acknowledgement/page'),
    zh: () => import('@/app/zh/land-acknowledgement/page'),
  },
];

/** Extra authored sections for summary pages that have a structured part. */
const SUMMARY_EXTRAS: Readonly<Record<string, (locale: Locale) => IndexedSection[]>> = {
  '/about': (locale) =>
    (locale === 'zh' ? FAQ_ITEMS_ZH : FAQ_ITEMS).map((item) =>
      section(faqItemText(item), item.question, item.id),
    ),
};

function metadataPages(): Promise<SourcePage[]> {
  return Promise.all(
    METADATA_PAGES.map(async ({ path, en, zh }) => {
      const [enMeta, zhMeta] = await Promise.all([readMetadata(en), readMetadata(zh)]);
      const extras = SUMMARY_EXTRAS[path];
      const variant = (locale: Locale, meta: typeof enMeta): PageVariant => {
        const base = summaryVariant(
          locale === 'zh' ? zhPath(path) : path,
          meta.title,
          meta.description,
        );
        if (!extras) return base;
        return {
          ...base,
          coverage: 'partial',
          sections: nonEmpty([...base.sections, ...extras(locale)]),
        };
      };
      return { path, en: variant('en', enMeta), zh: variant('zh', zhMeta) };
    }),
  );
}

function landingPage(): SourcePage {
  return {
    path: '/',
    en: summaryVariant('/', LANDING_META.title, LANDING_META.description),
    zh: summaryVariant('/zh', LANDING_META_ZH.title, LANDING_META_ZH.description),
  };
}

function dashboardPages(): SourcePage[] {
  // Public tabs (header and footer). Feature-gated tabs stay out of search.
  const routes = DASHBOARD_ROUTES.filter(
    (route) => route.indexable && route.navGroup !== 'feature-gated',
  );
  return routes.map((route) => {
    const en = TAB_META[route.key];
    const zh = TAB_META_ZH[route.key];
    return {
      path: route.path,
      en: summaryVariant(route.path, cleanPageTitle(en.title), en.description),
      zh: route.localeMirrored
        ? summaryVariant(zhPath(route.path), cleanPageTitle(zh.title), zh.description)
        : undefined,
    };
  });
}

function inferenceModelPages(): SourcePage[] {
  return INFERENCE_MODEL_SLUGS.map((entry) => {
    const path = `/inference/${entry.slug}`;
    const en = inferenceModelMeta(entry);
    const zh = inferenceModelMetaZh(entry);
    return {
      path,
      en: summaryVariant(path, en.title, `${en.description} ${entry.label}`),
      zh: summaryVariant(zhPath(path), zh.title, `${zh.description} ${entry.label}`),
    };
  });
}

function rankingPages(): SourcePage[] {
  return getAllRankingPageEntries().map((entry) => {
    const path = rankingPagePath(entry);
    return {
      path,
      en: summaryVariant(path, rankingPageHeading(entry), rankingPageDescription(entry)),
      zh: summaryVariant(
        zhPath(path),
        rankingPageHeadingZh(entry),
        rankingPageDescriptionZh(entry),
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export async function collectSourcePages(): Promise<SourcePage[]> {
  const groups = [
    [landingPage()],
    dashboardPages(),
    await metadataPages(),
    optimizationPages(),
    inferenceModelPages(),
    await chipPages(),
    await chipVsPages(),
    rankingPages(),
    glossaryPages(),
    modelPages(),
    whitepaperPages(),
    blogPages(),
  ];
  const seen = new Set<string>();
  const pages: SourcePage[] = [];
  for (const page of groups.flat()) {
    // First source wins; later registries never shadow a richer adapter.
    if (seen.has(page.path)) continue;
    seen.add(page.path);
    pages.push(page);
  }
  return pages;
}

function toIndexedPage(variant: PageVariant): IndexedPage {
  return {
    url: variant.url,
    title: variant.title,
    coverage: variant.coverage,
    sections: variant.sections,
  };
}

export function localePages(pages: readonly SourcePage[], locale: Locale): IndexedPage[] {
  return pages
    .map((page) => (locale === 'zh' ? (page.zh ?? page.en) : page.en))
    .filter((variant) => variant.sections.length > 0)
    .map(toIndexedPage);
}

export interface BuiltSearchIndex {
  manifest: SearchIndexManifest;
  files: Record<Locale, SearchIndexFile>;
}

/**
 * Deterministic content version: the same sources always hash to the same
 * value, so the manifest and file routes agree even when Next prerenders them
 * in different workers.
 */
export function contentVersion(pagesByLocale: Record<Locale, IndexedPage[]>): string {
  const hash = createHash('sha256');
  hash.update(String(SEARCH_INDEX_SCHEMA));
  for (const locale of SEARCH_INDEX_LOCALES) hash.update(JSON.stringify(pagesByLocale[locale]));
  return hash.digest('hex').slice(0, 16);
}

export function assembleSearchIndex(
  pages: readonly SourcePage[],
  generatedAt: Date = new Date(),
): BuiltSearchIndex {
  const pagesByLocale = {
    en: localePages(pages, 'en'),
    zh: localePages(pages, 'zh'),
  } satisfies Record<Locale, IndexedPage[]>;
  const version = contentVersion(pagesByLocale);
  const files = {} as Record<Locale, SearchIndexFile>;
  const locales = {} as SearchIndexManifest['locales'];
  for (const locale of SEARCH_INDEX_LOCALES) {
    const file: SearchIndexFile = {
      schema: SEARCH_INDEX_SCHEMA,
      version,
      locale,
      pages: pagesByLocale[locale],
    };
    files[locale] = file;
    locales[locale] = {
      path: searchIndexFilePath(version, locale),
      pages: file.pages.length,
      sections: file.pages.reduce((sum, page) => sum + page.sections.length, 0),
      bytes: Buffer.byteLength(JSON.stringify(file)),
    };
  }
  return {
    manifest: {
      schema: SEARCH_INDEX_SCHEMA,
      version,
      generatedAt: generatedAt.toISOString(),
      locales,
    },
    files,
  };
}

let cached: Promise<BuiltSearchIndex> | null = null;

/** Memoized per server process; the routes are prerendered once per build. */
export function getSiteSearchIndex(): Promise<BuiltSearchIndex> {
  cached ??= collectSourcePages().then((pages) => assembleSearchIndex(pages));
  return cached;
}
