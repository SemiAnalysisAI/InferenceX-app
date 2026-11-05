import type { Metadata } from 'next';

import { AgentXQuickstartArticle } from '@/components/datasets/agentx-quickstart';
import { AGENTX_QUICKSTART } from '@/lib/agentx/quickstart';
import { zhAlternates } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const { title, description } = AGENTX_QUICKSTART.zh;

export const metadata: Metadata = {
  title,
  description,
  alternates: zhAlternates('/agentx/quickstart'),
  ...socialMetadata({
    title,
    description,
    url: `${SITE_URL}/zh/agentx/quickstart`,
    locale: 'zh',
  }),
};

export default function AgentXQuickstartPageZh() {
  return (
    <main className="container mx-auto max-w-4xl px-4 pb-12 lg:px-8">
      <AgentXQuickstartArticle locale="zh" />
    </main>
  );
}
