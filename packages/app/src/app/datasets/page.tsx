import type { Metadata } from 'next';

import { JsonLd } from '@/components/json-ld';
import { AgentXMethodology } from '@/components/datasets/agentx-methodology';
import { DatasetList } from '@/components/datasets/dataset-list';
import { enAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const DESCRIPTION =
  'The real Claude Code agentic conversation traces that the InferenceX agentic benchmark replays — methodology, distributions, and per-conversation flamegraphs.';

export const metadata: Metadata = {
  title: 'Agentic Datasets',
  description: DESCRIPTION,
  alternates: enAlternates('/datasets'),
  openGraph: {
    title: 'Agentic Datasets | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/datasets`,
  },
  twitter: { title: 'Agentic Datasets | InferenceX', description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'InferenceX Agentic Datasets',
  description: DESCRIPTION,
  url: `${SITE_URL}/datasets`,
};

export default function DatasetsPage() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto flex flex-col gap-6 px-4 pb-8 lg:px-8">
        <section>
          <AgentXMethodology locale="en" />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">Datasets</h2>
          <DatasetList />
        </section>
      </div>
    </main>
  );
}
