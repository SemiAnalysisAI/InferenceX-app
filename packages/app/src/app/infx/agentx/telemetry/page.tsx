import type { Metadata } from 'next';

import { AgentXTelemetryArticle } from '@/components/datasets/agentx-telemetry-article';
import { JsonLd } from '@/components/seo/json-ld';
import { ARTICLE_PAGE_CLASS } from '@/components/ui/reading-layout';
import { AGENTX_TELEMETRY_GUIDE } from '@/lib/agentx/agentx-telemetry';
import { enAlternates } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { AGENTX_ROUTE } from '@/lib/routing/dashboard-routes';

const TITLE = 'Exploring Agentic Workloads: Detailed Telemetry';
const DESCRIPTION =
  'How to read the telemetry behind one AgentX point: the per-point charts, the request timeline, KV offload markers, and the per-conversation flamegraph.';

export const metadata: Metadata = {
  title: 'AgentX Telemetry Tutorial',
  description: DESCRIPTION,
  alternates: enAlternates(`${AGENTX_ROUTE.path}/telemetry`),
  ...socialMetadata({
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}${AGENTX_ROUTE.path}/telemetry`,
    locale: 'en',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}${AGENTX_ROUTE.path}/telemetry`,
  inLanguage: 'en',
  about: AGENTX_TELEMETRY_GUIDE.title,
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default function AgentXTelemetryPage() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className={cn(ARTICLE_PAGE_CLASS, 'pt-4 lg:pt-8')}>
        <AgentXTelemetryArticle locale="en" />
      </div>
    </main>
  );
}
