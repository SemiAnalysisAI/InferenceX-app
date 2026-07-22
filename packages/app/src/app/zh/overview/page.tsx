import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { OverviewPageContent } from '@/components/overview/overview-page';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { getOverviewPageData } from '@/lib/overview-data.server';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  '以固定单轮 8K 输入 / 1K 输出负载，按 50 tok/s/user 档位排名，对比每个活跃模型在各硬件平台上可比的已验证服务结果。';

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

export default async function ZhOverviewPage() {
  const data = await getOverviewPageData();
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <OverviewPageContent data={data} locale="zh" />
      </div>
    </main>
  );
}
