import type { Metadata } from 'next';
import Link from 'next/link';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { INFERENCE_MODEL_SLUGS } from '@/lib/inference-model-slug';
import type { RunPageEntry } from '@/lib/run-pages';
import { runPageHeadingZh } from '@/lib/run-pages-zh';
import { getAvailableRunEntries } from '@/lib/run-rankings-data.server';

export const dynamic = 'force-dynamic';

const title = '任意模型在任意 GPU 上的实测结果';
const description =
  'InferenceX 集群实测的每一组开源大模型与 GPU 组合的吞吐、延迟与成本数据：DeepSeek、Kimi、GLM、MiniMax、Qwen 运行在 H100、H200、B200、GB200 NVL72、MI300X、MI325X、MI355X 等硬件上。';

export function generateMetadata(): Metadata {
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    keywords: [
      'LLM GPU 基准测试',
      '大模型 GPU 吞吐量',
      '模型 GPU 推理性能',
      'DeepSeek GPU 基准测试',
      'Kimi GPU 基准测试',
      'LLM 推理成本',
      'H100 大模型基准测试',
      'MI355X 大模型基准测试',
    ],
    alternates: zhAlternates('/run'),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/zh/run`,
      locale: ZH_OG_LOCALE,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function ZhRunIndexPage() {
  const entries = await getAvailableRunEntries();
  const byModel = new Map<string, RunPageEntry[]>();
  for (const entry of entries) {
    const list = byModel.get(entry.model.slug) ?? [];
    list.push(entry);
    byModel.set(entry.model.slug, list);
  }
  const models = INFERENCE_MODEL_SLUGS.filter((model) => byModel.has(model.slug));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: `${SITE_URL}/zh/run`,
    inLanguage: ZH_LANG_TAG,
    hasPart: entries.map((entry) => ({
      '@type': 'WebPage',
      name: runPageHeadingZh(entry),
      url: `${SITE_URL}/zh/run/${entry.slug}`,
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
              选一个模型和一款 GPU：下面每个页面都会回答它能跑多快、每百万 token
              成本多少、以及数字出自哪个推理引擎，数据来自真实硬件上持续重跑的基准测试。
            </p>
          </header>

          <section className="mt-10 mb-16 space-y-8">
            {models.map((model) => (
              <Card key={model.slug} className="p-5">
                <h2 className="text-lg font-semibold tracking-tight">{model.seoName}</h2>
                <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                  {(byModel.get(model.slug) ?? []).map((entry) => {
                    const chipLabel = entry.chip.label;
                    return (
                      <li key={entry.slug}>
                        <Link
                          href={`/zh/run/${entry.slug}`}
                          className="text-sm font-medium text-brand hover:underline"
                        >
                          {model.seoName} 运行在 {chipLabel}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
