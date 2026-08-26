import type { Metadata } from 'next';
import Link from 'next/link';

import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { GUIDE_CATEGORIES } from '@/lib/guides';
import { GUIDE_CATEGORY_LABELS_ZH, getAllZhGuides, getZhGuidesByCategory } from '@/lib/guides-zh';
import { ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

const title = 'LLM 推理实践指南';
const description =
  '基于真实基准数据的 LLM 推理实践指南：如何选择 GPU 和推理引擎、如何规划显存与集群容量、如何理解每百万 token 成本，以及如何正确开展基准测试。';

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'LLM 推理指南',
    'LLM 推理最佳 GPU',
    '推理引擎对比',
    'LLM 推理成本',
    'GPU 容量规划',
    '推理基准测试指南',
    'AI 基础设施指南',
    'LLM 部署指南',
  ],
  alternates: zhAlternates('/guides'),
  openGraph: {
    title: `${title} | ${SITE_NAME}`,
    description,
    url: `${SITE_URL}/zh/guides`,
    locale: ZH_OG_LOCALE,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function ZhGuidesPage() {
  const guides = getAllZhGuides();
  const groups = getZhGuidesByCategory();
  const guidesUrl = `${SITE_URL}/zh/guides`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': guidesUrl,
    name: `InferenceX ${title}`,
    description,
    url: guidesUrl,
    inLanguage: ZH_LANG_TAG,
    creator: {
      '@type': 'Organization',
      name: AUTHOR_NAME,
    },
    hasPart: guides.map((guide) => ({
      '@type': 'TechArticle',
      '@id': `${guidesUrl}/${guide.slug}`,
      headline: guide.title,
      description: guide.description,
      url: `${guidesUrl}/${guide.slug}`,
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
                  实践指南 / AI 基础设施决策
                </p>
                <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-[-0.045em] text-balance md:text-6xl lg:text-7xl">
                  用实测数据做部署决策。
                </h1>
                <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
                  选哪款 GPU、用哪个引擎、需要多少显存、成本是多少。每篇指南回答一个具体的部署问题，
                  依据与 InferenceX 仪表盘相同的实测数据，并链接到支撑每一条结论的在线基准结果。
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/50 bg-border/50 lg:grid-cols-1">
                <div className="bg-background/70 p-4">
                  <dt className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                    指南数量
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{guides.length}</dd>
                </div>
                <div className="bg-background/70 p-4">
                  <dt className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                    主题分类
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {GUIDE_CATEGORIES.length}
                  </dd>
                </div>
              </dl>
            </div>
          </header>

          <div className="border-t border-border/50 px-5 py-8 md:px-8 md:py-10 lg:px-12">
            {groups.map((group) => (
              <section
                key={group.category}
                aria-label={GUIDE_CATEGORY_LABELS_ZH[group.category]}
                className="py-6 first:pt-0 last:pb-0"
              >
                <h2 className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
                  {GUIDE_CATEGORY_LABELS_ZH[group.category]}
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {group.guides.map((guide) => (
                    <Link
                      key={guide.slug}
                      href={`/zh/guides/${guide.slug}`}
                      className="group rounded-xl border border-border/40 bg-background/20 p-5 transition-colors hover:border-brand/40 hover:bg-brand/5"
                    >
                      <h3 className="font-semibold leading-snug group-hover:text-brand">
                        {guide.title}
                      </h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {guide.description}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Card>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              为什么需要指南
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              推理领域的经验几周就会过时。
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              一次引擎版本更新就能让实测吞吐量提升 1.8 倍，新的推理方案每个月都在改写性价比排名。
              这些指南讲解长期有效的决策框架，所有易变的数字都指向持续更新的在线基准页面。
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
              <Link href="/zh/inference" className="text-brand hover:underline">
                在线基准数据 →
              </Link>
              <Link href="/zh/compare-per-dollar" className="text-brand hover:underline">
                每美元性能对比 →
              </Link>
            </div>
          </Card>

          <Card>
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              深入阅读
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              术语定义、芯片规格与测试方法。
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              每篇指南都会交叉引用术语表中的精确定义、芯片页面中的硬件规格与租用价格，
              以及发表相关实测结果的技术文章。
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
              <Link href="/zh/glossary" className="text-brand hover:underline">
                AI 推理术语表 →
              </Link>
              <Link href="/zh/chips" className="text-brand hover:underline">
                GPU 芯片页面 →
              </Link>
              <Link href="/zh/blog" className="text-brand hover:underline">
                技术文章 →
              </Link>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
