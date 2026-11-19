import type { Metadata } from 'next';

import { AgentXOptimizationsIndex } from '@/components/datasets/agentx-optimizations-article';
import { JsonLd } from '@/components/seo/json-ld';
import { ARTICLE_PAGE_CLASS } from '@/components/ui/reading-layout';
import { OPTIMIZATIONS_OVERVIEW } from '@/lib/agentx/agentx-optimizations';
import { enAlternates } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { AGENTX_ROUTE } from '@/lib/routing/dashboard-routes';

const TITLE = 'AgentX Industry Impact: Optimizations for Agentic Workloads';
const DESCRIPTION =
  'The 50+ upstream pull requests AgentX drove across vLLM, SGLang, TensorRT-LLM, ATOM, AITER, Dynamo, LMCache, Mooncake, and MoRI UMBP.';

export const metadata: Metadata = {
  title: 'AgentX Industry Impact',
  description: DESCRIPTION,
  alternates: enAlternates(`${AGENTX_ROUTE.path}/optimizations`),
  ...socialMetadata({
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}${AGENTX_ROUTE.path}/optimizations`,
    locale: 'en',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}${AGENTX_ROUTE.path}/optimizations`,
  inLanguage: 'en',
  about: OPTIMIZATIONS_OVERVIEW.title,
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default function AgentXOptimizationsPage() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className={cn(ARTICLE_PAGE_CLASS, 'pt-4 lg:pt-8')}>
        <AgentXOptimizationsIndex locale="en" />
      </div>
    </main>
  );
}
