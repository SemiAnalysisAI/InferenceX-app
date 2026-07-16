import type { Metadata } from 'next';
import Link from 'next/link';

import {
  GlossaryBrowser,
  type GlossaryBrowserEntry,
  type GlossaryBrowserLabels,
} from '@/components/glossary/glossary-browser';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getAllPosts } from '@/lib/blog';
import { GLOSSARY_CATEGORIES } from '@/lib/glossary';
import {
  GLOSSARY_CATEGORY_LABELS_ZH,
  compareZhGlossaryEntries,
  getAllZhGlossaryEntries,
} from '@/lib/glossary-zh';
import { ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

const title = 'AI 推理术语表';
const description =
  '清晰、技术严谨的 LLM 推理基准、服务指标、分布式并行、数值精度、GPU 硬件与推理软件术语定义。';
const browserLabels: GlossaryBrowserLabels = {
  searchLabel: '搜索 AI 推理术语表',
  searchPlaceholder: '搜索 MTP、延迟、FP4…',
  clearSearch: '清除术语搜索',
  categoryFilterLabel: '按类别筛选术语',
  letterFilterLabel: '按字母筛选术语',
  allLetters: '全部',
  termSingular: '个术语',
  termPlural: '个术语',
  clearFilters: '清除筛选',
  noMatch: '没有匹配项',
  noResultsTitle: '未找到相关术语',
  noResultsDescription: '请尝试更宽泛的关键词，或清除当前筛选条件。',
  showAllTerms: '显示全部术语',
};

export const metadata: Metadata = {
  title,
  description,
  keywords: ['AI 推理术语表', 'LLM 推理术语', 'GPU 基准术语', '分布式推理', 'LLM 性能指标'],
  alternates: zhAlternates('/glossary'),
  openGraph: {
    title: `${title} | ${SITE_NAME}`,
    description,
    url: `${SITE_URL}/zh/glossary`,
    locale: ZH_OG_LOCALE,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function ZhGlossaryPage() {
  const entries = getAllZhGlossaryEntries().toSorted(compareZhGlossaryEntries);
  const articleCount = getAllPosts('zh').length;
  const browserEntries: GlossaryBrowserEntry[] = entries.map((entry) => ({
    slug: entry.slug,
    term: entry.term,
    ...(entry.abbreviation && { abbreviation: entry.abbreviation }),
    category: entry.category,
    plainEnglish: entry.plainEnglish,
    searchText: [
      entry.term,
      entry.abbreviation,
      ...(entry.aliases ?? []),
      GLOSSARY_CATEGORY_LABELS_ZH[entry.category],
      entry.plainEnglish,
      entry.definition,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase(),
  }));
  const glossaryUrl = `${SITE_URL}/zh/glossary`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': glossaryUrl,
    name: 'InferenceX AI 推理术语表',
    description,
    url: glossaryUrl,
    inLanguage: ZH_LANG_TAG,
    creator: {
      '@type': 'Organization',
      name: AUTHOR_NAME,
    },
    hasDefinedTerm: entries.map((entry) => ({
      '@type': 'DefinedTerm',
      '@id': `${glossaryUrl}/${entry.slug}`,
      name: entry.term,
      ...(entry.abbreviation && { termCode: entry.abbreviation }),
      description: entry.definition,
      url: `${glossaryUrl}/${entry.slug}`,
      inLanguage: ZH_LANG_TAG,
    })),
  };

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8">
        <Card className="overflow-hidden p-0">
          <header className="relative px-5 py-10 md:px-8 md:py-14 lg:px-12 lg:py-16">
            <div
              aria-hidden="true"
              className="absolute top-0 left-1/2 h-px w-2/3 -translate-x-1/2 bg-linear-to-r from-transparent via-brand/75 to-transparent"
            />
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
              <div>
                <p className="font-mono text-xs font-semibold tracking-[0.2em] text-brand uppercase">
                  技术指南 / AI 基础设施
                </p>
                <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-[-0.045em] text-balance md:text-6xl lg:text-7xl">
                  读懂推理曲线背后的语言。
                </h1>
                <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
                  解释 InferenceX
                  使用的性能指标、服务技术、数值格式和分布式系统概念。所有定义都来自实测行为，而非厂商峰值规格。
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border/50 bg-border/50 lg:grid-cols-1">
                <div className="bg-background/70 p-4">
                  <dt className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                    术语
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{entries.length}</dd>
                </div>
                <div className="bg-background/70 p-4">
                  <dt className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                    类别
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {GLOSSARY_CATEGORIES.length}
                  </dd>
                </div>
                <div className="bg-background/70 p-4">
                  <dt className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                    参考文章
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{articleCount}</dd>
                </div>
              </dl>
            </div>
          </header>

          <GlossaryBrowser
            entries={browserEntries}
            categories={GLOSSARY_CATEGORIES}
            labels={browserLabels}
            categoryLabels={GLOSSARY_CATEGORY_LABELS_ZH}
            groupBy="category"
            basePath="/zh/glossary"
          />
        </Card>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              阅读基准曲线
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">完整曲线更能说明问题。</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              LLM 服务需要在单用户速度与总吞吐量之间取舍。InferenceX 使用完整 Pareto
              曲线和等交互性比较，展示不同运行点上的真实权衡。单一最大吞吐点无法代表完整系统。
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
              <Link href="/zh/glossary/interactivity" className="text-brand hover:underline">
                交互性 →
              </Link>
              <Link href="/zh/glossary/pareto-frontier" className="text-brand hover:underline">
                Pareto 前沿 →
              </Link>
              <Link href="/zh/glossary/iso-interactivity" className="text-brand hover:underline">
                等交互性 →
              </Link>
            </div>
          </Card>

          <Card>
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              基于实测数据
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">每个定义都连接真实方案。</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              每个术语页都会链接到该概念真正影响实测结果的 InferenceX 文章，包括 MTP 接受行为、NVL72
              Wide EP 扩展，以及硬件不变时的软件性能提升。
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
              <Link href="/zh/blog" className="text-brand hover:underline">
                浏览技术文章 →
              </Link>
              <Link href="/zh/inference" className="text-brand hover:underline">
                查看实时基准数据 →
              </Link>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
