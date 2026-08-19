import type { Metadata } from 'next';

import { AgentXMethodologyArticle } from '@/components/datasets/agentx-methodology-article';
import { JsonLd } from '@/components/json-ld';
import { enAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const DESCRIPTION =
  'How AgentX transforms opt-in coding-agent traces into replay graphs with controlled KV-cache warmup and benchmark settings.';

export const metadata: Metadata = {
  title: 'AgentX Methodology',
  description: DESCRIPTION,
  alternates: enAlternates('/agentx/methodology'),
  openGraph: {
    title: 'AgentX Methodology | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/agentx/methodology`,
  },
  twitter: { title: 'AgentX Methodology | InferenceX', description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'AgentX Methodology',
  description: DESCRIPTION,
  url: `${SITE_URL}/agentx/methodology`,
  inLanguage: 'en',
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default function AgentXMethodologyPage() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto max-w-6xl px-4 pb-12 lg:px-8">
        <AgentXMethodologyArticle locale="en" />
      </div>
    </main>
  );
}
