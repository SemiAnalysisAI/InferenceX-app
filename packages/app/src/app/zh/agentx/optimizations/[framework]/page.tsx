import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AgentXOptimizationsArticle } from '@/components/datasets/agentx-optimizations-article';
import { JsonLd } from '@/components/json-ld';
import {
  AGENTX_OPTIMIZATION_FRAMEWORKS,
  getOptimizationFramework,
} from '@/lib/agentx-optimizations';
import { getLocalizedFramework } from '@/lib/agentx-optimizations-zh';
import { zhAlternates, ZH_LANG_TAG, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ framework: string }>;
}

export function generateStaticParams() {
  return AGENTX_OPTIMIZATION_FRAMEWORKS.map((entry) => ({ framework: entry.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { framework: slug } = await params;
  const framework = getOptimizationFramework(slug);
  if (!framework) return {};
  const localized = getLocalizedFramework(framework, 'zh');
  const title = `${framework.name} 智能体负载优化`;
  return {
    title,
    description: localized.summary,
    alternates: zhAlternates(`/agentx/optimizations/${slug}`),
    openGraph: {
      title: `${title} | InferenceX`,
      description: localized.summary,
      url: `${SITE_URL}/zh/agentx/optimizations/${slug}`,
      locale: ZH_OG_LOCALE,
    },
    twitter: { title: `${title} | InferenceX`, description: localized.summary },
  };
}

export default async function AgentXOptimizationsFrameworkPageZh({ params }: Props) {
  const { framework: slug } = await params;
  const framework = getOptimizationFramework(slug);
  if (!framework) notFound();

  const localized = getLocalizedFramework(framework, 'zh');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${framework.name} 智能体负载优化`,
    description: localized.summary,
    url: `${SITE_URL}/zh/agentx/optimizations/${slug}`,
    inLanguage: ZH_LANG_TAG,
    isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
  };

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto max-w-6xl px-4 pb-12 lg:px-8">
        <AgentXOptimizationsArticle slug={slug} locale="zh" />
      </div>
    </main>
  );
}
