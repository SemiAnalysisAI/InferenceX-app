import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  GlossaryBrowser,
  type GlossaryBrowserEntry,
  type GlossaryBrowserLabels,
} from '@/components/glossary/glossary-browser';
import { JsonLd } from '@/components/seo/json-ld';
import { Card } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { getAllPosts } from '@/lib/blog/blog';
import { GLOSSARY_CATEGORIES } from '@/lib/content/glossary';
import {
  GLOSSARY_CATEGORY_LABELS_ZH,
  compareZhGlossaryEntries,
  getAllZhGlossaryEntries,
} from '@/lib/content/glossary-zh';
import { ZH_LANG_TAG, zhAlternates } from '@/lib/i18n/i18n';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { analyticsPlacement } from '@/lib/analytics/placement';

const MORE_LINK = 'inline-flex items-center gap-1 text-brand hover:underline';

const title = 'AI 推理术语表';
const description =
  '清晰、技术严谨的智能体推理、LLM 基准测试、服务指标、分布式并行、数值精度、芯片硬件与推理软件术语定义。';
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
  noResultsTitle: '未找到相关术语',
  noResultsDescription: '请尝试更宽泛的关键词，或清除当前筛选条件',
  showAllTerms: '显示全部术语',
};

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'AI 推理术语表',
    '智能体推理术语',
    'AgentX 基准测试术语',
    'LLM 推理术语',
    '芯片基准术语',
    '分布式推理',
    'LLM 性能指标',
  ],
  alternates: zhAlternates('/glossary'),
  ...socialMetadata({
    title: `${title} | ${SITE_NAME}`,
    description,
    url: `${SITE_URL}/zh/glossary`,
    locale: 'zh',
  }),
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
    <main className="relative" {...analyticsPlacement('glossary')}>
      <JsonLd data={jsonLd} />
      <div className="container mx-auto flex flex-col gap-10 px-4 pt-4 pb-8 lg:px-8 lg:pt-8">
        <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-semibold text-balance md:text-4xl">AI 推理术语表</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
              解释 InferenceX 使用的智能体推理、基准指标、服务技术、数值格式与分布式系统概念。
              各条目以实测行为和已发布的基准测试方案为依据。
            </p>
          </div>
          <dl className="flex gap-10">
            <Stat size="lg" label="术语" value={entries.length} />
            <Stat size="lg" label="类别" value={GLOSSARY_CATEGORIES.length} />
            <Stat size="lg" label="参考文章" value={articleCount} />
          </dl>
        </header>

        <Card className="overflow-hidden p-0 md:p-0">
          <GlossaryBrowser
            entries={browserEntries}
            categories={GLOSSARY_CATEGORIES}
            labels={browserLabels}
            categoryLabels={GLOSSARY_CATEGORY_LABELS_ZH}
            groupBy="category"
            basePath="/zh/glossary"
          />
        </Card>

        <section className="grid gap-10 border-t border-border/30 pt-10 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold">完整曲线更能说明问题</h2>
            <p className="mt-3 max-w-prose leading-7 text-muted-foreground">
              LLM 服务需要在单用户速度与总吞吐量之间取舍。InferenceX 使用完整 Pareto
              曲线和等交互性比较，展示不同运行点上的真实权衡。单一最大吞吐点无法代表完整系统。
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
              <Link href="/zh/glossary/interactivity" className={MORE_LINK}>
                交互性
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/zh/glossary/pareto-frontier" className={MORE_LINK}>
                Pareto 前沿
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/zh/glossary/iso-interactivity" className={MORE_LINK}>
                等交互性
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold">每个定义都连接真实方案</h2>
            <p className="mt-3 max-w-prose leading-7 text-muted-foreground">
              每个术语页都会链接到该概念真正影响实测结果的 InferenceX 文章，包括 MTP 接受行为、NVL72
              Wide EP 扩展，以及硬件不变时的软件性能提升。
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
              <Link href="/zh/agentx/methodology" className={MORE_LINK}>
                AgentX 方法说明
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/zh/blog" className={MORE_LINK}>
                浏览技术文章
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/zh/inference" className={MORE_LINK}>
                查看实时基准数据
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
