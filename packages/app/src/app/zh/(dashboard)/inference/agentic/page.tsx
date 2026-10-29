import type { Metadata } from 'next';

import { AgenticCatalogHero } from '@/components/inference/agentic-catalog/agentic-catalog-hero';
import { AgenticCatalogList } from '@/components/inference/agentic-catalog/agentic-catalog-list';
import { JsonLd } from '@/components/seo/json-ld';
import { getAgenticCatalogGroups } from '@/lib/agentx/agentic-catalog';
import { zhAlternates } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const TITLE = 'AgentX 遥测数据';
const DESCRIPTION =
  '浏览所有存储了逐请求遥测数据的 AgentX 基准测试运行，按模型与推理服务栈分组。每种配置都可打开其数据点详情图表、请求时间线与 cache 行为。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: zhAlternates('/inference/agentic'),
  ...socialMetadata({
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/inference/agentic`,
    locale: 'zh',
  }),
};

export const dynamic = 'force-dynamic';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `${TITLE} | InferenceX`,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/inference/agentic`,
  inLanguage: 'zh-CN',
  isPartOf: { '@type': 'WebSite', name: 'InferenceX', url: SITE_URL },
};

export default async function AgenticTelemetryCatalogPageZh() {
  const groups = await getAgenticCatalogGroups();
  return (
    <>
      <JsonLd data={jsonLd} />
      <AgenticCatalogHero locale="zh" />
      <AgenticCatalogList groups={groups} locale="zh" />
    </>
  );
}
