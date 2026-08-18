import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { OverviewPageContent } from '@/components/overview/overview-page';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import {
  resolveOverviewComparisonMode,
  resolveOverviewEngineScope,
  resolveOverviewHardwareRowScope,
  resolveOverviewModelScope,
  resolveOverviewReferenceHardware,
  resolveOverviewRowScope,
  resolveOverviewTier,
} from '@/lib/overview-data';
import { getOverviewPageData } from '@/lib/overview-data.server';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  '在具备对应数据的模型上，分别按 AgentX 长上下文多轮编码场景与固定序列场景，对比 MI355X、B200、B300、GB200 与 GB300 的每百万总 token 超大规模云成本。';

export const metadata: Metadata = {
  title: '智能体推理成本总览',
  description: DESCRIPTION,
  alternates: zhAlternates('/overview'),
  openGraph: {
    title: `智能体推理成本总览 | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/overview`,
    type: 'website',
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    card: 'summary_large_image',
    title: `智能体推理成本总览 | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ZhOverviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await getOverviewPageData(
    resolveOverviewTier(sp.tier),
    resolveOverviewEngineScope(sp.engine),
    resolveOverviewComparisonMode(sp.compare),
    resolveOverviewReferenceHardware(sp.ref),
    resolveOverviewModelScope(sp.models),
    resolveOverviewRowScope(sp.rows),
    resolveOverviewHardwareRowScope(sp.hwrows),
  );
  return <OverviewPageContent data={data} locale="zh" />;
}
