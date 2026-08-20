import type { Metadata } from 'next';

import { AgenticCatalogHero } from '@/components/inference/agentic-catalog/agentic-catalog-hero';
import { AgenticCatalogList } from '@/components/inference/agentic-catalog/agentic-catalog-list';
import { JsonLd } from '@/components/json-ld';
import { getAgenticCatalogGroups } from '@/lib/agentic-catalog';
import { enAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'AgentX Telemetry';
const DESCRIPTION =
  'Browse every AgentX benchmark run with stored per-request telemetry, grouped by model and serving stack. Each configuration opens its point-detail charts, request timeline, and cache behavior.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: enAlternates('/inference/agentic'),
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/inference/agentic`,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

// The catalog reads the same live benchmark tables the dashboard does, so a
// build-time snapshot would go stale the moment a new run lands.
export const dynamic = 'force-dynamic';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `${TITLE} | InferenceX`,
  description: DESCRIPTION,
  url: `${SITE_URL}/inference/agentic`,
  inLanguage: 'en',
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default async function AgenticTelemetryCatalogPage() {
  const groups = await getAgenticCatalogGroups();
  return (
    <>
      <JsonLd data={jsonLd} />
      <AgenticCatalogHero locale="en" />
      <AgenticCatalogList groups={groups} locale="en" />
    </>
  );
}
