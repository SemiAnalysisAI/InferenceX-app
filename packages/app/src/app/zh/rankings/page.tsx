import type { Metadata } from 'next';
import Link from 'next/link';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { INFERENCE_MODEL_SLUGS } from '@/lib/inference-model-slug';
import { getAllRankingPageEntries } from '@/lib/rankings';
import { rankingPageHeadingZh } from '@/lib/rankings-zh';

const title = 'LLM 推理 GPU 排行榜';
const description =
  'DeepSeek、Kimi、GLM、MiniMax、Qwen 等开源大模型推理的最快与最省钱 GPU 实时排行。按实测单 GPU 每秒 token 数与每百万 token 成本排名，数据持续更新。';

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'LLM 推理最快 GPU',
    'LLM 推理最便宜 GPU',
    'GPU 推理排行榜',
    'AI 推理最佳 GPU',
    'LLM 推理 token 成本',
    'H100 B200 MI355X 对比',
    '单 GPU 每秒 token 数',
    'GPU 推理排名',
  ],
  alternates: zhAlternates('/rankings'),
  openGraph: {
    title: `${title} | ${SITE_NAME}`,
    description,
    url: `${SITE_URL}/zh/rankings`,
    locale: ZH_OG_LOCALE,
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title, description },
};

export default function ZhRankingsIndexPage() {
  const entries = getAllRankingPageEntries();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: `${SITE_URL}/zh/rankings`,
    inLanguage: ZH_LANG_TAG,
    hasPart: entries.map((entry) => ({
      '@type': 'WebPage',
      name: rankingPageHeadingZh(entry),
      url: `${SITE_URL}/zh/rankings/${entry.slug}`,
    })),
  };

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <header className="pt-8 md:pt-12">
            <h1 className="max-w-4xl text-4xl font-bold tracking-[-0.035em] text-balance md:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">
              哪款 GPU
              最适合部署你的模型？以下每个排行都来自匹配交互速度下的实测基准数据，而非纸面规格，并随新结果自动更新。
            </p>
          </header>

          <section className="mt-10 mb-16 grid gap-4 sm:grid-cols-2">
            {INFERENCE_MODEL_SLUGS.map((model) => (
              <Card key={model.slug} className="p-5">
                <h2 className="text-lg font-semibold tracking-tight">{model.seoName}</h2>
                <ul className="mt-3 space-y-1">
                  <li>
                    <Link
                      href={`/zh/rankings/fastest-gpu-for-${model.slug}`}
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      {model.seoName} 最快 GPU 排行
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/zh/rankings/cheapest-gpu-for-${model.slug}`}
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      {model.seoName} 最低成本 GPU 排行
                    </Link>
                  </li>
                </ul>
              </Card>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
