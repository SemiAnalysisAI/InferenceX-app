import type { Metadata } from 'next';

import { AgentXTelemetryArticle } from '@/components/datasets/agentx-telemetry-article';
import { JsonLd } from '@/components/seo/json-ld';
import { getTelemetryGuide } from '@/lib/agentx/agentx-telemetry-zh';
import { zhAlternates, ZH_LANG_TAG } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const TITLE = '通过详细遥测数据解析智能体负载';
const DESCRIPTION =
  '如何解读 AgentX 单个数据点背后的遥测数据：单点图表、请求时间线、KV offload 标记，以及单会话火焰图。';

export const metadata: Metadata = {
  title: 'AgentX 遥测数据教程',
  description: DESCRIPTION,
  alternates: zhAlternates('/agentx/telemetry'),
  ...socialMetadata({
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/agentx/telemetry`,
    locale: 'zh',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/agentx/telemetry`,
  inLanguage: ZH_LANG_TAG,
  about: getTelemetryGuide('zh').title,
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default function AgentXTelemetryPageZh() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto max-w-6xl px-4 pb-12 lg:px-8">
        <AgentXTelemetryArticle locale="zh" />
      </div>
    </main>
  );
}
