import type { Metadata } from 'next';

import { AgentXMethodologyArticle } from '@/components/datasets/agentx-methodology-article';
import { JsonLd } from '@/components/seo/json-ld';
import { ARTICLE_PAGE_CLASS } from '@/components/ui/reading-layout';
import { enAlternates } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const DESCRIPTION =
  'How AgentX transforms opt-in coding-agent traces into replay graphs with controlled KV-cache warmup and benchmark settings.';

export const metadata: Metadata = {
  title: 'AgentX Methodology',
  description: DESCRIPTION,
  alternates: enAlternates('/agentx/methodology'),
  ...socialMetadata({
    title: 'AgentX Methodology | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/agentx/methodology`,
    locale: 'en',
  }),
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
      <div className={cn(ARTICLE_PAGE_CLASS, 'pt-4 lg:pt-8')}>
        <AgentXMethodologyArticle locale="en" />
      </div>
    </main>
  );
}
