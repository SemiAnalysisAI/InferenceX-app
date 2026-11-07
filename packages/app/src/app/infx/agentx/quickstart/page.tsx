import type { Metadata } from 'next';

import { AgentXQuickstartArticle } from '@/components/datasets/agentx-quickstart';
import { ARTICLE_PAGE_CLASS } from '@/components/ui/reading-layout';
import { AGENTX_QUICKSTART } from '@/lib/agentx/quickstart';
import { enAlternates } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { AGENTX_ROUTE } from '@/lib/routing/dashboard-routes';

const { title, description } = AGENTX_QUICKSTART.en;

export const metadata: Metadata = {
  title,
  description,
  alternates: enAlternates(`${AGENTX_ROUTE.path}/quickstart`),
  ...socialMetadata({
    title,
    description,
    url: `${SITE_URL}${AGENTX_ROUTE.path}/quickstart`,
    locale: 'en',
  }),
};

export default function AgentXQuickstartPage() {
  return (
    <main className={cn(ARTICLE_PAGE_CLASS, 'pt-4 lg:pt-8')}>
      <AgentXQuickstartArticle locale="en" />
    </main>
  );
}
