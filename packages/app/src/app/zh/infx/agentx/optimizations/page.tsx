import type { Metadata } from 'next';

import { AgentXOptimizationsIndex } from '@/components/datasets/agentx-optimizations-article';
import { JsonLd } from '@/components/seo/json-ld';
import { ARTICLE_PAGE_CLASS } from '@/components/ui/reading-layout';
import { zhAlternates, ZH_LANG_TAG } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { AGENTX_ROUTE } from '@/lib/routing/dashboard-routes';

const TITLE = 'AgentX 行业影响：面向智能体负载的优化';
const DESCRIPTION =
  'AgentX 推动了 vLLM、SGLang、TensorRT-LLM、ATOM、AITER、Dynamo、LMCache、Mooncake 与 MoRI UMBP 等项目的 50 多个上游 PR。';

export const metadata: Metadata = {
  title: 'AgentX 行业影响',
  description: DESCRIPTION,
  alternates: zhAlternates(`${AGENTX_ROUTE.path}/optimizations`),
  ...socialMetadata({
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh${AGENTX_ROUTE.path}/optimizations`,
    locale: 'zh',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh${AGENTX_ROUTE.path}/optimizations`,
  inLanguage: ZH_LANG_TAG,
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default function AgentXOptimizationsPageZh() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className={cn(ARTICLE_PAGE_CLASS, 'pt-4 lg:pt-8')}>
        <AgentXOptimizationsIndex locale="zh" />
      </div>
    </main>
  );
}
