import type { Metadata } from 'next';

import { AgentXQuickstartArticle } from '@/components/datasets/agentx-quickstart';
import { AGENTX_QUICKSTART } from '@/lib/agentx/quickstart';
import { enAlternates } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const { title, description } = AGENTX_QUICKSTART.en;

export const metadata: Metadata = {
  title,
  description,
  alternates: enAlternates('/agentx/quickstart'),
  ...socialMetadata({
    title,
    description,
    url: `${SITE_URL}/agentx/quickstart`,
    locale: 'en',
  }),
};

export default function AgentXQuickstartPage() {
  return (
    <main className="container mx-auto max-w-4xl px-4 pb-12 lg:px-8">
      <AgentXQuickstartArticle locale="en" />
    </main>
  );
}
