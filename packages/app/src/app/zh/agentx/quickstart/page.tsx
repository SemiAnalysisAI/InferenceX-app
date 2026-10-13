import type { Metadata } from 'next';

import { AgentXQuickstartArticle } from '@/components/datasets/agentx-quickstart';
import { AGENTX_QUICKSTART } from '@/lib/agentx/quickstart';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const { title, description } = AGENTX_QUICKSTART.zh;

export const metadata: Metadata = {
  title,
  description,
  alternates: zhAlternates('/agentx/quickstart'),
  openGraph: {
    title,
    description,
    url: `${SITE_URL}/zh/agentx/quickstart`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title, description },
};

export default function AgentXQuickstartPageZh() {
  return (
    <main className="container mx-auto max-w-4xl px-4 pb-12 lg:px-8">
      <AgentXQuickstartArticle locale="zh" />
    </main>
  );
}
