import type { Metadata } from 'next';

import { AgenticCatalogHero } from '@/components/inference/agentic-catalog/agentic-catalog-hero';
import { AgenticCatalogList } from '@/components/inference/agentic-catalog/agentic-catalog-list';
import { JsonLd } from '@/components/json-ld';
import { getAgenticCatalogGroups } from '@/lib/agentic-catalog';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'AgentX 遥测数据';
const DESCRIPTION =
  '浏览所有存储了逐请求遥测数据的 AgentX 基准测试运行，按模型与推理服务栈分组。每种配置都可打开其数据点详情图表、请求时间线与 cache 行为。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: zhAlternates('/inference/agentic'),
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/inference/agentic`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
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
