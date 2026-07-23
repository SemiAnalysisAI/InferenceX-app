import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { OverviewPageContent } from '@/components/overview/overview-page';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { resolveOverviewTier } from '@/lib/overview-data';
import { getOverviewPageData } from '@/lib/overview-data.server';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  '在固定单轮 8K 输入 / 1K 输出负载下，总览各活跃模型在 MI355X、B200、B300、GB200 与 GB300 上的表现；每格为该平台最佳验证推测解码结果（50 tok/s/user 档位），相对 B200 的差值仅在同精度结果之间计算。';

export const metadata: Metadata = {
  title: 'AI 推理总览',
  description: DESCRIPTION,
  alternates: zhAlternates('/overview'),
  openGraph: {
    title: `AI 推理总览 | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/overview`,
    type: 'website',
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    card: 'summary_large_image',
    title: `AI 推理总览 | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ZhOverviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await getOverviewPageData(resolveOverviewTier(sp.tier));
  return <OverviewPageContent data={data} locale="zh" />;
}
