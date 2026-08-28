import type { Metadata } from 'next';

import { AgentXMethodologyArticle } from '@/components/datasets/agentx-methodology-article';
import { JsonLd } from '@/components/json-ld';
import { zhAlternates, ZH_LANG_TAG, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const DESCRIPTION =
  'AgentX 如何将自愿采集的编码智能体 trace 转换为回放图，并统一 KV cache warmup 与基准测试配置。';

export const metadata: Metadata = {
  title: 'AgentX 测试方法',
  description: DESCRIPTION,
  alternates: zhAlternates('/agentx/methodology'),
  openGraph: {
    title: 'AgentX 测试方法 | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/agentx/methodology`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: 'AgentX 测试方法 | InferenceX', description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'AgentX 测试方法',
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/agentx/methodology`,
  inLanguage: ZH_LANG_TAG,
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default function AgentXMethodologyPageZh() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto max-w-6xl px-4 pb-12 lg:px-8">
        <AgentXMethodologyArticle locale="zh" />
      </div>
    </main>
  );
}
