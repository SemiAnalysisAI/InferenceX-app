import type { Metadata } from 'next';

import { AgentXMethodology } from '@/components/datasets/agentx-methodology';
import { DatasetList } from '@/components/datasets/dataset-list';
import { JsonLd } from '@/components/seo/json-ld';
import { enAlternates } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const DESCRIPTION =
  'AgentX replays workload shapes derived from opt-in Claude Code sessions. Explore its methodology, distributions, and per-conversation flamegraphs.';

export const metadata: Metadata = {
  title: 'AgentX Methodology and Datasets',
  description: DESCRIPTION,
  alternates: enAlternates('/agentx'),
  ...socialMetadata({
    title: 'AgentX Methodology and Datasets | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/agentx`,
    locale: 'en',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'InferenceX AgentX Datasets',
  description: DESCRIPTION,
  url: `${SITE_URL}/agentx`,
};

export default function AgentXPage() {
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
