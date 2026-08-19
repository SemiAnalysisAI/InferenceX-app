import type { Metadata } from 'next';

import { AgentXOptimizationsIndex } from '@/components/datasets/agentx-optimizations-article';
import { JsonLd } from '@/components/json-ld';
import { OPTIMIZATIONS_OVERVIEW } from '@/lib/agentx-optimizations';
import { enAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'AgentX Industry Impact: Optimizations for Agentic Workloads';
const DESCRIPTION =
  'The 50+ upstream pull requests AgentX drove across vLLM, SGLang, TensorRT-LLM, ATOM, AITER, Dynamo, LMCache, and Mooncake.';

export const metadata: Metadata = {
  title: 'AgentX Industry Impact',
  description: DESCRIPTION,
  alternates: enAlternates('/agentx/optimizations'),
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/agentx/optimizations`,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}/agentx/optimizations`,
  inLanguage: 'en',
  about: OPTIMIZATIONS_OVERVIEW.title,
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default function AgentXOptimizationsPage() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto max-w-6xl px-4 pb-12 lg:px-8">
        <AgentXOptimizationsIndex locale="en" />
      </div>
    </main>
  );
}
