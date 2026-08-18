import type { Metadata } from 'next';

import { JsonLd } from '@/components/json-ld';
import { AgentXMethodology } from '@/components/datasets/agentx-methodology';
import { DatasetList } from '@/components/datasets/dataset-list';
import { zhAlternates, ZH_OG_LOCALE, ZH_LANG_TAG } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const DESCRIPTION =
  'InferenceX agentic 基准测试所回放的真实 Claude Code 对话 trace——方法论、分布及逐对话火焰图。';

export const metadata: Metadata = {
  title: 'Agentic 数据集',
  description: DESCRIPTION,
  alternates: zhAlternates('/datasets'),
  openGraph: {
    title: 'Agentic 数据集 | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/datasets`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: 'Agentic 数据集 | InferenceX', description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'InferenceX Agentic 数据集',
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/datasets`,
  inLanguage: ZH_LANG_TAG,
};

export default function DatasetsPageZh() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto flex flex-col gap-6 px-4 pb-8 lg:px-8">
        <section>
          <AgentXMethodology locale="zh" />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">数据集</h2>
          <DatasetList />
        </section>
      </div>
    </main>
  );
}
