import type { Metadata } from 'next';

import { AgentXMethodology } from '@/components/datasets/agentx-methodology';
import { DatasetList } from '@/components/datasets/dataset-list';
import { JsonLd } from '@/components/json-ld';
import { zhAlternates, ZH_LANG_TAG, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const DESCRIPTION =
  'AgentX 根据自愿参与采集的 Claude Code 会话构建回放工作负载。可查看测试方法、数据分布和单会话火焰图。';

export const metadata: Metadata = {
  title: 'AgentX 测试方法与数据集',
  description: DESCRIPTION,
  alternates: zhAlternates('/agentx'),
  openGraph: {
    title: 'AgentX 测试方法与数据集 | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/agentx`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: 'AgentX 测试方法与数据集 | InferenceX', description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'InferenceX AgentX 数据集',
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/agentx`,
  inLanguage: ZH_LANG_TAG,
};

export default function AgentXPageZh() {
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
