import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { OverviewPageContent } from '@/components/overview/overview-page';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { resolveOverviewEngineScope, resolveOverviewTier } from '@/lib/overview-data';
import { getOverviewPageData } from '@/lib/overview-data.server';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  '在固定单轮 8K 输入 / 1K 输出负载下，基于最佳观测平台服务包络线对比各活跃模型在 MI355X、B200、B300、GB200 与 GB300 上的每百万输出 token 成本；优先采用推测解码与 FP4。';

export const metadata: Metadata = {
  title: '推理成本总览',
  description: DESCRIPTION,
  alternates: zhAlternates('/overview'),
  openGraph: {
    title: `推理成本总览 | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/overview`,
    type: 'website',
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    card: 'summary_large_image',
    title: `推理成本总览 | ${SITE_NAME}`,
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
  );
  return <OverviewPageContent data={data} locale="zh" />;
}
