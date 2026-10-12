import type { Metadata } from 'next';

import { SmL2Content } from '@/components/ubenchx/SmL2Heatmap';
import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX：SM 间 L2 延迟差异';
const DESCRIPTION =
  '基于 L2 指针追踪的微基准测试，展示 SM 间延迟差异，揭示 NVIDIA Blackwell GPU 上的 GPC 和 die 拓扑结构。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: zhAlternates('/ubenchx/sm-l2-distance'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/ubenchx/sm-l2-distance`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxSmL2DistancePageZh() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <div className="space-y-8">
          <UbenchxHub current="sm-l2-distance" />
          <SmL2Content />
        </div>
      </div>
    </main>
  );
}
