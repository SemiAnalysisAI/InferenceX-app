import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AgentXOptimizationsArticle } from '@/components/datasets/agentx-optimizations-article';
import { JsonLd } from '@/components/json-ld';
import {
  AGENTX_OPTIMIZATION_FRAMEWORKS,
  getOptimizationFramework,
} from '@/lib/agentx-optimizations';
import { enAlternates } from '@/lib/i18n';
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
  const title = `${framework.name} Agentic Optimizations`;
  return {
    title,
    description: framework.summary,
    alternates: enAlternates(`/agentx/optimizations/${slug}`),
    openGraph: {
      title: `${title} | InferenceX`,
      description: framework.summary,
      url: `${SITE_URL}/agentx/optimizations/${slug}`,
    },
    twitter: { title: `${title} | InferenceX`, description: framework.summary },
  };
}

export default async function AgentXOptimizationsFrameworkPage({ params }: Props) {
  const { framework: slug } = await params;
  const framework = getOptimizationFramework(slug);
  if (!framework) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${framework.name} Agentic Optimizations`,
    description: framework.summary,
    url: `${SITE_URL}/agentx/optimizations/${slug}`,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
  };

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto max-w-6xl px-4 pb-12 lg:px-8">
        <AgentXOptimizationsArticle slug={slug} locale="en" />
      </div>
    </main>
  );
}
