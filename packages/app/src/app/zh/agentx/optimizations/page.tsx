import type { Metadata } from 'next';

import { AgentXOptimizationsIndex } from '@/components/datasets/agentx-optimizations-article';
import { JsonLd } from '@/components/json-ld';
import { zhAlternates, ZH_LANG_TAG, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'AgentX 行业影响：面向智能体负载的优化';
const DESCRIPTION =
  'AgentX 推动了 vLLM、SGLang、TensorRT-LLM、ATOM、AITER、Dynamo、LMCache 与 Mooncake 等项目的 50 多个上游 PR。';

export const metadata: Metadata = {
  title: 'AgentX 行业影响',
  description: DESCRIPTION,
  alternates: zhAlternates('/agentx/optimizations'),
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/agentx/optimizations`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/agentx/optimizations`,
  inLanguage: ZH_LANG_TAG,
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default function AgentXOptimizationsPageZh() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto max-w-6xl px-4 pb-12 lg:px-8">
        <AgentXOptimizationsIndex locale="zh" />
      </div>
    </main>
  );
}
