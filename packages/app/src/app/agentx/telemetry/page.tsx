import type { Metadata } from 'next';

import { AgentXTelemetryArticle } from '@/components/datasets/agentx-telemetry-article';
import { JsonLd } from '@/components/json-ld';
import { AGENTX_TELEMETRY_GUIDE } from '@/lib/agentx-telemetry';
import { enAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'Exploring Agentic Workloads: Detailed Telemetry';
const DESCRIPTION =
  'How to read the telemetry behind a single AgentX point: the per-point charts, the request timeline, KV offload markers, and the per-conversation flamegraph.';

export const metadata: Metadata = {
  title: 'AgentX Telemetry Tutorial',
  description: DESCRIPTION,
  alternates: enAlternates('/agentx/telemetry'),
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/agentx/telemetry`,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}/agentx/telemetry`,
  inLanguage: 'en',
  about: AGENTX_TELEMETRY_GUIDE.title,
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default function AgentXTelemetryPage() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto max-w-6xl px-4 pb-12 lg:px-8">
        <AgentXTelemetryArticle locale="en" />
      </div>
    </main>
  );
}
