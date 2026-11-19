import type { Metadata } from 'next';

import { AgentXTelemetryArticle } from '@/components/datasets/agentx-telemetry-article';
import { JsonLd } from '@/components/seo/json-ld';
import { ARTICLE_PAGE_CLASS } from '@/components/ui/reading-layout';
import { getTelemetryGuide } from '@/lib/agentx/agentx-telemetry-zh';
import { zhAlternates, ZH_LANG_TAG } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { AGENTX_ROUTE } from '@/lib/routing/dashboard-routes';

const TITLE = '通过详细遥测数据解析智能体负载';
const DESCRIPTION =
  '如何解读 AgentX 单个数据点背后的遥测数据：单点图表、请求时间线、KV offload 标记，以及单会话火焰图。';

export const metadata: Metadata = {
  title: 'AgentX 遥测数据教程',
  description: DESCRIPTION,
  alternates: zhAlternates(`${AGENTX_ROUTE.path}/telemetry`),
  ...socialMetadata({
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh${AGENTX_ROUTE.path}/telemetry`,
    locale: 'zh',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh${AGENTX_ROUTE.path}/telemetry`,
  inLanguage: ZH_LANG_TAG,
  about: getTelemetryGuide('zh').title,
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default function AgentXTelemetryPageZh() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className={cn(ARTICLE_PAGE_CLASS, 'pt-4 lg:pt-8')}>
        <AgentXTelemetryArticle locale="zh" />
      </div>
    </main>
  );
}
